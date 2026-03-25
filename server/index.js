import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabase, salesDb, usersDb } from './db.js';
import { registerAuthRoutes, requireAuth } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

const TABLE = 'ddf_listings';

app.use(helmet());
app.use(compression());
app.use(express.json());
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));

// ── helpers ──────────────────────────────────────────────────────────────────

// The select fields we use for listings (map Supabase columns to API shape)
const LISTING_SELECT = '*';

function mapRow(row, refData, saleData) {
  if (!row) return null;
  const ref = refData || null;
  const sale = saleData || null;
  // listing_change is only valid if |change| < 50% of price (filters out reference collisions)
  const validListingChange = row.listing_change != null && row.listing_change !== 0
    && row.price_aed && Math.abs(row.listing_change) < (row.price_aed * 0.5);
  // Listing vs Last Sale: difference between listing price and last DLD sale price
  const saleChange = sale ? row.price_aed - sale.sale_price : null;
  return {
    id: row.id,
    reference_no: row.reference_no,
    source: row.source,
    scraped_at: row.scraped_at,
    date_listed: row.date_listed,
    purpose: row.purpose,
    title: row.title,
    distress: row.distress,
    ready_off_plan: row.ready_off_plan,
    city: row.city,
    community: row.community,
    property_name: row.property_name,
    type: row.type,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    size_sqft: row.size_sqft,
    furnished: row.furnished,
    price_aed: row.price_aed,
    price_sqft: row.price_sqft,
    listing_change: validListingChange ? row.listing_change : null,
    listing_change_prev_price: validListingChange ? row.price_aed - row.listing_change : null,
    broker_agency: row.broker_agency,
    url: row.url,
    lat: row.lat,
    lng: row.lng,
    // Map dip columns to the change_pct / change_aed the frontend expects
    change_pct: row.dip_pct != null && row.dip_pct !== 0 ? Math.round(row.dip_pct * 10) / 10 : null,
    change_aed: row.dip_price != null && row.dip_price !== 0 ? row.dip_price : null,
    // Previous listing data — prefer dip_prev_* columns, fallback to ref lookup
    previous_price: row.dip_prev_price || (ref ? ref.price_aed : null),
    price_changed_at: row.dip_prev_date || (ref ? ref.date_listed : null),
    previous_url: row.dip_prev_url || (ref ? ref.url : null),
    dip_prev_source: row.dip_prev_source || (ref ? ref.source : null),
    dip_prev_size: row.dip_prev_size || (ref ? ref.size_sqft : null),
    dip_prev_furnished: row.dip_prev_furnished || (ref ? ref.furnished : null),
    // Listing vs Last Sale
    last_sale_price: sale ? sale.sale_price : null,
    last_sale_date: sale ? sale.sale_date : null,
    last_sale_change: saleChange,
    last_sale_size: sale ? sale.sale_size : null,
    last_sale_type: sale ? sale.sale_type : null,
  };
}

// Batch-fetch reference listings for dip_ref_id lookups
async function fetchRefData(rows) {
  const refIds = [...new Set(rows.filter(r => r.dip_ref_id).map(r => r.dip_ref_id))];
  if (refIds.length === 0) return {};

  // Supabase IN query supports up to ~300 ids at once
  const refMap = {};
  for (let i = 0; i < refIds.length; i += 200) {
    const batch = refIds.slice(i, i + 200);
    const { data } = await supabase
      .from(TABLE)
      .select('id, price_aed, url, source, date_listed, size_sqft, furnished, property_name, community')
      .in('id', batch);
    (data || []).forEach(r => { refMap[r.id] = r; });
  }
  return refMap;
}

