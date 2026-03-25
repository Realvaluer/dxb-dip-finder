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

// ── caching layer ─────────────────────────────────────────────────────────────

// Sale/rent combo cache: key → { data, ts }
const saleCache = new Map();
const SALE_CACHE_TTL = 30 * 60 * 1000; // 30 min

function getCachedSale(key) {
  const entry = saleCache.get(key);
  if (entry && Date.now() - entry.ts < SALE_CACHE_TTL) return entry.data;
  saleCache.delete(key);
  return undefined;
}
function setCachedSale(key, data) {
  saleCache.set(key, { data, ts: Date.now() });
}

// KPI cache: filterKey → { data, ts }
const kpiCache = new Map();
const KPI_CACHE_TTL = 5 * 60 * 1000; // 5 min

// Filter-options cache (single entry, rarely changes)
let filterOptionsCache = { data: null, ts: 0 };
const FILTER_OPTIONS_TTL = 30 * 60 * 1000; // 30 min

// Cleanup stale cache entries every 5 min
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of saleCache) if (now - v.ts > SALE_CACHE_TTL) saleCache.delete(k);
  for (const [k, v] of kpiCache) if (now - v.ts > KPI_CACHE_TTL) kpiCache.delete(k);
}, 5 * 60 * 1000);

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

// Batch-fetch last comparable transaction for each listing from RealValuer DB
// SALE listings → rv_sales (Sale/Pre-registration after 1 Jan 2025)
// RENT listings → rv_rentals (RERA rental contracts after 1 Jan 2025)
// Match: same property_name, same community, same bedrooms, ±10% size
async function fetchLastSales(rows) {
  if (!salesDb) return {};
  const resultMap = {};

  // Split by purpose
  const saleRows = rows.filter(r => r.purpose && r.purpose.toLowerCase() === 'sale');
  const rentRows = rows.filter(r => r.purpose && r.purpose.toLowerCase() === 'rent');

  // Helper: group rows by property/community/bedrooms
  function groupCombos(rowList) {
    const combos = new Map();
    for (const row of rowList) {
      if (!row.property_name || !row.community || row.bedrooms == null) continue;
      const key = `${row.property_name.toLowerCase()}|${row.community.toLowerCase()}|${row.bedrooms}`;
      if (!combos.has(key)) {
        combos.set(key, { property_name: row.property_name, community: row.community, bedrooms: row.bedrooms, listings: [] });
      }
      combos.get(key).listings.push(row);
    }
    return [...combos.values()];
  }

  // Helper: match listing to best result by ±20% size (relaxed from ±10%)
  function matchBySize(listing, candidates) {
    const listingSize = listing.size_sqft || 0;
    const minSize = listingSize * 0.8;
    const maxSize = listingSize * 1.2;
    // First try ±20% match
    const sizeMatch = candidates.find(s => {
      if (!listingSize || !s.size_sqft) return true;
      return s.size_sqft >= minSize && s.size_sqft <= maxSize;
    });
    if (sizeMatch) return sizeMatch;
    // Fallback: pick closest size if within ±40%
    if (!listingSize) return candidates[0];
    let best = null, bestDiff = Infinity;
    for (const s of candidates) {
      if (!s.size_sqft) continue;
      const diff = Math.abs(s.size_sqft - listingSize) / listingSize;
      if (diff < 0.4 && diff < bestDiff) { best = s; bestDiff = diff; }
    }
    return best;
  }

  // Helper: process combos in parallel batches (25 concurrent, with caching)
  async function processCombos(entries, queryFn, cachePrefix) {
    for (let i = 0; i < entries.length; i += 25) {
      const batch = entries.slice(i, i + 25);
      await Promise.all(batch.map(async (combo) => {
        try {
          const cacheKey = `${cachePrefix}|${combo.property_name.toLowerCase()}|${combo.community.toLowerCase()}|${combo.bedrooms}`;
          let data = getCachedSale(cacheKey);
          if (data === undefined) {
            data = await queryFn(combo);
            setCachedSale(cacheKey, data || []);
          }
          if (!data || data.length === 0) return;
          for (const listing of combo.listings) {
            const match = matchBySize(listing, data);
            if (match) {
              resultMap[listing.id] = {
                sale_price: match.price,
                sale_price_sqft: match.price_sqft,
                sale_date: match.date,
                sale_size: match.size_sqft,
                sale_bedrooms: match.bedrooms,
                sale_type: match._type || null,
              };
            }
          }
        } catch (err) { /* skip */ }
      }));
    }
  }

  // ── Process SALE and RENT combos in parallel ──
  const saleCombos = groupCombos(saleRows);
  const rentCombos = groupCombos(rentRows);

  // Normalize name for fuzzy matching: "DT1" → "%dt1%", "Marina Gate 1" → "%marina gate 1%"
  function fuzzyName(name) {
    let n = name.toLowerCase().replace(/^the\s+/i, '').trim();
    // Insert % at letter↔digit boundaries: "dt1" → "dt%1", "a2" → "a%2"
    n = n.replace(/([a-z])(\d)/g, '$1%$2');
    n = n.replace(/(\d)([a-z])/g, '$1%$2');
    return `%${n}%`;
  }

  await Promise.all([
    processCombos(saleCombos, async (combo) => {
      const bed = parseInt(combo.bedrooms, 10);
      const namePattern = fuzzyName(combo.property_name);
      const { data } = await salesDb
        .from('rv_sales')
        .select('id, price, price_sqft, size_sqft, date, bedrooms, subtype')
        .eq('is_valid', true)
        .or('subtype.eq.Sale,subtype.eq.Pre-registration')
        .ilike('property_name', namePattern)
        .ilike('community_name', `%${combo.community.toLowerCase()}%`)
        .eq('bedrooms', bed)
        .gte('date', '2025-01-01')
        .order('date', { ascending: false })
        .limit(10);
      return (data || []).map(r => ({ ...r, _type: r.subtype }));
    }, 'sale'),
    processCombos(rentCombos, async (combo) => {
      const bed = parseInt(combo.bedrooms, 10);
      const namePattern = fuzzyName(combo.property_name);
      const { data } = await salesDb
        .from('rv_rentals')
        .select('id, price, price_sqft, size_sqft, date, bedrooms')
        .eq('is_valid', true)
        .eq('property_category', 'Residential')
        .ilike('property_name', namePattern)
        .ilike('community_name', `%${combo.community.toLowerCase()}%`)
        .eq('bedrooms', bed)
        .gte('date', '2025-01-01')
        .order('date', { ascending: false })
        .limit(10);
      return (data || []).map(r => ({ ...r, _type: 'Rent listing' }));
    }, 'rent'),
  ]);

  return resultMap;
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

    // Fetch ref data (fast — same DB), return listings immediately without waiting for sales
    const refMap = await fetchRefData(data || []);

    res.json({
      listings: (data || []).map(r => mapRow(r, refMap[r.dip_ref_id], null)),
      total: count || 0,
    });
  } catch (err) {
    console.error('Listings error:', err);
    res.status(500).json({ error: 'Failed to fetch listings' });
  }
});

