-- ═══════════════════════════════════════════════════════════════════
-- MM CSM Dashboard – Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════════

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────────
-- 1. USERS  (extends Supabase auth.users)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id            UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT        NOT NULL UNIQUE,
  name          TEXT,
  role          TEXT        NOT NULL DEFAULT 'spoc'
                            CHECK (role IN ('admin', 'spoc', 'leadership')),
  spoc_name     TEXT,       -- exact SPOC label used in data (e.g. "Priya Sharma")
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create user row when a new auth user is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.users (id, email, name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────
-- 2. DASHBOARD_STORE  (key-value store for all dashboard module data)
--    This is the core sync table – each localStorage key becomes one row.
--    Structure mirrors the existing localStorage keys exactly.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dashboard_store (
  id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key           TEXT        NOT NULL UNIQUE,   -- e.g. 'csm_etb_ntb'
  value         JSONB,
  updated_by    UUID        REFERENCES public.users(id),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_store_key ON public.dashboard_store (key);
CREATE INDEX IF NOT EXISTS idx_dashboard_store_updated ON public.dashboard_store (updated_at DESC);

-- ─────────────────────────────────────────────────────────────────
-- 3. MERCHANTS  (normalized merchant master, populated from CSV uploads)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.merchants (
  id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mid           TEXT        NOT NULL UNIQUE,
  name          TEXT        NOT NULL,
  spoc          TEXT,
  segment       TEXT,
  exec_sponsor  TEXT,
  tags          TEXT[],
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchants_mid  ON public.merchants (mid);
CREATE INDEX IF NOT EXISTS idx_merchants_spoc ON public.merchants (spoc);

-- ─────────────────────────────────────────────────────────────────
-- 4. MONTHLY_TARGETS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.monthly_targets (
  id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  month         TEXT        NOT NULL,   -- 'January', 'February' ...
  year          INTEGER     NOT NULL,
  product       TEXT        NOT NULL,   -- 'AMB', 'TPN', 'FAV', 'SAAS', 'SC' ...
  target        NUMERIC(18,4),
  achieved      NUMERIC(18,4),
  updated_by    UUID        REFERENCES public.users(id),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (month, year, product)
);

-- ─────────────────────────────────────────────────────────────────
-- 5. PRODUCT_TARGETS  (annual / quarterly product-level targets)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.product_targets (
  id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product       TEXT        NOT NULL,
  fy            TEXT        NOT NULL DEFAULT 'FY27',
  target        NUMERIC(18,4),
  stretch_target NUMERIC(18,4),
  updated_by    UUID        REFERENCES public.users(id),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product, fy)
);

-- ─────────────────────────────────────────────────────────────────
-- 6. PIPELINE_ENTRIES
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pipeline_entries (
  id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pipeline_type TEXT        NOT NULL CHECK (pipeline_type IN ('amb','tpn','fav','saas','sc')),
  mid           TEXT        NOT NULL,
  merchant_name TEXT        NOT NULL,
  spoc          TEXT,
  stage         TEXT,
  amount        NUMERIC(18,4),
  expected_close DATE,
  notes         TEXT,
  status        TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','won','lost','stalled')),
  created_by    UUID        REFERENCES public.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_type ON public.pipeline_entries (pipeline_type);
CREATE INDEX IF NOT EXISTS idx_pipeline_spoc ON public.pipeline_entries (spoc);

-- ─────────────────────────────────────────────────────────────────
-- 7. AMB_GROWTH_TRACKER  (ETB / NTB tracking per merchant)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.amb_growth_tracker (
  id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mid           TEXT        NOT NULL,
  merchant_name TEXT,
  spoc          TEXT,
  bank          TEXT,
  current_amb   NUMERIC(18,4),
  amb_potential NUMERIC(18,4),
  opp_size      TEXT,
  etb_status    TEXT,
  last_followup DATE,
  blocker       TEXT,
  notes         TEXT,
  updated_by    UUID        REFERENCES public.users(id),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mid)
);

CREATE INDEX IF NOT EXISTS idx_amb_tracker_spoc ON public.amb_growth_tracker (spoc);

-- ─────────────────────────────────────────────────────────────────
-- 8. EXEC_SPONSOR_ACCOUNTS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.exec_sponsor_accounts (
  id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mid           TEXT        NOT NULL UNIQUE,
  merchant_name TEXT,
  spoc          TEXT,
  segment       TEXT,
  exec_sponsor  TEXT,
  status        TEXT,
  last_review   DATE,
  notes         TEXT,
  updated_by    UUID        REFERENCES public.users(id),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────
-- 9. MERCHANT_MEETINGS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.merchant_meetings (
  id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mid           TEXT,
  merchant_name TEXT,
  meeting_date  DATE        NOT NULL,
  meeting_type  TEXT,       -- 'QBR', 'Monthly', 'Escalation', 'Onboarding' ...
  attendees     TEXT[],
  summary       TEXT,
  next_steps    TEXT,
  created_by    UUID        REFERENCES public.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meetings_mid  ON public.merchant_meetings (mid);
CREATE INDEX IF NOT EXISTS idx_meetings_date ON public.merchant_meetings (meeting_date DESC);

-- ─────────────────────────────────────────────────────────────────
-- 10. ACTION_ITEMS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.action_items (
  id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id    UUID        REFERENCES public.merchant_meetings(id) ON DELETE SET NULL,
  mid           TEXT,
  merchant_name TEXT,
  description   TEXT        NOT NULL,
  owner         TEXT,
  due_date      DATE,
  priority      TEXT        NOT NULL DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
  status        TEXT        NOT NULL DEFAULT 'open'   CHECK (status IN ('open','in_progress','done','cancelled')),
  created_by    UUID        REFERENCES public.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_action_items_owner  ON public.action_items (owner);
CREATE INDEX IF NOT EXISTS idx_action_items_status ON public.action_items (status);

-- ─────────────────────────────────────────────────────────────────
-- 11. APOLLO_REPORTS  (uploaded Apollo / external reports)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.apollo_reports (
  id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_name   TEXT        NOT NULL,
  report_date   DATE        NOT NULL,
  data          JSONB,
  file_url      TEXT,       -- Supabase Storage URL if raw file is stored
  uploaded_by   UUID        REFERENCES public.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────
-- Helper: update updated_at on row change
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$ DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','dashboard_store','merchants','monthly_targets','product_targets',
    'pipeline_entries','amb_growth_tracker','exec_sponsor_accounts',
    'merchant_meetings','action_items'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS set_updated_at ON public.%I;
       CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();', t, t);
  END LOOP;
END $$;
