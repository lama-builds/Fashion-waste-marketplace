const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is missing. Add it to .env (local) or Vercel Environment Variables.');
}

// Keep the pool small: each serverless instance gets its own pool, and the Supabase pooler shares connections.
// Supabase requires SSL. Do not put "?sslmode=..." in DATABASE_URL: it would override this setting.
// Log only the non-secret parts of DATABASE_URL (never the password) so connection mistakes are easy to spot in the logs.
try {
  const u = new URL(process.env.DATABASE_URL);
  console.log(`[db] host=${u.hostname} port=${u.port || '(default 5432)'} user=${decodeURIComponent(u.username)} database=${u.pathname.slice(1)}`);
} catch (e) {
  console.error('[db] DATABASE_URL is not a valid URL. Check for unencoded special characters or leftover [brackets].');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 10000,
  ssl: { rejectUnauthorized: false },
});

const query = (text, params) => pool.query(text, params);

module.exports = { pool, query };
