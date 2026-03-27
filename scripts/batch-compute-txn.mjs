#!/usr/bin/env node
// Batch compute last_txn_* columns for all DDF listings
// Strategy: Pre-load RV data per community into memory, match in code (no per-building ILIKE queries)
// Run: SUPABASE_SERVICE_KEY=... SALES_SUPABASE_KEY=... node scripts/batch-compute-txn.mjs

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://xrdrypydnnaemmyvgjee.supabase.co',
  process.env.SUPABASE_SERVICE_KEY
);

const salesDb = createClient(
  process.env.SALES_SUPABASE_URL || 'https://jbqxxaxesaqymqgtmkvu.supabase.co',
  process.env.SALES_SUPABASE_KEY
);

const TABLE = 'ddf_listings';

// ── Community aliases (DDF name → RV community names) ─────────────────────
const COMMUNITY_ALIASES = {
  // Exact name differences
  'dubai south': ['dubai south', 'azizi venice'],
  'dubai south (dubai world central)': ['dubai south', 'azizi venice', 'dubai world central'],
  'downtown dubai': ['downtown dubai', 'business bay'],
  "za'abeel": ['zaabeel first', 'zaabeel second', 'zaabeel'],
  'zabeel': ['zaabeel first', 'zaabeel second', 'zaabeel'],

  // DAMAC variants
  'damac hills': ['damac hills'],
  'damac hills 2 (akoya by damac)': ['damac hills 2', 'akoya oxygen'],
  'damac hills 2': ['damac hills 2', 'akoya oxygen'],

  // Parenthetical variants
  'barsha heights (tecom)': ['barsha heights', 'tecom'],
  'jumeirah village circle (jvc)': ['jumeirah village circle'],
  'jumeirah village circle': ['jumeirah village circle'],
  'jumeirah village triangle (jvt)': ['jumeirah village triangle'],
  'jumeirah village triangle': ['jumeirah village triangle'],
  'jumeirah lake towers (jlt)': ['jumeirah lake towers'],
  'jumeirah lake towers': ['jumeirah lake towers'],
  'jumeirah beach residence (jbr)': ['jumeirah beach residence'],
  'jumeirah beach residence': ['jumeirah beach residence'],
  'dubai silicon oasis (dso)': ['dubai silicon oasis'],
  'dubai silicon oasis': ['dubai silicon oasis'],
  'dubai production city (impz)': ['dubai production city', 'impz'],
  'culture village (jaddaf waterfront)': ['culture village', 'jaddaf waterfront', 'al jaddaf'],
  'culture village': ['culture village', 'al jaddaf'],
  'dubai investment park (dip)': ['dubai investment park'],
  'dubai land residence complex': ['dubai land residence complex', 'dubailand residence complex'],
  'dubai land': ['dubailand', 'dubai land'],
  'dubailand': ['dubailand', 'dubai land'],

  // Name mismatches between DDF and RV
  'mohammed bin rashid city': ['district one', 'district seven', 'district eleven', 'sobha hartland', 'mohammed bin rashid city', 'meydan', 'meydan one'],
  'nad al sheba': ['nad al shiba first', 'nad al sheba'],
  'al sufouh': ['al sufouh first', 'al sufouh'],
  'al jaddaf': ['al jadaf', 'al jaddaf', 'culture village', 'jaddaf waterfront'],
  'arabian ranches': ['arabian ranches'],
  'arabian ranches 3': ['arabian ranches phase 3', 'arabian ranches'],
  'meydan': ['meydan one', 'meydan city', 'meydan'],
  'meydan horizon': ['meydan one', 'meydan city', 'meydan'],
  'sobha hartland': ['sobha hartland'],
  'sobha hartland 2': ['sobha hartland 2', 'sobha hartland'],
  'greens': ['the greens', 'greens'],
  'falcon city of wonders': ['falcon city of wonders'],
  'motor city': ['motor city', 'business park motor city'],
  'international city': ['international city', 'international city phase 2 & 3'],
  'jebel ali': ['jebel ali first', 'jebel ali downtown', 'jebel ali'],
  'jumeirah': ['jumeirah first', 'jumeirah second', 'jumeirah third', 'jumeirah'],
  'dubai science park': ['dubai science park', 'dubai science park (dubiotech)'],
  'dubai industrial city': ['dubai industrial city', 'dubai industrial city first'],
  'umm suqeim': ['umm suqeim third', 'umm suqeim first', 'umm suqeim'],
  'dubai harbour': ['dubai harbour'],
  'palm jumeirah': ['palm jumeirah'],
  'dubai creek harbour': ['dubai creek harbour'],
  'dubai hills estate': ['dubai hills estate'],
  'dubai marina': ['dubai marina'],
  'business bay': ['business bay'],
  'al barari': ['al barari'],
  'al satwa': ['al satwa', 'jumeirah garden city'],
  'mina rashid': ['mina rashid', 'al mina'],
  'dubai south': ['dubai south', 'azizi venice', 'emaar south'],
  'dubai south (dubai world central)': ['dubai south', 'azizi venice', 'emaar south', 'dubai world central'],
  'dubai production city (impz)': ['dubai production city', 'dubai production city (impz)', 'impz'],
};

