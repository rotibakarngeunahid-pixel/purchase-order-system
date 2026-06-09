const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');

// GET /api/distribution-photos?branch=&date=&date_from=&date_to=
router.get('/', async (req, res) => {
  const { branch, date, date_from, date_to } = req.query;

  let query = supabase
    .from('distribution_photos')
    .select('*')
    .order('uploaded_at', { ascending: false })
    .limit(200);

  if (branch) query = query.eq('branch', branch);
  if (date) {
    query = query.eq('date', date);
  } else {
    if (date_from) query = query.gte('date', date_from);
    if (date_to) query = query.lte('date', date_to);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

module.exports = router;
