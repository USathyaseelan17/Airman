// ─── Roles & Statuses ────────────────────────────────────────────────────────

export type UserRole = "admin" | "instructor" | "student";
export type UserStatus = "active" | "pending" | "suspended";
export type EnrollmentStatus = "active" | "completed" | "dropped";
export type EvaluationStatus = "draft" | "submitted" | "archived";
export type LicenseType = "PPL" | "CPL" | "ATPL" | "TypeRating";

// ─── DB Row Types (match migration columns exactly) ───────────────────────────

export interface Person {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  created_at: Date;
  updated_at: Date;
}

export interface Course {
  id: string;
  tenant_id: string;
  name: string;
  license_type: LicenseType;
  created_at: Date;
  updated_at: Date;
}

export interface Enrollment {
  id: string;
  tenant_id: string;
  student_id: string;
  course_id: string;
  status: EnrollmentStatus;
  start_date: string;
  created_at: Date;
  updated_at: Date;
}

export interface Evaluation {
  id: string;
  tenant_id: string;
  person_id: string;
  evaluator_id: string;
  course_id: string;
  overall_rating: number;
  technical_rating: number;
  non_technical_rating: number;
  remarks: string | null;
  status: EvaluationStatus;
  period_start: Date;
  period_end: Date;
  created_at: Date;
  updated_at: Date;
}

export interface EvaluationInsight {
  id: string;
  evaluation_id: string;
  summary: string;
  focus_areas: string[];
  study_recommendations: string[];
  generated_at: Date;
}

// ─── Request Context (attached by auth middleware) ────────────────────────────

export interface AuthUser {
  id: string;
  role: UserRole;
  tenant_id: string;
}

// Extend Express Request to carry auth context
declare global {
  namespace Express {
    interface Request {
      user: AuthUser;
    }
  }
}