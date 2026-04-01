import cron from 'node-cron';
import { supabase, usersDb } from './db.js';

let resend = null;
if (process.env.RESEND_API_KEY) {
  const { Resend } = await import('resend');
  resend = new Resend(process.env.RESEND_API_KEY);
}

const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev';
const TABLE = 'ddf_listings';

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
    .select('id, property_name, community, bedrooms, size_sqft, price_aed, purpose, url')
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
      .select('id, property_name, community, bedrooms, price_aed, dip_pct, url')
      .eq('is_valid', true)
      .eq('property_name', listing.property_name)
      .eq('community', listing.community)
      .eq('bedrooms', listing.bedrooms)
      .neq('id', listing.id)
      .gte('date_listed', since.slice(0, 10))
      .order('date_listed', { ascending: false })
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
      const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      await resend.emails.send({
        from: `Dip Finder <${FROM_EMAIL}>`,
        to: user.email,
        subject: `Your DxbDipFinder Update — ${today}`,
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
      const beds = l.bedrooms === 0 ? 'Studio' : `${l.bedrooms}BR`;
      html += `
        <div style="background:#252540;border-radius:8px;padding:12px 16px;margin-bottom:8px;">
          <div style="font-weight:600;font-size:14px;">${l.property_name || l.community} | ${beds} | ${l.community}</div>
          <div style="margin-top:4px;font-size:13px;">AED ${fmtPrice(oldPrice)} → <span style="color:#E24B4A;font-weight:600;">AED ${fmtPrice(l.price_aed)}</span> (-${pctDrop}%)</div>
          ${l.url ? `<a href="${l.url}" style="color:#1D9E75;font-size:12px;text-decoration:none;margin-top:6px;display:inline-block;">View Listing →</a>` : ''}
        </div>`;
    }
  }

  if (newMatches.length > 0) {
    html += `<h2 style="color:#1D9E75;font-size:18px;margin:${priceDrops.length ? '24px' : '0'} 0 16px;">New Listings Matching Your Saves</h2>`;
    for (const { listing: l } of newMatches) {
      const beds = l.bedrooms === 0 ? 'Studio' : `${l.bedrooms}BR`;
      html += `
        <div style="background:#252540;border-radius:8px;padding:12px 16px;margin-bottom:8px;">
          <div style="font-weight:600;font-size:14px;">${l.property_name || l.community} | ${beds} | ${l.community}</div>
          <div style="margin-top:4px;font-size:13px;">Listed at AED ${fmtPrice(l.price_aed)}${l.dip_pct ? ` | Dip: ${Math.abs(l.dip_pct).toFixed(1)}%` : ''}</div>
          <a href="https://dxbdipfinder.com/listing/${l.id}" style="color:#1D9E75;font-size:12px;text-decoration:none;margin-top:6px;display:inline-block;">View Listing →</a>
        </div>`;
    }
  }

  html += '<p style="color:#888;font-size:11px;margin-top:24px;text-align:center;">You\'re receiving this because you saved listings on <a href="https://dxbdipfinder.com" style="color:#1D9E75;">dxbdipfinder.com</a></p>';
  html += '</div>';
  return html;
}

// ── F3: Dip Report Email ─────────────────────────────────────────────────────

async function runDipReport() {
  if (!usersDb) { console.log('[CRON] usersDb not available, skipping dip report'); return; }

  const subscribers = usersDb.prepare(
    'SELECT email, user_id FROM dip_report_subscribers WHERE active = 1'
  ).all();

  if (subscribers.length === 0) { console.log('[CRON] No dip report subscribers'); return; }

  // Get top 10 dips from last 24 hours
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data: topDips } = await supabase
    .from(TABLE)
    .select('id, property_name, community, bedrooms, price_aed, dip_pct, dip_price, url')
    .eq('is_valid', true)
    .gte('date_listed', yesterday)
    .not('dip_pct', 'is', null)
    .order('dip_pct', { ascending: true })
    .limit(10);

  if (!topDips || topDips.length === 0) {
    console.log('[CRON] No dips to report today');
    return;
  }

  console.log(`[CRON] Sending dip report to ${subscribers.length} subscribers (${topDips.length} dips)`);

  let sent = 0;
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

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

      const html = buildDipReportHtml(topDips, savedCommunities, today);
      if (resend) {
        await resend.emails.send({
          from: `Dip Finder <${FROM_EMAIL}>`,
          to: sub.email,
          subject: `DXB Dip Report — ${today}`,
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

function buildDipReportHtml(topDips, savedCommunities, today) {
  let html = '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#e0e0e0;background:#1a1a2e;padding:24px;border-radius:12px;">';
  html += `<h1 style="color:#1D9E75;font-size:20px;margin:0 0 4px;">DXB Dip Report</h1>`;
  html += `<p style="color:#888;font-size:12px;margin:0 0 20px;">${today}</p>`;

  topDips.forEach((d, i) => {
    const beds = d.bedrooms === 0 ? 'Studio' : `${d.bedrooms}BR`;
    const isSaved = savedCommunities.has(d.community);
    const bg = isSaved ? '#1D9E75' + '15' : '#252540';
    const border = isSaved ? 'border-left:3px solid #1D9E75;' : '';

    html += `
      <div style="background:${bg};${border}border-radius:8px;padding:12px 16px;margin-bottom:8px;">
        <div style="font-size:12px;color:#888;">#${i + 1}${isSaved ? ' <span style="color:#1D9E75;">&#9733; Your community</span>' : ''}</div>
        <div style="font-weight:600;font-size:14px;margin-top:2px;">${d.property_name || d.community} | ${beds} | ${d.community}</div>
        <div style="margin-top:4px;font-size:13px;">AED ${fmtPrice(d.price_aed)} | <span style="color:#E24B4A;font-weight:600;">${Math.abs(d.dip_pct).toFixed(1)}% below transaction</span></div>
        <a href="https://dxbdipfinder.com/listing/${d.id}" style="color:#1D9E75;font-size:12px;text-decoration:none;margin-top:6px;display:inline-block;">View →</a>
      </div>`;
  });

  html += '<div style="text-align:center;margin-top:20px;"><a href="https://dxbdipfinder.com" style="color:#1D9E75;font-size:13px;text-decoration:none;">View All Dips on DxbDipFinder →</a></div>';
  html += '<p style="color:#888;font-size:11px;margin-top:24px;text-align:center;">You subscribed to the daily dip report on <a href="https://dxbdipfinder.com" style="color:#1D9E75;">dxbdipfinder.com</a>. Visit your profile to unsubscribe.</p>';
  html += '</div>';
  return html;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtPrice(aed) {
  if (aed == null) return '—';
  return Math.round(aed).toLocaleString();
}
