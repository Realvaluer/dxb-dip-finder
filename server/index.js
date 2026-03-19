import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db, { usersDb } from './db.js';
import { registerAuthRoutes, requireAuth } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(compression());
app.use(express.json());
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));

// ── helpers ──────────────────────────────────────────────────────────────────

function buildWhereClause(query) {
  const conditions = [];
  const params = {};

  if (query.search) {
    conditions.push(`(l.community LIKE @search OR l.property_name LIKE @search)`);
    params.search = `%${query.search}%`;
  }
  if (query.purpose) {
    conditions.push(`LOWER(l.purpose) = @purpose`);
    params.purpose = query.purpose.toLowerCase();
  }
  if (query.type) {
    conditions.push(`l.type = @type`);
    params.type = query.type;
  }
  if (query.source) {
    conditions.push(`l.source = @source`);
    params.source = query.source;
  }
  if (query.bedrooms !== undefined && query.bedrooms !== null && query.bedrooms !== '') {
    const bed = parseInt(query.bedrooms, 10);
    if (bed === 4) {
      conditions.push(`l.bedrooms >= 4`);
    } else if (bed === 0) {
      // Studio: bedrooms is NULL or 0 in the DB
      conditions.push(`(l.bedrooms IS NULL OR l.bedrooms = 0)`);
    } else {
      conditions.push(`l.bedrooms = @bedrooms`);
      params.bedrooms = bed;
    }
  }
  if (query.max_price) {
    conditions.push(`l.price_aed <= @max_price`);
    params.max_price = parseInt(query.max_price, 10);
  }
  if (query.min_sqft) {
    conditions.push(`l.size_sqft >= @min_sqft`);
    params.min_sqft = parseInt(query.min_sqft, 10);
  }

  // community[] multi-value
  const communities = toArray(query['community[]'] || query.community || query.community_arr);
  if (communities.length) {
    const placeholders = communities.map((_, i) => `@comm${i}`);
    conditions.push(`l.community IN (${placeholders.join(',')})`);
    communities.forEach((c, i) => { params[`comm${i}`] = c; });
  }

  // property_name[] multi-value
  const buildings = toArray(query['property_name[]'] || query.property_name || query.property_name_arr);
  if (buildings.length) {
    const placeholders = buildings.map((_, i) => `@bld${i}`);
    conditions.push(`l.property_name IN (${placeholders.join(',')})`);
    buildings.forEach((b, i) => { params[`bld${i}`] = b; });
  }

  // date range filter
  if (query.date_from) {
    conditions.push(`date(l.date_listed) >= @date_from`);
    params.date_from = query.date_from;
  }
  if (query.date_to) {
    conditions.push(`date(l.date_listed) <= @date_to`);
    params.date_to = query.date_to;
  }

  // ids filter (for bookmarks)
  if (query.ids) {
    const idList = query.ids.split(',').map(Number).filter(n => !isNaN(n));
    if (idList.length > 0) {
      const placeholders = idList.map((_, i) => `@id${i}`);
      conditions.push(`l.id IN (${placeholders.join(',')})`);
      idList.forEach((id, i) => { params[`id${i}`] = id; });
    }
  }

  conditions.unshift(DEDUP_CONDITION);
  return { where: 'WHERE ' + conditions.join(' AND '), params };
}

