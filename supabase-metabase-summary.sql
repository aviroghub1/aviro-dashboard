-- Metabase summary data: stores per-method/currency breakdown rows
-- One row per client + month + type (deposit/withdrawal) + currency + method
-- Allows flexible date range queries and method-level revenue calculations

CREATE TABLE IF NOT EXISTS metabase_summary (
  id BIGSERIAL PRIMARY KEY,
  client_name TEXT NOT NULL,
  month TEXT NOT NULL,            -- YYYY-MM format
  tx_type TEXT NOT NULL,          -- 'deposit' or 'withdrawal'
  currency TEXT NOT NULL DEFAULT 'EUR',
  method TEXT NOT NULL DEFAULT 'Unknown',
  tx_count INTEGER DEFAULT 0,
  gross_amount NUMERIC(14,2) DEFAULT 0,
  fee_amount NUMERIC(14,2) DEFAULT 0,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_name, month, tx_type, currency, method)
);

-- Index for fast date range queries per client
CREATE INDEX IF NOT EXISTS idx_metabase_summary_client_month
  ON metabase_summary(client_name, month);

-- Enable RLS and allow anon access (same pattern as rest of app)
ALTER TABLE metabase_summary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon full access" ON metabase_summary
  FOR ALL USING (true) WITH CHECK (true);

-- Drop the old cache table if it exists (no longer needed)
DROP TABLE IF EXISTS metabase_cache;