// Batch-fetch last sale for each SALE listing from RealValuer sales DB
// Match: same property_name, same community, same bedrooms, ±10% size
// Only looks at Sale and Pre-registration transactions after 1 Jan 2025
async function fetchLastSales(rows) {
  if (!salesDb) return {};
  const saleMap = {};

  // Only match for SALE listings, not rent
  const saleRows = rows.filter(r => r.purpose && r.purpose.toLowerCase() === 'sale');

  // Group unique property/community/bedrooms combos to minimize queries
  const combos = new Map();
  for (const row of saleRows) {
    if (!row.property_name || !row.community || row.bedrooms == null) continue;
    const key = `${row.property_name.toLowerCase()}|${row.community.toLowerCase()}|${row.bedrooms}`;
    if (!combos.has(key)) {
      combos.set(key, { property_name: row.property_name, community: row.community, bedrooms: row.bedrooms, listings: [] });
    }
    combos.get(key).listings.push(row);
  }

  // Query sales for each combo (parallel, max 10 concurrent)
  const entries = [...combos.values()];
  for (let i = 0; i < entries.length; i += 10) {
    const batch = entries.slice(i, i + 10);
    await Promise.all(batch.map(async (combo) => {
      try {
        const bed = parseInt(combo.bedrooms, 10);
        const { data } = await salesDb
          .from('rv_sales')
          .select('id, price, price_sqft, size_sqft, date, property_name, community_name, bedrooms, subtype')
          .eq('is_valid', true)
          .or('subtype.eq.Sale,subtype.eq.Pre-registration')
          .ilike('property_name', combo.property_name)
          .ilike('community_name', combo.community)
          .eq('bedrooms', bed)
          .gte('date', '2025-01-01')
          .order('date', { ascending: false })
          .limit(3);

        if (!data || data.length === 0) return;

        // For each listing in this combo, find best matching sale (±10% size)
        for (const listing of combo.listings) {
          const listingSize = listing.size_sqft || 0;
          const minSize = listingSize * 0.9;
          const maxSize = listingSize * 1.1;

          const match = data.find(s => {
            if (!listingSize || !s.size_sqft) return true; // skip size check if missing
            return s.size_sqft >= minSize && s.size_sqft <= maxSize;
          });

          if (match) {
            saleMap[listing.id] = {
              sale_price: match.price,
              sale_price_sqft: match.price_sqft,
              sale_date: match.date,
              sale_size: match.size_sqft,
              sale_bedrooms: match.bedrooms,
              sale_type: match.transaction_type_name,
            };
          }
        }
      } catch (err) {
        // Silently skip failed lookups
      }
    }));
  }
  return saleMap;
}

function toArray(val) {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

// Apply filters to a Supabase query
function applyFilters(query, params) {
  if (params.search) {
    query = query.or(`community.ilike.%${params.search}%,property_name.ilike.%${params.search}%`);
  }
  if (params.purpose) {
    query = query.ilike('purpose', params.purpose);
  }
  if (params.type) {
    query = query.eq('type', params.type);
  }
  if (params.source) {
    query = query.eq('source', params.source);
  }
  if (params.bedrooms !== undefined && params.bedrooms !== null && params.bedrooms !== '') {
    const bed = parseInt(params.bedrooms, 10);
    if (bed === 4) {
      query = query.gte('bedrooms', '4');
    } else if (bed === 0) {
      query = query.or('bedrooms.is.null,bedrooms.eq.0');
    } else {
      query = query.eq('bedrooms', String(bed));
    }
  }
  if (params.max_price) {
    query = query.lte('price_aed', parseInt(params.max_price, 10));
  }
  if (params.min_sqft) {
    query = query.gte('size_sqft', parseInt(params.min_sqft, 10));
  }

  const communities = toArray(params['community[]'] || params.community || params.community_arr);
  if (communities.length) {
    query = query.in('community', communities);
  }

  const buildings = toArray(params['property_name[]'] || params.property_name || params.property_name_arr);
  if (buildings.length) {
    query = query.in('property_name', buildings);
  }

  if (params.date_from) {
    query = query.gte('date_listed', params.date_from);
  }
  if (params.date_to) {
    query = query.lte('date_listed', params.date_to);
  }

  if (params.min_dip && parseFloat(params.min_dip) > 0) {
    query = query.not('dip_pct', 'is', null).lte('dip_pct', -parseFloat(params.min_dip));
  }

  if (params.ids) {
    const idList = params.ids.split(',').map(Number).filter(n => !isNaN(n));
    if (idList.length > 0) {
      query = query.in('id', idList);
    }
  }

  return query;
}

function applySort(query, sort) {
  switch (sort) {
    case 'dip_pct':
      return query.order('dip_pct', { ascending: true, nullsFirst: false });
    case 'dip_aed':
      return query.order('dip_price', { ascending: true, nullsFirst: false });
    case 'listing_change':
      return query.not('listing_change', 'is', null).neq('listing_change', 0).order('listing_change', { ascending: true, nullsFirst: false });
    case 'price_asc':
      return query.order('price_aed', { ascending: true });
    case 'price_desc':
      return query.order('price_aed', { ascending: false });
    case 'newest':
    default:
      return query.order('date_listed', { ascending: false }).order('community', { ascending: true });
  }
}

// ── GET /api/listings ────────────────────────────────────────────────────────

app.get('/api/listings', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = parseInt(req.query.offset, 10) || 0;

    let query = supabase
      .from(TABLE)
      .select(LISTING_SELECT, { count: 'exact' })
      .eq('is_valid', true)
      .range(offset, offset + limit - 1);

    query = applyFilters(query, req.query);
    query = applySort(query, req.query.sort);

    const { data, count, error } = await query;
    if (error) throw error;

    // Batch-fetch reference listings and last sales in parallel
    const [refMap, saleMap] = await Promise.all([
      fetchRefData(data || []),
      fetchLastSales(data || []),
    ]);

    res.json({
      listings: (data || []).map(r => mapRow(r, refMap[r.dip_ref_id], saleMap[r.id])),
      total: count || 0,
    });
  } catch (err) {
    console.error('Listings error:', err);
    res.status(500).json({ error: 'Failed to fetch listings' });
  }
});

