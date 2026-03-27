import { Router } from 'express';
import { supabase } from '../db.js';

const router = Router();

const ALLOWED_EVENTS = new Set([
  'pageview',
  'filter',
  'click',
  'session_end',
  'property_view',
]);

router.post('/', async (req, res) => {
  try {
    const { event_type, session_id, user_email, page, property_id, property_name, event_data, duration_ms, referrer, user_agent } = req.body;

    if (!event_type || !session_id) {
      return res.status(400).json({ error: 'event_type and session_id are required' });
    }

    if (!ALLOWED_EVENTS.has(event_type)) {
      return res.status(400).json({ error: 'Invalid event_type' });
    }

    const { error } = await supabase.from('DDP_analytics').insert({
      event_type,
      session_id,
      user_email: user_email || null,
      page: page || null,
      property_id: property_id ? String(property_id) : null,
      property_name: property_name || null,
      event_data: event_data || null,
      duration_ms: duration_ms != null ? Number(duration_ms) : null,
      referrer: referrer || null,
      user_agent: user_agent || null,
    });

    if (error) {
      console.error('[analytics] Supabase insert error:', error.message);
      return res.status(500).json({ error: 'Failed to store event' });
    }

    res.status(204).end();
  } catch (err) {
    console.error('[analytics] Unexpected error:', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

export default router;
