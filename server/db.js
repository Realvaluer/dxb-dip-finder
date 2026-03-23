import { createClient } from '@supabase/supabase-js';
import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

// ── Supabase (listings data) ──────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xrdrypydnnaemmyvgjee.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || '';

if (!SUPABASE_KEY) {
  console.error('WARNING: No SUPABASE_SERVICE_KEY set — listings API will fail');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Users DB (auth, saved listings) — still SQLite ─────────────────────────────

let usersDb = null;
try {
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
  `);
  console.log('Users DB initialized at:', usersDbPath);
} catch (err) {
  console.error('Failed to initialize users DB (auth features disabled):', err.message);
  usersDb = null;
}

export { supabase as default, supabase, usersDb };
