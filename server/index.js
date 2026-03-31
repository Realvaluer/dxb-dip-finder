import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabase, salesDb, usersDb } from './db.js';
import { registerAuthRoutes, requireAuth } from './auth.js';
import analyticsRouter from './routes/analytics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

const TABLE = 'ddf_listings';

app.use(helmet());
app.use(cors({ origin: ['https://dxbdipfinder.com', 'https://www.dxbdipfinder.com', 'https://admin.dxbdipfinder.com'] }));
app.use(compression());
app.use(express.json());
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));

// ── caching layer ─────────────────────────────────────────────────────────────

// Sale/rent combo cache: key → { data, ts }
const saleCache = new Map();
const SALE_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

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
const KPI_CACHE_TTL = 15 * 60 * 1000; // 15 min

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

// FIX 2: Select only fields the frontend needs (was SELECT * → 113KB, now ~40KB)
const LISTING_SELECT = 'id, reference_no, source, scraped_at, date_listed, purpose, title, distress, ready_off_plan, city, community, property_name, type, bedrooms, bathrooms, size_sqft, furnished, price_aed, price_sqft, listing_change, broker_agency, url, dip_pct, dip_price, dip_ref_id, dip_prev_price, dip_prev_url, dip_prev_source, dip_prev_date, dip_prev_size, dip_prev_furnished, last_txn_price, last_txn_date, last_txn_change, last_txn_change_pct, last_txn_size, last_txn_type';
// TODO: Add listing_change_method to LISTING_SELECT once column is added via Supabase dashboard

