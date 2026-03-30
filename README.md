# AIRMAN — Backend Developer Technical Assessment

A mini training performance workflow system built across two backend services:

- **Skynet** — Node.js/Express/PostgreSQL core API for managing people, courses, enrollments, and evaluations
- **Maverick** — FastAPI Python microservice that generates structured learning insights from evaluation data

---

## 1. What Is Implemented

### Skynet (Node.js / TypeScript / Express / Knex / PostgreSQL)

*----Feature----*

| PostgreSQL schema with migrations | 
| Seed data (admin, instructors, students, courses, enrollments, evaluations) | 
| Auth middleware (`x-user-id`, `x-user-role`, `x-tenant-id` headers) | 
| Role-based access control (admin / instructor / student) |
| `GET /api/people` — people directory with role filter + name/email search | 
| Student enrichment (course info + evaluation stats in people response) | 
| `GET /api/evaluations?personId=...` — list evaluations for a person | 
| `GET /api/evaluations/:id` — full evaluation detail with insight | 
| `POST /api/evaluations` — create evaluation with full validation | 
| `PATCH /api/evaluations/:id` — update evaluation with state-machine rules | 
| `GET /api/evaluations/summary/:personId` — aggregate stats + 3-period trend | 
| `POST /api/evaluations/:id/generate-insight` — calls Maverick, stores result | 
| Multi-tenant scoping via `tenant_id` on all queries |
| Docker Compose orchestration (postgres + maverick + skynet) |

### Maverick (Python / FastAPI / Pydantic)

*----Feature----*

| `POST /insights/generate` — generates structured insight from evaluation ratings |
| `GET /health` — health check endpoint | 
| Rule-based logic (no LLM required) — deterministic, explainable | 
| Pydantic input/output validation |
| Performance tier classification (needs_improvement / average / strong) |
| Dynamic focus areas + study recommendations based on weak areas |

---

## 2. How to Run the service

### Prerequisites

- Docker and Docker Compose installed
- No local Node.js or Python setup needed — everything runs in containers

### Step 1 — Clone and configure environment

```bash
git clone <repo-url>
cd <repo-root>

cp .env.example .env
```

### Step 2 — Start all services

```bash
docker compose up --build
```

This will:
1. Start PostgreSQL and wait until it is healthy
2. Start Maverick (FastAPI) on port `8000`
3. Start Skynet (Node.js) on port `3000`, automatically running migrations and seeds before the server starts

### Step 3 — Verify services are running

```bash
# Skynet health check
curl http://localhost:3000/health

# Maverick health check
curl http://localhost:8000/health
```

NOTE: Both should return `{ "status": "ok" }`.

### Stopping services

```bash
docker compose down        # Stop containers, keep data
docker compose down -v     # Stop containers AND delete database volume
```

---

## 3. Architecture Summary

```
┌──────────────────────────────────────────────────────────┐
│                     Docker Network                       |
│                                                          │
│  ┌─────────────┐        ┌──────────────────────────┐     |
│  │  PostgreSQL │◄──────►│   Skynet (Node.js/TS)    │     |
│  │   Port 5432 │        │   Express + Knex         │     │
│  └─────────────┘        │   Port 3000              │     │
│                         └────────────┬─────────────┘     │
│                                      │ HTTP POST         │
│                          ┌───────────▼─────────────┐     │
│                          │Maverick (FastAPI/Python)│     │
│                          │Rule-based insight engine│     │
│                          │Port 8000                │     │
│                          └─────────────────────────┘     │
└──────────────────────────────────────────────────────────┘
```

**Request flow for insight generation:**


Client : POST /api/evaluations/:id/generate-insight
           │
           ▼ (Skynet)
    Fetch evaluation from PostgreSQL
           │
           ▼
    POST http://maverick:8000/insights/generate
           │
           ▼ (Maverick)
    Apply rule-based logic → return InsightOutput JSON
           │
           ▼ (Skynet)
    Persist insight to evaluation_insights table
           │
           ▼
    Return insight to client


Services communicate by Docker service name (`maverick`, `postgres`) on the internal Docker network. Skynet talks to Maverick via `MAVERICK_URL=http://maverick:8000`. External clients access Skynet on `localhost:3000` and Maverick on `localhost:8000`.

