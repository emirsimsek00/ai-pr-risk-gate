import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, "..");
const migrationsDir = path.join(root, "sql", "migrations");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required for migrations");
  process.exit(1);
}

const client = new Client({ connectionString });

async function ensureMigrationsTable() {
  await client.query(`
    create table if not exists schema_migrations (
      id bigserial primary key,
      filename text not null unique,
      applied_at timestamptz not null default now()
    );
  `);
}

async function appliedMigrations() {
  const res = await client.query("select filename from schema_migrations");
  return new Set(res.rows.map((r) => r.filename));
}

async function run() {
  await client.connect();
  await ensureMigrationsTable();

  const files = (await fs.readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied = await appliedMigrations();

  for (const file of files) {
    if (applied.has(file)) continue;

    const fullPath = path.join(migrationsDir, file);
    const sql = await fs.readFile(fullPath, "utf8");

    console.log(`Applying migration: ${file}`);
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into schema_migrations(filename) values ($1)", [file]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }

  console.log("Migrations complete");
}

run()
  .catch((error) => {
    console.error("Migration failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
