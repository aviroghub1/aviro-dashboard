-- ============================================================
-- AVIRO DASHBOARD — Supabase Database Schema
-- ============================================================
-- Run this in Supabase SQL Editor to create all tables.
-- ============================================================

-- Entity Documents: the main document register
CREATE TABLE IF NOT EXISTS entity_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_name TEXT NOT NULL,
  doc_name TEXT NOT NULL,
  expiry DATE,
  notarised BOOLEAN DEFAULT false,
  notarised_date DATE,
  renewal_months INTEGER,
  delayed_until INTEGER,
  renewal_notes TEXT DEFAULT '',
  file_name TEXT DEFAULT '',
  file_size INTEGER DEFAULT 0,
  file_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by TEXT DEFAULT 'dashboard'
);

-- Entity Overrides: editable company details
CREATE TABLE IF NOT EXISTS entity_overrides (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_name TEXT NOT NULL UNIQUE,
  jurisdiction TEXT,
  company_number TEXT,
  license_number TEXT,
  address TEXT,
  ubo TEXT,
  director TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Service Providers per entity
CREATE TABLE IF NOT EXISTS entity_service_providers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_name TEXT NOT NULL,
  role_name TEXT NOT NULL,
  company TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- License Seals per entity
CREATE TABLE IF NOT EXISTS entity_seals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_name TEXT NOT NULL,
  brand TEXT NOT NULL,
  seal_code TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Entity Footer Text
CREATE TABLE IF NOT EXISTS entity_footers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_name TEXT NOT NULL UNIQUE,
  footer_text TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Dashboard user state (calendar events, jobs, etc. — per user)
CREATE TABLE IF NOT EXISTS user_state (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email TEXT NOT NULL UNIQUE,
  state_data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_docs_entity ON entity_documents(entity_name);
CREATE INDEX IF NOT EXISTS idx_sp_entity ON entity_service_providers(entity_name);
CREATE INDEX IF NOT EXISTS idx_seals_entity ON entity_seals(entity_name);
CREATE INDEX IF NOT EXISTS idx_state_email ON user_state(user_email);

-- Enable Row Level Security (RLS) — but allow all access for now
-- You can add auth policies later when you add user login
ALTER TABLE entity_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_service_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_seals ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_footers ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_state ENABLE ROW LEVEL SECURITY;

-- Policies: allow all operations for now (open access)
-- Replace these with auth-based policies when you add login
CREATE POLICY "Allow all on entity_documents" ON entity_documents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on entity_overrides" ON entity_overrides FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on entity_service_providers" ON entity_service_providers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on entity_seals" ON entity_seals FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on entity_footers" ON entity_footers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on user_state" ON user_state FOR ALL USING (true) WITH CHECK (true);

-- Auto-update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_docs BEFORE UPDATE ON entity_documents FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at_overrides BEFORE UPDATE ON entity_overrides FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at_footers BEFORE UPDATE ON entity_footers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at_state BEFORE UPDATE ON user_state FOR EACH ROW EXECUTE FUNCTION update_updated_at();