---

## 4. Data Model Summary

### `people`
Stores all users across their roles. All records are scoped to a `tenant_id`.

| Column | Type | Notes |

| `id` | UUID | Primary key, auto-generated |
| `tenant_id` | string | Multi-tenant scope |
| `name` | string | Required |
| `email` | string | Unique |
| `role` | enum | `admin`, `instructor`, `student` |
| `status` | enum | `active`, `pending`, `suspended` |
| `created_at` / `updated_at` | timestamp | Auto-managed |

### `courses`
Training programs offered by the institution.

| Column | Type | Notes |

| `id` | UUID | Primary key |
| `tenant_id` | string | Multi-tenant scope |
| `name` | string | e.g. "CPL Integrated" |
| `license_type` | enum | `PPL`, `CPL`, `ATPL`, `TypeRating` |

### `enrollments`
Matches a student to a course.

| Column | Type | Notes |

| `id` | UUID | Primary key |
| `tenant_id` | string | Multi-tenant scope |
| `student_id` | UUID FK → `people` | CASCADE delete |
| `course_id` | UUID FK → `courses` | CASCADE delete |
| `status` | enum | `active`, `completed`, `dropped` |
| `start_date` | date | 

### `evaluations`
 instructor's assessment of a student for a training period (core requirement).

| Column | Type | Notes |

| `id` | UUID | Primary key |
| `tenant_id` | string | Multi-tenant scope |
| `person_id` | UUID FK → `people` | Student being evaluated |
| `evaluator_id` | UUID FK → `people` | Must be instructor or admin |
| `course_id` | UUID FK → `courses` | 
| `overall_rating` | integer | 1–5, DB-enforced |
| `technical_rating` | integer | 1–5, DB-enforced |
| `non_technical_rating` | integer | 1–5, DB-enforced |
| `remarks` | text | Optional |
| `status` | enum | `draft` → `submitted` → `archived` |
| `period_start` | datetime | 
| `period_end` | datetime | Must be ≥ `period_start`, DB-enforced |

### `evaluation_insights`
Stores the structured response returned by Maverick after calling `generate-insight` API.

| Column | Type | Notes |

| `id` | UUID | Primary key |
| `evaluation_id` | UUID FK → `evaluations` | CASCADE delete |
| `summary` | text | Narrative summary |
| `focus_areas` | jsonb | Array of focus area strings |
| `study_recommendations` | jsonb | Array of recommendation strings |
| `generated_at` | timestamp | Auto-set |

**DB constraints enforced:**
- Ratings between 1 and 5
- `period_end >= period_start`
- All tables indexed on `tenant_id`
- `evaluations` indexed on `person_id`, `evaluator_id`, `course_id`

---

## 5. Access Control

Auth is header-based. Every protected request must include:

```
x-user-id: <person uuid>
x-user-role: admin | instructor | student
x-tenant-id: <tenant string>
```

The `authMiddleware` in Skynet:
1. Validates all three headers are present.
2. Confirms the role is a valid enum value.
3. Looks up the user in the database — verifies they exist and belong to the tenant.
4. Confirms the user's `status` is `active`.
5. Cross-checks the header role matches the DB role.
6. Attaches the verified user context to `req.user` for all downstream handlers.

**Role enforcement per route:**

| Action | Student | Instructor | Admin |

| View own evaluations | yes | — | yes |
| View any evaluation | no | yes (own tenant) | yes |
| Create evaluation | no | yes (as evaluator) | yes |
| Update evaluation (draft/submitted) | no | yes (own evaluations only) | yes |
| Update archived evaluation | no | no | no |
| Generate insight | no | yes | yes |
| View people directory | yes | yes | yes |

---

## 6. Sample API Calls

Replace `<admin-id>` and `<student-id>` with actual UUIDs from seed data (query `GET /api/people` first).

### Health checks

```bash
curl http://localhost:3000/health
curl http://localhost:8000/health
```

### List all people (as admin)

```bash
curl http://localhost:3000/api/people \
  -H "x-user-id: <admin-id>" \
  -H "x-user-role: admin" \
  -H "x-tenant-id: school_alpha_001"
```

### Filter students only

