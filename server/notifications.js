import cron from 'node-cron';
import { supabase, usersDb } from './db.js';

let resend = null;
if (process.env.RESEND_API_KEY) {
  const { Resend } = await import('resend');
  resend = new Resend(process.env.RESEND_API_KEY);
}

const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev';
const TABLE = 'ddf_listings';

// Fields needed for rich email cards
const RICH_SELECT = 'id, property_name, community, bedrooms, size_sqft, price_aed, price_sqft, purpose, type, ready_off_plan, listing_change, url, dip_pct, dip_price, dip_prev_price, dip_prev_date, dip_prev_size, last_txn_price, last_txn_date, last_txn_change, last_txn_change_pct, last_txn_size, last_txn_type, listing_date, source';

export function startCronJobs() {
  // 6AM UTC = 10AM UAE (GMT+4). UAE has no DST.
  cron.schedule('0 6 * * *', () => {
    runDailyJob().catch(err => console.error('[CRON] Daily job failed:', err));
  });
  console.log('[CRON] Daily notification job scheduled for 06:00 UTC (10:00 UAE)');
}

// Exported for manual testing: import { runDailyJob } from './notifications.js'; await runDailyJob();
export async function runDailyJob() {
  console.log('[CRON] Starting daily job...');
  const t0 = Date.now();
  await runUserAlerts();
  await runDipReport();
  console.log(`[CRON] Daily job complete in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

// ── F1: Daily Alert Email + F2: In-app notifications ────────────────────────

async function runUserAlerts() {
  if (!usersDb) { console.log('[CRON] usersDb not available, skipping alerts'); return; }

  // Get all users with saved listings
  const users = usersDb.prepare(`
    SELECT DISTINCT sl.user_id, u.email
    FROM saved_listings sl JOIN users u ON u.id = sl.user_id
  `).all();

  if (users.length === 0) { console.log('[CRON] No users with saved listings'); return; }
  console.log(`[CRON] Processing alerts for ${users.length} users`);

  let totalEmails = 0;
  let totalNotifs = 0;

  for (const user of users) {
    try {
      const result = await processUserAlerts(user);
      totalEmails += result.emailSent ? 1 : 0;
      totalNotifs += result.notifCount;
    } catch (err) {
      console.error(`[CRON] Alert error for user ${user.user_id}:`, err.message);
    }
  }

  console.log(`[CRON] Alerts done: ${totalEmails} emails, ${totalNotifs} notifications`);
}

async function processUserAlerts(user) {
  const savedRows = usersDb.prepare(`
    SELECT id, listing_id, last_price_alerted, last_match_alerted_at
    FROM saved_listings WHERE user_id = ?
  `).all(user.user_id);

  if (savedRows.length === 0) return { emailSent: false, notifCount: 0 };

  // Batch-fetch current listing data from Supabase
  const listingIds = savedRows.map(r => r.listing_id);
  const { data: listings } = await supabase
    .from(TABLE)
    .select(RICH_SELECT)
    .in('id', listingIds);

  if (!listings || listings.length === 0) return { emailSent: false, notifCount: 0 };

  const listingMap = Object.fromEntries(listings.map(l => [l.id, l]));

  const priceDrops = [];
  const newMatches = [];

  for (const saved of savedRows) {
    const listing = listingMap[saved.listing_id];
    if (!listing) continue;

    // ── Trigger A: Price drop on saved listing ──
    if (saved.last_price_alerted == null) {
      // First run: set baseline, no alert
      usersDb.prepare('UPDATE saved_listings SET last_price_alerted = ? WHERE id = ?')
        .run(listing.price_aed, saved.id);
    } else if (listing.price_aed < saved.last_price_alerted) {
      const oldPrice = saved.last_price_alerted;
      const pctDrop = ((oldPrice - listing.price_aed) / oldPrice * 100).toFixed(1);
      priceDrops.push({ saved, listing, oldPrice, pctDrop });

      // Create in-app notification
      const msg = `Price drop: ${listing.property_name || listing.community} ${listing.bedrooms === 0 ? 'Studio' : listing.bedrooms + 'BR'} — AED ${fmtPrice(oldPrice)} → AED ${fmtPrice(listing.price_aed)} (-${pctDrop}%)`;
      usersDb.prepare(
        'INSERT INTO notifications (user_id, type, listing_id, saved_listing_id, message) VALUES (?, ?, ?, ?, ?)'
      ).run(user.user_id, 'price_drop', listing.id, saved.id, msg);

      // Update baseline
      usersDb.prepare('UPDATE saved_listings SET last_price_alerted = ? WHERE id = ?')
        .run(listing.price_aed, saved.id);
    }

    // ── Trigger B: New similar listing ──
    const since = saved.last_match_alerted_at || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: matches } = await supabase
      .from(TABLE)
      .select(RICH_SELECT)
      .eq('is_valid', true)
      .eq('property_name', listing.property_name)
      .eq('community', listing.community)
      .eq('bedrooms', listing.bedrooms)
      .neq('id', listing.id)
      .gte('listing_date', since.slice(0, 10))
      .order('listing_date', { ascending: false })
      .limit(10);

    if (matches && matches.length > 0) {
      for (const m of matches) {
        // Dedup: skip if we already notified about this listing
        const exists = usersDb.prepare(
          'SELECT id FROM notifications WHERE user_id = ? AND listing_id = ? AND type = ?'
        ).get(user.user_id, m.id, 'new_match');
        if (exists) continue;

        newMatches.push({ saved, listing: m });

        const beds = m.bedrooms === 0 ? 'Studio' : `${m.bedrooms}BR`;
        const msg = `New match: ${beds} in ${m.property_name || m.community}, ${m.community} — AED ${fmtPrice(m.price_aed)}${m.dip_pct ? ` (${Math.abs(m.dip_pct).toFixed(1)}% dip)` : ''}`;
        usersDb.prepare(
          'INSERT INTO notifications (user_id, type, listing_id, saved_listing_id, message) VALUES (?, ?, ?, ?, ?)'
        ).run(user.user_id, 'new_match', m.id, saved.id, msg);
      }
    }

    // Update match alert timestamp
    usersDb.prepare("UPDATE saved_listings SET last_match_alerted_at = datetime('now') WHERE id = ?")
      .run(saved.id);
  }

  const notifCount = priceDrops.length + newMatches.length;

  // Send consolidated email
  if (notifCount > 0 && resend) {
    try {
      const html = buildAlertEmailHtml(priceDrops, newMatches);
      await resend.emails.send({
        from: `Dip Finder <${FROM_EMAIL}>`,
        to: user.email,
        subject: '\u{1F6A8} New Listing similar to your Saved Properties',
        html,
      });
      return { emailSent: true, notifCount };
    } catch (err) {
      console.error(`[CRON] Email send failed for ${user.email}:`, err.message);
    }
  }

  return { emailSent: false, notifCount };
}

function buildAlertEmailHtml(priceDrops, newMatches) {
  let html = '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#e0e0e0;background:#1a1a2e;padding:24px;border-radius:12px;">';

  if (priceDrops.length > 0) {
    html += '<h2 style="color:#E24B4A;font-size:18px;margin:0 0 16px;">Price Drops on Your Saved Listings</h2>';
    for (const { listing: l, oldPrice, pctDrop } of priceDrops) {
      html += buildRichCardHtml(l);
    }
  }

  if (newMatches.length > 0) {
    html += `<h2 style="color:#1D9E75;font-size:18px;margin:${priceDrops.length ? '24px' : '0'} 0 16px;">New Listings Matching Your Saves</h2>`;
    for (const { listing: l } of newMatches) {
      html += buildRichCardHtml(l);
    }
  }

  html += '<p style="color:#888;font-size:11px;margin-top:24px;text-align:center;">You\'re receiving this because you saved listings on <a href="https://www.dxbdipfinder.com" style="color:#1D9E75;">dxbdipfinder.com</a></p>';
  html += '</div>';
  return html;
}

// ── F3: Dip Report Email (Weekly) ───────────────────────────────────────────

async function runDipReport() {
  if (!usersDb) { console.log('[CRON] usersDb not available, skipping dip report'); return; }

  const subscribers = usersDb.prepare(
    'SELECT email, user_id FROM dip_report_subscribers WHERE active = 1'
  ).all();

  if (subscribers.length === 0) { console.log('[CRON] No dip report subscribers'); return; }

  // Get top 10 dips from last 7 days
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data: topDips } = await supabase
    .from(TABLE)
    .select(RICH_SELECT)
    .eq('is_valid', true)
    .gte('listing_date', weekAgo)
    .not('last_txn_change_pct', 'is', null)
    .lt('last_txn_change_pct', 0)
    .order('last_txn_change_pct', { ascending: true })
    .limit(10);

  if (!topDips || topDips.length === 0) {
    console.log('[CRON] No dips to report this week');
    return;
  }

  console.log(`[CRON] Sending dip report to ${subscribers.length} subscribers (${topDips.length} dips)`);

  let sent = 0;
  const subject = buildWeeklySubject();

  for (const sub of subscribers) {
    try {
      // Get subscriber's saved communities for highlighting
      let savedCommunities = new Set();
      if (sub.user_id) {
        const savedIds = usersDb.prepare('SELECT listing_id FROM saved_listings WHERE user_id = ?').all(sub.user_id);
        if (savedIds.length > 0) {
          const { data: savedListings } = await supabase
            .from(TABLE)
            .select('community')
            .in('id', savedIds.map(r => r.listing_id));
          if (savedListings) savedListings.forEach(l => savedCommunities.add(l.community));
        }
      }

      const html = buildDipReportHtml(topDips, savedCommunities);
      if (resend) {
        await resend.emails.send({
          from: `Dip Finder <${FROM_EMAIL}>`,
          to: sub.email,
          subject,
          html,
        });
        sent++;
        // Small delay to respect rate limits
        await new Promise(r => setTimeout(r, 100));
      }
    } catch (err) {
      console.error(`[CRON] Dip report failed for ${sub.email}:`, err.message);
    }
  }

  console.log(`[CRON] Dip report sent to ${sent}/${subscribers.length} subscribers`);
}

function buildWeeklySubject() {
  const now = new Date();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const month = monthNames[now.getMonth()];
  const year = now.getFullYear();
  // Week number within the month (1-based)
  const dayOfMonth = now.getDate();
  const weekNum = Math.ceil(dayOfMonth / 7);
  return `DXB Dip Finder - Highest Drops this week - Week ${weekNum}, ${month} ${year}`;
}

function buildDipReportHtml(topDips, savedCommunities) {
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  let html = '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#e0e0e0;background:#1a1a2e;padding:24px;border-radius:12px;">';
  html += `<h1 style="color:#1D9E75;font-size:20px;margin:0 0 4px;">DXB Dip Finder - Weekly Report</h1>`;
  html += `<p style="color:#888;font-size:12px;margin:0 0 20px;">${today}</p>`;

  topDips.forEach((d, i) => {
    const isSaved = savedCommunities.has(d.community);
    const highlight = isSaved ? ' style="color:#1D9E75;font-size:11px;margin-left:6px;"' : '';
    html += `<div style="font-size:12px;color:#888;margin-bottom:2px;">#${i + 1}${isSaved ? `<span${highlight}>&#9733; Your community</span>` : ''}</div>`;
    html += buildRichCardHtml(d);
  });

  html += '<div style="text-align:center;margin-top:20px;"><a href="https://www.dxbdipfinder.com" style="color:#1D9E75;font-size:13px;text-decoration:none;">View All Dips on DxbDipFinder →</a></div>';
  html += '<p style="color:#888;font-size:11px;margin-top:24px;text-align:center;">You subscribed to the weekly dip report on <a href="https://www.dxbdipfinder.com" style="color:#1D9E75;">dxbdipfinder.com</a>. Visit your profile to unsubscribe.</p>';
  html += '</div>';
  return html;
}

