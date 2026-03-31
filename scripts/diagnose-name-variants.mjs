#!/usr/bin/env node
// DIAGNOSTIC ONLY — find property name pairs that are likely the same building
// but spelled slightly differently. Does NOT modify any data.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://xrdrypydnnaemmyvgjee.supabase.co',
  process.env.SUPABASE_SERVICE_KEY
);

// Fetch all distinct (property_name, community) with counts
async function fetchGroups() {
  console.log('Loading property_name groups from ddf_listings...');
  const allGroups = [];
  let offset = 0;
  while (true) {
    // We can't do GROUP BY via PostgREST, so fetch all distinct combos
    // Use a workaround: fetch all rows with just the columns we need
    const { data, error } = await supabase
      .from('ddf_listings')
      .select('property_name, community')
      .not('property_name', 'is', null)
      .not('community', 'is', null)
      .range(offset, offset + 999);
    if (error) { console.error('Fetch error:', error.message); break; }
    if (!data || data.length === 0) break;
    allGroups.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
    if (offset % 50000 === 0) console.log(`  Loaded ${offset} rows...`);
  }
  console.log(`Total rows fetched: ${allGroups.length}`);

  // Group and count
  const counts = {};
  for (const r of allGroups) {
    const key = `${r.property_name}|||${r.community}`;
    counts[key] = (counts[key] || 0) + 1;
  }

  const groups = Object.entries(counts).map(([key, count]) => {
    const [property_name, community] = key.split('|||');
    return { property_name, community, listing_count: count };
  });
  console.log(`Distinct (property_name, community) groups: ${groups.length}\n`);
  return groups;
}

// Roman numeral conversion
const romanMap = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8, 'IX': 9, 'X': 10 };
function romanToArabic(name) {
  return name.replace(/\b(I{1,3}|IV|VI{0,3}|IX|X)\b/g, (match) => {
    return romanMap[match] !== undefined ? String(romanMap[match]) : match;
  });
}

function normalize(name) {
  return name.toLowerCase().trim();
}

// ═══════════════════════════════════════════════
// PATTERN MATCHING
// ═══════════════════════════════════════════════

