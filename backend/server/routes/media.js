const express = require('express');
const { query } = require('../db');
const { HttpError, asyncH, isUuid } = require('../utils');
const { sendDataUri } = require('../media');

const router = express.Router();

// GET /api/photos/:id   a listing photo as an image (public, like the listing itself)
router.get('/photos/:id', asyncH(async (req, res) => {
  if (!isUuid(req.params.id)) throw new HttpError(404, 'Photo not found.');
  const { rows } = await query('select image_url from listing_photos where id = $1', [req.params.id]);
  if (!rows[0] || !sendDataUri(res, rows[0].image_url, 31536000)) throw new HttpError(404, 'Photo not found.');
}));

// GET /api/avatars/:id?v=...   a profile picture as an image. "v" is only there so browsers fetch a new one after a change.
router.get('/avatars/:id', asyncH(async (req, res) => {
  if (!isUuid(req.params.id)) throw new HttpError(404, 'Picture not found.');
  const { rows } = await query('select avatar_url from profiles where id = $1', [req.params.id]);
  if (!rows[0] || !sendDataUri(res, rows[0].avatar_url, 86400)) throw new HttpError(404, 'Picture not found.');
}));

module.exports = router;
