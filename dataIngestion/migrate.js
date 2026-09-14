require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function runMigration() {
    try {
        await client.connect();
        console.log("Connected to NeonDB. Running migrations...");

        const query = `
            CREATE TABLE IF NOT EXISTS trend_analytics (
                id SERIAL PRIMARY KEY,
                trend_label TEXT NOT NULL,
                combined_data JSONB NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_trend_label ON trend_analytics (trend_label);
        `;

        await client.query(query);
        console.log("Migration executed successfully!");
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        await client.end();
    }
}

runMigration();