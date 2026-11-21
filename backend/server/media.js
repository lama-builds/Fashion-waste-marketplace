// Pictures are stored in the database as small JPEG data URIs (the page resizes them before upload).
// They are served from /api/photos/:id and /api/avatars/:id as real images, so listing data stays small.

const JPEG_URI = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/;
const MAX_PHOTO_CHARS = 400000;  // about 300 KB of image per listing photo
const MAX_AVATAR_CHARS = 80000;  // about 60 KB for a profile picture

// SQL snippet: turns a stored avatar data URI into a short URL. "v" changes when the picture changes.
const AVATAR_SQL = `case when p.avatar_url like 'data:%' then '/api/avatars/' || p.id || '?v=' || left(md5(p.avatar_url), 8) else p.avatar_url end`;

function sendDataUri(res, dataUri, cacheSeconds) {
  const m = typeof dataUri === 'string' && /^data:image\/jpeg;base64,(.+)$/.exec(dataUri);
  if (!m) return false;
  res.set('Content-Type', 'image/jpeg');
  res.set('Cache-Control', `public, max-age=${cacheSeconds}, immutable`);
  res.send(Buffer.from(m[1], 'base64'));
  return true;
}

module.exports = { JPEG_URI, MAX_PHOTO_CHARS, MAX_AVATAR_CHARS, AVATAR_SQL, sendDataUri };
