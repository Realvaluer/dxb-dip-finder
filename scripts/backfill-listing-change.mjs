#!/usr/bin/env node
// Backfill listing_change for ddf_listings rows.
//
// Method A (default): Same reference_no + source, different price.
// Method B (--method-b): Fingerprint match — same property_name (case-insensitive) +
//   community + bedrooms + ±5% size + same purpose + same source + within 90 days +
//   different price + AED ≥1,000 difference. Only for rows with NO existing listing_change.
//
// Usage:
//   node scripts/backfill-listing-change.mjs            # Method A (all rows)
//   node scripts/backfill-listing-change.mjs --method-b  # Method B (fills gaps)

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://xrdrypydnnaemmyvgjee.supabase.co',
  process.env.SUPABASE_SERVICE_KEY
);

const TABLE = 'ddf_listings';
const METHOD_B = process.argv.includes('--method-b');

async function fetchAll(query) {
  let allRows = [];
  let offset = 0;
  while (true) {
    const { data, error } = await query.range(offset, offset + 999);
    if (error) { console.error('Fetch error:', error.message); break; }
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
    if (offset % 50000 === 0) console.log(`  Loaded ${offset} rows...`);
  }
  return allRows;
}

// Check if listing_change_method column exists
let HAS_METHOD_COL = true;
{
  const { error } = await supabase.from(TABLE).select('listing_change_method').limit(1);
  if (error && error.message.includes('listing_change_method')) {
    console.log('NOTE: listing_change_method column not found — will skip writing method. Add column via Supabase dashboard.');
    HAS_METHOD_COL = false;
  }
}

async function batchUpdate(updates) {
  let done = 0;
  for (let i = 0; i < updates.length; i += 50) {
    const batch = updates.slice(i, i + 50);
    await Promise.all(batch.map(async (u) => {
      const payload = { ...u.payload };
      if (!HAS_METHOD_COL) delete payload.listing_change_method;
      const { error } = await supabase.from(TABLE)
        .update(payload)
        .eq('id', u.id);
      if (error) console.error(`  Error updating id=${u.id}: ${error.message}`);
    }));
    done += batch.length;
    if (done % 200 === 0 || done === updates.length) {
      console.log(`  Updated ${done}/${updates.length}`);
    }
  }
}

