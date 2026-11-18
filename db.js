const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is missing. Add it to .env (local) or Vercel Environment Variables.');
}

// Keep the pool small: each serverless instance gets its own pool, and the Supabase pooler shares connections.
// Supabase requires SSL. Do not put "?sslmode=..." in DATABASE_URL: it would override this setting.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 10000,
  ssl: { rejectUnauthorized: false },
});

const query = (text, params) => pool.query(text, params);

module.exports = { pool, query };
