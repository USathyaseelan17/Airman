import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // 1. Users/People Table 
  await knex.schema.createTable("people", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("tenant_id").notNullable().index(); 
    table.string("name").notNullable();
    table.string("email").unique().notNullable();
    table.enum("role", ["admin", "instructor", "student"]).notNullable();
    table.enum("status", ["active", "pending", "suspended"]).defaultTo("active");
    table.timestamps(true, true);
  });

  // 2. Courses Table
  await knex.schema.createTable("courses", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("tenant_id").notNullable().index();
    table.string("name").notNullable();
    table.string("license_type").notNullable(); 
    table.timestamps(true, true);
  });

  // 3. Enrollments Table 
  await knex.schema.createTable("enrollments", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("tenant_id").notNullable().index();
    table.uuid("student_id").references("id").inTable("people").onDelete("CASCADE");
    table.uuid("course_id").references("id").inTable("courses").onDelete("CASCADE");
    table.enum("status", ["active", "completed", "dropped"]).defaultTo("active");
    table.date("start_date");
    table.timestamps(true, true);
  });

  // 4. Evaluations Table 
  await knex.schema.createTable("evaluations", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("tenant_id").notNullable().index();
    table.uuid("person_id").references("id").inTable("people"); 
    table.uuid("evaluator_id").references("id").inTable("people"); 
    table.uuid("course_id").references("id").inTable("courses");
    table.integer("overall_rating").checkBetween([1, 5]); // [cite: 163]
    table.integer("technical_rating").checkBetween([1, 5]);
    table.integer("non_technical_rating").checkBetween([1, 5]);
    table.text("remarks");
    table.enum("status", ["draft", "submitted", "archived"]).defaultTo("draft");
    table.dateTime("period_start").notNullable();
    table.dateTime("period_end").notNullable();
    table.timestamps(true, true);
    

    table.check("?? >= ??", ["period_end", "period_start"]);
  });

  // 5. Evaluation Insights (Maverick Response)
  await knex.schema.createTable("evaluation_insights", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("evaluation_id").references("id").inTable("evaluations").onDelete("CASCADE");
    table.text("summary");
    table.jsonb("focus_areas");
    table.jsonb("study_recommendations");
    table.timestamp("generated_at").defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("evaluation_insights");
  await knex.schema.dropTableIfExists("evaluations");
  await knex.schema.dropTableIfExists("enrollments");
  await knex.schema.dropTableIfExists("courses");
  await knex.schema.dropTableIfExists("people");
}