// ── Rich Card HTML (shared by both emails) ──────────────────────────────────

function buildRichCardHtml(l) {
  const beds = l.bedrooms === 0 ? 'Studio' : `${l.bedrooms}BR`;
  const purpose = (l.purpose || '').toLowerCase() === 'sale' ? 'Sale' : 'Rent';
  const purposeColor = purpose === 'Sale' ? '#5ED3B2' : '#E6B450';
  const purposeBg = purpose === 'Sale' ? 'rgba(20,100,80,0.5)' : 'rgba(120,80,20,0.5)';
  const typeLabel = l.type || null;
  const rop = (l.ready_off_plan || '').toLowerCase();
  const readyLabel = rop === 'ready' ? 'Ready' : (rop === 'off_plan' || rop === 'off plan' || rop === 'off-plan') ? 'Off Plan' : null;
  const readyColor = readyLabel === 'Ready' ? '#B48CF0' : '#E6AA64';
  const readyBg = readyLabel === 'Ready' ? 'rgba(110,60,170,0.25)' : 'rgba(170,100,50,0.25)';

  // Transaction comparison pill
  const txnPct = l.last_txn_change_pct;
  const txnIsNeg = txnPct != null && txnPct < 0;
  const txnIsPos = txnPct != null && txnPct > 0;
  const pillColor = txnIsNeg ? '#E24B4A' : txnIsPos ? '#1D9E75' : null;
  const pillBg = txnIsNeg ? 'rgba(226,75,74,0.15)' : txnIsPos ? 'rgba(29,158,117,0.15)' : null;
  const pillBorder = txnIsNeg ? 'rgba(226,75,74,0.4)' : txnIsPos ? 'rgba(29,158,117,0.4)' : null;
  const pillText = txnPct != null ? `${txnIsNeg ? '\u2212' : '+'}${Math.abs(txnPct).toFixed(1)}%` : null;

  // Date
  const dateStr = l.listing_date ? fmtDate(l.listing_date) : '';

  let html = `<div style="background:#252540;border-radius:8px;padding:12px 16px;margin-bottom:10px;">`;

  // Row 1: date + pill
  html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">`;
  html += `<span style="font-size:11px;font-family:monospace;color:#888;">${dateStr}</span>`;
  if (pillText) {
    html += `<span style="font-size:11px;font-weight:bold;padding:2px 8px;border-radius:999px;background:${pillBg};border:1px solid ${pillBorder};color:${pillColor};">${pillText}</span>`;
  }
  html += `</div>`;

  // Row 2: name + community
  html += `<div style="font-weight:600;font-size:14px;">${l.property_name || l.community}</div>`;
  if (l.property_name && l.community) {
    html += `<div style="font-size:12px;color:#888;">${l.community}</div>`;
  }

  // Row 3: price
  html += `<div style="font-size:16px;font-weight:700;margin-top:6px;">AED ${fmtPrice(l.price_aed)}</div>`;

  // Row 4: tags
  html += `<div style="margin-top:6px;">`;
  html += `<span style="font-size:12px;color:#888;">${beds} · ${l.size_sqft ? l.size_sqft.toLocaleString() + ' sqft' : ''}</span> `;
  html += `<span style="font-size:10px;padding:2px 6px;border-radius:999px;font-weight:500;background:${purposeBg};color:${purposeColor};">${purpose}</span> `;
  if (typeLabel) {
    html += `<span style="font-size:10px;padding:2px 6px;border-radius:999px;font-weight:500;background:rgba(56,96,160,0.3);color:rgb(130,175,235);">${typeLabel}</span> `;
  }
  if (readyLabel) {
    html += `<span style="font-size:10px;padding:2px 6px;border-radius:999px;font-weight:500;background:${readyBg};color:${readyColor};">${readyLabel}</span> `;
  }
  if (l.source) {
    html += `<span style="font-size:10px;font-family:monospace;color:#888;margin-left:4px;">${l.source === 'Property Finder' ? 'PF' : l.source === 'Dubizzle' ? 'DBZ' : l.source}</span>`;
  }
  html += `</div>`;

  // Comparison lines
  const comparisons = [];

  // Same Listing
  if (l.listing_change != null && l.listing_change !== 0) {
    const isNeg = l.listing_change < 0;
    const prevPrice = l.price_aed - l.listing_change;
    comparisons.push(`<span style="font-weight:600;color:#fff;">Same Listing:</span> <span style="color:${isNeg ? '#E24B4A' : '#1D9E75'};font-weight:500;">${isNeg ? '\u2212' : '+'}AED ${fmtPrice(Math.abs(l.listing_change))}</span> · Prev: AED ${fmtPrice(prevPrice)}`);
  }

  // Prev Listing
  if (l.dip_prev_price != null && l.dip_price != null) {
    const isNeg = l.dip_price < 0;
    let line = `<span style="font-weight:600;color:#fff;">Prev Listing:</span> <span style="color:${isNeg ? '#E24B4A' : '#1D9E75'};font-weight:500;">${isNeg ? '\u2212' : '+'}AED ${fmtPrice(Math.abs(l.dip_price))}</span> · AED ${fmtPrice(l.dip_prev_price)}`;
    if (l.dip_prev_size) line += ` · ${Math.round(l.dip_prev_size).toLocaleString()} sqft`;
    if (l.dip_prev_date) line += ` · ${fmtDate(l.dip_prev_date)}`;
    comparisons.push(line);
  }

  // Last Sale/Rent
  if (l.last_txn_price != null && l.last_txn_date != null) {
    const change = l.last_txn_change;
    const isNeg = change != null && change < 0;
    const label = (l.purpose || '').toLowerCase() === 'rent' ? 'Last Rent:' : 'Last Sale:';
    let line = `<span style="font-weight:600;color:#fff;">${label}</span> <span style="color:${isNeg ? '#E24B4A' : '#1D9E75'};font-weight:500;">${isNeg ? '\u2212' : '+'}AED ${fmtPrice(Math.abs(change || 0))}</span> · AED ${fmtPrice(l.last_txn_price)}`;
    if (l.last_txn_size) line += ` · ${Math.round(l.last_txn_size).toLocaleString()} sqft`;
    if (l.last_txn_date) line += ` · ${fmtDate(l.last_txn_date)}`;
    comparisons.push(line);
  }

  if (comparisons.length > 0) {
    html += `<div style="border-top:1px solid rgba(255,255,255,0.08);margin-top:8px;padding-top:8px;">`;
    comparisons.forEach(c => {
      html += `<div style="font-size:11px;color:#888;margin-bottom:3px;">${c}</div>`;
    });
    html += `</div>`;
  }

  // View link
  const viewUrl = `https://www.dxbdipfinder.com/listing/${l.id}`;
  html += `<a href="${viewUrl}" style="color:#1D9E75;font-size:11px;text-decoration:none;margin-top:6px;display:inline-block;">→ View on DxbDipFinder</a>`;

  html += `</div>`;
  return html;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtPrice(aed) {
  if (aed == null) return '\u2014';
  if (Math.abs(aed) >= 1000000) return (aed / 1000000).toFixed(2) + 'M';
  if (Math.abs(aed) >= 1000) return Math.round(aed / 1000) + 'K';
  return Math.round(aed).toLocaleString();
}

function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${months[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
}
