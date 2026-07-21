const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Initialize tables
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS media (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        original_title TEXT,
        description TEXT,
        rating TEXT,
        user_rating INTEGER DEFAULT 0,
        watch_status TEXT DEFAULT 'planned',
        episodes TEXT,
        duration TEXT,
        status TEXT,
        url TEXT,
        image_url TEXT,
        year TEXT,
        notes TEXT,
        sort_order INTEGER DEFAULT 0,
        favorite INTEGER DEFAULT 0,
        rewatch_count INTEGER DEFAULT 0,
        added_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_date TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Database initialized');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
