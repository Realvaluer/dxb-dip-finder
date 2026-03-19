import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import { ensureDatabase } from './seed-db.js';

// On Railway: download listings DB to volume if needed
await ensureDatabase();

// Listings DB — read-only, never written to by this app
const dbPath = process.env.DB_PATH || path.join(os.homedir(), 'Desktop', 'Claude', 'scraper', 'database.db');
const db = new Database(dbPath, { readonly: true });
db.pragma('query_only = ON');

// Users DB — read-write, for auth, saved listings, notifications
const usersDbPath = process.env.USERS_DB_PATH || path.join(os.homedir(), 'Desktop', 'Claude', 'Mobile App for Dip Finder', 'users.db');
const usersDb = new Database(usersDbPath);
usersDb.pragma('journal_mode = WAL');
usersDb.pragma('foreign_keys = ON');

// Create tables on startup
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

export { db as default, usersDb };
