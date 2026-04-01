#!/usr/bin/env node
// DIAGNOSTIC ONLY — Why is the 5.5M Seventh Heaven listing not in the database?
// Run: SUPABASE_SERVICE_KEY=... node scripts/diagnose-seventh-heaven.mjs

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://xrdrypydnnaemmyvgjee.supabase.co',
  process.env.SUPABASE_SERVICE_KEY
);

// ── Q1: Scraper run history — which days did Property Finder scraper run? ──
async function q1_scraperRunDates() {
  console.log('═'.repeat(60));
  console.log('Q1 — Scraper run dates (Property Finder, last 14 days)');
  console.log('═'.repeat(60));

  // Supabase doesn't support GROUP BY via PostgREST, so fetch recent rows and group in JS
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  const cutoffStr = cutoff.toISOString();

  const all = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('ddf_listings')
      .select('scraped_at')
      .eq('source', 'Property Finder')
      .gte('scraped_at', cutoffStr)
      .order('scraped_at', { ascending: false })
      .range(offset, offset + 999);
    if (error) { console.error('  Error:', error.message); break; }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }

  const byDate = {};
  for (const r of all) {
    const d = r.scraped_at ? r.scraped_at.slice(0, 10) : 'null';
    byDate[d] = (byDate[d] || 0) + 1;
  }

  const sorted = Object.entries(byDate).sort((a, b) => b[0].localeCompare(a[0]));
  for (const [date, count] of sorted) {
    console.log(`  ${date}: ${count} rows`);
  }
  console.log(`  Total rows in last 14 days: ${all.length}\n`);
}

// ── Q2: Search broadly for the listing ──
async function q2_searchBroadly() {
  console.log('═'.repeat(60));
  console.log('Q2 — Search Al Barari 2BR Sale 5M-6M');
  console.log('═'.repeat(60));

  const { data, error } = await supabase
    .from('ddf_listings')
    .select('id, property_name, community, bedrooms, price_aed, date_listed, scraped_at, reference_no, source, dip_prev_price, listing_change')
    .ilike('community', '%barari%')
    .eq('bedrooms', 2)
    .eq('purpose', 'Sale')
    .gte('price_aed', 5000000)
    .lte('price_aed', 6000000)
    .order('scraped_at', { ascending: false })
    .limit(50);

  if (error) { console.error('  Error:', error.message); return; }
  console.log(`  Found ${data?.length || 0} listings:\n`);
  for (const r of (data || [])) {
    console.log(`  id=${r.id} | "${r.property_name}" | ${r.community} | ${r.bedrooms}BR | AED ${r.price_aed?.toLocaleString()}`);
    console.log(`    ref=${r.reference_no} | source=${r.source} | date_listed=${r.date_listed} | scraped_at=${r.scraped_at}`);
    console.log(`    dip_prev_price=${r.dip_prev_price} | listing_change=${r.listing_change}`);
    console.log();
  }
}

// ── Q2b: Search by reference number ──
async function q2b_searchByRef() {
  console.log('═'.repeat(60));
  console.log('Q2b — Search by reference_no VI740082-1');
  console.log('═'.repeat(60));

  const { data, error } = await supabase
    .from('ddf_listings')
    .select('id, property_name, community, bedrooms, price_aed, date_listed, scraped_at, reference_no, source, dip_prev_price, listing_change')
    .eq('reference_no', 'VI740082-1')
    .order('scraped_at', { ascending: false })
    .limit(20);

  if (error) { console.error('  Error:', error.message); return; }
  console.log(`  Found ${data?.length || 0} listings:\n`);
  for (const r of (data || [])) {
    console.log(`  id=${r.id} | "${r.property_name}" | ${r.community} | ${r.bedrooms}BR | AED ${r.price_aed?.toLocaleString()}`);
    console.log(`    ref=${r.reference_no} | source=${r.source} | date_listed=${r.date_listed} | scraped_at=${r.scraped_at}`);
    console.log(`    dip_prev_price=${r.dip_prev_price} | listing_change=${r.listing_change}`);
    console.log();
  }

  // Also try ILIKE in case of casing differences
  const { data: data2, error: err2 } = await supabase
    .from('ddf_listings')
    .select('id, reference_no, price_aed, scraped_at')
    .ilike('reference_no', '%VI740082%')
    .limit(20);

  if (!err2 && data2 && data2.length > 0) {
    console.log(`  Fuzzy match (ILIKE %VI740082%): ${data2.length} results`);
    for (const r of data2) {
      console.log(`    id=${r.id} ref=${r.reference_no} price=${r.price_aed} scraped=${r.scraped_at}`);
    }
  } else {
    console.log(`  Fuzzy match (ILIKE %VI740082%): 0 results`);
  }
  console.log();
}

// ── Q3: All Seventh Heaven listings with date comparison ──
async function q3_seventhHeavenAll() {
  console.log('═'.repeat(60));
  console.log('Q3 — All Seventh Heaven 2BR Sale listings (date_listed vs scraped_at)');
  console.log('═'.repeat(60));

  const { data, error } = await supabase
    .from('ddf_listings')
    .select('id, property_name, community, bedrooms, price_aed, date_listed, scraped_at, reference_no, source, dip_prev_price, dip_ref_id, listing_change')
    .ilike('property_name', '%seventh heaven%')
    .eq('bedrooms', 2)
    .eq('purpose', 'Sale')
    .order('scraped_at', { ascending: false })
    .limit(50);

  if (error) { console.error('  Error:', error.message); return; }
  console.log(`  Found ${data?.length || 0} listings:\n`);
  for (const r of (data || [])) {
    console.log(`  id=${r.id} | AED ${r.price_aed?.toLocaleString()} | date_listed=${r.date_listed} | scraped_at=${r.scraped_at}`);
    console.log(`    ref=${r.reference_no} | source=${r.source} | dip_prev_price=${r.dip_prev_price} | dip_ref_id=${r.dip_ref_id} | listing_change=${r.listing_change}`);
    console.log();
  }
}

// ── Q4: Check for ANY Seventh Heaven listing near 5.5M ──
async function q4_priceRange() {
  console.log('═'.repeat(60));
  console.log('Q4 — Seventh Heaven listings between 5M-6M (any beds)');
  console.log('═'.repeat(60));

  const { data, error } = await supabase
    .from('ddf_listings')
    .select('id, property_name, community, bedrooms, price_aed, date_listed, scraped_at, reference_no, source')
    .ilike('property_name', '%seventh heaven%')
    .gte('price_aed', 5000000)
    .lte('price_aed', 6000000)
    .order('price_aed', { ascending: true })
    .limit(50);

  if (error) { console.error('  Error:', error.message); return; }
  console.log(`  Found ${data?.length || 0} listings:\n`);
  for (const r of (data || [])) {
    console.log(`  id=${r.id} | ${r.bedrooms}BR | AED ${r.price_aed?.toLocaleString()} | ref=${r.reference_no} | date_listed=${r.date_listed} | scraped=${r.scraped_at}`);
  }
  console.log();
}

async function main() {
  if (!process.env.SUPABASE_SERVICE_KEY) {
    console.error('ERROR: SUPABASE_SERVICE_KEY not set');
    console.error('Run: SUPABASE_SERVICE_KEY=... node scripts/diagnose-seventh-heaven.mjs');
    process.exit(1);
  }

  await q1_scraperRunDates();
  await q2_searchBroadly();
  await q2b_searchByRef();
  await q3_seventhHeavenAll();
  await q4_priceRange();

  console.log('═'.repeat(60));
  console.log('DIAGNOSTIC COMPLETE — No changes made.');
  console.log('═'.repeat(60));
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
