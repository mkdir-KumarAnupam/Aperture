const fs = require("node:fs");
const path = require("node:path");

const { pool } = require("./client");

const MIGRATIONS_DIR = path.join(
  __dirname,
  "migrations"
);

// ============================================================================
// Migration Helpers
// ============================================================================

function getMigrationVersion(filename) {
  return filename.replace(/\.sql$/, "");
}

// ============================================================================
// Migration Table
// ============================================================================

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

// ============================================================================
// Migration Files
// ============================================================================

async function getMigrationFiles() {
  const files = await fs.promises.readdir(
    MIGRATIONS_DIR
  );

  return files
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

// ============================================================================
// Applied Migrations
// ============================================================================

async function getAppliedMigrations(client) {
  const result = await client.query(`
    SELECT version
    FROM schema_migrations
    ORDER BY version;
  `);

  return new Set(
    result.rows.map((row) => row.version)
  );
}

// ============================================================================
// Apply Migration
// ============================================================================

async function applyMigration(
  client,
  filename
) {
  const migrationPath = path.join(
    MIGRATIONS_DIR,
    filename
  );

  const version =
    getMigrationVersion(filename);

  const sql =
    await fs.promises.readFile(
      migrationPath,
      "utf8"
    );

  console.log(
    `[Migration] Applying: ${filename}`
  );

  await client.query("BEGIN");

  try {
    await client.query(sql);

    await client.query(
      `
        INSERT INTO schema_migrations (version)
        VALUES ($1)
        ON CONFLICT (version) DO NOTHING
      `,
      [version]
    );

    await client.query("COMMIT");

    console.log(
      `[Migration] Applied successfully: ${filename}`
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

// ============================================================================
// Migration Runner
// ============================================================================

async function migrate() {
  const client =
    await pool.connect();

  try {
    console.log(
      "[Migration] Connecting to PostgreSQL..."
    );

    await client.query("SELECT 1");

    console.log(
      "[Migration] PostgreSQL connection successful."
    );

    await ensureMigrationTable(
      client
    );

    const migrationFiles =
      await getMigrationFiles();

    const appliedMigrations =
      await getAppliedMigrations(
        client
      );

    for (
      const filename of migrationFiles
    ) {
      const version =
        getMigrationVersion(
          filename
        );

      if (
        appliedMigrations.has(
          version
        )
      ) {
        console.log(
          `[Migration] Already applied: ${filename}`
        );

        continue;
      }

      await applyMigration(
        client,
        filename
      );
    }

    console.log(
      "[Migration] All migrations are up to date."
    );
  } finally {
    client.release();

    await pool.end();
  }
}

// ============================================================================
// Start
// ============================================================================

migrate().catch((error) => {
  console.error(
    "[Migration] Fatal error:",
    error
  );

  process.exit(1);
});
