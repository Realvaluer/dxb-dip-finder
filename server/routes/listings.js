import { Router } from 'express';
import { supabase } from '../db.js';

const router = Router();

// Fields to select from ddf_listings
const LISTING_FIELDS = `
  id, reference_no, title, community, city, property_name, type,
  purpose, bedrooms, bathrooms, size_sqft, furnished, price_aed,
  source, url, scraped_at, date_listed,
  dip_pct, dip_price, dip_prev_price, dip_prev_url, dip_prev_source,
  dip_prev_date, dip_prev_size, dip_prev_furnished,
  listing_change, broker_agency, distress, ready_off_plan
`;

router.get('/', async (req, res) => {
  const {
    min_dip = 0,
    bedrooms,
    area,
    source,
    search,
    sort = 'dip_pct',
    max_price,
    min_sqft,
    property_type,
    listing_type,
    listing_change_filter,
    limit = 50,
    offset = 0,
  } = req.query;

  const communities = parseArrayParam(req.query, 'communities');
  const buildings = parseArrayParam(req.query, 'buildings');

  try {
    let query = supabase
      .from('ddf_listings')
      .select(LISTING_FIELDS, { count: 'exact' });

    // Only require dip when sorting by dip or filtering
    const dipSort = sort === 'dip_pct' || sort === 'dip_aed';
    const minDipVal = parseFloat(min_dip) || 0;
    if (dipSort || minDipVal > 0) {
      query = query.not('dip_pct', 'is', null).gte('dip_pct', minDipVal);
    }

    if (bedrooms !== undefined && bedrooms !== '') {
      query = query.eq('bedrooms', bedrooms);
    }
    if (area) {
      query = query.ilike('community', `%${area}%`);
    }
    if (communities.length > 0) {
      query = query.in('community', communities);
    }
    if (buildings.length > 0) {
      query = query.in('property_name', buildings);
    }
    if (source) {
      query = query.eq('source', source);
    }
    if (property_type) {
      query = query.eq('type', property_type);
    }
    if (listing_type && listing_type !== 'Both') {
      query = query.eq('purpose', listing_type);
    }
    if (max_price) {
      query = query.lte('price_aed', parseInt(max_price));
    }
    if (min_sqft) {
      query = query.gte('size_sqft', parseInt(min_sqft));
    }
    if (search) {
      query = query.or(`title.ilike.%${search}%,community.ilike.%${search}%,property_name.ilike.%${search}%`);
    }
    // Listing change filter
    if (listing_change_filter === 'decreased') {
      query = query.not('listing_change', 'is', null).lt('listing_change', 0);
    } else if (listing_change_filter === 'increased') {
      query = query.not('listing_change', 'is', null).gt('listing_change', 0);
    } else if (listing_change_filter === 'has_change') {
      query = query.not('listing_change', 'is', null).neq('listing_change', 0);
    }

    // Sorting
    const sortMap = {
      dip_pct: { column: 'dip_pct', ascending: false },
      dip_aed: { column: 'dip_price', ascending: false },
      newest: { column: 'date_listed', ascending: false },
      price_asc: { column: 'price_aed', ascending: true },
      price_desc: { column: 'price_aed', ascending: false },
      listing_change_asc: { column: 'listing_change', ascending: true },
      listing_change_desc: { column: 'listing_change', ascending: false },
    };
    const sortOpt = sortMap[sort] || sortMap.dip_pct;
    query = query.order(sortOpt.column, { ascending: sortOpt.ascending, nullsFirst: false });

    // Pagination
    const lim = Math.min(parseInt(limit) || 50, 100);
    const off = parseInt(offset) || 0;
    query = query.range(off, off + lim - 1);

    const { data, count, error } = await query;
    if (error) throw error;

    // Map to frontend format
    const mapped = (data || []).map(mapListingToFrontend);

    res.json({ data: mapped, total: count || 0, limit: lim, offset: off });
  } catch (err) {
    console.error('Listings query error:', err.message || err);
    res.status(500).json({ error: 'Failed to fetch listings' });
  }
});

router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('ddf_listings')
      .select(LISTING_FIELDS)
      .eq('id', parseInt(id))
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    const listing = mapListingToFrontend(data);
    // No txn_history from DLD yet — return empty array
    listing.txn_history = [];

    res.json(listing);
  } catch (err) {
    console.error('Listing detail error:', err.message || err);
    res.status(500).json({ error: 'Failed to fetch listing' });
  }
});

// Map Supabase row to frontend expected format
function mapListingToFrontend(row) {
  return {
    id: row.id,
    reference_no: row.reference_no,
    listing_title: row.title,
    location: row.community,
    city: row.city,
    property_name: row.property_name,
    property_type: row.type,
    listing_type: row.purpose,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    size_sqft: row.size_sqft,
    furnished: row.furnished,
    current_price: row.price_aed,
    source: row.source,
    listing_url: row.url,
    scraped_at: row.scraped_at,
    date_listed: row.date_listed,
    // Dip 1 — vs Prior Listing
    dip_percent: row.dip_pct,
    dip_amount: row.dip_price,
    dip_prev_price: row.dip_prev_price,
    dip_prev_url: row.dip_prev_url,
    dip_prev_source: row.dip_prev_source,
    dip_prev_date: row.dip_prev_date,
    dip_prev_size: row.dip_prev_size,
    dip_prev_furnished: row.dip_prev_furnished,
    // Dip 2 — Listing Change
    listing_change: row.listing_change,
    // Other
    broker_agency: row.broker_agency,
    distress: row.distress,
    ready_off_plan: row.ready_off_plan,
  };
}

function parseArrayParam(query, key) {
  const val = query[key] || query[`${key}[]`];
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  return val.split(',').map(s => s.trim()).filter(Boolean);
}

export default router;