```bash
curl "http://localhost:3000/api/people?role=student" \
  -H "x-user-id: <admin-id>" \
  -H "x-user-role: admin" \
  -H "x-tenant-id: school_alpha_001"
```

### Search by name or email

```bash
curl "http://localhost:3000/api/people?search=arjun" \
  -H "x-user-id: <admin-id>" \
  -H "x-user-role: admin" \
  -H "x-tenant-id: school_alpha_001"
```

### List evaluations for a student

```bash
curl "http://localhost:3000/api/evaluations?personId=<student-id>" \
  -H "x-user-id: <admin-id>" \
  -H "x-user-role: admin" \
  -H "x-tenant-id: school_alpha_001"
```

### Get a single evaluation

```bash
curl http://localhost:3000/api/evaluations/<evaluation-id> \
  -H "x-user-id: <admin-id>" \
  -H "x-user-role: admin" \
  -H "x-tenant-id: school_alpha_001"
```

### Create a new evaluation (as instructor)

```bash
curl -X POST http://localhost:3000/api/evaluations \
  -H "Content-Type: application/json" \
  -H "x-user-id: <instructor-id>" \
  -H "x-user-role: instructor" \
  -H "x-tenant-id: school_alpha_001" \
  -d '{
    "personId": "<student-id>",
    "evaluatorId": "<instructor-id>",
    "courseId": "<course-id>",
    "periodStart": "2024-06-01T00:00:00Z",
    "periodEnd": "2024-06-07T00:00:00Z",
    "overallRating": 3,
    "technicalRating": 2,
    "nonTechnicalRating": 4,
    "remarks": "Good communication, needs checklist work.",
    "status": "draft"
  }'
```

### Update evaluation status

```bash
curl -X PATCH http://localhost:3000/api/evaluations/<evaluation-id> \
  -H "Content-Type: application/json" \
  -H "x-user-id: <instructor-id>" \
  -H "x-user-role: instructor" \
  -H "x-tenant-id: school_alpha_001" \
  -d '{ "status": "submitted" }'
```

### Get evaluation summary for a student

```bash
curl http://localhost:3000/api/evaluations/summary/<student-id> \
  -H "x-user-id: <admin-id>" \
  -H "x-user-role: admin" \
  -H "x-tenant-id: school_alpha_001"
```

### Generate Maverick insight for an evaluation

```bash
curl -X POST http://localhost:3000/api/evaluations/<evaluation-id>/generate-insight \
  -H "x-user-id: <instructor-id>" \
  -H "x-user-role: instructor" \
  -H "x-tenant-id: school_alpha_001"
```

### Call Maverick directly (for testing)

```bash
curl -X POST http://localhost:8000/insights/generate \
  -H "Content-Type: application/json" \
  -d '{
    "student_name": "Arjun Mehta",
    "course_name": "CPL Integrated",
    "overall_rating": 3,
    "technical_rating": 2,
    "non_technical_rating": 4,
    "remarks": "Good communication, but needs improvement in checklist discipline."
  }'
```

---

## 7. What AI Tools Were Used

- **Claude (Anthropic)** was used as a coding assistant throughout development to:
  - Scaffold Knex migration and seed file structure
  - Write TypeScript Express route handlers following consistent patterns
  - Design the rule-based insight logic in Maverick's `logic.py`
  - Review and improve auth middleware logic and error handling
  - Write Docker Compose service wiring with proper health check dependencies

All code was reviewed, understood, and manually adjusted before finalisation.

---

## 8. What I Would Improve Next

**Duplicate evaluation guard:**  
The DB should enforce a unique constraint on `(person_id, course_id, period_start, period_end)` to prevent the same student being evaluated twice for the same period. This is noted in the assessment requirements and is a straightforward migration change.

**Audit logging**  
An `audit_logs` table capturing `user_id`, `tenant_id`, `action`, `resource_type`, `resource_id`, `before_state`, `after_state`, and `timestamp` on every evaluation create/update/status change and insight generation. This would be particularly valuable for AIRMAN's compliance workflows.

**Pagination:**  
`GET /api/people` and `GET /api/evaluations` currently return all records. For production, cursor-based or offset pagination with a `limit` query param would be needed.