function getRvCommunities(ddfCommunity) {
  const key = ddfCommunity.toLowerCase();
  const aliases = COMMUNITY_ALIASES[key];
  if (aliases) return aliases;
  // Strip parentheticals: "Foo (Bar)" → try both "foo" and "bar"
  const stripped = key.replace(/\s*\([^)]+\)\s*/g, '').trim();
  return stripped !== key ? [key, stripped] : [key];
}

// ── Name normalization ────────────────────────────────────────────────────

function normalizeName(name) {
  return name.toLowerCase()
    .replace(/['\u2018\u2019`]/g, '')  // strip apostrophes
    .replace(/\s+/g, ' ')
    .trim();
}

function nameTokens(name) {
  return normalizeName(name).split(/[\s\-]+/).filter(t => t.length > 0);
}

// Explicit name overrides: DDF name → RV search tokens
const NAME_OVERRIDES = {
  'the torch': 'torch tower',
  'the address sky view tower 1': 'address residence sky',
  'the address sky view tower 2': 'address residence sky',
  'the address residences dubai opera tower 1': 'address residence dubai opera',
  'the address residences dubai opera tower 2': 'address residence dubai opera',
  'maple at dubai hills estate 1': 'maple townhouses 1',
  'maple at dubai hills estate 2': 'maple townhouses 2',
  'maple at dubai hills estate 3': 'maple townhouses 3',
  'district one villas': 'district one',
  'binghatti ghost': 'ghost by binghatti',
  'sls dubai hotel & residences': 'sls dubai hotel',
  'six senses hotel': 'six senses residences',
  'ciel tower': 'ciel vignette collection',
  'kempinski residences the creek': 'kempinski',
  'stamn one': 'stamn one',
  'passo by beyond': 'passo',
  'peninsula four the plaza': 'peninsula four',
  'baystar by vida': 'baystar by vida',
};

// Check if DDF name matches RV name using fuzzy token matching
function namesMatch(ddfName, rvName) {
  // Check explicit overrides first
  const override = NAME_OVERRIDES[normalizeName(ddfName)];
  if (override) {
    const rvNorm = normalizeName(rvName);
    if (rvNorm.includes(override) || override.includes(rvNorm)) return true;
  }
  const ddfNorm = normalizeName(ddfName);
  const rvNorm = normalizeName(rvName);

  // Exact match
  if (ddfNorm === rvNorm) return true;

  // Contains match (either direction)
  if (rvNorm.includes(ddfNorm) || ddfNorm.includes(rvNorm)) return true;

  // Token overlap: all DDF tokens appear in RV name
  const ddfTokens = nameTokens(ddfName);
  const rvTokens = nameTokens(rvName);
  if (ddfTokens.length >= 2 && ddfTokens.every(t => rvTokens.some(rt => rt.includes(t) || t.includes(rt)))) return true;

  // Reversed word order: "binghatti ghost" ↔ "ghost by binghatti"
  if (ddfTokens.length >= 2) {
    const ddfReversed = [...ddfTokens].reverse();
    if (ddfReversed.every(t => rvTokens.some(rt => rt.includes(t) || t.includes(rt)))) return true;
  }

  return false;
}

// ── Size matching ─────────────────────────────────────────────────────────

function matchBySize(listingSize, candidates) {
  const ls = listingSize || 0;
  const min20 = ls * 0.8, max20 = ls * 1.2;
  // ±20% match
  const m = candidates.find(s => !ls || !s.size_sqft || (s.size_sqft >= min20 && s.size_sqft <= max20));
  if (m) return m;
  if (!ls) return candidates[0];
  // Fallback: closest within ±40%
  let best = null, bd = Infinity;
  for (const s of candidates) {
    if (!s.size_sqft) continue;
    const d = Math.abs(s.size_sqft - ls) / ls;
    if (d < 0.4 && d < bd) { best = s; bd = d; }
  }
  return best;
}

// ── Pre-load RV data for a community ──────────────────────────────────────

const rvCache = new Map(); // community_key → { sales: [...], rentals: [...] }

async function loadRvCommunity(rvCommunityName) {
  const key = rvCommunityName.toLowerCase();
  if (rvCache.has(key)) return rvCache.get(key);

  // Fetch all sales for this community after Jan 2025
  const salesPages = [];
  let salesOffset = 0;
  while (true) {
    const { data } = await salesDb.from('rv_sales')
      .select('property_name, bedrooms, size_sqft, price, price_sqft, date, subtype')
      .eq('is_valid', true)
      .or('subtype.eq.Sale,subtype.eq.Pre-registration')
      .ilike('community_name', `%${key}%`)
      .gte('date', '2025-01-01')
      .order('date', { ascending: false })
      .range(salesOffset, salesOffset + 999);
    if (!data || data.length === 0) break;
    salesPages.push(...data);
    if (data.length < 1000) break;
    salesOffset += 1000;
  }

  // Fetch all rentals for this community after Jan 2025
  const rentalPages = [];
  let rentalOffset = 0;
  while (true) {
    const { data } = await salesDb.from('rv_rentals')
      .select('property_name, bedrooms, size_sqft, price, price_sqft, date')
      .eq('is_valid', true)
      .eq('property_category', 'Residential')
      .ilike('community_name', `%${key}%`)
      .gte('date', '2025-01-01')
      .order('date', { ascending: false })
      .range(rentalOffset, rentalOffset + 999);
    if (!data || data.length === 0) break;
    rentalPages.push(...data);
    if (data.length < 1000) break;
    rentalOffset += 1000;
  }

  const result = { sales: salesPages, rentals: rentalPages };
  rvCache.set(key, result);
  return result;
}

// ── Find best transaction match for a listing ─────────────────────────────

async function findMatch(listing, rvData) {
  const isSale = listing.purpose?.toLowerCase() === 'sale';
  const pool = isSale ? rvData.sales : rvData.rentals;
  const bed = parseInt(listing.bedrooms, 10);

  // Filter by: name match + bedrooms
  const candidates = pool.filter(tx => {
    if (tx.bedrooms !== bed && !(bed === 0 && tx.bedrooms === null)) return false;
    if (!tx.property_name) return false;
    return namesMatch(listing.property_name, tx.property_name);
  });

  if (candidates.length === 0) return null;

  // Already sorted by date desc from the query — pick best by size
  const match = matchBySize(listing.size_sqft, candidates);
  if (!match) return null;

  return {
    price: match.price,
    date: match.date,
    size: match.size_sqft,
    type: isSale ? (match.subtype || 'Sale') : 'Rent listing',
  };
}

// ── Main batch loop ───────────────────────────────────────────────────────

async function main() {
  let processed = 0, updated = 0, noMatch = 0;
  const startTime = Date.now();

  // Step 1: Get all unique communities from DDF
  console.log('Loading DDF communities...');
  const { data: commData } = await supabase.from(TABLE)
    .select('community')
    .eq('is_valid', true)
    .is('last_txn_price', null)
    .limit(50000);
  const communities = [...new Set((commData || []).map(r => r.community).filter(Boolean))].sort();
  console.log(`Found ${communities.length} communities to process`);

  // Step 2: Process each community
  for (const community of communities) {
    const commStart = Date.now();

    // Load RV data for this community (+ aliases)
    const rvCommunities = getRvCommunities(community);
    let allSales = [], allRentals = [];
    for (const rvComm of rvCommunities) {
      const data = await loadRvCommunity(rvComm);
      allSales.push(...data.sales);
      allRentals.push(...data.rentals);
    }
    const rvData = { sales: allSales, rentals: allRentals };

    // Load DDF listings for this community in batches
    let offset = 0;
    let commProcessed = 0, commUpdated = 0;

    while (true) {
      const { data: rows, error: rowErr } = await supabase.from(TABLE)
        .select('id, property_name, community, bedrooms, size_sqft, purpose, price_aed')
        .eq('is_valid', true)
        .eq('community', community)
        .is('last_txn_price', null)
        .range(offset, offset + 499);

      if (rowErr) { console.log(`  ERROR fetching ${community}: ${rowErr.message}`); break; }
      if (!rows || rows.length === 0) break;

      // Match each listing
      const updates = [];
      for (const listing of rows) {
        if (!listing.property_name || listing.bedrooms == null) continue;
        const match = await findMatch(listing, rvData);
        if (match) {
          const change = listing.price_aed - match.price;
          const changePct = match.price ? Math.round((change / match.price) * 1000) / 10 : null;
          updates.push({
            id: listing.id,
            last_txn_price: match.price,
            last_txn_date: match.date,
            last_txn_change: change,
            last_txn_change_pct: changePct,
            last_txn_size: match.size,
            last_txn_type: match.type,
          });
        }
      }

      // Batch write updates (50 parallel)
      for (let i = 0; i < updates.length; i += 50) {
        await Promise.all(updates.slice(i, i + 50).map(u =>
          supabase.from(TABLE).update({
            last_txn_price: u.last_txn_price,
            last_txn_date: u.last_txn_date,
            last_txn_change: u.last_txn_change,
            last_txn_change_pct: u.last_txn_change_pct,
            last_txn_size: u.last_txn_size,
            last_txn_type: u.last_txn_type,
          }).eq('id', u.id)
        ));
      }

      commProcessed += rows.length;
      commUpdated += updates.length;
      noMatch += rows.length - updates.length;
      offset += rows.length;

      if (rows.length < 500) break;
    }

    processed += commProcessed;
    updated += commUpdated;
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const commElapsed = Math.round((Date.now() - commStart) / 1000);
    const pct = Math.round(processed / 1784 * 10) / 10;
    console.log(`[${elapsed}s] ${community}: ${commProcessed} listings, ${commUpdated} matched (${allSales.length}S/${allRentals.length}R in RV, ${commElapsed}s) | Total: ${processed} (~${pct}%)`);
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`\nDONE. ${processed} processed | ${updated} matched | ${noMatch} no match | ${elapsed}s`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
