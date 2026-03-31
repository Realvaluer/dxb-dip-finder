#!/usr/bin/env node
// Add listing_change_method column to ddf_listings table.
// Run once: SUPABASE_SERVICE_KEY=... node scripts/add-listing-change-method-column.mjs

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://xrdrypydnnaemmyvgjee.supabase.co',
  process.env.SUPABASE_SERVICE_KEY
);

async function main() {
  // Supabase JS client doesn't support DDL. Use the REST API to run raw SQL.
  // We'll just try to update a row with the new column — if it works, the column exists.
  // If not, we need to add it via the Supabase dashboard.

  console.log('Testing if listing_change_method column exists...');
  const { data, error } = await supabase.from('ddf_listings')
    .select('listing_change_method')
    .limit(1);

  if (error && error.message.includes('listing_change_method')) {
    console.log('Column does NOT exist.');
    console.log('Please add it via Supabase dashboard SQL editor:');
    console.log('  ALTER TABLE ddf_listings ADD COLUMN listing_change_method text;');
    console.log('Skipping tagging step — re-run after adding column.');
    return;
  } else {
    console.log('Column exists. Ready to tag existing rows.');
  }

  // Backfill existing listing_change rows as method='ref' since they were all Method A
  console.log('Backfilling existing listing_change rows with method=ref...');
  let offset = 0;
  let total = 0;
  while (true) {
    const { data: rows, error: fetchErr } = await supabase.from('ddf_listings')
      .select('id')
      .not('listing_change', 'is', null)
      .is('listing_change_method', null)
      .range(offset, offset + 999);
    if (fetchErr) { console.error('Fetch error:', fetchErr.message); break; }
    if (!rows || rows.length === 0) break;

    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50);
      await Promise.all(batch.map(r =>
        supabase.from('ddf_listings')
          .update({ listing_change_method: 'ref' })
          .eq('id', r.id)
      ));
    }
    total += rows.length;
    console.log(`  Tagged ${total} rows as method=ref`);
    if (rows.length < 1000) break;
    offset += 1000;
  }
  console.log(`Done! Tagged ${total} existing rows.`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
