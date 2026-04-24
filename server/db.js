import { createClient } from '@supabase/supabase-js';
import path from 'path';
import os from 'os';
import fs from 'fs';

// Try to load better-sqlite3 (optional — fails on some cloud environments)
let Database = null;
try {
  Database = (await import('better-sqlite3')).default;
} catch {
  console.log('better-sqlite3 not available — users DB disabled (auth features off)');
}

// ── Supabase (listings data) ──────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xrdrypydnnaemmyvgjee.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || '';

if (!SUPABASE_KEY) {
  console.error('WARNING: No SUPABASE_SERVICE_KEY set — listings API will fail');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Sales DB (RealValuer transaction data) ───────────────────────────────────────

const SALES_SUPABASE_URL = process.env.SALES_SUPABASE_URL || 'https://jbqxxaxesaqymqgtmkvu.supabase.co';
const SALES_SUPABASE_KEY = process.env.SALES_SUPABASE_KEY || '';

let salesDb = null;
if (SALES_SUPABASE_KEY) {
  salesDb = createClient(SALES_SUPABASE_URL, SALES_SUPABASE_KEY);
  console.log('Sales DB (RealValuer) connected');
} else {
  console.log('WARNING: No SALES_SUPABASE_KEY set — "Listing vs Last Sale" disabled');
}

// ── Users DB (auth, saved listings) — still SQLite ─────────────────────────────

let usersDb = null;
if (!Database) {
  console.log('Skipping users DB — better-sqlite3 not available');
} else try {
  const usersDbPath = process.env.USERS_DB_PATH
    || (process.env.DB_PATH ? path.join(path.dirname(process.env.DB_PATH), 'users.db') : null)
    || path.join(os.homedir(), 'Desktop', 'Claude', 'Mobile App for Dip Finder', 'users.db');

  const usersDir = path.dirname(usersDbPath);
  if (!fs.existsSync(usersDir)) {
    fs.mkdirSync(usersDir, { recursive: true });
  }

  usersDb = new Database(usersDbPath);
  usersDb.pragma('journal_mode = WAL');
  usersDb.pragma('foreign_keys = ON');

  usersDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS auth_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      token TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS saved_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      listing_id INTEGER NOT NULL,
      saved_at DATETIME DEFAULT (datetime('now')),
      UNIQUE(user_id, listing_id)
    );
    CREATE TABLE IF NOT EXISTS notification_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      listing_id INTEGER NOT NULL,
      sent_at DATETIME DEFAULT (datetime('now')),
      UNIQUE(user_id, listing_id)
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      listing_id INTEGER NOT NULL,
      saved_listing_id INTEGER,
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT (datetime('now')),
      dismissed_at DATETIME
    );
    CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, dismissed_at);
    CREATE TABLE IF NOT EXISTS dip_report_subscribers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      user_id INTEGER REFERENCES users(id),
      subscribed_at DATETIME DEFAULT (datetime('now')),
      active INTEGER DEFAULT 1
    );
  `);

  // Add columns to saved_listings for alert tracking (safe if already exist)
  try { usersDb.exec('ALTER TABLE saved_listings ADD COLUMN last_price_alerted REAL'); } catch {}
  try { usersDb.exec('ALTER TABLE saved_listings ADD COLUMN last_match_alerted_at DATETIME'); } catch {}
  // Track when we last sent the dip report to avoid repeating listings
  try { usersDb.exec('ALTER TABLE dip_report_subscribers ADD COLUMN last_report_sent_at DATETIME'); } catch {}
  try { usersDb.exec('ALTER TABLE dip_report_subscribers ADD COLUMN last_sent_ids TEXT'); } catch {}

  console.log('Users DB initialized at:', usersDbPath);
} catch (err) {
  console.error('Failed to initialize users DB (auth features disabled):', err.message);
  usersDb = null;
}

export { supabase as default, supabase, salesDb, usersDb };
