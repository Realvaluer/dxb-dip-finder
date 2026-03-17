import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import { ensureDatabase } from './seed-db.js';

// On Railway: download DB to volume if it doesn't exist yet
await ensureDatabase();

const dbPath = process.env.DB_PATH || path.join(os.homedir(), 'Desktop', 'Claude', 'scraper', 'database.db');
const db = new Database(dbPath, { readonly: true });

db.pragma('query_only = ON');

export default db;