function toArray(val) {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

const DEDUP_CONDITION = `l.id IN (SELECT MIN(id) FROM listings GROUP BY reference_no)`;

const DIP_JOIN = `LEFT JOIN dip_data d ON d.listing_id = l.id`;

function dipSelectFields() {
  return `
    l.*,
    d.prev_price AS previous_price,
    d.prev_date AS price_changed_at,
    d.prev_url AS previous_url_from_dip,
    d.prev_source AS prev_source,
    CASE WHEN d.dip_pct < 0 THEN ABS(d.dip_amount) ELSE NULL END AS dip_amount,
    CASE WHEN d.dip_pct < 0 THEN ABS(d.dip_pct) ELSE NULL END AS dip_percent
  `;
}

function sortClause(sort) {
  switch (sort) {
    case 'dip_aed': return 'ORDER BY dip_amount IS NULL, dip_amount DESC, date(date_listed) DESC';
    case 'dip_pct': return 'ORDER BY dip_percent IS NULL, dip_percent DESC, date(date_listed) DESC';
    case 'price_asc': return 'ORDER BY price_aed ASC';
    case 'price_desc': return 'ORDER BY price_aed DESC';
    case 'newest':
    default: return 'ORDER BY date(date_listed) DESC, community ASC, property_name ASC';
  }
}

function dipFilter(minDip) {
  if (!minDip || parseFloat(minDip) <= 0) return '';
  return `AND (dip_percent IS NOT NULL AND dip_percent >= ${parseFloat(minDip)})`;
}

// Shared count query used by /api/listings and /api/listings/count
function getFilteredCount(query) {
  const { where, params } = buildWhereClause(query);
  const minDip = query.min_dip;
  const countSql = `
    SELECT COUNT(*) as total FROM (
      SELECT ${dipSelectFields()}
      FROM listings l
      ${DIP_JOIN}
      ${where}
    )
    WHERE 1=1 ${dipFilter(minDip)}
  `;
  return db.prepare(countSql).get(params).total;
}

// ── GET /api/listings ────────────────────────────────────────────────────────

app.get('/api/listings', (req, res) => {
  try {
    const { where, params } = buildWhereClause(req.query);
    const sort = sortClause(req.query.sort);
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = parseInt(req.query.offset, 10) || 0;
    const minDip = req.query.min_dip;

    const sql = `
      SELECT * FROM (
        SELECT ${dipSelectFields()}
        FROM listings l
        ${DIP_JOIN}
        ${where}
      )
      WHERE 1=1 ${dipFilter(minDip)}
      ${sort}
      LIMIT @limit OFFSET @offset
    `;

    const rows = db.prepare(sql).all({ ...params, limit, offset });
    const total = getFilteredCount(req.query);
    const cleaned = rows.map(({ title, ...rest }) => rest);

    res.json({ listings: cleaned, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch listings' });
  }
});

// ── GET /api/listings/count — live count for filter sheet ────────────────────

app.get('/api/listings/count', (req, res) => {
  try {
    const total = getFilteredCount(req.query);
    res.json({ total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get count' });
  }
});

// ── GET /api/listings/:id ────────────────────────────────────────────────────

app.get('/api/listings/:id', (req, res) => {
  try {
    const sql = `
      SELECT ${dipSelectFields()}
      FROM listings l
      ${DIP_JOIN}
      WHERE l.id = @id
    `;
    const row = db.prepare(sql).get({ id: parseInt(req.params.id, 10) });
    if (!row) return res.status(404).json({ error: 'Not found' });

    const history = db.prepare(`
      SELECT old_value, new_value, edited_at
      FROM edits
      WHERE listing_id = @id AND field_name = 'price_aed'
      ORDER BY edited_at DESC
    `).all({ id: row.id });

    const dipRow = db.prepare(`
      SELECT d.prev_url, d.prev_source, d.prev_price, d.prev_date, d.prev_size,
             d.prev_furnished, d.ref_listing_id,
             ref.url AS ref_url, ref.property_name AS ref_name, ref.community AS ref_community
      FROM dip_data d
      LEFT JOIN listings ref ON ref.id = d.ref_listing_id
      WHERE d.listing_id = @id
    `).get({ id: row.id });

    const { title, previous_url_from_dip, ...cleaned } = row;
    res.json({
      ...cleaned,
      price_history: history,
      previous_url: previous_url_from_dip || dipRow?.prev_url || null,
      comparison: dipRow ? {
        url: dipRow.prev_url || dipRow.ref_url || null,
        source: dipRow.prev_source || null,
        price: dipRow.prev_price || null,
        date: dipRow.prev_date || null,
        size: dipRow.prev_size || null,
        furnished: dipRow.prev_furnished || null,
        property_name: dipRow.ref_name || null,
        community: dipRow.ref_community || null,
      } : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch listing' });
  }
});

// ── GET /api/kpis ────────────────────────────────────────────────────────────

app.get('/api/kpis', (req, res) => {
  try {
    const { where, params } = buildWhereClause(req.query);
    const minDip = req.query.min_dip;

    const baseSql = `
      SELECT * FROM (
        SELECT ${dipSelectFields()}
        FROM listings l
        ${DIP_JOIN}
        ${where}
      )
      WHERE 1=1 ${dipFilter(minDip)}
    `;

    const highestPct = db.prepare(`
      SELECT id AS listing_id, dip_percent, property_name, community
      FROM (${baseSql})
      WHERE dip_percent IS NOT NULL
      ORDER BY dip_percent DESC LIMIT 1
    `).get(params);

    const highestAed = db.prepare(`
      SELECT id AS listing_id, dip_amount, property_name, community
      FROM (${baseSql})
      WHERE dip_amount IS NOT NULL
      ORDER BY dip_amount DESC LIMIT 1
    `).get(params);

    const mostActive = db.prepare(`
      SELECT community, COUNT(*) as count
      FROM (${baseSql})
      WHERE dip_percent IS NOT NULL AND dip_percent > 0
      GROUP BY community
      ORDER BY count DESC LIMIT 1
    `).get(params);

    // Use the max date_listed in the DB as "today" (handles timezone mismatch)
    const latestDate = db.prepare(`SELECT MAX(date_listed) as d FROM listings`).get()?.d;
    const newToday = db.prepare(`
      SELECT COUNT(*) as count
      FROM (${baseSql})
      WHERE date_listed = @latestDate
    `).get({ ...params, latestDate: latestDate || '' });

    res.json({
      highest_dip_pct: highestPct || null,
      highest_dip_aed: highestAed || null,
      most_active_community: mostActive || null,
      new_today: newToday?.count || 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch KPIs' });
  }
});

// ── GET /api/filter-options ──────────────────────────────────────────────────

app.get('/api/filter-options', (req, res) => {
  try {
    const communities = db.prepare(
      `SELECT DISTINCT community FROM listings WHERE community IS NOT NULL ORDER BY community`
    ).all().map(r => r.community);

    const property_names = db.prepare(
      `SELECT DISTINCT property_name FROM listings WHERE property_name IS NOT NULL ORDER BY property_name`
    ).all().map(r => r.property_name);

    const types = db.prepare(
      `SELECT DISTINCT type FROM listings WHERE type IS NOT NULL ORDER BY type`
    ).all().map(r => r.type);

    const sources = db.prepare(
      `SELECT DISTINCT source FROM listings ORDER BY source`
    ).all().map(r => r.source);

    const purposes = db.prepare(
      `SELECT DISTINCT purpose FROM listings WHERE purpose IS NOT NULL ORDER BY purpose`
    ).all().map(r => r.purpose);

    res.json({ communities, property_names, types, sources, purposes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch filter options' });
  }
});

// ── GET /api/search-suggestions ───────────────────────────────────────────────

app.get('/api/search-suggestions', (req, res) => {
  try {
    const q = req.query.q;
    if (!q || q.length < 2) return res.json({ communities: [], buildings: [] });

    const communities = db.prepare(`
      SELECT community AS label, COUNT(*) AS cnt
      FROM listings
      WHERE community LIKE @q AND community IS NOT NULL
      GROUP BY community ORDER BY cnt DESC LIMIT 5
    `).all({ q: `%${q}%` });

    const buildings = db.prepare(`
      SELECT property_name AS label, COUNT(*) AS cnt
      FROM listings
      WHERE property_name LIKE @q AND property_name IS NOT NULL
      GROUP BY property_name ORDER BY cnt DESC LIMIT 5
    `).all({ q: `%${q}%` });

    res.json({ communities, buildings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

// ── GET /api/search-community ─────────────────────────────────────────────────

app.get('/api/search-community', (req, res) => {
  try {
    const q = req.query.q;
    if (!q || q.length < 2) return res.json([]);
    const rows = db.prepare(`
      SELECT community AS label, COUNT(*) AS cnt FROM listings
      WHERE community LIKE @q AND community IS NOT NULL
      GROUP BY community ORDER BY cnt DESC LIMIT 10
    `).all({ q: `%${q}%` });
    res.json(rows);
  } catch (err) { res.status(500).json([]); }
});

// ── GET /api/search-building ─────────────────────────────────────────────────

app.get('/api/search-building', (req, res) => {
  try {
    const q = req.query.q;
    if (!q || q.length < 2) return res.json([]);
    const rows = db.prepare(`
      SELECT property_name AS label, COUNT(*) AS cnt FROM listings
      WHERE property_name LIKE @q AND property_name IS NOT NULL AND property_name != ''
      GROUP BY property_name ORDER BY cnt DESC LIMIT 10
    `).all({ q: `%${q}%` });
    res.json(rows);
  } catch (err) { res.status(500).json([]); }
});

// ── GET /api/health ──────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  try {
    const { total } = db.prepare('SELECT COUNT(*) as total FROM listings').get();
    const dbInfo = db.prepare("SELECT file FROM pragma_database_list WHERE name='main'").get();
    res.json({ total, db_path: dbInfo?.file || 'unknown', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SSE endpoint for live DB updates ─────────────────────────────────────────

const sseClients = new Set();

app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.write('data: connected\n\n');
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// Watch database file for changes (local dev only — Railway uses volume)
const dbPath = process.env.DB_PATH || path.join(import.meta.dirname || __dirname, '..', '..', 'scraper', 'database.db');
try {
  const actualDbPath = db.prepare("SELECT file FROM pragma_database_list WHERE name='main'").get()?.file;
  if (actualDbPath && fs.existsSync(actualDbPath)) {
    let debounce = null;
    fs.watch(actualDbPath, () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        console.log('Database updated at', new Date().toISOString());
        sseClients.forEach(client => {
          try { client.write('data: refresh\n\n'); } catch {}
        });
      }, 2000);
    });
    console.log('Watching database for changes:', actualDbPath);
  }
} catch (e) {
  // File watching is optional — ignore errors
}

// ── Auth routes ──────────────────────────────────────────────────────────────

registerAuthRoutes(app);

// ── Saved listings routes ────────────────────────────────────────────────────

app.get('/api/saved/ids', requireAuth, (req, res) => {
  const rows = usersDb.prepare(`SELECT listing_id FROM saved_listings WHERE user_id = ?`).all(req.user.user_id);
  res.json(rows.map(r => r.listing_id));
});

app.get('/api/saved', requireAuth, (req, res) => {
  try {
    const savedIds = usersDb.prepare(`SELECT listing_id FROM saved_listings WHERE user_id = ? ORDER BY saved_at DESC`).all(req.user.user_id);
    if (savedIds.length === 0) return res.json({ listings: [], total: 0 });

    const ids = savedIds.map(r => r.listing_id);
    const placeholders = ids.map((_, i) => `@id${i}`);
    const params = {};
    ids.forEach((id, i) => { params[`id${i}`] = id; });

    const sql = `
      SELECT ${dipSelectFields()}
      FROM listings l
      ${DIP_JOIN}
      WHERE l.id IN (${placeholders.join(',')})
    `;
    const rows = db.prepare(sql).all(params);
    const cleaned = rows.map(({ title, ...rest }) => rest);
    res.json({ listings: cleaned, total: cleaned.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch saved listings' });
  }
});

app.post('/api/saved/:listing_id', requireAuth, (req, res) => {
  usersDb.prepare(`INSERT OR IGNORE INTO saved_listings (user_id, listing_id) VALUES (?, ?)`).run(req.user.user_id, parseInt(req.params.listing_id));
  res.json({ saved: true });
});

app.delete('/api/saved/:listing_id', requireAuth, (req, res) => {
  usersDb.prepare(`DELETE FROM saved_listings WHERE user_id = ? AND listing_id = ?`).run(req.user.user_id, parseInt(req.params.listing_id));
  res.json({ saved: false });
});

// ── static files (production) ────────────────────────────────────────────────

const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// ── start ────────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Dip Finder running on http://0.0.0.0:${PORT}`);
  const { total } = db.prepare('SELECT COUNT(*) as total FROM listings').get();
  console.log(`Database: ${total} listings`);
});
