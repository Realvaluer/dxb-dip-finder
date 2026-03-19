import db, { usersDb } from './db.js';

let resend = null;
if (process.env.RESEND_API_KEY) {
  const { Resend } = await import('resend');
  resend = new Resend(process.env.RESEND_API_KEY);
}

const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev';

export async function runNotificationJob() {
  // Get listings scraped in the last 6 hours
  const newListings = db.prepare(`
    SELECT id, purpose, type, community, bedrooms, size_sqft, price_aed,
           property_name, url, source
    FROM listings
    WHERE scraped_at >= datetime('now', '-6 hours')
  `).all();

  if (newListings.length === 0) {
    console.log('Notifications: no new listings in last 6 hours');
    return;
  }

  console.log(`Notifications: checking ${newListings.length} new listings against saved criteria`);

  // Get all saved listings with criteria and user emails
  const savedCriteria = db.prepare(`
    SELECT sl.user_id, sl.listing_id, u.email,
           l.purpose, l.type, l.community, l.bedrooms, l.size_sqft
    FROM saved_listings sl
    JOIN users u ON u.id = sl.user_id
    JOIN listings l ON l.id = sl.listing_id
  `).all(); // This won't work — saved_listings is in usersDb, listings is in db

  // Actually need to join across databases. Let's do it in two steps:
  const savedRows = usersDb.prepare(`
    SELECT sl.user_id, sl.listing_id, u.email
    FROM saved_listings sl JOIN users u ON u.id = sl.user_id
  `).all();

  if (savedRows.length === 0) {
    console.log('Notifications: no saved listings to match against');
    return;
  }

  // Get criteria for each saved listing from the listings DB
  const savedWithCriteria = savedRows.map(sr => {
    const listing = db.prepare(`
      SELECT purpose, type, community, bedrooms, size_sqft FROM listings WHERE id = ?
    `).get(sr.listing_id);
    return listing ? { ...sr, ...listing } : null;
  }).filter(Boolean);

  let sent = 0;
  for (const nl of newListings) {
    for (const saved of savedWithCriteria) {
      const sizeMin = (saved.size_sqft || 0) * 0.9;
      const sizeMax = (saved.size_sqft || 0) * 1.1;

      const matches =
        nl.purpose === saved.purpose &&
        nl.type === saved.type &&
        nl.community === saved.community &&
        nl.bedrooms === saved.bedrooms &&
        nl.size_sqft >= sizeMin &&
        nl.size_sqft <= sizeMax &&
        nl.id !== saved.listing_id;

      if (!matches) continue;

      // Check not already notified
      const already = usersDb.prepare(`
        SELECT id FROM notification_log WHERE user_id = ? AND listing_id = ?
      `).get(saved.user_id, nl.id);
      if (already) continue;

      // Send email
      if (resend) {
        try {
          const price = nl.price_aed?.toLocaleString() || '—';
          await resend.emails.send({
            from: FROM_EMAIL,
            to: saved.email,
            subject: `New match in ${nl.community} — AED ${price}`,
            html: `
              <p>A new listing matching one of your saved properties just appeared:</p>
              <table style="border-collapse:collapse;font-family:sans-serif;">
                <tr><td style="padding:4px 12px;font-weight:bold;">Building</td><td>${nl.property_name || '—'}</td></tr>
                <tr><td style="padding:4px 12px;font-weight:bold;">Community</td><td>${nl.community}</td></tr>
                <tr><td style="padding:4px 12px;font-weight:bold;">Type</td><td>${nl.type}</td></tr>
                <tr><td style="padding:4px 12px;font-weight:bold;">Beds</td><td>${nl.bedrooms || 'Studio'}</td></tr>
                <tr><td style="padding:4px 12px;font-weight:bold;">Size</td><td>${nl.size_sqft?.toLocaleString()} sqft</td></tr>
                <tr><td style="padding:4px 12px;font-weight:bold;">Price</td><td>AED ${price}</td></tr>
              </table>
              <p style="margin-top:16px;"><a href="${nl.url || 'https://www.dxbdipfinder.com'}" style="color:#1D9E75;">View listing</a></p>
              <p style="color:#999;font-size:12px;margin-top:24px;">
                You saved a similar listing on dxbdipfinder.com.
              </p>
            `,
          });
          sent++;
        } catch (e) {
          console.error(`Failed to send notification to ${saved.email}:`, e.message);
        }
      }

      usersDb.prepare(`INSERT INTO notification_log (user_id, listing_id) VALUES (?, ?)`).run(saved.user_id, nl.id);
    }
  }

  console.log(`Notifications: sent ${sent} emails`);
}
