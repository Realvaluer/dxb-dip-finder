/**
 * Startup script: ensures DB exists and is up-to-date on Railway.
 * Downloads from DB_SEED_URL if DB is missing or a FORCE_DB_UPDATE env var is set.
 */
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

const dbPath = process.env.DB_PATH;
const seedUrl = process.env.DB_SEED_URL;

export async function ensureDatabase() {
  if (!dbPath) return; // local dev, skip

  const forceUpdate = process.env.FORCE_DB_UPDATE === 'true';

  if (fs.existsSync(dbPath) && !forceUpdate) {
    // Check if the DB has the dip_data table (current schema)
    try {
      const Database = (await import('better-sqlite3')).default;
      const db = new Database(dbPath, { readonly: true });
      const hasDipData = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='dip_data'").get();
      db.close();
      if (hasDipData) {
        console.log(`Database exists at ${dbPath} with dip_data table`);
        return;
      }
      console.log(`Database exists but missing dip_data table, re-downloading...`);
      fs.unlinkSync(dbPath);
    } catch (e) {
      console.log(`Database check failed: ${e.message}, re-downloading...`);
      try { fs.unlinkSync(dbPath); } catch {}
    }
  } else if (forceUpdate && fs.existsSync(dbPath)) {
    console.log('FORCE_DB_UPDATE is set, re-downloading database...');
    fs.unlinkSync(dbPath);
  }

  if (fs.existsSync(dbPath)) return;

  if (!seedUrl) {
    console.error('DB_PATH set but database missing and no DB_SEED_URL configured');
    process.exit(1);
  }

  console.log(`Database not found at ${dbPath}, downloading from seed URL...`);

  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  await new Promise((resolve, reject) => {
    const download = (url) => {
      const client = url.startsWith('https') ? https : http;
      client.get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          console.log(`Redirecting to ${res.headers.location}`);
          download(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${res.statusCode}`));
          return;
        }
        const total = parseInt(res.headers['content-length'], 10) || 0;
        let downloaded = 0;
        const file = fs.createWriteStream(dbPath);
        res.on('data', (chunk) => {
          downloaded += chunk.length;
          if (total > 0) {
            const pct = ((downloaded / total) * 100).toFixed(1);
            process.stdout.write(`\rDownloading: ${pct}% (${(downloaded / 1024 / 1024).toFixed(1)}MB)`);
          }
        });
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log(`\nDatabase downloaded to ${dbPath} (${(downloaded / 1024 / 1024).toFixed(1)}MB)`);
          resolve();
        });
        file.on('error', reject);
      }).on('error', reject);
    };
    download(seedUrl);
  });

  // After download, unset FORCE_DB_UPDATE for next restart
  delete process.env.FORCE_DB_UPDATE;
}
