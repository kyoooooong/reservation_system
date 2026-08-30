import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "pg";
import { getDatabaseUrl } from "./db-url";

const migrationName = "001_init.sql";

export async function migrate(): Promise<void> {
  const pool = new Pool({ connectionString: getDatabaseUrl() });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(984271)");
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT statement_timestamp()
      )
    `);

    const alreadyApplied = await client.query<{ name: string }>(
      "SELECT name FROM schema_migrations WHERE name = $1",
      [migrationName],
    );

    if (alreadyApplied.rowCount === 0) {
      const sql = await readFile(
        join(process.cwd(), "migrations", migrationName),
        "utf8",
      );
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [
        migrationName,
      ]);
      console.log(`Applied migration ${migrationName}`);
    } else {
      console.log(`Migration ${migrationName} already applied`);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  void migrate().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