// ── GET /api/listings/count ──────────────────────────────────────────────────

app.get('/api/listings/count', async (req, res) => {
  try {
    let query = supabase
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('is_valid', true);

    query = applyFilters(query, req.query);

    const { count, error } = await query;
    if (error) throw error;

    res.json({ total: count || 0 });
  } catch (err) {
    console.error('Count error:', err);
    res.status(500).json({ error: 'Failed to get count' });
  }
});

// ── GET /api/listings/:id ────────────────────────────────────────────────────

app.get('/api/listings/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    const { data: row, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .single();

    if (error || !row) return res.status(404).json({ error: 'Not found' });

    // Get edits (price history) from ddf_edits
    const { data: edits } = await supabase
      .from('ddf_edits')
      .select('old_value, new_value, edited_at')
      .eq('listing_id', id)
      .eq('field_name', 'price_aed')
      .order('edited_at', { ascending: false });

    // Get comparison — prefer dip_prev_* columns, fallback to dip_ref_id JOIN
    let comparison = null;
    let refData = null;
    if (row.dip_prev_price) {
      comparison = {
        url: row.dip_prev_url,
        source: row.dip_prev_source,
        price: row.dip_prev_price,
        date: row.dip_prev_date,
        size: row.dip_prev_size,
        furnished: row.dip_prev_furnished,
      };
    } else if (row.dip_ref_id) {
      const { data: ref } = await supabase
        .from(TABLE)
        .select('id, url, source, price_aed, date_listed, size_sqft, furnished')
        .eq('id', row.dip_ref_id)
        .single();

      if (ref) {
        refData = ref;
        comparison = {
          url: ref.url,
          source: ref.source,
          price: ref.price_aed,
          date: ref.date_listed,
          size: ref.size_sqft,
          furnished: ref.furnished,
        };
      }
    }

    // Fetch last sale for this listing
    const saleMap = await fetchLastSales([row]);
    const mapped = mapRow(row, refData, saleMap[row.id]);
    res.json({
      ...mapped,
      price_history: edits || [],
      comparison,
    });
  } catch (err) {
    console.error('Listing detail error:', err);
    res.status(500).json({ error: 'Failed to fetch listing' });
  }
});

// ── GET /api/kpis ────────────────────────────────────────────────────────────

