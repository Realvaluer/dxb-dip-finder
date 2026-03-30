#!/usr/bin/env node
// One-time backfill: compute listing_change for all ddf_listings rows
// where same reference_no + source appears more than once.
// listing_change = current_price - previous_price (sorted by date ASC, then id ASC)
// First occurrence gets NULL (no prior to compare against).

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://xrdrypydnnaemmyvgjee.supabase.co',
  process.env.SUPABASE_SERVICE_KEY
);

const TABLE = 'ddf_listings';

async function main() {
  console.log('Loading all rows with reference_no...');

  let allRows = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.from(TABLE)
      .select('id, reference_no, source, price_aed, date_listed')
      .not('reference_no', 'is', null)
      .neq('reference_no', '')
      .order('id', { ascending: true })
      .range(offset, offset + 999);
    if (error) { console.error('Fetch error:', error.message); break; }
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
    if (offset % 50000 === 0) console.log(`  Loaded ${offset} rows...`);
  }
  console.log(`Total rows with reference_no: ${allRows.length}`);

  // Group by ref+source
  const groups = {};
  for (const r of allRows) {
    const key = `${r.reference_no}|${r.source}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  }

  // Find groups with >1 row
  const dupGroups = Object.entries(groups).filter(([, v]) => v.length > 1);
  console.log(`Groups with >1 row: ${dupGroups.length}`);

  // Build updates
  const updates = [];
  for (const [, rows] of dupGroups) {
    rows.sort((a, b) => (a.date_listed || '').localeCompare(b.date_listed || '') || a.id - b.id);
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1].price_aed;
      const curr = rows[i].price_aed;
      if (prev != null && curr != null) {
        const change = curr - prev;
        updates.push({ id: rows[i].id, listing_change: change });
      }
    }
  }
  console.log(`Rows to update: ${updates.length}`);

  if (updates.length === 0) {
    console.log('Nothing to update.');
    return;
  }

  // Also null out the first occurrence in each group (reset stale values)
  const firstIds = dupGroups.map(([, rows]) => {
    rows.sort((a, b) => (a.date_listed || '').localeCompare(b.date_listed || '') || a.id - b.id);
    return rows[0].id;
  });

  // Execute updates in batches of 50
  let done = 0;
  for (let i = 0; i < updates.length; i += 50) {
    const batch = updates.slice(i, i + 50);
    await Promise.all(batch.map(async (u) => {
      const { error } = await supabase.from(TABLE)
        .update({ listing_change: u.listing_change })
        .eq('id', u.id);
      if (error) console.error(`  Error updating id=${u.id}: ${error.message}`);
    }));
    done += batch.length;
    if (done % 200 === 0 || done === updates.length) {
      console.log(`  Updated ${done}/${updates.length}`);
    }
  }

  // Null out first occurrences that might have stale listing_change
  console.log(`Clearing listing_change on ${firstIds.length} first-occurrence rows...`);
  for (let i = 0; i < firstIds.length; i += 50) {
    const batch = firstIds.slice(i, i + 50);
    await Promise.all(batch.map(async (id) => {
      await supabase.from(TABLE).update({ listing_change: null }).eq('id', id);
    }));
  }

  console.log(`Done! Updated ${updates.length} rows with listing_change values.`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
