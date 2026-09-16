const { pool } = require("./client");

async function checkSchema() {
  try {
    const result = await pool.query(`
      SELECT
        column_name,
        data_type,
        is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'trends'
      ORDER BY ordinal_position;
    `);

    console.log("\n[Database] trends columns:\n");

    if (result.rows.length === 0) {
      console.log("No trends table found.");
      return;
    }

    console.table(result.rows);
  } catch (error) {
    console.error("[Database] Schema inspection failed:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

checkSchema();