app.get('/api/kpis', async (req, res) => {
  try {
    // Get latest date in DB as "today"
    const { data: latestRow } = await supabase
      .from(TABLE)
      .select('date_listed')
      .eq('is_valid', true)
      .order('date_listed', { ascending: false })
      .limit(1)
      .single();
    const latestDate = latestRow?.date_listed;

    // 1. Highest % drop TODAY
    let pctQuery = supabase
      .from(TABLE)
      .select('id, dip_pct, property_name, community')
      .eq('is_valid', true)
      .eq('date_listed', latestDate || '')
      .not('dip_pct', 'is', null)
      .lt('dip_pct', 0)
      .order('dip_pct', { ascending: true })
      .limit(1);
    pctQuery = applyFilters(pctQuery, req.query);
    const { data: pctData } = await pctQuery;

    // 2. Highest AED drop TODAY
    let aedQuery = supabase
      .from(TABLE)
      .select('id, dip_price, property_name, community')
      .eq('is_valid', true)
      .eq('date_listed', latestDate || '')
      .not('dip_price', 'is', null)
      .lt('dip_price', 0)
      .order('dip_price', { ascending: true })
      .limit(1);
    aedQuery = applyFilters(aedQuery, req.query);
    const { data: aedData } = await aedQuery;

    // 3. Community with most drops (negative dip_pct only)
    let mostDrops = null;
    {
      let allComm = [];
      let from = 0;
      const batchSize = 1000;
      for (let i = 0; i < 10; i++) {
        const { data: batch } = await supabase
          .from(TABLE)
          .select('community')
          .eq('is_valid', true)
          .not('dip_pct', 'is', null)
          .lt('dip_pct', 0)
          .range(from, from + batchSize - 1);
        if (!batch || batch.length === 0) break;
        allComm = allComm.concat(batch);
        if (batch.length < batchSize) break;
        from += batchSize;
      }
      if (allComm.length) {
        const counts = {};
        allComm.forEach(r => { if (r.community) counts[r.community] = (counts[r.community] || 0) + 1; });
        const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
        if (top) mostDrops = { community: top[0], count: top[1] };
      }
    }

    // 4. Dips in last 24h (listings with negative dip_pct on latest date)
    let dipsQuery = supabase
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('is_valid', true)
      .eq('date_listed', latestDate || '')
      .not('dip_pct', 'is', null)
      .lt('dip_pct', 0);
    dipsQuery = applyFilters(dipsQuery, req.query);
    const { count: dipsToday } = await dipsQuery;

    const highestPct = pctData?.[0] ? {
      listing_id: pctData[0].id,
      change_pct: Math.round(pctData[0].dip_pct * 10) / 10,
      property_name: pctData[0].property_name,
      community: pctData[0].community,
    } : null;

    const highestAed = aedData?.[0] ? {
      listing_id: aedData[0].id,
      change_aed: aedData[0].dip_price,
      property_name: aedData[0].property_name,
      community: aedData[0].community,
    } : null;

    res.json({
      highest_dip_pct: highestPct,
      highest_dip_aed: highestAed,
      most_drops_community: mostDrops,
      dips_today: dipsToday || 0,
    });
  } catch (err) {
    console.error('KPIs error:', err);
    res.status(500).json({ error: 'Failed to fetch KPIs' });
  }
});

// ── GET /api/filter-options ──────────────────────────────────────────────────

app.get('/api/filter-options', async (req, res) => {
  try {
    // Supabase doesn't have DISTINCT — fetch unique values
    const [commRes, typeRes, sourceRes, purposeRes] = await Promise.all([
      supabase.from(TABLE).select('community').eq('is_valid', true).not('community', 'is', null).limit(5000),
      supabase.from(TABLE).select('type').eq('is_valid', true).not('type', 'is', null).limit(2000),
      supabase.from(TABLE).select('source').eq('is_valid', true).limit(1000),
      supabase.from(TABLE).select('purpose').eq('is_valid', true).not('purpose', 'is', null).limit(1000),
    ]);

    const unique = (arr, key) => [...new Set((arr || []).map(r => r[key]).filter(Boolean))].sort();

    res.json({
      communities: unique(commRes.data, 'community'),
      property_names: [], // Too many to fetch — searched via search endpoints
      types: unique(typeRes.data, 'type'),
      sources: unique(sourceRes.data, 'source'),
      purposes: unique(purposeRes.data, 'purpose'),
    });
  } catch (err) {
    console.error('Filter options error:', err);
    res.status(500).json({ error: 'Failed to fetch filter options' });
  }
});

// ── GET /api/search-suggestions ───────────────────────────────────────────────

app.get('/api/search-suggestions', async (req, res) => {
  try {
    const q = req.query.q;
    if (!q || q.length < 2) return res.json({ communities: [], buildings: [] });

    const [commRes, bldRes] = await Promise.all([
      supabase.rpc('search_communities', { query: `%${q}%` }),
      supabase.rpc('search_buildings', { query: `%${q}%` }),
    ]);

    // Fallback if RPCs don't exist
    let communities = commRes.data || [];
    let buildings = bldRes.data || [];

    if (commRes.error) {
      const { data } = await supabase
        .from(TABLE)
        .select('community')
        .eq('is_valid', true)
        .ilike('community', `%${q}%`)
        .not('community', 'is', null)
        .limit(500);
      const counts = {};
      (data || []).forEach(r => { if (r.community) counts[r.community] = (counts[r.community] || 0) + 1; });
      communities = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, cnt]) => ({ label, cnt }));
    }
    if (bldRes.error) {
      const { data } = await supabase
        .from(TABLE)
        .select('property_name')
        .eq('is_valid', true)
        .ilike('property_name', `%${q}%`)
        .not('property_name', 'is', null)
        .limit(500);
      const counts = {};
      (data || []).forEach(r => { if (r.property_name) counts[r.property_name] = (counts[r.property_name] || 0) + 1; });
      buildings = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, cnt]) => ({ label, cnt }));
    }

    res.json({ communities, buildings });
  } catch (err) {
    console.error('Suggestions error:', err);
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

// ── GET /api/search-community ─────────────────────────────────────────────────

app.get('/api/search-community', async (req, res) => {
  try {
    const q = req.query.q;
    if (!q || q.length < 2) return res.json([]);

    const { data } = await supabase
      .from(TABLE)
      .select('community')
      .eq('is_valid', true)
      .ilike('community', `%${q}%`)
      .not('community', 'is', null)
      .limit(1000);

    const counts = {};
    (data || []).forEach(r => { if (r.community) counts[r.community] = (counts[r.community] || 0) + 1; });
    const results = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, cnt]) => ({ label, cnt }));
    res.json(results);
  } catch (err) {
    res.status(500).json([]);
  }
});

