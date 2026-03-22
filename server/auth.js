import crypto from 'crypto';
import { usersDb } from './db.js';

let resend = null;
if (process.env.RESEND_API_KEY) {
  try {
    const { Resend } = await import('resend');
    resend = new Resend(process.env.RESEND_API_KEY);
    console.log('[AUTH] Resend SDK initialized, from:', process.env.FROM_EMAIL || 'onboarding@resend.dev');
  } catch (err) {
    console.error('[AUTH] Failed to init Resend:', err.message);
  }
} else {
  console.log('[AUTH] No RESEND_API_KEY — emails will be logged to console');
}

const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev';

// ── Middleware ────────────────────────────────────────────────────────────────

export function requireAuth(req, res, next) {
  if (!usersDb) return res.status(503).json({ error: 'Auth not available' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  const session = usersDb.prepare(`
    SELECT s.user_id, s.expires_at, u.email
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).get(token);

  if (!session) return res.status(401).json({ error: 'Session expired' });
  req.user = session;
  next();
}

// ── Routes ───────────────────────────────────────────────────────────────────

export function registerAuthRoutes(app) {

  // Send verification code
  app.post('/api/auth/send-code', async (req, res) => {
    if (!usersDb) return res.status(503).json({ error: 'Auth not available' });
    try {
      const { email } = req.body;
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Invalid email' });
      }

      // Rate limit: max 3 codes per email per hour
      const recentCount = usersDb.prepare(`
        SELECT COUNT(*) as cnt FROM auth_codes
        WHERE email = ? AND created_at > datetime('now', '-1 hour')
      `).get(email).cnt;
      if (recentCount >= 3) {
        return res.status(429).json({ error: 'Too many requests. Try again later.' });
      }

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      // Clear old unused codes
      usersDb.prepare(`DELETE FROM auth_codes WHERE email = ? AND used = 0`).run(email);

      // Insert new code
      usersDb.prepare(`INSERT INTO auth_codes (email, code, expires_at) VALUES (?, ?, ?)`).run(email, code, expiresAt);

      // Send email via Resend
      if (resend) {
        const result = await resend.emails.send({
          from: FROM_EMAIL,
          to: email,
          subject: 'Your Dip Finder code',
          html: `
            <p>Your verification code is:</p>
            <h1 style="letter-spacing: 8px; font-size: 36px; font-family: monospace;">${code}</h1>
            <p>This code expires in 10 minutes.</p>
            <p style="color: #999;">If you did not request this, ignore this email.</p>
          `,
        });
        console.log('[AUTH] Resend result:', JSON.stringify(result));
      } else {
        console.log(`[DEV] Auth code for ${email}: ${code} (Resend not initialized)`);
      }

      res.json({ success: true });
    } catch (err) {
      console.error('send-code error:', err);
      res.status(500).json({ error: 'Failed to send code' });
    }
  });

  // Verify code
  app.post('/api/auth/verify-code', (req, res) => {
    if (!usersDb) return res.status(503).json({ error: 'Auth not available' });
    try {
      const { email, code } = req.body;
      if (!email || !code) return res.status(400).json({ error: 'Email and code required' });

      const row = usersDb.prepare(`
        SELECT id FROM auth_codes
        WHERE email = ? AND code = ? AND used = 0 AND expires_at > datetime('now')
        ORDER BY created_at DESC LIMIT 1
      `).get(email, code);

      if (!row) return res.status(401).json({ error: 'Invalid or expired code' });

      // Mark used
      usersDb.prepare(`UPDATE auth_codes SET used = 1 WHERE id = ?`).run(row.id);

      // Upsert user
      usersDb.prepare(`INSERT OR IGNORE INTO users (email) VALUES (?)`).run(email);
      const user = usersDb.prepare(`SELECT id, email, created_at FROM users WHERE email = ?`).get(email);

      // Create session (30 days)
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      usersDb.prepare(`INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)`).run(user.id, token, expiresAt);

      res.json({ token, email: user.email, user_id: user.id });
    } catch (err) {
      console.error('verify-code error:', err);
      res.status(500).json({ error: 'Failed to verify code' });
    }
  });

  // Get current user
  app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({ user_id: req.user.user_id, email: req.user.email });
  });

  // Sign out
  app.delete('/api/auth/session', requireAuth, (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    usersDb.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
    res.json({ success: true });
  });
}
