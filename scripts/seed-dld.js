import Database from 'better-sqlite3';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRAPER_DB = resolve(__dirname, '../../scraper/database.db');
const DIP_DB = resolve(__dirname, '../dip_finder.db');

console.log('Reading scraper DB:', SCRAPER_DB);
console.log('Writing DIP DB:', DIP_DB);

const scraper = new Database(SCRAPER_DB, { readonly: true });
const dip = new Database(DIP_DB);

// Create schema
dip.exec(`
  DROP TABLE IF EXISTS dld_transactions;
  CREATE TABLE dld_transactions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    reference_no    TEXT NOT NULL,
    txn_date        TEXT NOT NULL,
    txn_price_aed   INTEGER NOT NULL,
    txn_type        TEXT DEFAULT 'Sale',
    community       TEXT,
    property_type   TEXT,
    bedrooms        INTEGER,
    area_sqft       INTEGER
  );
`);

// Get latest listing per reference_no (sale only)
const listings = scraper.prepare(`
  SELECT l.reference_no, l.community, l.type, l.bedrooms, l.size_sqft, l.price_aed, l.scraped_at
  FROM listings l
  INNER JOIN (
    SELECT reference_no, MAX(scraped_at) as max_scraped
    FROM listings
    WHERE purpose = 'Sale' AND price_aed > 0 AND reference_no IS NOT NULL AND reference_no != ''
    GROUP BY reference_no
  ) latest ON l.reference_no = latest.reference_no AND l.scraped_at = latest.max_scraped
  WHERE l.purpose = 'Sale'
`).all();

console.log(`Found ${listings.length} unique sale listings`);

// Seeded random for reproducibility
let seed = 42;
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

function randomDate(yearsBack) {
  const now = Date.now();
  const past = now - yearsBack * 365 * 24 * 60 * 60 * 1000;
  const ts = past + rand() * (now - past);
  return new Date(ts).toISOString().split('T')[0];
}

const insert = dip.prepare(`
  INSERT INTO dld_transactions (reference_no, txn_date, txn_price_aed, txn_type, community, property_type, bedrooms, area_sqft)
  VALUES (?, ?, ?, 'Sale', ?, ?, ?, ?)
`);

const insertMany = dip.transaction((rows) => {
  for (const r of rows) {
    insert.run(r.reference_no, r.txn_date, r.txn_price_aed, r.community, r.property_type, r.bedrooms, r.area_sqft);
  }
});

const rows = [];
let skipped = 0;

for (const listing of listings) {
  const price = listing.price_aed;
  if (!price || price <= 0) { skipped++; continue; }

  // Determine dip factor distribution
  const roll = rand();
  let dipFactor;
  if (roll < 0.05) {
    // 5% — price went up (negative dip)
    dipFactor = -(0.10 + rand() * 0.20);
  } else if (roll < 0.20) {
    // 15% — flat/slight
    dipFactor = rand() * 0.05;
  } else if (roll < 0.80) {
    // 60% — moderate 5-20%
    dipFactor = 0.05 + rand() * 0.15;
  } else {
    // 20% — big dip 20-45%
    dipFactor = 0.20 + rand() * 0.25;
  }

  // last_txn_price = current_price / (1 - dipFactor)
  // So dip_percent = dipFactor * 100
  const lastTxnPrice = Math.round(price / (1 - dipFactor));

  // Number of transactions: 1-3
  const numTxns = 1 + Math.floor(rand() * 3);

  for (let i = 0; i < numTxns; i++) {
    const yearsBack = 1 + rand() * 4; // 1-5 years ago
    const date = randomDate(yearsBack);
    // Older transactions vary from last txn price by ±15%
    let txnPrice;
    if (i === 0) {
      txnPrice = lastTxnPrice; // Most recent = reference
    } else {
      const variance = 1 + (rand() - 0.5) * 0.30;
      txnPrice = Math.round(lastTxnPrice * variance);
    }

    rows.push({
      reference_no: listing.reference_no,
      txn_date: date,
      txn_price_aed: txnPrice,
      community: listing.community,
      property_type: listing.type,
      bedrooms: listing.bedrooms,
      area_sqft: listing.size_sqft,
    });
  }
}

console.log(`Inserting ${rows.length} transactions (skipped ${skipped} invalid listings)...`);
insertMany(rows);

// Create indexes
dip.exec(`
  CREATE INDEX idx_dld_ref ON dld_transactions(reference_no);
  CREATE INDEX idx_dld_community ON dld_transactions(community);
  CREATE INDEX idx_dld_date ON dld_transactions(txn_date);
`);

const count = dip.prepare('SELECT COUNT(*) as c FROM dld_transactions').get();
console.log(`Done. Total DLD transactions: ${count.c}`);

scraper.close();
dip.close();
