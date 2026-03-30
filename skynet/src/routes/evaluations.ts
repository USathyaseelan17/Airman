import { Router, Request, Response } from "express";
import db from "../db";
import { EvaluationStatus } from "../types/index";
import { requireRole } from "../middleware/auth";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Check if a status transition is valid
//
// Allowed transitions:
//   draft      → submitted
//   submitted  → archived
//
// NOT allowed:
//   archived   → anything  (archived is a dead end)
//   submitted  → draft     (cannot go backwards)
//   draft      → archived  (must go through submitted first)
// ─────────────────────────────────────────────────────────────────────────────
const VALID_TRANSITIONS: Record<EvaluationStatus, EvaluationStatus[]> = {
  draft: ["submitted"],
  submitted: ["archived"],
  archived: [], // nothing is allowed from archived
};

function isValidTransition(from: EvaluationStatus, to: EvaluationStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Validate ratings are between 1 and 5
// ─────────────────────────────────────────────────────────────────────────────
function validateRatings(overall: unknown,technical: unknown,nonTechnical: unknown): string | null {
  const ratings = [
    { name: "overallRating", value: overall },
    { name: "technicalRating", value: technical },
    { name: "nonTechnicalRating", value: nonTechnical },
  ];

  for (const { name, value } of ratings) {
    if (value === undefined || value === null) continue; // optional on PATCH
    const num = Number(value);
    if (!Number.isInteger(num) || num < 1 || num > 5) {
      return `${name} must be an integer between 1 and 5`;
    }
  }

  return null; // null means no error
}

// ─────────────────────────────────────────────────────────────────────────────
// A. GET /api/evaluations?personId=...
//
// Returns evaluations for a person, newest period first.
// Access rules:
//   - students can only see their own evaluations
//   - instructors can see evaluations they authored
//   - admins can see all evaluations in the tenant
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const { personId } = req.query;
  const { id: userId, role, tenant_id: tenantId } = req.user;

  try {
    const query = db("evaluations")
      .where("evaluations.tenant_id", tenantId)
      // Join people table twice:
      // once for the student (person), once for the evaluator
      // "as" gives each join a different alias so columns don't clash
      .join("people as person", "evaluations.person_id", "person.id")
      .join("people as evaluator", "evaluations.evaluator_id", "evaluator.id")
      .join("courses", "evaluations.course_id", "courses.id")
      .select(
        "evaluations.id",
        "evaluations.status",
        "evaluations.overall_rating",
        "evaluations.technical_rating",
        "evaluations.non_technical_rating",
        "evaluations.remarks",
        "evaluations.period_start",
        "evaluations.period_end",
        "evaluations.created_at",
        // Person (student) info
        "person.id as person_id",
        "person.name as person_name",
        // Evaluator info
        "evaluator.id as evaluator_id",
        "evaluator.name as evaluator_name",
        // Course info
        "courses.id as course_id",
        "courses.name as course_name",
        "courses.license_type"
      )
      .orderBy("evaluations.period_start", "desc"); // newest period first

    // ── Access control scoping ────────────────────────────────
    if (role === "student") {
      // Students can ONLY see their own evaluations
      // We ignore any personId query param they send — always force their own id
      query.where("evaluations.person_id", userId);
    } else if (role === "instructor") {
      // Instructors see evaluations they authored
      query.where("evaluations.evaluator_id", userId);
      // If they also pass a personId, narrow it further
      if (personId) {
        query.where("evaluations.person_id", personId as string);
      }
    } else if (role === "admin") {
      // Admins can see all — but can filter by personId if they want
      if (personId) {
        query.where("evaluations.person_id", personId as string);
      }
    }

    const evaluations = await query;

    res.json({
      count: evaluations.length,
      evaluations,
    });
  } catch (err) {
    console.error("GET /api/evaluations error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTANT: This summary route MUST be defined before /:id
//
// Why? Express matches routes in order. If /:id was first,
// a request to /summary/person-uuid would match /:id
// with id = "summary" — which is wrong.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// E. GET /api/evaluations/summary/:personId
//
// Returns:
//   - average ratings (overall, technical, non-technical)
//   - total evaluation count
//   - last 3 periods as a trend array
// ─────────────────────────────────────────────────────────────────────────────
router.get("/summary/:personId", async (req: Request, res: Response): Promise<void> => {
  const { personId } = req.params;
  const { id: userId, role, tenant_id: tenantId } = req.user;

  try {
    // ── Access control ────────────────────────────────────────
    // Students can only view their own summary
    if (role === "student" && personId !== userId) {
      res.status(403).json({
        error: "Forbidden",
        message: "Students can only view their own summary",
      });
      return;
    }

    // Confirm the person exists in this tenant
    const person = await db("people")
      .where({ id: personId, tenant_id: tenantId })
      .first();

    if (!person) {
      res.status(404).json({ error: "Person not found" });
      return;
    }

    // ── Aggregate stats ───────────────────────────────────────
    // One query to get counts and averages
    const stats = await db("evaluations")
      .where({ person_id: personId, tenant_id: tenantId })
      .select(
        db.raw("COUNT(*) as evaluation_count"),
        db.raw("ROUND(AVG(overall_rating), 2) as avg_overall"),
        db.raw("ROUND(AVG(technical_rating), 2) as avg_technical"),
        db.raw("ROUND(AVG(non_technical_rating), 2) as avg_non_technical")
      )
      .first();

    // ── Last 3 periods trend ──────────────────────────────────
    // Fetches the 3 most recent evaluations for a simple trend view
    const trend = await db("evaluations")
      .where({ person_id: personId, tenant_id: tenantId })
      .orderBy("period_start", "desc")
      .limit(3)
      .select(
        "period_start",
        "period_end",
        "overall_rating",
        "technical_rating",
        "non_technical_rating",
        "status"
      );

    res.json({
      person_id: personId,
      person_name: person.name,
      summary: {
        evaluation_count: Number(stats?.evaluation_count ?? 0),
        avg_overall: stats?.avg_overall ? Number(stats.avg_overall) : null,
        avg_technical: stats?.avg_technical ? Number(stats.avg_technical) : null,
        avg_non_technical: stats?.avg_non_technical ? Number(stats.avg_non_technical) : null,
      },
      // trend is ordered newest first — frontend can plot these as a chart
      last_3_periods_trend: trend,
    });
  } catch (err) {
    console.error("GET /api/evaluations/summary error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// B. GET /api/evaluations/:id
//
// Returns full evaluation detail including insight if it exists
// ─────────────────────────────────────────────────────────────────────────────
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { id: userId, role, tenant_id: tenantId } = req.user;

  try {
    const evaluation = await db("evaluations")
      .where("evaluations.id", id)
      .where("evaluations.tenant_id", tenantId)
      .join("people as person", "evaluations.person_id", "person.id")
      .join("people as evaluator", "evaluations.evaluator_id", "evaluator.id")
      .join("courses", "evaluations.course_id", "courses.id")
      .select(
        "evaluations.*",
        "person.name as person_name",
        "person.email as person_email",
        "evaluator.name as evaluator_name",
        "evaluator.email as evaluator_email",
        "courses.name as course_name",
        "courses.license_type"
      )
      .first();

    if (!evaluation) {
      res.status(404).json({ error: "Evaluation not found" });
      return;
    }

    // ── Access control ────────────────────────────────────────
    if (role === "student" && evaluation.person_id !== userId) {
      res.status(403).json({
        error: "Forbidden",
        message: "Students can only view their own evaluations",
      });
      return;
    }

    if (role === "instructor" && evaluation.evaluator_id !== userId) {
      res.status(403).json({
        error: "Forbidden",
        message: "Instructors can only view evaluations they authored",
      });
      return;
    }

    // ── Attach insight if it exists ───────────────────────────
    // LEFT JOIN alternative: just fetch separately and attach
    const insight = await db("evaluation_insights")
      .where({ evaluation_id: id })
      .first();

    res.json({
      ...evaluation,
      insight: insight || null,
    });
  } catch (err) {
    console.error("GET /api/evaluations/:id error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// C. POST /api/evaluations
//
// Creates a new evaluation.
// Only admins and instructors can create evaluations.
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/",
  requireRole("admin", "instructor"), // students cannot create evaluations
  async (req: Request, res: Response): Promise<void> => {
    const { id: userId, tenant_id: tenantId } = req.user;

    const {
      personId,
      evaluatorId,
      courseId,
      periodStart,
      periodEnd,
      overallRating,
      technicalRating,
      nonTechnicalRating,
      remarks,
      status = "draft", // default to draft if not provided
    } = req.body;

    try {
      // ── Validation 1: Required fields ───────────────────────
      if (!personId || !evaluatorId || !courseId || !periodStart || !periodEnd) {
        res.status(400).json({
          error: "Bad Request",
          message: "Missing required fields: personId, evaluatorId, courseId, periodStart, periodEnd",
        });
        return;
      }

      // ── Validation 2: Ratings ───────────────────────────────
      const ratingError = validateRatings(overallRating, technicalRating, nonTechnicalRating);
      if (ratingError) {
        res.status(400).json({ error: "Bad Request", message: ratingError });
        return;
      }

      // ── Validation 3: period_end >= period_start ────────────
      if (new Date(periodEnd) < new Date(periodStart)) {
        res.status(400).json({
          error: "Bad Request",
          message: "periodEnd must be greater than or equal to periodStart",
        });
        return;
      }

      // ── Validation 4: status must be valid ──────────────────
      const validStatuses: EvaluationStatus[] = ["draft", "submitted", "archived"];
      if (!validStatuses.includes(status)) {
        res.status(400).json({
          error: "Bad Request",
          message: "status must be one of: draft, submitted, archived",
        });
        return;
      }

      // ── Validation 5: person must exist and be a student ────
      const person = await db("people")
        .where({ id: personId, tenant_id: tenantId })
        .first();

      if (!person) {
        res.status(404).json({ error: "Person not found" });
        return;
      }

      if (person.role !== "student") {
        res.status(400).json({
          error: "Bad Request",
          message: "The person being evaluated must be a student",
        });
        return;
      }

      // ── Validation 6: evaluator must exist and be instructor/admin ──
      const evaluator = await db("people")
        .where({ id: evaluatorId, tenant_id: tenantId })
        .first();

      if (!evaluator) {
        res.status(404).json({ error: "Evaluator not found" });
        return;
      }

      if (!["instructor", "admin"].includes(evaluator.role)) {
        res.status(400).json({
          error: "Bad Request",
          message: "The evaluator must be an instructor or admin",
        });
        return;
      }

      // ── Validation 7: course must exist ─────────────────────
      const course = await db("courses")
        .where({ id: courseId, tenant_id: tenantId })
        .first();

      if (!course) {
        res.status(404).json({ error: "Course not found" });
        return;
      }

      // ── Validation 8: no duplicate evaluation ───────────────
      // Same student cannot have two evaluations for the same course
      // in the exact same period
      const duplicate = await db("evaluations")
        .where({
          tenant_id: tenantId,
          person_id: personId,
          course_id: courseId,
          period_start: new Date(periodStart),
          period_end: new Date(periodEnd),
        })
        .first();

      if (duplicate) {
        res.status(409).json({
          error: "Conflict",
          message: "An evaluation already exists for this student, course, and period",
        });
        return;
      }

      // ── Insert ───────────────────────────────────────────────
      const [created] = await db("evaluations")
        .insert({
          tenant_id: tenantId,
          person_id: personId,
          evaluator_id: evaluatorId,
          course_id: courseId,
          period_start: new Date(periodStart),
          period_end: new Date(periodEnd),
          overall_rating: overallRating,
          technical_rating: technicalRating,
          non_technical_rating: nonTechnicalRating,
          remarks: remarks || null,
          status,
        })
        .returning("*");

      res.status(201).json(created);
    } catch (err) {
      console.error("POST /api/evaluations error:", err);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// D. PATCH /api/evaluations/:id
//
// Updates ratings, remarks, and/or status.
// Rules:
//   - archived evaluations are completely immutable
//   - submitted evaluations can only be edited by their evaluator or an admin
//   - status transitions must follow the allowed flow
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { id: userId, role, tenant_id: tenantId } = req.user;

  const {
    overallRating,
    technicalRating,
    nonTechnicalRating,
    remarks,
    status: newStatus,
  } = req.body;

  try {
    // ── Fetch current evaluation ─────────────────────────────
    const evaluation = await db("evaluations")
      .where({ id, tenant_id: tenantId })
      .first();

    if (!evaluation) {
      res.status(404).json({ error: "Evaluation not found" });
      return;
    }

    // ── Rule 1: archived is immutable ────────────────────────
    if (evaluation.status === "archived") {
      res.status(403).json({
        error: "Forbidden",
        message: "Archived evaluations cannot be modified",
      });
      return;
    }

    // ── Rule 2: submitted can only be edited by evaluator or admin ──
    if (evaluation.status === "submitted") {
      const isEvaluator = evaluation.evaluator_id === userId;
      const isAdmin = role === "admin";

      if (!isEvaluator && !isAdmin) {
        res.status(403).json({
          error: "Forbidden",
          message: "Only the evaluator or an admin can edit a submitted evaluation",
        });
        return;
      }
    }

    // ── Rule 3: students cannot patch at all ─────────────────
    if (role === "student") {
      res.status(403).json({
        error: "Forbidden",
        message: "Students cannot modify evaluations",
      });
      return;
    }

    // ── Rule 4: validate rating values if provided ───────────
    const ratingError = validateRatings(overallRating, technicalRating, nonTechnicalRating);
    if (ratingError) {
      res.status(400).json({ error: "Bad Request", message: ratingError });
      return;
    }

    // ── Rule 5: validate status transition if status is changing ──
    if (newStatus && newStatus !== evaluation.status) {
      if (!isValidTransition(evaluation.status, newStatus)) {
        res.status(400).json({
          error: "Bad Request",
          message: `Invalid status transition: '${evaluation.status}' → '${newStatus}'. Allowed: ${VALID_TRANSITIONS[evaluation.status as EvaluationStatus].join(", ") || "none"}`,
        });
        return;
      }
    }

    // ── Build update object (only include fields that were sent) ──
    // This is a partial update — we only change what was provided
    const updates: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (overallRating !== undefined) updates.overall_rating = overallRating;
    if (technicalRating !== undefined) updates.technical_rating = technicalRating;
    if (nonTechnicalRating !== undefined) updates.non_technical_rating = nonTechnicalRating;
    if (remarks !== undefined) updates.remarks = remarks;
    if (newStatus !== undefined) updates.status = newStatus;

    // ── Update ────────────────────────────────────────────────
    const [updated] = await db("evaluations")
      .where({ id, tenant_id: tenantId })
      .update(updates)
      .returning("*");

    res.json(updated);
  } catch (err) {
    console.error("PATCH /api/evaluations/:id error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// F. POST /api/evaluations/:id/generate-insight
//
// Calls the Maverick FastAPI service and stores the result.
// Only admins and instructors can trigger this.
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/:id/generate-insight",
  requireRole("admin", "instructor"),
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { tenant_id: tenantId } = req.user;

    const MAVERICK_URL = process.env.MAVERICK_URL || "http://localhost:8000";

    try {
      // ── Fetch the evaluation with student + course info ──────
      const evaluation = await db("evaluations")
        .where("evaluations.id", id)
        .where("evaluations.tenant_id", tenantId)
        .join("people as person", "evaluations.person_id", "person.id")
        .join("courses", "evaluations.course_id", "courses.id")
        .select(
          "evaluations.*",
          "person.name as student_name",
          "courses.name as course_name"
        )
        .first();

      if (!evaluation) {
        res.status(404).json({ error: "Evaluation not found" });
        return;
      }

      // ── Call Maverick ────────────────────────────────────────
      // This is an HTTP POST to the Python FastAPI service
      // fetch() is built into Node.js 18+
      const maverickResponse = await fetch(`${MAVERICK_URL}/insights/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_name: evaluation.student_name,
          course_name: evaluation.course_name,
          overall_rating: evaluation.overall_rating,
          technical_rating: evaluation.technical_rating,
          non_technical_rating: evaluation.non_technical_rating,
          remarks: evaluation.remarks,
        }),
      });

      if (!maverickResponse.ok) {
        res.status(502).json({
          error: "Bad Gateway",
          message: "Maverick insight service returned an error",
        });
        return;
      }

      const insight = await maverickResponse.json() as {
        summary: string;
        focus_areas: string[];
        study_recommendations: string[];
      };

      // ── Store the insight ─────────────────────────────────────
      // Delete any existing insight for this evaluation (regenerate)
      await db("evaluation_insights")
        .where({ evaluation_id: id })
        .del();

      const [saved] = await db("evaluation_insights")
        .insert({
          evaluation_id: id,
          summary: insight.summary,
          focus_areas: JSON.stringify(insight.focus_areas),
          study_recommendations: JSON.stringify(insight.study_recommendations),
          generated_at: new Date(),
        })
        .returning("*");

      res.status(201).json({
        message: "Insight generated and saved successfully",
        insight: saved,
      });
    } catch (err) {
      console.error("POST /api/evaluations/:id/generate-insight error:", err);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
);

export default router;