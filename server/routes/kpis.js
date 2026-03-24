import { Router } from 'express';
import db, { LISTINGS_CTE, LISTINGS_SELECT } from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  try {
    const {
      min_dip = 0,
      bedrooms,
      source,
      property_type,
      listing_type,
      max_price,
      min_sqft,
    } = req.query;

    const communities = parseArrayParam(req.query, 'communities');
    const buildings = parseArrayParam(req.query, 'buildings');

    // KPIs always filter on dip data existing (they're dip-specific metrics)
    const conditions = ['dip_percent IS NOT NULL AND dip_percent >= @min_dip'];
    const params = { min_dip: parseFloat(min_dip) || 0 };

    if (bedrooms !== undefined && bedrooms !== '') {
      conditions.push('ll.bedrooms = @bedrooms');
      params.bedrooms = parseInt(bedrooms);
    }
    if (communities.length > 0) {
      const placeholders = communities.map((c, i) => {
        params[`comm_${i}`] = c;
        return `@comm_${i}`;
      });
      conditions.push(`ll.community IN (${placeholders.join(',')})`);
    }
    if (buildings.length > 0) {
      const placeholders = buildings.map((b, i) => {
        params[`bldg_${i}`] = b;
        return `@bldg_${i}`;
      });
      conditions.push(`ll.property_name IN (${placeholders.join(',')})`);
    }
    if (source) {
      conditions.push('ll.source = @source');
      params.source = source;
    }
    if (property_type) {
      conditions.push('ll.type = @property_type');
      params.property_type = property_type;
    }
    if (listing_type && listing_type !== 'Both') {
      conditions.push('ll.purpose = @listing_type');
      params.listing_type = listing_type;
    }
    if (max_price) {
      conditions.push('ll.price_aed <= @max_price');
      params.max_price = parseInt(max_price);
    }
    if (min_sqft) {
      conditions.push('ll.size_sqft >= @min_sqft');
      params.min_sqft = parseInt(min_sqft);
    }

    const whereClause = conditions.length ? 'AND ' + conditions.join(' AND ') : '';

    const highestPct = db.prepare(`
      ${LISTINGS_CTE}
      ${LISTINGS_SELECT} ${whereClause}
      ORDER BY dip_percent DESC LIMIT 1
    `).get(params);

    const highestVal = db.prepare(`
      ${LISTINGS_CTE}
      ${LISTINGS_SELECT} ${whereClause}
      ORDER BY dip_amount DESC LIMIT 1
    `).get(params);

    const hottestArea = db.prepare(`
      ${LISTINGS_CTE}
      SELECT location, COUNT(*) as count FROM (
        ${LISTINGS_SELECT} ${whereClause} AND ll.scraped_at >= datetime('now', '-7 days')
      ) GROUP BY location ORDER BY count DESC LIMIT 1
    `).get(params);

    const newToday = db.prepare(`
      ${LISTINGS_CTE}
      SELECT COUNT(*) as count FROM (
        ${LISTINGS_SELECT} ${whereClause} AND ll.scraped_at >= datetime('now', '-24 hours')
      )
    `).get(params);

    res.json({
      highest_pct_listing: highestPct ? {
        listing_id: highestPct.id,
        dip_percent: highestPct.dip_percent,
        title: highestPct.listing_title,
        location: highestPct.location,
      } : null,
      highest_val_listing: highestVal ? {
        listing_id: highestVal.id,
        dip_amount: highestVal.dip_amount,
        title: highestVal.listing_title,
        location: highestVal.location,
      } : null,
      hottest_area: hottestArea || { location: 'N/A', count: 0 },
      new_today_count: newToday?.count || 0,
    });
  } catch (err) {
    console.error('KPI error:', err.message);
    res.status(500).json({ error: 'Failed to fetch KPIs' });
  }
});

function parseArrayParam(query, key) {
  const val = query[key] || query[`${key}[]`];
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  return val.split(',').map(s => s.trim()).filter(Boolean);
}

export default router;
