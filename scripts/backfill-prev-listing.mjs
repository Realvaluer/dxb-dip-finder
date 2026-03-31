#!/usr/bin/env node
// Backfill dip_prev_* columns for listings that have dip_ref_id but missing dip_prev_price.
//
// Usage:
//   node scripts/backfill-prev-listing.mjs --all      # All rows with dip_ref_id + null dip_prev_price
//   node scripts/backfill-prev-listing.mjs --recent    # Only rows scraped in last 25 hours

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://xrdrypydnnaemmyvgjee.supabase.co',
  process.env.SUPABASE_SERVICE_KEY
);

const TABLE = 'ddf_listings';
const RECENT_MODE = process.argv.includes('--recent');
const ALL_MODE = process.argv.includes('--all');
const RECENT_HOURS = 25;

if (!RECENT_MODE && !ALL_MODE) {
  console.log('Usage: node scripts/backfill-prev-listing.mjs [--all|--recent]');
  process.exit(1);
}

async function main() {
  const startTime = Date.now();
  const recentCutoff = RECENT_MODE
    ? new Date(Date.now() - RECENT_HOURS * 60 * 60 * 1000).toISOString()
    : null;

  if (RECENT_MODE) console.log(`--recent mode: only listings scraped after ${recentCutoff}`);

  // Step 1: Find rows with dip_ref_id but no dip_prev_price
  console.log('Loading rows needing prev listing backfill...');
  let targetRows = [];
  let offset = 0;
  while (true) {
    let query = supabase.from(TABLE)
      .select('id, dip_ref_id')
      .not('dip_ref_id', 'is', null)
      .is('dip_prev_price', null)
      .order('id', { ascending: true });
    if (recentCutoff) query = query.gte('scraped_at', recentCutoff);
    const { data, error } = await query.range(offset, offset + 999);
    if (error) { console.error('Fetch error:', error.message); break; }
    if (!data || data.length === 0) break;
    targetRows.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }
  console.log(`Found ${targetRows.length} rows to backfill`);

  if (targetRows.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  // Step 2: Collect unique ref IDs and batch-fetch them
  const refIds = [...new Set(targetRows.map(r => r.dip_ref_id))];
  console.log(`Fetching ${refIds.length} referenced listings...`);
  const refMap = {};
  for (let i = 0; i < refIds.length; i += 50) {
    const batch = refIds.slice(i, i + 50);
    const { data, error } = await supabase.from(TABLE)
      .select('id, price_aed, date_listed, url, source, size_sqft, furnished')
      .in('id', batch);
    if (error) { console.error('Ref fetch error:', error.message); continue; }
    for (const row of (data || [])) {
      refMap[row.id] = row;
    }
  }
  console.log(`Fetched ${Object.keys(refMap).length} ref listings`);

  // Step 3: Build updates
  const updates = [];
  for (const row of targetRows) {
    const ref = refMap[row.dip_ref_id];
    if (!ref || !ref.price_aed) continue;
    updates.push({
      id: row.id,
      dip_prev_price: ref.price_aed,
      dip_prev_date: ref.date_listed || null,
      dip_prev_url: ref.url || null,
      dip_prev_source: ref.source || null,
      dip_prev_size: ref.size_sqft || null,
      dip_prev_furnished: ref.furnished || null,
    });
  }
  console.log(`Updates to apply: ${updates.length}`);

  // Step 4: Apply updates in batches
  let done = 0;
  for (let i = 0; i < updates.length; i += 50) {
    const batch = updates.slice(i, i + 50);
    await Promise.all(batch.map(async (u) => {
      const { id, ...payload } = u;
      const { error } = await supabase.from(TABLE).update(payload).eq('id', id);
      if (error) console.error(`  Error updating id=${id}: ${error.message}`);
    }));
    done += batch.length;
    if (done % 200 === 0 || done === updates.length) {
      console.log(`  Updated ${done}/${updates.length}`);
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`Done! Backfilled ${updates.length} rows in ${elapsed}s.`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
