# DXB DIP Finder

## Preventing Cold Starts (Railway)

Set up UptimeRobot (free at uptimerobot.com) to ping https://www.dxbdipfinder.com/health every 5 minutes. This prevents Railway cold starts.

Steps:
1. Go to https://uptimerobot.com and create a free account
2. Click "Add New Monitor"
3. Type: HTTP(s)
4. URL: https://www.dxbdipfinder.com/health
5. Monitoring interval: 5 minutes
6. Save

This keeps the Railway container alive from outside. The self-ping in server/index.js only works while the container is running — UptimeRobot wakes it if Railway puts it to sleep.

**Railway Cron (optional):** Railway supports Cron Job services (separate from the main service) via the dashboard under New → Cron Job. railway.json does not support cron config for the main service. If you want Railway-native keep-alive, add a Cron Job service in the dashboard that hits https://www.dxbdipfinder.com/health every 4 minutes.

## Property List RPC (Supabase)

To enable single-query property list loading, run this in the Supabase SQL Editor (https://supabase.com/dashboard/project/xrdrypydnnaemmyvgjee/sql):

```sql
CREATE OR REPLACE FUNCTION get_distinct_properties()
RETURNS TABLE(property_name text, community text, listing_count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT
    property_name,
    community,
    COUNT(*)::bigint AS listing_count
  FROM ddf_listings
  WHERE property_name IS NOT NULL
    AND is_valid = true
  GROUP BY property_name, community
  ORDER BY property_name ASC;
$$;
```

Without this function, the server falls back to parallel batched fetching (~400ms vs ~50ms with RPC).
