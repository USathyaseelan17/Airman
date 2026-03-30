import knex from "knex";
 
const db = knex({
  client: "postgresql",
  connection: {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || "airman_db",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "",
  },
  pool: { min: 2, max: 10 },
});
 
export default db;