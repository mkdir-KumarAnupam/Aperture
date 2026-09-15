const pg = require('pg');
require("dotenv").config();

const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function runMigration() {
  try {
    await client.connect();
    console.log('Connected to NeonDB successfully.');

    // 1. Changed table name to 'trend_analytics'
    // 2. Added UNIQUE constraint to 'run_id' for ON CONFLICT support
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS trend_analytics (
        id SERIAL PRIMARY KEY,
        run_id VARCHAR(255) UNIQUE NOT NULL, 
        trend_label VARCHAR(255),
        schema_version VARCHAR(50),
        canonical_collection JSONB,
        analytics JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await client.query(createTableQuery);
    console.log('Migration successful: "trend_analytics" table is ready.');

  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await client.end();
    console.log('Database connection closed.');
  }
}

runMigration();