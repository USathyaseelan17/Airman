import type { Knex } from "knex";

const config: { [key: string]: Knex.Config } = {
  development: {
    client: "postgresql",
    connection: {
      database: "airman_db",
      user: process.env.USER || "postgres", 
      password: "",
    },
    migrations: {
      directory: "./migrations",
      extension: "ts",
      loadExtensions: [".ts"]
    },
    seeds: {
      directory: "./seeds",
      extension: "ts",
      loadExtensions: [".ts"]
    }
  }
};

export default config;