// ── POST /api/listings/sales — non-blocking sale/rent lookup ────────────────

app.post('/api/listings/sales', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) return res.json({});

    // Fetch the listings by ID to get property details for matching
    const idList = ids.slice(0, 200).map(Number).filter(n => !isNaN(n));
    const { data, error } = await supabase
      .from(TABLE)
      .select('id, property_name, community, bedrooms, size_sqft, purpose, price_aed')
      .in('id', idList);

    if (error) throw error;

    const saleMap = await fetchLastSales(data || []);

    // Return { id: { last_sale_price, last_sale_date, last_sale_change, ... } }
    const result = {};
    for (const row of (data || [])) {
      const sale = saleMap[row.id];
      if (sale) {
        result[row.id] = {
          last_sale_price: sale.sale_price,
          last_sale_date: sale.sale_date,
          last_sale_change: row.price_aed - sale.sale_price,
          last_sale_size: sale.sale_size,
          last_sale_type: sale.sale_type,
        };
      }
    }
    res.json(result);
  } catch (err) {
    console.error('Sales lookup error:', err);
    res.json({});
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
    // Check KPI cache
    const cacheKey = `kpi:${new URLSearchParams(req.query).toString()}`;
    const cached = kpiCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < KPI_CACHE_TTL) {
      return res.json(cached.data);
    }

    // Get latest date in DB as "today"
    const { data: latestRow } = await supabase
      .from(TABLE)
      .select('date_listed')
      .eq('is_valid', true)
      .order('date_listed', { ascending: false })
      .limit(1)
      .single();
    const latestDate = latestRow?.date_listed;

    // Run all 4 KPI queries in parallel
    const [pctResult, aedResult, commResult, dipsResult] = await Promise.all([
      // 1. Highest % drop TODAY
      (() => {
        let q = supabase.from(TABLE).select('id, dip_pct, property_name, community')
          .eq('is_valid', true).eq('date_listed', latestDate || '')
          .not('dip_pct', 'is', null).lt('dip_pct', 0)
          .order('dip_pct', { ascending: true }).limit(1);
        q = applyFilters(q, req.query);
        return q;
      })(),
      // 2. Highest AED drop TODAY
      (() => {
        let q = supabase.from(TABLE).select('id, dip_price, property_name, community')
          .eq('is_valid', true).eq('date_listed', latestDate || '')
          .not('dip_price', 'is', null).lt('dip_price', 0)
          .order('dip_price', { ascending: true }).limit(1);
        q = applyFilters(q, req.query);
        return q;
      })(),
      // 3. Community with most drops — single query (limit 10000)
      supabase.from(TABLE).select('community')
        .eq('is_valid', true).not('dip_pct', 'is', null).lt('dip_pct', 0)
        .limit(10000),
      // 4. Dips in last 24h
      (() => {
        let q = supabase.from(TABLE).select('id', { count: 'exact', head: true })
          .eq('is_valid', true).eq('date_listed', latestDate || '')
          .not('dip_pct', 'is', null).lt('dip_pct', 0);
        q = applyFilters(q, req.query);
        return q;
      })(),
    ]);

    // Process community counts
    let mostDrops = null;
    if (commResult.data?.length) {
      const counts = {};
      commResult.data.forEach(r => { if (r.community) counts[r.community] = (counts[r.community] || 0) + 1; });
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      if (top) mostDrops = { community: top[0], count: top[1] };
    }

    const highestPct = pctResult.data?.[0] ? {
      listing_id: pctResult.data[0].id,
      change_pct: Math.round(pctResult.data[0].dip_pct * 10) / 10,
      property_name: pctResult.data[0].property_name,
      community: pctResult.data[0].community,
    } : null;

    const highestAed = aedResult.data?.[0] ? {
      listing_id: aedResult.data[0].id,
      change_aed: aedResult.data[0].dip_price,
      property_name: aedResult.data[0].property_name,
      community: aedResult.data[0].community,
    } : null;

    const result = {
      highest_dip_pct: highestPct,
      highest_dip_aed: highestAed,
      most_drops_community: mostDrops,
      dips_today: dipsResult.count || 0,
    };

    // Cache result
    kpiCache.set(cacheKey, { data: result, ts: Date.now() });

    res.json(result);
  } catch (err) {
    console.error('KPIs error:', err);
    res.status(500).json({ error: 'Failed to fetch KPIs' });
  }
});