// ── Method A: reference_no + source grouping ──
async function methodA() {
  console.log('Method A: Loading all rows with reference_no...');
  const allRows = await fetchAll(
    supabase.from(TABLE)
      .select('id, reference_no, source, price_aed, date_listed')
      .not('reference_no', 'is', null)
      .neq('reference_no', '')
      .order('id', { ascending: true })
  );
  console.log(`Total rows with reference_no: ${allRows.length}`);

  // Group by ref+source
  const groups = {};
  for (const r of allRows) {
    const key = `${r.reference_no}|${r.source}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  }

  const dupGroups = Object.entries(groups).filter(([, v]) => v.length > 1);
  console.log(`Groups with >1 row: ${dupGroups.length}`);

  const updates = [];
  const firstIds = [];
  for (const [, rows] of dupGroups) {
    rows.sort((a, b) => (a.date_listed || '').localeCompare(b.date_listed || '') || a.id - b.id);
    firstIds.push(rows[0].id);
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1].price_aed;
      const curr = rows[i].price_aed;
      if (prev != null && curr != null) {
        const change = curr - prev;
        updates.push({ id: rows[i].id, payload: { listing_change: change, listing_change_method: 'ref' } });
      }
    }
  }
  console.log(`Rows to update: ${updates.length}`);

  if (updates.length > 0) {
    await batchUpdate(updates);
  }

  // Null out first occurrences
  console.log(`Clearing listing_change on ${firstIds.length} first-occurrence rows...`);
  for (let i = 0; i < firstIds.length; i += 50) {
    const batch = firstIds.slice(i, i + 50);
    const nullPayload = HAS_METHOD_COL
      ? { listing_change: null, listing_change_method: null }
      : { listing_change: null };
    await Promise.all(batch.map(async (id) => {
      await supabase.from(TABLE).update(nullPayload).eq('id', id);
    }));
  }

  console.log(`Method A done! Updated ${updates.length} rows.`);
}

// ── Method B: fingerprint matching ──
async function methodB() {
  console.log('Method B: Loading rows without listing_change...');

  // Only target rows that don't already have a listing_change value
  const targetRows = await fetchAll(
    supabase.from(TABLE)
      .select('id, property_name, community, bedrooms, size_sqft, purpose, source, price_aed, date_listed')
      .is('listing_change', null)
      .not('property_name', 'is', null)
      .not('community', 'is', null)
      .order('id', { ascending: true })
  );
  console.log(`Rows without listing_change: ${targetRows.length}`);

  if (targetRows.length === 0) {
    console.log('Nothing to process.');
    return;
  }

  // Also load all rows for fingerprint comparison (need the full pool)
  console.log('Loading all rows for fingerprint pool...');
  const allRows = await fetchAll(
    supabase.from(TABLE)
      .select('id, property_name, community, bedrooms, size_sqft, purpose, source, price_aed, date_listed')
      .not('property_name', 'is', null)
      .not('community', 'is', null)
      .order('id', { ascending: true })
  );
  console.log(`Total pool: ${allRows.length}`);

  // Index pool by fingerprint key (name_lower|community_lower|bedrooms|purpose|source)
  const pool = {};
  for (const r of allRows) {
    const key = `${(r.property_name || '').toLowerCase().trim()}|${(r.community || '').toLowerCase().trim()}|${r.bedrooms ?? ''}|${(r.purpose || '').toLowerCase().trim()}|${(r.source || '').trim()}`;
    if (!pool[key]) pool[key] = [];
    pool[key].push(r);
  }

  const updates = [];
  const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

  for (const row of targetRows) {
    const key = `${(row.property_name || '').toLowerCase().trim()}|${(row.community || '').toLowerCase().trim()}|${row.bedrooms ?? ''}|${(row.purpose || '').toLowerCase().trim()}|${(row.source || '').trim()}`;
    const candidates = pool[key];
    if (!candidates || candidates.length < 2) continue;

    const rowDate = new Date(row.date_listed).getTime();
    const rowSize = row.size_sqft;
    const minSize = rowSize ? rowSize * 0.95 : null;
    const maxSize = rowSize ? rowSize * 1.05 : null;

    // Find the most recent candidate BEFORE this row's date that passes size filter
    let bestMatch = null;
    for (const c of candidates) {
      if (c.id === row.id) continue;
      if (c.price_aed == null || row.price_aed == null) continue;
      if (c.price_aed === row.price_aed) continue; // same price, skip

      const cDate = new Date(c.date_listed).getTime();
      if (cDate >= rowDate) continue; // must be older
      if (rowDate - cDate > NINETY_DAYS_MS) continue; // within 90 days

      // Size check: ±5%, skip if either is null
      if (minSize && maxSize && c.size_sqft) {
        if (c.size_sqft < minSize || c.size_sqft > maxSize) continue;
      }

      // AED ≥1,000 difference
      const diff = row.price_aed - c.price_aed;
      if (Math.abs(diff) < 1000) continue;

      // Pick the most recent prior listing
      if (!bestMatch || cDate > new Date(bestMatch.date_listed).getTime()) {
        bestMatch = c;
      }
    }

    if (bestMatch) {
      const change = row.price_aed - bestMatch.price_aed;
      updates.push({ id: row.id, payload: { listing_change: change, listing_change_method: 'fingerprint' } });
    }
  }

  console.log(`Method B matches: ${updates.length}`);
  if (updates.length > 0) {
    await batchUpdate(updates);
  }
  console.log(`Method B done! Updated ${updates.length} rows.`);
}

async function main() {
  if (METHOD_B) {
    await methodB();
  } else {
    await methodA();
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