function runDiagnostics(groups) {
  const mergeRecommendations = [];
  const seen = new Set(); // avoid duplicates

  // Index by community
  const byCommunity = {};
  for (const g of groups) {
    const c = g.community;
    if (!byCommunity[c]) byCommunity[c] = [];
    byCommunity[c].push(g);
  }

  // ── QUERY 1: Residence vs Residences ──
  console.log('═'.repeat(60));
  console.log('QUERY 1 — Residence vs Residences');
  console.log('═'.repeat(60));
  let q1Count = 0;
  for (const [community, entries] of Object.entries(byCommunity)) {
    for (const a of entries) {
      for (const b of entries) {
        if (a === b) continue;
        if (a.property_name === b.property_name) continue;
        const aNorm = normalize(a.property_name).replace(/residences/g, 'residence');
        const bNorm = normalize(b.property_name).replace(/residences/g, 'residence');
        if (aNorm === bNorm && a.listing_count >= b.listing_count) {
          const key = [a.property_name, b.property_name, community].sort().join('|');
          if (seen.has(key)) continue;
          seen.add(key);
          console.log(`  ${a.property_name} (${a.listing_count}) vs ${b.property_name} (${b.listing_count}) — ${community}`);
          q1Count++;
          mergeRecommendations.push({
            keep: a.listing_count >= b.listing_count ? a : b,
            merge: a.listing_count >= b.listing_count ? b : a,
            reason: 'Singular vs plural (Residence/Residences)'
          });
        }
      }
    }
  }
  console.log(`  Found: ${q1Count} pairs\n`);

  // ── QUERY 2: One name is prefix of other ──
  console.log('═'.repeat(60));
  console.log('QUERY 2 — One name is prefix of other (+ suffix word)');
  console.log('═'.repeat(60));
  let q2Count = 0;
  for (const [community, entries] of Object.entries(byCommunity)) {
    // Only entries with count >= 2
    const filtered = entries.filter(e => e.listing_count >= 2);
    for (const a of filtered) {
      for (const b of filtered) {
        if (a === b || a.property_name === b.property_name) continue;
        if (a.listing_count < b.listing_count) continue;
        const aLow = normalize(a.property_name);
        const bLow = normalize(b.property_name);
        if (bLow.startsWith(aLow + ' ')) {
          const suffix = bLow.slice(aLow.length + 1);
          // Only include if suffix is a common word (Tower, Towers, Villas, etc)
          const key = [a.property_name, b.property_name, community].sort().join('|');
          if (seen.has(key)) continue;
          seen.add(key);
          console.log(`  "${a.property_name}" (${a.listing_count}) → "${b.property_name}" (${b.listing_count}) [suffix: "${suffix}"] — ${community}`);
          q2Count++;
          mergeRecommendations.push({
            keep: a.listing_count >= b.listing_count ? a : b,
            merge: a.listing_count >= b.listing_count ? b : a,
            reason: `Extra suffix word: "${suffix}"`
          });
        }
      }
    }
  }
  console.log(`  Found: ${q2Count} pairs\n`);

  // ── QUERY 3: Roman numeral vs arabic number ──
  console.log('═'.repeat(60));
  console.log('QUERY 3 — Roman numeral vs Arabic number');
  console.log('═'.repeat(60));
  let q3Count = 0;
  const romanPattern = /\b(I{1,3}|IV|VI{0,3}|IX|X)\b/;
  for (const [community, entries] of Object.entries(byCommunity)) {
    // Find entries with Roman numerals
    const withRoman = entries.filter(e => romanPattern.test(e.property_name) && e.listing_count >= 2);
    for (const r of withRoman) {
      const arabicVersion = romanToArabic(r.property_name);
      if (arabicVersion === r.property_name) continue;
      // Find matching arabic version in same community
      const match = entries.find(e => normalize(e.property_name) === normalize(arabicVersion) && e.property_name !== r.property_name);
      if (match) {
        const key = [r.property_name, match.property_name, community].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        const keep = r.listing_count >= match.listing_count ? r : match;
        const merge = r.listing_count >= match.listing_count ? match : r;
        console.log(`  "${r.property_name}" (${r.listing_count}) vs "${match.property_name}" (${match.listing_count}) — ${community}`);
        q3Count++;
        mergeRecommendations.push({ keep, merge, reason: 'Roman numeral vs Arabic number' });
      }
    }
  }
  console.log(`  Found: ${q3Count} pairs\n`);

  // ── QUERY 4: With/without Villas/Villa suffix ──
  console.log('═'.repeat(60));
  console.log('QUERY 4 — With/without Villas/Villa suffix');
  console.log('═'.repeat(60));
  let q4Count = 0;
  for (const [community, entries] of Object.entries(byCommunity)) {
    const filtered = entries.filter(e => e.listing_count >= 2);
    // Group by base name (remove villas/villa)
    const baseGroups = {};
    for (const e of filtered) {
      const base = normalize(e.property_name)
        .replace(/\s+villas?\s*$/i, '')
        .replace(/\s+villas?\s+/i, ' ')
        .trim();
      if (!baseGroups[base]) baseGroups[base] = [];
      baseGroups[base].push(e);
    }
    for (const [base, variants] of Object.entries(baseGroups)) {
      if (variants.length < 2) continue;
      // Check they actually differ on the villa/villas part
      const names = variants.map(v => v.property_name);
      const uniqueNames = [...new Set(names)];
      if (uniqueNames.length < 2) continue;
      // Check at least one has villa/villas and one doesn't
      const hasVilla = variants.filter(v => /\bvillas?\b/i.test(v.property_name));
      const noVilla = variants.filter(v => !/\bvillas?\b/i.test(v.property_name));
      if (hasVilla.length === 0 || noVilla.length === 0) continue;

      const allSorted = [...variants].sort((a, b) => b.listing_count - a.listing_count);
      const keep = allSorted[0];
      for (let i = 1; i < allSorted.length; i++) {
        if (allSorted[i].property_name === keep.property_name) continue;
        const key = [keep.property_name, allSorted[i].property_name, community].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        console.log(`  "${keep.property_name}" (${keep.listing_count}) vs "${allSorted[i].property_name}" (${allSorted[i].listing_count}) — ${community}`);
        q4Count++;
        mergeRecommendations.push({
          keep,
          merge: allSorted[i],
          reason: 'With/without Villas/Villa suffix'
        });
      }
    }
  }
  console.log(`  Found: ${q4Count} pairs\n`);

  // ── QUERY 5: Known specific cases ──
  console.log('═'.repeat(60));
  console.log('QUERY 5 — Known specific cases');
  console.log('═'.repeat(60));
  const knownPatterns = [
    'canal front residence',
    'dt1',
    'chorisia',
    'ixora',
    'amaranta',
    'act one',
    'act two',
    'marina gate',
    'address downtown',
    'address residences',
    'sparklz',
    'barari'
  ];
  for (const pattern of knownPatterns) {
    const matches = groups.filter(g =>
      normalize(g.property_name).includes(pattern)
    );
    if (matches.length > 0) {
      console.log(`\n  Pattern: "${pattern}"`);
      // Group by community
      const byCom = {};
      for (const m of matches) {
        if (!byCom[m.community]) byCom[m.community] = [];
        byCom[m.community].push(m);
      }
      for (const [com, entries] of Object.entries(byCom)) {
        if (entries.length > 1) {
          console.log(`    ${com}:`);
          for (const e of entries.sort((a, b) => b.listing_count - a.listing_count)) {
            console.log(`      "${e.property_name}" — ${e.listing_count} listings`);
          }
        } else {
          console.log(`    ${com}: "${entries[0].property_name}" — ${entries[0].listing_count} listings`);
        }
      }
    }
  }

  // ── QUERY 6: Dash vs space vs no separator (Al-Barari vs Al Barari) ──
  console.log('\n' + '═'.repeat(60));
  console.log('QUERY 6 — Dash vs space/no separator');
  console.log('═'.repeat(60));
  let q6Count = 0;
  for (const [community, entries] of Object.entries(byCommunity)) {
    const filtered = entries.filter(e => e.listing_count >= 2);
    for (const a of filtered) {
      for (const b of filtered) {
        if (a === b || a.property_name === b.property_name) continue;
        if (a.listing_count < b.listing_count) continue;
        // Normalize: remove dashes, extra spaces
        const aNorm = normalize(a.property_name).replace(/-/g, ' ').replace(/\s+/g, ' ');
        const bNorm = normalize(b.property_name).replace(/-/g, ' ').replace(/\s+/g, ' ');
        if (aNorm === bNorm) {
          const key = [a.property_name, b.property_name, community].sort().join('|');
          if (seen.has(key)) continue;
          seen.add(key);
          console.log(`  "${a.property_name}" (${a.listing_count}) vs "${b.property_name}" (${b.listing_count}) — ${community}`);
          q6Count++;
          mergeRecommendations.push({
            keep: a,
            merge: b,
            reason: 'Dash vs space separator'
          });
        }
      }
    }
  }
  console.log(`  Found: ${q6Count} pairs\n`);

  // ── QUERY 7: "By" capitalization ──
  console.log('═'.repeat(60));
  console.log('QUERY 7 — Case differences (By/by, The/the, etc.)');
  console.log('═'.repeat(60));
  let q7Count = 0;
  for (const [community, entries] of Object.entries(byCommunity)) {
    const filtered = entries.filter(e => e.listing_count >= 2);
    for (const a of filtered) {
      for (const b of filtered) {
        if (a === b || a.property_name === b.property_name) continue;
        if (a.listing_count < b.listing_count) continue;
        if (normalize(a.property_name) === normalize(b.property_name)) {
          const key = [a.property_name, b.property_name, community].sort().join('|');
          if (seen.has(key)) continue;
          seen.add(key);
          console.log(`  "${a.property_name}" (${a.listing_count}) vs "${b.property_name}" (${b.listing_count}) — ${community}`);
          q7Count++;
          mergeRecommendations.push({
            keep: a,
            merge: b,
            reason: 'Case difference only'
          });
        }
      }
    }
  }
  console.log(`  Found: ${q7Count} pairs\n`);

  // ═══════════════════════════════════════════════
  // MERGE RECOMMENDATIONS
  // ═══════════════════════════════════════════════
  console.log('\n');
  console.log('MERGE RECOMMENDATIONS');
  console.log('═'.repeat(60));

  // Deduplicate recommendations
  const uniqueRecs = [];
  const recSeen = new Set();
  for (const rec of mergeRecommendations) {
    const key = [rec.keep.property_name, rec.merge.property_name, rec.keep.community].sort().join('|');
    if (recSeen.has(key)) continue;
    recSeen.add(key);
    uniqueRecs.push(rec);
  }

  let totalToRename = 0;
  for (const rec of uniqueRecs) {
    console.log(`\nKEEP:   ${rec.keep.property_name} (${rec.keep.listing_count})`);
    console.log(`MERGE:  ${rec.merge.property_name} (${rec.merge.listing_count})`);
    console.log(`COUNT:  ${rec.merge.listing_count} rows to update`);
    console.log(`COMMUNITY: ${rec.keep.community}`);
    console.log(`REASON: ${rec.reason}`);
    console.log('─'.repeat(60));
    totalToRename += rec.merge.listing_count;
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`Total merge groups found:     ${uniqueRecs.length}`);
  console.log(`Total listings to be renamed: ${totalToRename}`);
  console.log('═'.repeat(60));
  console.log('\n⛔ DIAGNOSTIC ONLY — No changes made. Waiting for approval.');
}

async function main() {
  const groups = await fetchGroups();
  runDiagnostics(groups);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
