#!/bin/bash
# Sync local database to Railway
# Run this after the scraper updates the database
# Usage: ./scripts/sync-db.sh

set -e

DB_PATH="$HOME/Desktop/Claude/scraper/database.db"
HTML_PATH="$HOME/Desktop/Claude/scraper/listingsV8.html"
APP_DIR="$HOME/Desktop/Claude/Mobile App for Dip Finder"
GITHUB_TOKEN=$(cat "$APP_DIR/.github-token" 2>/dev/null || echo "")
REPO="Realvaluer/dxb-dip-finder"

if [ -z "$GITHUB_TOKEN" ]; then
  echo "Error: No GitHub token found. Create .github-token file in the app directory."
  echo "  echo 'ghp_yourtoken' > '$APP_DIR/.github-token'"
  exit 1
fi

echo "=== Step 1: Rebuild dip_data table from listingsV8.html ==="
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
const ins = db.prepare(`INSERT INTO dip_data VALUES (?,?,?,?,?,?,?,?,?,?)`);
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
console.log("  Inserted " + count + " dip records");
db.close();
' "$HTML_PATH" "$DB_PATH"

echo "=== Step 2: Upload database to GitHub release ==="
# Get current asset ID
ASSET_ID=$(curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
  "https://api.github.com/repos/$REPO/releases/297937140/assets" | \
  node -e "process.stdin.setEncoding('utf8');let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const a=JSON.parse(d);const f=a.find(x=>x.name==='database.db');console.log(f?f.id:'')})")

if [ -n "$ASSET_ID" ]; then
  echo "  Deleting old asset $ASSET_ID..."
  curl -s -X DELETE -H "Authorization: Bearer $GITHUB_TOKEN" \
    "https://api.github.com/repos/$REPO/releases/assets/$ASSET_ID" > /dev/null
fi

echo "  Uploading new database ($(du -h "$DB_PATH" | cut -f1))..."
curl -s -L -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Content-Type: application/octet-stream" \
  "https://uploads.github.com/repos/$REPO/releases/297937140/assets?name=database.db" \
  --data-binary "@$DB_PATH" > /dev/null

echo "=== Step 3: Set FORCE_DB_UPDATE and trigger Railway redeploy ==="
# Try setting the env var via Railway CLI if available
if command -v npx &> /dev/null; then
  echo "  Setting FORCE_DB_UPDATE=true on Railway..."
  npx @railway/cli variables set FORCE_DB_UPDATE=true 2>/dev/null || true
fi

# Push an empty commit to trigger redeploy
cd "$APP_DIR"
git commit --allow-empty -m "DB update $(date +%Y-%m-%d)" 2>/dev/null
git remote set-url origin "https://Realvaluer:${GITHUB_TOKEN}@github.com/$REPO.git"
git push origin main 2>/dev/null
git remote set-url origin "https://github.com/$REPO.git"

echo ""
echo "=== Done! ==="
echo "  1. Database uploaded to GitHub releases"
echo "  2. Railway will redeploy and download the updated database"
echo ""
echo "  After deploy succeeds, remove FORCE_DB_UPDATE from Railway variables"
echo "  to prevent re-downloading on every restart."
