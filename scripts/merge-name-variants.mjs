#!/usr/bin/env node
// Merge property name variants identified by diagnose-name-variants.mjs
// Groups: 1) Residence/Residences, 2) Roman→Arabic, 3) Dash/space, 4) Case, 5) Specific known

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://xrdrypydnnaemmyvgjee.supabase.co',
  process.env.SUPABASE_SERVICE_KEY
);

// ── Fetch all (property_name, community) groups with counts ──
async function fetchGroups() {
  console.log('Loading property_name groups from ddf_listings...');
  const all = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('ddf_listings')
      .select('property_name, community')
      .not('property_name', 'is', null)
      .not('community', 'is', null)
      .range(offset, offset + 999);
    if (error) { console.error('Fetch error:', error.message); break; }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
    if (offset % 50000 === 0) console.log(`  Loaded ${offset} rows...`);
  }
  console.log(`Total rows: ${all.length}`);
  const counts = {};
  for (const r of all) {
    const key = `${r.property_name}\t${r.community}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.entries(counts).map(([key, c]) => {
    const [property_name, community] = key.split('\t');
    return { property_name, community, count: c };
  });
}

const romanMap = { 'I':1,'II':2,'III':3,'IV':4,'V':5,'VI':6,'VII':7,'VIII':8,'IX':9,'X':10 };
function romanToArabic(name) {
  return name.replace(/\b(I{1,3}|IV|VI{0,3}|IX|X)\b/g, m => romanMap[m] !== undefined ? String(romanMap[m]) : m);
}
const norm = s => s.toLowerCase().trim();

// ── Identify all merge pairs ──
function identifyMerges(groups) {
  const byCommunity = {};
  for (const g of groups) {
    if (!byCommunity[g.community]) byCommunity[g.community] = [];
    byCommunity[g.community].push(g);
  }

  const merges = []; // { from, to, community, group, fromCount, toCount }
  const seen = new Set();
  const addMerge = (from, to, community, group, fromCount, toCount) => {
    const key = `${from}|${to}|${community}`;
    if (seen.has(key)) return;
    seen.add(key);
    merges.push({ from, to, community, group, fromCount, toCount });
  };

  // ── GROUP 5: Specific known cases (check first to avoid overlap) ──
  const specificPairs = [
    { from: 'DT1 Tower', to: 'DT1', community: 'Downtown Dubai' },
    { from: 'Bararigate by ADE', to: 'Barari Gate by ADE', community: 'Majan' },
  ];
  for (const sp of specificPairs) {
    const fromEntry = groups.find(g => g.property_name === sp.from && g.community === sp.community);
    const toEntry = groups.find(g => g.property_name === sp.to && g.community === sp.community);
    if (fromEntry) {
      addMerge(sp.from, sp.to, sp.community, 5, fromEntry.count, toEntry?.count || 0);
    }
  }

  for (const [community, entries] of Object.entries(byCommunity)) {
    // ── GROUP 3: Dash/space separator ──
    const filtered2 = entries.filter(e => e.count >= 2);
    for (const a of filtered2) {
      for (const b of filtered2) {
        if (a === b || a.property_name === b.property_name) continue;
        const aN = norm(a.property_name).replace(/-/g, ' ').replace(/\s+/g, ' ');
        const bN = norm(b.property_name).replace(/-/g, ' ').replace(/\s+/g, ' ');
        if (aN === bN && norm(a.property_name) !== norm(b.property_name)) {
          // They differ only in dash/space/double-space — not just case
          const keep = a.count >= b.count ? a : b;
          const merge = a.count >= b.count ? b : a;
          const key = [a.property_name, b.property_name, community].sort().join('|');
          if (!seen.has(key)) {
            addMerge(merge.property_name, keep.property_name, community, 3, merge.count, keep.count);
          }
        }
      }
    }

    // ── GROUP 2: Roman numeral → Arabic ──
    const romanPattern = /\b(I{1,3}|IV|VI{0,3}|IX|X)\b/;
    for (const r of entries) {
      if (!romanPattern.test(r.property_name) || r.count < 2) continue;
      const arabicVersion = romanToArabic(r.property_name);
      if (arabicVersion === r.property_name) continue;
      // Find exact match
      let match = entries.find(e => e.property_name === arabicVersion && e.property_name !== r.property_name);
      // Also check with " Villas" suffix for Chorisia case
      if (!match) {
        match = entries.find(e => norm(e.property_name) === norm(arabicVersion + ' Villas') && e.property_name !== r.property_name);
      }
      if (match) {
        const keep = match; // always keep arabic version
        addMerge(r.property_name, keep.property_name, community, 2, r.count, keep.count);
      }
    }

    // ── GROUP 1: Residence vs Residences (case-insensitive, same community) ──
    for (const a of entries) {
      for (const b of entries) {
        if (a === b || a.property_name === b.property_name) continue;
        if (a.count < b.count) continue;
        const aN = norm(a.property_name).replace(/residences/g, 'residence');
        const bN = norm(b.property_name).replace(/residences/g, 'residence');
        if (aN === bN) {
          const key = [a.property_name, b.property_name, community].sort().join('|');
          if (seen.has(key)) continue;
          // Check if this is ONLY a residence/residences difference or also case
          const aNoRes = a.property_name.replace(/Residences?/gi, 'X');
          const bNoRes = b.property_name.replace(/Residences?/gi, 'X');
          if (aNoRes.toLowerCase() === bNoRes.toLowerCase() && aNoRes !== bNoRes) {
            // Case + possibly residence diff → Group 4 if no residence diff, Group 1 if residence diff
            const hasResDiff = (a.property_name.toLowerCase().includes('residences') !== b.property_name.toLowerCase().includes('residences')) ||
                               (a.property_name.toLowerCase().includes('residence') !== b.property_name.toLowerCase().includes('residence'));
            if (hasResDiff) {
              addMerge(b.property_name, a.property_name, community, 1, b.count, a.count);
            } else {
              addMerge(b.property_name, a.property_name, community, 4, b.count, a.count);
            }
          } else if (aNoRes.toLowerCase() === bNoRes.toLowerCase()) {
            // Pure residence/residences diff
            addMerge(b.property_name, a.property_name, community, 1, b.count, a.count);
          } else {
            addMerge(b.property_name, a.property_name, community, 1, b.count, a.count);
          }
        }
      }
    }

    // ── GROUP 4: Case-only differences (not already caught above) ──
    for (const a of filtered2) {
      for (const b of filtered2) {
        if (a === b || a.property_name === b.property_name) continue;
        if (a.count < b.count) continue;
        if (norm(a.property_name) === norm(b.property_name)) {
          const key = [a.property_name, b.property_name, community].sort().join('|');
          if (seen.has(key)) continue;
          addMerge(b.property_name, a.property_name, community, 4, b.count, a.count);
        }
      }
    }
  }

  return merges;
}

// ── Execute merges ──
async function executeMerges(merges) {
  const groupNames = { 1: 'Residence/Residences', 2: 'Roman→Arabic', 3: 'Dash/space', 4: 'Case only', 5: 'Specific known' };
  const groupCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const groupRows = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  // Count per group
  for (const m of merges) {
    groupCounts[m.group] = (groupCounts[m.group] || 0) + 1;
    groupRows[m.group] = (groupRows[m.group] || 0) + m.fromCount;
  }

  // ── DRY RUN ──
  console.log('\n' + '═'.repeat(60));
  console.log('DRY RUN — Merge counts');
  console.log('═'.repeat(60));
  let totalPairs = 0, totalRows = 0;
  for (const g of [1, 2, 3, 4, 5]) {
    console.log(`  Group ${g} (${groupNames[g]}): ${groupCounts[g]} pairs → ${groupRows[g]} rows to rename`);
    totalPairs += groupCounts[g];
    totalRows += groupRows[g];
  }
  console.log(`  ──────────────────────────────────`);
  console.log(`  Total: ${totalPairs} pairs → ${totalRows} rows to rename`);
  console.log('═'.repeat(60));

  // ── EXECUTE ──
  console.log('\nExecuting merges...\n');
  const actualCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let errors = 0;

  for (const g of [1, 2, 3, 4, 5]) {
    const groupMerges = merges.filter(m => m.group === g);
    if (groupMerges.length === 0) continue;
    console.log(`── Group ${g}: ${groupNames[g]} (${groupMerges.length} pairs) ──`);

    for (let i = 0; i < groupMerges.length; i++) {
      const m = groupMerges[i];
      const { data, error, count } = await supabase
        .from('ddf_listings')
        .update({ property_name: m.to })
        .eq('property_name', m.from)
        .eq('community', m.community)
        .select('id', { count: 'exact', head: true });

      // Supabase JS v2: use count option
      const { error: err2, count: updated } = await supabase
        .from('ddf_listings')
        .update({ property_name: m.to }, { count: 'exact' })
        .eq('property_name', m.from)
        .eq('community', m.community);

      if (err2) {
        console.error(`  ✗ "${m.from}" → "${m.to}" [${m.community}]: ${err2.message}`);
        errors++;
      } else {
        actualCounts[g] += updated || m.fromCount;
        if ((i + 1) % 20 === 0 || i === groupMerges.length - 1) {
          console.log(`  Progress: ${i + 1}/${groupMerges.length} pairs done`);
        }
      }
    }
    console.log(`  ✓ Group ${g} done: ${actualCounts[g]} rows updated\n`);
  }

  // ── SUMMARY ──
  console.log('═'.repeat(60));
  console.log('MERGE RESULTS');
  console.log('═'.repeat(60));
  let totalActual = 0;
  for (const g of [1, 2, 3, 4, 5]) {
    console.log(`  Group ${g} (${groupNames[g].padEnd(22)}): ${actualCounts[g]} rows`);
    totalActual += actualCounts[g];
  }
  console.log(`  ──────────────────────────────────`);
  console.log(`  Total:                          ${totalActual} rows`);
  if (errors) console.log(`  Errors:                         ${errors}`);
  console.log('═'.repeat(60));
}

// ── Verification query ──
async function verify() {
  console.log('\n── VERIFICATION ──\n');
  const patterns = ['%canal front residence%', '%dt1%', '%chorisia%', '%pearl house%', '%auresta%', '%barari gate%'];
  for (const pat of patterns) {
    const { data, error } = await supabase
      .from('ddf_listings')
      .select('property_name, community')
      .ilike('property_name', pat);
    if (error) { console.error(`  Error for ${pat}: ${error.message}`); continue; }
    // Group and count
    const counts = {};
    for (const r of data) {
      const key = `${r.property_name}|${r.community}`;
      counts[key] = (counts[key] || 0) + 1;
    }
    const sorted = Object.entries(counts)
      .map(([k, c]) => { const [n, com] = k.split('|'); return { n, com, c }; })
      .sort((a, b) => a.com.localeCompare(b.com) || b.c - a.c);
    if (sorted.length > 0) {
      console.log(`  Pattern: ${pat}`);
      for (const s of sorted) {
        console.log(`    "${s.n}" — ${s.com} — ${s.c} listings`);
      }
      console.log();
    }
  }
}

async function main() {
  const groups = await fetchGroups();
  console.log(`Groups: ${groups.length}`);
  const merges = identifyMerges(groups);
  console.log(`Total merge pairs identified: ${merges.length}`);
  await executeMerges(merges);
  await verify();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
