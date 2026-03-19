#!/bin/bash
# Sync local database to Railway
# Called automatically by scrape-and-sync.sh, or run manually
set -e

DB_PATH="$HOME/Desktop/Claude/scraper/database.db"
HTML_PATH="$HOME/Desktop/Claude/scraper/listingsV8.html"
APP_DIR="$HOME/Desktop/Claude/Mobile App for Dip Finder"
GITHUB_TOKEN=$(cat "$APP_DIR/.github-token" 2>/dev/null || echo "")
REPO="Realvaluer/dxb-dip-finder"
RELEASE_ID="297937140"

if [ -z "$GITHUB_TOKEN" ]; then
  echo "Error: No GitHub token. Create .github-token in app directory."
  exit 1
fi

echo "=== Step 1: Rebuild dip_data table ==="
cd "$APP_DIR"
node -e '
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const html = fs.readFileSync(process.argv[1], "utf8");
const data = JSON.parse(html.match(/const DATA = (\[.*?\]);/s)[1]);
const db = new Database(process.argv[2]);
db.exec("DROP TABLE IF EXISTS dip_data");
db.exec(`CREATE TABLE dip_data (
  listing_id INTEGER PRIMARY KEY, dip_pct REAL, dip_amount INTEGER,
  prev_price INTEGER, prev_url TEXT, prev_source TEXT, prev_date TEXT,
  prev_size INTEGER, prev_furnished TEXT, ref_listing_id INTEGER
)`);
const ins = db.prepare("INSERT INTO dip_data VALUES (?,?,?,?,?,?,?,?,?,?)");
let count = 0;
db.transaction(() => {
  for (const d of data) {
    if (d._dipPct !== null && d._dipPct !== undefined) {
      ins.run(d._id, d._dipPct, d._dipPrice||null, d._dipPrevPrice||null,
        d._dipPrevUrl||null, d._dipPrevSource||null, d._dipPrevDate||null,
        d._dipPrevSize||null, d._dipPrevFurnished||null, d._dipRefId||null);
      count++;
    }
  }
})();
console.log("  " + count + " dip records inserted");
db.close();
' "$HTML_PATH" "$DB_PATH"

echo "=== Step 2: Upload to GitHub releases ==="
ASSET_ID=$(curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
  "https://api.github.com/repos/$REPO/releases/$RELEASE_ID/assets" | \
  node -e "process.stdin.setEncoding('utf8');let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const a=JSON.parse(d);const f=a.find(x=>x.name==='database.db');console.log(f?f.id:'')})")

if [ -n "$ASSET_ID" ]; then
  curl -s -X DELETE -H "Authorization: Bearer $GITHUB_TOKEN" \
    "https://api.github.com/repos/$REPO/releases/assets/$ASSET_ID" > /dev/null
fi

echo "  Uploading $(du -h "$DB_PATH" | cut -f1)..."
curl -s -L -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Content-Type: application/octet-stream" \
  "https://uploads.github.com/repos/$REPO/releases/$RELEASE_ID/assets?name=database.db" \
  --data-binary "@$DB_PATH" > /dev/null

echo "=== Step 3: Trigger Railway redeploy ==="
cd "$APP_DIR"
git commit --allow-empty -m "DB sync $(date '+%Y-%m-%d %H:%M')" 2>/dev/null || true
git remote set-url origin "https://Realvaluer:${GITHUB_TOKEN}@github.com/$REPO.git"
git push origin main 2>/dev/null || true
git remote set-url origin "https://github.com/$REPO.git"

echo "=== Done — Railway will redeploy with fresh data ==="