function mapRow(row, refData, saleData) {
  if (!row) return null;
  const ref = refData || null;
  const sale = saleData || null;
  // Pass listing_change through if non-null and non-zero
  const validListingChange = row.listing_change != null && row.listing_change !== 0;
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
    // Only include prev data if we have at least the price — never show partial context
    previous_price: row.dip_prev_price || (ref ? ref.price_aed : null) || null,
    price_changed_at: (row.dip_prev_price || ref) ? (row.dip_prev_date || (ref ? ref.date_listed : null)) : null,
    previous_url: (row.dip_prev_price || ref) ? (row.dip_prev_url || (ref ? ref.url : null)) : null,
    dip_prev_source: (row.dip_prev_price || ref) ? (row.dip_prev_source || (ref ? ref.source : null)) : null,
    dip_prev_size: (row.dip_prev_price || ref) ? (row.dip_prev_size || (ref ? ref.size_sqft : null)) : null,
    dip_prev_furnished: (row.dip_prev_price || ref) ? (row.dip_prev_furnished || (ref ? ref.furnished : null)) : null,
    // Listing vs Last Transaction — prefer pre-computed DB columns, fallback to runtime lookup
    last_sale_price: row.last_txn_price || (sale ? sale.sale_price : null),
    last_sale_date: row.last_txn_date || (sale ? sale.sale_date : null),
    last_sale_change: row.last_txn_change || saleChange,
    last_sale_change_pct: row.last_txn_change_pct != null ? Math.round(row.last_txn_change_pct * 10) / 10 : (sale && sale.sale_price ? Math.round(((row.price_aed - sale.sale_price) / sale.sale_price) * 1000) / 10 : null),
    last_sale_size: row.last_txn_size || (sale ? sale.sale_size : null),
    last_sale_type: row.last_txn_type || (sale ? sale.sale_type : null),
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

  // Transaction quality filters
  function isCleanSale(tx) {
    if (!tx.size_sqft || tx.size_sqft < 100 || tx.size_sqft > 30000) return false;
    if (!tx.price || tx.price < 50000) return false;
    return true;
  }
  function isCleanRental(tx) {
    if (!tx.size_sqft || tx.size_sqft < 100 || tx.size_sqft > 30000) return false;
    if (!tx.price || tx.price > 5000000) return false;
    return true;
  }

  // Helper: match listing to best result by ±15% size
  // For villas/townhouses, prefer RV land_size over size_sqft since DDF portals
  // often report land/plot size while RV size_sqft is built-up area.
  function matchBySize(listing, candidates) {
    const listingSize = listing.size_sqft;
    if (!listingSize) return null;
    const lType = (listing.type || '').toLowerCase();
    const isVilla = lType.includes('villa') || lType.includes('townhouse') || lType.includes('land');
    const rvSize = (c) => (isVilla && c.land_size) ? c.land_size : c.size_sqft;

    const minSize = listingSize * 0.85;
    const maxSize = listingSize * 1.15;
    // First try ±15% match
    const sizeMatch = candidates.find(s => {
      const sz = rvSize(s);
      if (!sz) return false;
      return sz >= minSize && sz <= maxSize;
    });
    if (sizeMatch) return sizeMatch;
    // Fallback: pick closest size if within ±25%
    let best = null, bestDiff = Infinity;
    for (const s of candidates) {
      const sz = rvSize(s);
      if (!sz) continue;
      const diff = Math.abs(sz - listingSize) / listingSize;
      if (diff < 0.25 && diff < bestDiff) { best = s; bestDiff = diff; }
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

  // Normalize name for fuzzy matching: "DT1" → "%dt%1%", strip special chars
  function fuzzyName(name) {
    let n = name.toLowerCase().replace(/^the\s+/i, '').replace(/[''`]/g, '').trim();
    // Insert % at letter↔digit boundaries: "dt1" → "dt%1", "a2" → "a%2"
    n = n.replace(/([a-z])(\d)/g, '$1%$2');
    n = n.replace(/(\d)([a-z])/g, '$1%$2');
    return `%${n}%`;
  }

  // Community aliases: DDF name → also try these in RV
  const COMMUNITY_ALIASES = {
    'dubai south': ['azizi venice', 'dubai south'],
    'dubai south (dubai world central)': ['azizi venice', 'dubai south', 'dubai world central'],
    'downtown dubai': ['downtown dubai', 'business bay'], // SLS is in BB in RV
    "za'abeel": ['zaabeel first', 'zaabeel second', 'zaabeel'],
    'dubai land': ['dubailand', 'dubai land', 'villanova', 'rukan', 'remraam'],
    'al jaddaf': ['al jadaf', 'al jaddaf', 'dubai healthcare city phase 2'],
    'al aweer': ['al aweer first', 'al aweer second', 'al aweer'],
    'jumeirah park': ['jumeirah park'],
    'jebel ali': ['jebel ali first', 'jebel ali downtown', 'jebel ali'],
  };

  // Build community pattern: check aliases, strip special chars
  function communityPattern(community) {
    const key = community.toLowerCase();
    const aliases = COMMUNITY_ALIASES[key];
    if (aliases) {
      // Return multiple patterns joined for OR matching
      return aliases;
    }
    return [key.replace(/[''`()]/g, '')];
  }

  // Query helper: tries name pattern + community patterns, returns best results
  async function queryWithFallbacks(table, namePattern, community, bed, extraFilters, selectFields) {
    const commPatterns = communityPattern(community);

    // Try each community alias
    for (const cp of commPatterns) {
      let q = salesDb.from(table).select(selectFields).eq('is_valid', true);
      for (const [k, v] of Object.entries(extraFilters)) {
        if (k === 'or') q = q.or(v);
        else q = q.eq(k, v);
      }
      q = q.ilike('property_name', namePattern)
        .ilike('community_name', `%${cp}%`)
        .eq('bedrooms', bed)
        .gte('date', '2025-01-01')
        .order('date', { ascending: false })
        .limit(10);
      const { data } = await q;
      if (data && data.length > 0) return data;
    }

    // Fallback: try reversed word order (e.g. "Binghatti Ghost" → "ghost%binghatti")
    const words = namePattern.replace(/%/g, ' ').trim().split(/\s+/);
    if (words.length >= 2) {
      const reversed = `%${words.reverse().join('%')}%`;
      for (const cp of commPatterns) {
        let q = salesDb.from(table).select(selectFields).eq('is_valid', true);
        for (const [k, v] of Object.entries(extraFilters)) {
          if (k === 'or') q = q.or(v);
          else q = q.eq(k, v);
        }
        q = q.ilike('property_name', reversed)
          .ilike('community_name', `%${cp}%`)
          .eq('bedrooms', bed)
          .gte('date', '2025-01-01')
          .order('date', { ascending: false })
          .limit(10);
        const { data } = await q;
        if (data && data.length > 0) return data;
      }
    }

    return [];
  }

  await Promise.all([
    processCombos(saleCombos, async (combo) => {
      const bed = parseInt(combo.bedrooms, 10);
      const namePattern = fuzzyName(combo.property_name);
      const data = await queryWithFallbacks(
        'rv_sales', namePattern, combo.community, bed,
        { or: 'subtype.eq.Sale,subtype.eq.Pre-registration' },
        'id, price, price_sqft, size_sqft, land_size, date, bedrooms, subtype'
      );
      return data.filter(isCleanSale).map(r => ({ ...r, _type: r.subtype }));
    }, 'sale'),
    processCombos(rentCombos, async (combo) => {
      const bed = parseInt(combo.bedrooms, 10);
      const namePattern = fuzzyName(combo.property_name);
      const data = await queryWithFallbacks(
        'rv_rentals', namePattern, combo.community, bed,
        { property_category: 'Residential' },
        'id, price, price_sqft, size_sqft, land_size, date, bedrooms'
      );
      return data.filter(isCleanRental).map(r => ({ ...r, _type: 'Rent listing' }));
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
      return query.order('last_txn_change_pct', { ascending: true, nullsFirst: false });
    case 'dip_aed':
      return query.order('last_txn_change', { ascending: true, nullsFirst: false });
    case 'listing_change':
      // Show all listings, sort by listing_change ASC (biggest drops first), nulls last
      return query.not('listing_change', 'is', null).lt('listing_change', 0).order('listing_change', { ascending: true });
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

    // FIX 4: Only run COUNT(*) when ?count=true (saves ~444ms on pagination/scroll loads)
    const wantCount = req.query.count === 'true';
    let query = supabase
      .from(TABLE)
      .select(LISTING_SELECT, wantCount ? { count: 'exact' } : undefined)
      .eq('is_valid', true)
      .range(offset, offset + limit - 1);

    query = applyFilters(query, req.query);
    query = applySort(query, req.query.sort);

    const { data, count, error } = await query;
    if (error) throw error;

    // All dip_prev_* and last_txn_* columns are pre-stored on the row — no extra round-trips needed.
    const rows = data || [];
    const listings = rows.map(r => mapRow(r, null, null));

    res.json({ listings, total: count || 0 });
  } catch (err) {
    console.error('Listings error:', err);
    res.status(500).json({ error: 'Failed to fetch listings' });
  }
});

// ── POST /api/listings/sales — non-blocking sale/rent lookup ────────────────

// ── POST /api/admin/compute-transactions — batch pre-compute last_txn_* ──────

app.post('/api/admin/compute-transactions', async (req, res) => {
  if (!salesDb) return res.json({ error: 'Sales DB not configured' });
  try {
    const batchSize = 500;
    let processed = 0, updated = 0, offset = 0;
    const startTime = Date.now();

    while (true) {
      const { data: rows } = await supabase
        .from(TABLE)
        .select('id, property_name, community, bedrooms, size_sqft, purpose, price_aed')
        .eq('is_valid', true)
        .is('last_txn_price', null)
        .range(offset, offset + batchSize - 1);

      if (!rows || rows.length === 0) break;

      const saleMap = await fetchLastSales(rows);
      const updates = [];

      for (const row of rows) {
        const sale = saleMap[row.id];
        if (sale) {
          const change = row.price_aed - sale.sale_price;
          const changePct = sale.sale_price ? Math.round(((change) / sale.sale_price) * 1000) / 10 : null;
          updates.push({
            id: row.id,
            last_txn_price: sale.sale_price,
            last_txn_date: sale.sale_date,
            last_txn_change: change,
            last_txn_change_pct: changePct,
            last_txn_size: sale.sale_size,
            last_txn_type: sale.sale_type,
          });
        }
      }

      // Batch update via individual upserts (Supabase doesn't support bulk update by different values)
      for (const u of updates) {
        await supabase.from(TABLE).update({
          last_txn_price: u.last_txn_price,
          last_txn_date: u.last_txn_date,
          last_txn_change: u.last_txn_change,
          last_txn_change_pct: u.last_txn_change_pct,
          last_txn_size: u.last_txn_size,
          last_txn_type: u.last_txn_type,
        }).eq('id', u.id);
      }

      processed += rows.length;
      updated += updates.length;
      console.log(`[compute-txn] Batch: ${processed} processed, ${updated} updated (${Math.round((Date.now() - startTime) / 1000)}s)`);

      if (rows.length < batchSize) break;
      // Don't increment offset — we're filtering by last_txn_price IS NULL, so processed rows won't appear again
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    res.json({ processed, updated, elapsed_seconds: elapsed });
  } catch (err) {
    console.error('Compute transactions error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/listings/sales — fallback sale/rent lookup ────────────────

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
        const change = row.price_aed - sale.sale_price;
        result[row.id] = {
          last_sale_price: sale.sale_price,
          last_sale_date: sale.sale_date,
          last_sale_change: change,
          last_sale_change_pct: sale.sale_price ? Math.round((change / sale.sale_price) * 1000) / 10 : null,
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

    // Build price chain: same reference_no + source (real price history of one listing)
    let priceChain = [];
    if (row.reference_no) {
      const { data: refHistory } = await supabase
        .from(TABLE)
        .select('id, price_aed, date_listed, listing_change, scraped_at')
        .eq('reference_no', row.reference_no)
        .eq('source', row.source)
        .order('scraped_at', { ascending: true });

      if (refHistory && refHistory.length >= 2) {
        for (const s of refHistory) {
          priceChain.push({
            id: s.id,
            price: s.price_aed,
            date: s.date_listed,
            change: s.listing_change,
          });
        }
      }
    }

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
    const sale = saleMap[row.id];
    const mapped = mapRow(row, refData, sale ? { sale_price: sale.sale_price, sale_date: sale.sale_date, sale_size: sale.sale_size, sale_type: sale.sale_type } : null);
    if (sale) {
      const change = row.price_aed - sale.sale_price;
      mapped.last_sale_change_pct = sale.sale_price ? Math.round((change / sale.sale_price) * 1000) / 10 : null;
    }
    res.json({
      ...mapped,
      price_history: priceChain.length >= 2 ? priceChain : [],
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

    // Run all 4 KPI queries in parallel — use pre-computed last_txn_* columns
    const [pctResult, aedResult, commResult, dipsResult] = await Promise.all([
      // Highest % drop TODAY (by transaction %)
      (() => {
        let q = supabase.from(TABLE).select('id, last_txn_change_pct, property_name, community')
          .eq('is_valid', true).eq('date_listed', latestDate || '')
          .not('last_txn_change_pct', 'is', null).lt('last_txn_change_pct', 0)
          .order('last_txn_change_pct', { ascending: true }).limit(1);
        q = applyFilters(q, req.query);
        return q;
      })(),
      // Highest AED drop TODAY (by transaction AED)
      (() => {
        let q = supabase.from(TABLE).select('id, last_txn_change, property_name, community')
          .eq('is_valid', true).eq('date_listed', latestDate || '')
          .not('last_txn_change', 'is', null).lt('last_txn_change', 0)
          .order('last_txn_change', { ascending: true }).limit(1);
        q = applyFilters(q, req.query);
        return q;
      })(),
      // Community with most drops
      supabase.from(TABLE).select('community')
        .eq('is_valid', true).not('last_txn_change_pct', 'is', null).lt('last_txn_change_pct', 0)
        .limit(10000),
      // Dips in last 24h
      (() => {
        let q = supabase.from(TABLE).select('id', { count: 'exact', head: true })
          .eq('is_valid', true).eq('date_listed', latestDate || '')
          .not('last_txn_change_pct', 'is', null).lt('last_txn_change_pct', 0);
        q = applyFilters(q, req.query);
        return q;
      })(),
    ]);

    const highestPct = pctResult.data?.[0] ? {
      listing_id: pctResult.data[0].id,
      change_pct: Math.round(pctResult.data[0].last_txn_change_pct * 10) / 10,
      property_name: pctResult.data[0].property_name,
      community: pctResult.data[0].community,
    } : null;

    const highestAed = aedResult.data?.[0] ? {
      listing_id: aedResult.data[0].id,
      change_aed: aedResult.data[0].last_txn_change,
      property_name: aedResult.data[0].property_name,
      community: aedResult.data[0].community,
    } : null;

    // Process community counts
    let mostDrops = null;
    if (commResult.data?.length) {
      const counts = {};
      commResult.data.forEach(r => { if (r.community) counts[r.community] = (counts[r.community] || 0) + 1; });
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      if (top) mostDrops = { community: top[0], count: top[1] };
    }

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

// ── GET /api/property-list — cached distinct properties for client-side Fuse.js search
let propertyListCache = { data: null, ts: 0 };
const PROPERTY_LIST_TTL = 60 * 60 * 1000; // 1 hour

app.get('/api/property-list', async (req, res) => {
  try {
    if (propertyListCache.data && Date.now() - propertyListCache.ts < PROPERTY_LIST_TTL) {
      return res.json(propertyListCache.data);
    }

    // Try RPC first (single DB call — create via Supabase SQL Editor if not present)
    // CREATE OR REPLACE FUNCTION get_distinct_properties()
    // RETURNS TABLE(property_name text, community text, listing_count bigint)
    // LANGUAGE sql STABLE AS $$
    //   SELECT property_name, community, COUNT(*)::bigint
    //   FROM ddf_listings WHERE property_name IS NOT NULL AND is_valid = true
    //   GROUP BY property_name, community ORDER BY property_name ASC;
    // $$;
    let result = null;
    const { data: rpcData, error: rpcErr } = await supabase.rpc('get_distinct_properties');
    if (!rpcErr && rpcData && rpcData.length > 0) {
      result = rpcData;
      console.log(`[property-list] RPC returned ${result.length} distinct properties`);
    } else {
      // Fallback: parallel batch fetch (all pages fired concurrently in groups of 50)
      // Get total count first, then fire all pages in parallel
      const { count: totalCount } = await supabase
        .from(TABLE).select('id', { count: 'exact', head: true })
        .eq('is_valid', true).not('property_name', 'is', null);

      const total = totalCount || 200000;
      const pageSize = 1000;
      const pages = Math.ceil(total / pageSize);
      const CONCURRENCY = 50;
      const allData = [];

      for (let i = 0; i < pages; i += CONCURRENCY) {
        const batch = [];
        for (let j = i; j < Math.min(i + CONCURRENCY, pages); j++) {
          batch.push(
            supabase.from(TABLE).select('property_name, community')
              .eq('is_valid', true).not('property_name', 'is', null)
              .range(j * pageSize, j * pageSize + pageSize - 1)
          );
        }
        const results = await Promise.all(batch);
        for (const { data } of results) if (data) allData.push(...data);
      }

      console.log(`[property-list] Parallel fetch: ${allData.length} rows in ${pages} pages`);
      const combos = {};
      for (const r of allData) {
        if (!r.property_name) continue;
        const key = `${r.property_name}|${r.community || ''}`;
        if (!combos[key]) combos[key] = { property_name: r.property_name, community: r.community || '', listing_count: 0 };
        combos[key].listing_count++;
      }
      result = Object.values(combos).sort((a, b) => b.listing_count - a.listing_count || a.property_name.localeCompare(b.property_name));
    }

    propertyListCache = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    console.error('Property list error:', err);
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

// ── Analytics route ──────────────────────────────────────────────────────────

app.use('/api/analytics', analyticsRouter);

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
    const rows = (data || []).map(r => mapRow(r, null, null));
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

  // FIX 5: Self-ping every 4 min to prevent Railway cold starts
  setInterval(() => {
    fetch(`http://localhost:${PORT}/api/health`).catch(() => {});
  }, 4 * 60 * 1000);
});
