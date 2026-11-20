const express = require('express');
const { query } = require('../db');
const { asyncH } = require('../utils');

const router = express.Router();

// GET /api/categories  (public)
router.get('/', asyncH(async (req, res) => {
  const { rows } = await query('select id, name from categories order by name');
  res.json({ items: rows });
}));

module.exports = router;
