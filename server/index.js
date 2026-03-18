import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(compression());
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

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
  const communities = toArray(query['community[]'] || query.community_arr);
  if (communities.length) {
    const placeholders = communities.map((_, i) => `@comm${i}`);
    conditions.push(`l.community IN (${placeholders.join(',')})`);
    communities.forEach((c, i) => { params[`comm${i}`] = c; });
  }

  // property_name[] multi-value
  const buildings = toArray(query['property_name[]'] || query.property_name_arr);
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

  // Always dedup on reference_no to match the web app count (80,979 vs 81,081)
  conditions.unshift(DEDUP_CONDITION);
  return { where: 'WHERE ' + conditions.join(' AND '), params };
}

function toArray(val) {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

// Dedup: the web app deduplicates by reference_no; 102 duplicate rows exist in the DB
const DEDUP_CONDITION = `l.id IN (SELECT MIN(id) FROM listings GROUP BY reference_no)`;

const DIP_JOIN = `
LEFT JOIN (
  SELECT listing_id, old_value, edited_at
  FROM edits
  WHERE field_name = 'price_aed'
    AND old_value IS NOT NULL
  GROUP BY listing_id
  HAVING edited_at = MAX(edited_at)
) e ON e.listing_id = l.id
`;

function dipSelectFields() {
  return `
    l.*,
    CAST(e.old_value AS INTEGER) AS previous_price,
    e.edited_at AS price_changed_at,
    CASE WHEN e.old_value IS NOT NULL AND CAST(e.old_value AS INTEGER) > l.price_aed
      THEN CAST(e.old_value AS INTEGER) - l.price_aed ELSE NULL END AS dip_amount,
    CASE WHEN e.old_value IS NOT NULL AND CAST(e.old_value AS INTEGER) > l.price_aed
      THEN ROUND((CAST(e.old_value AS INTEGER) - l.price_aed) * 100.0 / CAST(e.old_value AS INTEGER), 1)
      ELSE NULL END AS dip_percent
  `;
}

function sortClause(sort) {
  switch (sort) {
    case 'dip_aed': return 'ORDER BY (CASE WHEN dip_amount IS NULL THEN 1 ELSE 0 END), dip_amount DESC, date(date_listed) DESC';
    case 'dip_pct': return 'ORDER BY (CASE WHEN dip_percent IS NULL THEN 1 ELSE 0 END), dip_percent DESC, date(date_listed) DESC';
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

    // total count
    const countSql = `
      SELECT COUNT(*) as total FROM (
        SELECT ${dipSelectFields()}
        FROM listings l
        ${DIP_JOIN}
        ${where}
      )
      WHERE 1=1 ${dipFilter(minDip)}
    `;
    const { total } = db.prepare(countSql).get(params);

    // strip title from response
    const cleaned = rows.map(({ title, ...rest }) => rest);

    res.json({ listings: cleaned, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch listings' });
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

    const prevUrl = db.prepare(`
      SELECT new_value AS previous_url
      FROM edits WHERE listing_id = @id AND field_name = 'url'
      ORDER BY edited_at DESC LIMIT 1
    `).get({ id: row.id });

    const { title, ...cleaned } = row;
    res.json({ ...cleaned, price_history: history, previous_url: prevUrl?.previous_url || null });
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

    const newToday = db.prepare(`
      SELECT COUNT(*) as count
      FROM (${baseSql})
      WHERE date_listed = date('now')
    `).get(params);

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

// ── static files (production) ────────────────────────────────────────────────

const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// ── start ────────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Dip Finder running on http://0.0.0.0:${PORT}`);
});
