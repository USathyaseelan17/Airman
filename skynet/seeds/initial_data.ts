import { Knex } from "knex";

export async function seed(knex: Knex): Promise<void> {
  // Deleting existing data to prevent duplicates during testing
  await knex("evaluation_insights").del();
  await knex("evaluations").del();
  await knex("enrollments").del();
  await knex("courses").del();
  await knex("people").del();

  const tenantId = "school_alpha_001"; // Consistent tenant for testing 

  // 1. Insert People (Admin, Instructors, Students) [cite: 169-171]
  const [admin, inst1, inst2, ...students] = await knex("people").insert([
    { tenant_id: tenantId, name: "Aditi Sharma", email: "admin@school.com", role: "admin" },
    { tenant_id: tenantId, name: "Capt. Rajesh", email: "rajesh@school.com", role: "instructor" },
    { tenant_id: tenantId, name: "Capt. Sarah", email: "sarah@school.com", role: "instructor" },
    { tenant_id: tenantId, name: "Arjun Mehta", email: "arjun@student.com", role: "student" },
    { tenant_id: tenantId, name: "Priya Das", email: "priya@student.com", role: "student" },
    { tenant_id: tenantId, name: "Vikram Singh", email: "vikram@student.com", role: "student" },
    { tenant_id: tenantId, name: "Sanya Iyer", email: "sanya@student.com", role: "student" },
    { tenant_id: tenantId, name: "Rohan Varma", email: "rohan@student.com", role: "student" }
  ]).returning("*");

  // 2. Insert Courses [cite: 172]
  const [cpl, ppl] = await knex("courses").insert([
    { tenant_id: tenantId, name: "CPL Integrated", license_type: "CPL" },
    { tenant_id: tenantId, name: "Private Pilot License", license_type: "PPL" }
  ]).returning("*");

  // 3. Insert Enrollments [cite: 173]
  await knex("enrollments").insert(
    students.map((s, index) => ({
      tenant_id: tenantId,
      student_id: s.id,
      course_id: index % 2 === 0 ? cpl.id : ppl.id,
      status: "active",
      start_date: new Date("2024-01-01")
    }))
  );

  // 4. Insert Sample Evaluations [cite: 174]
  await knex("evaluations").insert([
    {
      tenant_id: tenantId,
      person_id: students[0].id, // Arjun
      evaluator_id: inst1.id,
      course_id: cpl.id,
      overall_rating: 3,
      technical_rating: 2,
      non_technical_rating: 4,
      remarks: "Good communication, but needs improvement in checklist discipline.",
      status: "submitted",
      period_start: new Date("2024-05-01"),
      period_end: new Date("2024-05-07")
    },
    {
      tenant_id: tenantId,
      person_id: students[1].id, // Priya
      evaluator_id: inst2.id,
      course_id: ppl.id,
      overall_rating: 5,
      technical_rating: 5,
      non_technical_rating: 5,
      remarks: "Exceptional situational awareness and landing technique.",
      status: "submitted",
      period_start: new Date("2024-05-01"),
      period_end: new Date("2024-05-07")
    }
  ]);
}
