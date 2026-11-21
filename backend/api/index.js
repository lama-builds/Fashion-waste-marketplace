const express = require('express');
const cookieParser = require('cookie-parser');
const { HttpError } = require('../server/utils');

const app = express();
app.disable('x-powered-by');
// Listing and profile requests carry small resized pictures, so they may be larger than the 20 KB default.
// (Vercel itself refuses request bodies over 4.5 MB.)
app.use(['/api/listings', '/api/profiles'], express.json({ limit: '2mb' }));
app.use(express.json({ limit: '20kb' }));
app.use(cookieParser());
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  next();
});

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', require('../server/routes/auth'));
app.use('/api/categories', require('../server/routes/categories'));
app.use('/api/listings', require('../server/routes/listings'));
app.use('/api/profiles', require('../server/routes/profiles'));
app.use('/api/bootstrap', require('../server/routes/bootstrap'));
app.use('/api/orders', require('../server/routes/orders'));
app.use('/api/saved', require('../server/routes/saved'));
app.use('/api/preferences', require('../server/routes/preferences'));
app.use('/api', require('../server/routes/media'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Route not found.' }));

// Every error ends up here and becomes a clear JSON message. Details are never leaked on a 500.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request body is not valid JSON.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'The request body is too large.' });
  if (err.code === '23505' && err.constraint === 'users_email_lower_key') {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }
  if (err.code === '23503') return res.status(400).json({ error: 'A referenced item does not exist (check category_id).' });
  if (err.code === '22P02') return res.status(400).json({ error: 'One of the ids is not valid.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
});

module.exports = app;
if (!process.env.VERCEL) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`API running on http://localhost:${port}`));
}
