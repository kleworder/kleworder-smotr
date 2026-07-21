const { pool, initDB } = require('../database');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(200, corsHeaders);
    res.end();
    return;
  }

  await initDB();

  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;
  const searchParams = url.searchParams;

  try {
    // GET /api/media
    if (req.method === 'GET' && path === '/api/media') {
      const status = searchParams.get('status');
      const type = searchParams.get('type');
      const search = searchParams.get('search');
      const sort = searchParams.get('sort');

      let sql = 'SELECT * FROM media WHERE 1=1';
      const params = [];

      if (status) {
        sql += ' AND watch_status = $' + (params.length + 1);
        params.push(status);
      }
      if (type) {
        sql += ' AND type = $' + (params.length + 1);
        params.push(type);
      }
      if (search) {
        sql += ' AND (title ILIKE $' + (params.length + 1) + ' OR original_title ILIKE $' + (params.length + 2) + ' OR description ILIKE $' + (params.length + 3) + ')';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      if (sort === 'rating') sql += ' ORDER BY user_rating DESC, created_at DESC';
      else if (sort === 'title') sql += ' ORDER BY title ASC';
      else if (sort === 'year') sql += ' ORDER BY year DESC';
      else if (sort === 'favorite') sql += ' ORDER BY favorite DESC, created_at DESC';
      else sql += ' ORDER BY sort_order ASC, created_at DESC';

      const result = await pool.query(sql, params);
      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify(result.rows));
      return;
    }

    // GET /api/media/stats
    if (req.method === 'GET' && path === '/api/media/stats') {
      const statsResult = await pool.query(`
        SELECT watch_status, COUNT(*) as count,
          AVG(CASE WHEN user_rating > 0 THEN user_rating END) as avg_rating
        FROM media GROUP BY watch_status
      `);

      const totalsResult = await pool.query(`
        SELECT COUNT(*) as total,
          SUM(CASE WHEN favorite = 1 THEN 1 ELSE 0 END) as favorites,
          AVG(CASE WHEN user_rating > 0 THEN user_rating END) as overall_avg
        FROM media
      `);

      const totals = totalsResult.rows[0];
      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({
        by_status: statsResult.rows,
        total: parseInt(totals.total),
        favorites: parseInt(totals.favorites),
        overall_avg: totals.overall_avg ? parseFloat(totals.overall_avg).toFixed(1) : '—'
      }));
      return;
    }

    // POST /api/media
    if (req.method === 'POST' && path === '/api/media') {
      const body = await getBody(req);
      const { type, title, original_title, description, rating, user_rating, watch_status, episodes, duration, status, url, image_url, year, notes } = body;

      if (!type || !title) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ error: 'Type and title required' }));
        return;
      }

      const result = await pool.query(
        `INSERT INTO media (type, title, original_title, description, rating, user_rating, watch_status, episodes, duration, status, url, image_url, year, notes, added_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW()) RETURNING id`,
        [type, title, original_title, description, rating, user_rating || 0, watch_status || 'planned', episodes, duration, status, url, image_url, year, notes]
      );

      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ id: result.rows[0].id, message: 'Added' }));
      return;
    }

    // PUT /api/media/:id
    if (req.method === 'PUT' && path.match(/^\/api\/media\/\d+$/)) {
      const id = path.split('/').pop();
      const body = await getBody(req);
      const { user_rating, watch_status, notes, favorite, rewatch_count, completed_date } = body;

      const fields = [];
      const values = [];
      let paramIndex = 1;

      if (user_rating !== undefined) { fields.push(`user_rating = $${paramIndex++}`); values.push(user_rating); }
      if (watch_status !== undefined) {
        fields.push(`watch_status = $${paramIndex++}`);
        values.push(watch_status);
        if (watch_status === 'completed' && !completed_date) fields.push(`completed_date = NOW()`);
      }
      if (notes !== undefined) { fields.push(`notes = $${paramIndex++}`); values.push(notes); }
      if (favorite !== undefined) { fields.push(`favorite = $${paramIndex++}`); values.push(favorite ? 1 : 0); }
      if (rewatch_count !== undefined) { fields.push(`rewatch_count = $${paramIndex++}`); values.push(rewatch_count); }
      if (completed_date !== undefined) { fields.push(`completed_date = $${paramIndex++}`); values.push(completed_date); }

      if (fields.length === 0) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ error: 'No fields to update' }));
        return;
      }

      values.push(id);
      const sql = `UPDATE media SET ${fields.join(', ')} WHERE id = $${paramIndex}`;
      const result = await pool.query(sql, values);

      if (result.rowCount === 0) {
        res.writeHead(404, corsHeaders);
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
      }

      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ message: 'Updated' }));
      return;
    }

    // DELETE /api/media/:id
    if (req.method === 'DELETE' && path.match(/^\/api\/media\/\d+$/)) {
      const id = path.split('/').pop();
      await pool.query('DELETE FROM media WHERE id = $1', [id]);
      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ message: 'Deleted' }));
      return;
    }

    res.writeHead(404, corsHeaders);
    res.end(JSON.stringify({ error: 'Not found' }));

  } catch (error) {
    console.error('API Error:', error);
    res.writeHead(500, corsHeaders);
    res.end(JSON.stringify({ error: 'Server error', details: error.message }));
  }
};

function getBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (e) { reject(e); }
    });
  });
}
