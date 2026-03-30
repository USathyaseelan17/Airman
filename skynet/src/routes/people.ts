import { Router, Request, Response } from "express";
import db from "../db";
import { UserRole } from "../types/index";

const router = Router();

// ─────────────────────────────────────────────────────────────
// GET /api/people
// Query params:
//   ?role=student|instructor|admin
//   ?search=name_or_email
// ─────────────────────────────────────────────────────────────
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const { role, search } = req.query;
  const tenantId = req.user.tenant_id; // always scoped to the logged-in user's tenant

  try {
    // ── Step 1: Build the base people query ──────────────────
    // Always filter by tenant_id first — this is non-negotiable
    const query = db("people")
      .where("people.tenant_id", tenantId)
      .select(
        "people.id",
        "people.name",
        "people.email",
        "people.role",
        "people.status",
        "people.created_at"
      );

    // Optional: filter by role if provided
    if (role) {
      const validRoles: UserRole[] = ["admin", "instructor", "student"];
      if (!validRoles.includes(role as UserRole)) {
        res.status(400).json({
          error: "Bad Request",
          message: `Invalid role '${role}'. Must be one of: admin, instructor, student`,
        });
        return;
      }
      query.where("people.role", role as string);
    }

    // Optional: search by name or email (case-insensitive)
    // ILIKE is PostgreSQL's case-insensitive LIKE
    // So search=arjun matches "Arjun Mehta" and "arjun@student.com"
    if (search) {
      query.where((builder) => {
        builder
          .whereILike("people.name", `%${search}%`)
          .orWhereILike("people.email", `%${search}%`);
      });
    }

    const people = await query;

    // ── Step 2: For students, attach enrollment + eval data ──
    // We only do the extra queries if there are students in the result
    // This avoids unnecessary DB calls when listing only instructors/admins
    const studentIds = people
      .filter((p) => p.role === "student")
      .map((p) => p.id);

    // These maps will hold extra data keyed by student id
    // Map looks like: { "student-uuid": { course info } }
    let enrollmentMap: Record<string, object> = {};
    let evalStatsMap: Record<string, object> = {};

    if (studentIds.length > 0) {
      // ── Enrollment + Course info ─────────────────────────
      // Join enrollments with courses to get course name + license type
      // whereIn fetches data for ALL students in one query (efficient)
      const enrollments = await db("enrollments")
        .join("courses", "enrollments.course_id", "courses.id")
        .whereIn("enrollments.student_id", studentIds)
        .where("enrollments.tenant_id", tenantId)
        .select(
          "enrollments.student_id",
          "enrollments.status as enrollment_status",
          "enrollments.start_date",
          "courses.id as course_id",
          "courses.name as course_name",
          "courses.license_type"
        );

      // Convert the array into a map for O(1) lookup later
      // { "student-uuid": { course_name, license_type, ... } }
      enrollmentMap = enrollments.reduce((map, row) => {
        map[row.student_id] = {
          course_id: row.course_id,
          course_name: row.course_name,
          license_type: row.license_type,
          enrollment_status: row.enrollment_status,
          start_date: row.start_date,
        };
        return map;
      }, {} as Record<string, object>);

      // ── Evaluation stats ─────────────────────────────────
      // For each student: count of evaluations + average ratings
      // groupBy groups the results by person_id so each student
      // gets their own row with their own averages
      const evalStats = await db("evaluations")
        .whereIn("person_id", studentIds)
        .where("tenant_id", tenantId)
        .groupBy("person_id")
        .select(
          "person_id",
          db.raw("COUNT(*) as evaluation_count"),
          db.raw("ROUND(AVG(overall_rating), 2) as avg_overall"),
          db.raw("ROUND(AVG(technical_rating), 2) as avg_technical"),
          db.raw("ROUND(AVG(non_technical_rating), 2) as avg_non_technical")
        );

      // Convert to map: { "student-uuid": { evaluation_count, avg_overall, ... } }
      evalStatsMap = evalStats.reduce((map, row) => {
        map[row.person_id] = {
          evaluation_count: Number(row.evaluation_count),
          avg_overall: Number(row.avg_overall),
          avg_technical: Number(row.avg_technical),
          avg_non_technical: Number(row.avg_non_technical),
        };
        return map;
      }, {} as Record<string, object>);
    }

    // ── Step 3: Merge everything into the final response ────
    // For each person, if they're a student, attach the extra data
    // If they're not a student, those fields simply won't appear
    const result = people.map((person) => {
      if (person.role !== "student") {
        // Admins and instructors — return as-is
        return person;
      }

      // Students — attach course info and eval stats
      return {
        ...person, // spread all base person fields
        enrollment: enrollmentMap[person.id] || null,
        evaluation_stats: evalStatsMap[person.id] || {
          // Student exists but has no evaluations yet
          evaluation_count: 0,
          avg_overall: null,
          avg_technical: null,
          avg_non_technical: null,
        },
      };
    });

    res.json({
      count: result.length,
      people: result,
    });
  } catch (err) {
    console.error("GET /api/people error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;