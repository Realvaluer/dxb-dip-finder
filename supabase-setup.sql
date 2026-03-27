-- DDP Analytics table — run once in Supabase SQL Editor
-- Stores user interaction events from dxpdipfinder.com

CREATE TABLE IF NOT EXISTS "DDP_analytics" (
  id            BIGSERIAL PRIMARY KEY,
  event_type    TEXT NOT NULL,
  session_id    TEXT NOT NULL,
  user_email    TEXT,
  page          TEXT,
  property_id   TEXT,
  property_name TEXT,
  event_data    JSONB,
  duration_ms   INTEGER,
  referrer      TEXT,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ddp_analytics_created_at  ON "DDP_analytics" (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ddp_analytics_event_type  ON "DDP_analytics" (event_type);
CREATE INDEX IF NOT EXISTS idx_ddp_analytics_session_id  ON "DDP_analytics" (session_id);
CREATE INDEX IF NOT EXISTS idx_ddp_analytics_user_email  ON "DDP_analytics" (user_email) WHERE user_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ddp_analytics_property_id ON "DDP_analytics" (property_id) WHERE property_id IS NOT NULL;

ALTER TABLE "DDP_analytics" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_insert"         ON "DDP_analytics" FOR INSERT TO anon         WITH CHECK (true);
CREATE POLICY "allow_select_service" ON "DDP_analytics" FOR SELECT TO service_role USING (true);