// ── GET /api/filter-options ──────────────────────────────────────────────────

app.get('/api/filter-options', async (req, res) => {
  try {
    // Check cache
    if (filterOptionsCache.data && Date.now() - filterOptionsCache.ts < FILTER_OPTIONS_TTL) {
      return res.json(filterOptionsCache.data);
    }

    // Supabase doesn't have DISTINCT — fetch unique values
    const [commRes, typeRes, sourceRes, purposeRes] = await Promise.all([
      supabase.from(TABLE).select('community').eq('is_valid', true).not('community', 'is', null).limit(5000),
      supabase.from(TABLE).select('type').eq('is_valid', true).not('type', 'is', null).limit(2000),
      supabase.from(TABLE).select('source').eq('is_valid', true).limit(1000),
      supabase.from(TABLE).select('purpose').eq('is_valid', true).not('purpose', 'is', null).limit(1000),
    ]);

    const unique = (arr, key) => [...new Set((arr || []).map(r => r[key]).filter(Boolean))].sort();

    const result = {
      communities: unique(commRes.data, 'community'),
      property_names: [], // Too many to fetch — searched via search endpoints
      types: unique(typeRes.data, 'type'),
      sources: unique(sourceRes.data, 'source'),
      purposes: unique(purposeRes.data, 'purpose'),
    };

    // Cache result
    filterOptionsCache = { data: result, ts: Date.now() };

    res.json(result);
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