// ── GET /api/search-building ─────────────────────────────────────────────────

app.get('/api/search-building', async (req, res) => {
  try {
    const q = req.query.q;
    if (!q || q.length < 2) return res.json([]);

    const { data } = await supabase
      .from(TABLE)
      .select('property_name')
      .eq('is_valid', true)
      .ilike('property_name', `%${q}%`)
      .not('property_name', 'is', null)
      .neq('property_name', '')
      .limit(1000);

    const counts = {};
    (data || []).forEach(r => { if (r.property_name) counts[r.property_name] = (counts[r.property_name] || 0) + 1; });
    const results = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, cnt]) => ({ label, cnt }));
    res.json(results);
  } catch (err) {
    res.status(500).json([]);
  }
});

// ── GET /api/health ──────────────────────────────────────────────────────────

app.get('/api/health', async (req, res) => {
  try {
    const { count, error } = await supabase
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('is_valid', true);

    if (error) throw error;
    res.json({
      total: count || 0,
      db: 'supabase',
      timestamp: new Date().toISOString(),
      resend_configured: !!process.env.RESEND_API_KEY,
      users_db: !!usersDb,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SSE endpoint (simplified — Supabase Realtime can be added later) ────────

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

// ── Auth routes ──────────────────────────────────────────────────────────────

registerAuthRoutes(app);

// ── Saved listings routes ────────────────────────────────────────────────────

app.get('/api/saved/ids', requireAuth, (req, res) => {
  if (!usersDb) return res.json([]);
  const rows = usersDb.prepare('SELECT listing_id FROM saved_listings WHERE user_id = ?').all(req.user.user_id);
  res.json(rows.map(r => r.listing_id));
});

app.get('/api/saved', requireAuth, async (req, res) => {
  if (!usersDb) return res.json({ listings: [], total: 0 });
  try {
    const savedIds = usersDb.prepare('SELECT listing_id FROM saved_listings WHERE user_id = ? ORDER BY saved_at DESC').all(req.user.user_id);
    if (savedIds.length === 0) return res.json({ listings: [], total: 0 });

    const ids = savedIds.map(r => r.listing_id);
    const { data, error } = await supabase
      .from(TABLE)
      .select(LISTING_SELECT)
      .in('id', ids);

    if (error) throw error;
    const [refMap, saleMap] = await Promise.all([
      fetchRefData(data || []),
      fetchLastSales(data || []),
    ]);
    const rows = (data || []).map(r => mapRow(r, refMap[r.dip_ref_id], saleMap[r.id]));
    res.json({ listings: rows, total: rows.length });
  } catch (err) {
    console.error('Saved listings error:', err);
    res.status(500).json({ error: 'Failed to fetch saved listings' });
  }
});

app.post('/api/saved/:listing_id', requireAuth, (req, res) => {
  if (!usersDb) return res.status(503).json({ error: 'Auth not available' });
  usersDb.prepare('INSERT OR IGNORE INTO saved_listings (user_id, listing_id) VALUES (?, ?)').run(req.user.user_id, parseInt(req.params.listing_id));
  res.json({ saved: true });
});

app.delete('/api/saved/:listing_id', requireAuth, (req, res) => {
  if (!usersDb) return res.status(503).json({ error: 'Auth not available' });
  usersDb.prepare('DELETE FROM saved_listings WHERE user_id = ? AND listing_id = ?').run(req.user.user_id, parseInt(req.params.listing_id));
  res.json({ saved: false });
});

// ── static files (production) ────────────────────────────────────────────────

const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// ── start ────────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Dip Finder running on http://0.0.0.0:${PORT}`);
  try {
    const { count } = await supabase.from(TABLE).select('id', { count: 'exact', head: true }).eq('is_valid', true);
    console.log(`Supabase: ${count} listings`);
  } catch (e) {
    console.error('Supabase connection check failed:', e.message);
  }
});
