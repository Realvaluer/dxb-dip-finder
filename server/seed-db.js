/**
 * Startup script: ensures DB on Railway is present and up-to-date.
 * Uses timestamp comparison against GitHub release asset to auto-detect updates.
 */
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

const dbPath = process.env.DB_PATH;
const seedUrl = process.env.DB_SEED_URL;

function getTimestampPath() {
  return dbPath ? dbPath + '.timestamp' : null;
}

function readLocalTimestamp() {
  const tsPath = getTimestampPath();
  if (!tsPath) return null;
  try { return fs.readFileSync(tsPath, 'utf8').trim(); } catch { return null; }
}

function saveLocalTimestamp(ts) {
  const tsPath = getTimestampPath();
  if (tsPath) fs.writeFileSync(tsPath, ts);
}

async function getRemoteTimestamp(url) {
  // Follow redirects to get the final URL's Last-Modified header
  return new Promise((resolve) => {
    const check = (checkUrl) => {
      const client = checkUrl.startsWith('https') ? https : http;
      const req = client.request(checkUrl, { method: 'HEAD' }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          check(res.headers.location);
          return;
        }
        resolve(res.headers['last-modified'] || res.headers['etag'] || null);
      });
      req.on('error', () => resolve(null));
      req.end();
    };
    check(url);
  });
}

export async function ensureDatabase() {
  if (!dbPath) return; // local dev, skip
  if (!seedUrl) return;

  const dbExists = fs.existsSync(dbPath);

  if (dbExists) {
    // Check if remote has a newer version
    const localTs = readLocalTimestamp();
    const remoteTs = await getRemoteTimestamp(seedUrl);

    if (remoteTs && localTs && remoteTs === localTs) {
      console.log(`Database up-to-date (${localTs})`);
      return;
    }

    if (remoteTs && remoteTs !== localTs) {
      console.log(`Remote DB updated: local=${localTs || 'none'} remote=${remoteTs}`);
      console.log('Re-downloading...');
      try { fs.unlinkSync(dbPath); } catch {}
    } else if (!remoteTs) {
      // Can't check remote, keep existing DB
      console.log('Could not check remote timestamp, keeping existing DB');
      return;
    }
  }

  if (fs.existsSync(dbPath)) return;

  console.log(`Downloading database from seed URL...`);

  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const remoteTs = await new Promise((resolve, reject) => {
    let lastModified = null;
    const download = (url) => {
      const client = url.startsWith('https') ? https : http;
      client.get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          download(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${res.statusCode}`));
          return;
        }
        lastModified = res.headers['last-modified'] || res.headers['etag'] || new Date().toISOString();
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
          console.log(`\nDatabase downloaded (${(downloaded / 1024 / 1024).toFixed(1)}MB)`);
          resolve(lastModified);
        });
        file.on('error', reject);
      }).on('error', reject);
    };
    download(seedUrl);
  });

  // Save timestamp for next comparison
  if (remoteTs) saveLocalTimestamp(remoteTs);
}
