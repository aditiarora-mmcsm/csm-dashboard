-- ═══════════════════════════════════════════════════════════════════
-- Row Level Security Policies
-- Run AFTER 001_schema.sql
-- ═══════════════════════════════════════════════════════════════════

-- Helper function: get current user's role
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;

-- Helper function: get current user's spoc_name
CREATE OR REPLACE FUNCTION public.current_user_spoc()
RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT spoc_name FROM public.users WHERE id = auth.uid();
$$;

-- ─────────────────────────────────────────────────────────────────
-- USERS table
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Everyone can read users (needed to show names/roles in UI)
CREATE POLICY "users_select_all"
  ON public.users FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Users can update their own profile
CREATE POLICY "users_update_own"
  ON public.users FOR UPDATE
  USING (auth.uid() = id);

-- Admins can update any user (to change roles)
CREATE POLICY "users_admin_update_any"
  ON public.users FOR UPDATE
  USING (public.current_user_role() = 'admin');

-- ─────────────────────────────────────────────────────────────────
-- DASHBOARD_STORE table
-- Controls who can read/write the shared dashboard data
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.dashboard_store ENABLE ROW LEVEL SECURITY;

-- ALL authenticated users can read dashboard_store
CREATE POLICY "dashboard_store_select"
  ON public.dashboard_store FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Admins can INSERT / UPDATE / DELETE anything
CREATE POLICY "dashboard_store_admin_write"
  ON public.dashboard_store FOR ALL
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

-- SPOCs can upsert (INSERT or UPDATE) – but NOT delete
CREATE POLICY "dashboard_store_spoc_insert"
  ON public.dashboard_store FOR INSERT
  WITH CHECK (public.current_user_role() = 'spoc');

CREATE POLICY "dashboard_store_spoc_update"
  ON public.dashboard_store FOR UPDATE
  USING (public.current_user_role() = 'spoc');

-- Leadership is read-only (no insert/update/delete policies for them)

-- ─────────────────────────────────────────────────────────────────
-- MERCHANTS table
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read merchants
CREATE POLICY "merchants_select"
  ON public.merchants FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Admins can write anything
CREATE POLICY "merchants_admin_write"
  ON public.merchants FOR ALL
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

-- SPOCs can update merchants assigned to them
CREATE POLICY "merchants_spoc_update"
  ON public.merchants FOR UPDATE
  USING (
    public.current_user_role() = 'spoc'
    AND spoc = public.current_user_spoc()
  );

-- ─────────────────────────────────────────────────────────────────
-- MONTHLY_TARGETS
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.monthly_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "targets_select" ON public.monthly_targets FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "targets_admin_write" ON public.monthly_targets FOR ALL
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

-- ─────────────────────────────────────────────────────────────────
-- PRODUCT_TARGETS
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.product_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_targets_select" ON public.product_targets FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "product_targets_admin_write" ON public.product_targets FOR ALL
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

-- ─────────────────────────────────────────────────────────────────
-- PIPELINE_ENTRIES
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.pipeline_entries ENABLE ROW LEVEL SECURITY;

-- Leadership + Admin: see everything
CREATE POLICY "pipeline_leadership_select"
  ON public.pipeline_entries FOR SELECT
  USING (
    public.current_user_role() IN ('admin', 'leadership')
  );

-- SPOCs: see only their own entries
CREATE POLICY "pipeline_spoc_select"
  ON public.pipeline_entries FOR SELECT
  USING (
    public.current_user_role() = 'spoc'
    AND spoc = public.current_user_spoc()
  );

-- SPOCs: insert/update their own entries
CREATE POLICY "pipeline_spoc_insert"
  ON public.pipeline_entries FOR INSERT
  WITH CHECK (
    public.current_user_role() IN ('admin', 'spoc')
    AND (public.current_user_role() = 'admin' OR spoc = public.current_user_spoc())
  );

CREATE POLICY "pipeline_spoc_update"
  ON public.pipeline_entries FOR UPDATE
  USING (
    public.current_user_role() = 'admin'
    OR (public.current_user_role() = 'spoc' AND spoc = public.current_user_spoc())
  );

CREATE POLICY "pipeline_admin_delete"
  ON public.pipeline_entries FOR DELETE
  USING (public.current_user_role() = 'admin');

-- ─────────────────────────────────────────────────────────────────
-- AMB_GROWTH_TRACKER
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.amb_growth_tracker ENABLE ROW LEVEL SECURITY;

CREATE POLICY "amb_tracker_admin_leadership_select"
  ON public.amb_growth_tracker FOR SELECT
  USING (public.current_user_role() IN ('admin', 'leadership'));

CREATE POLICY "amb_tracker_spoc_select"
  ON public.amb_growth_tracker FOR SELECT
  USING (
    public.current_user_role() = 'spoc'
    AND spoc = public.current_user_spoc()
  );

CREATE POLICY "amb_tracker_admin_write"
  ON public.amb_growth_tracker FOR ALL
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "amb_tracker_spoc_write"
  ON public.amb_growth_tracker FOR INSERT
  WITH CHECK (
    public.current_user_role() = 'spoc'
    AND spoc = public.current_user_spoc()
  );

CREATE POLICY "amb_tracker_spoc_update"
  ON public.amb_growth_tracker FOR UPDATE
  USING (
    public.current_user_role() = 'spoc'
    AND spoc = public.current_user_spoc()
  );

-- ─────────────────────────────────────────────────────────────────
-- EXEC_SPONSOR_ACCOUNTS
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.exec_sponsor_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exec_select" ON public.exec_sponsor_accounts FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "exec_admin_write" ON public.exec_sponsor_accounts FOR ALL
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');
CREATE POLICY "exec_spoc_update" ON public.exec_sponsor_accounts FOR UPDATE
  USING (public.current_user_role() = 'spoc' AND spoc = public.current_user_spoc());

-- ─────────────────────────────────────────────────────────────────
-- MERCHANT_MEETINGS
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.merchant_meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meetings_select" ON public.merchant_meetings FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "meetings_insert"
  ON public.merchant_meetings FOR INSERT
  WITH CHECK (public.current_user_role() IN ('admin', 'spoc'));

CREATE POLICY "meetings_update"
  ON public.merchant_meetings FOR UPDATE
  USING (
    public.current_user_role() = 'admin'
    OR created_by = auth.uid()
  );

CREATE POLICY "meetings_delete"
  ON public.merchant_meetings FOR DELETE
  USING (public.current_user_role() = 'admin' OR created_by = auth.uid());

-- ─────────────────────────────────────────────────────────────────
-- ACTION_ITEMS
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.action_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "actions_select" ON public.action_items FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "actions_insert"
  ON public.action_items FOR INSERT
  WITH CHECK (public.current_user_role() IN ('admin', 'spoc'));

CREATE POLICY "actions_update"
  ON public.action_items FOR UPDATE
  USING (
    public.current_user_role() = 'admin'
    OR created_by = auth.uid()
    OR owner = (SELECT email FROM public.users WHERE id = auth.uid())
  );

CREATE POLICY "actions_delete"
  ON public.action_items FOR DELETE
  USING (public.current_user_role() = 'admin' OR created_by = auth.uid());

-- ─────────────────────────────────────────────────────────────────
-- APOLLO_REPORTS
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.apollo_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "apollo_select" ON public.apollo_reports FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "apollo_admin_write" ON public.apollo_reports FOR ALL
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

-- ─────────────────────────────────────────────────────────────────
-- Enable Realtime for dashboard_store (live sync across users)
-- ─────────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.dashboard_store;
ALTER PUBLICATION supabase_realtime ADD TABLE public.action_items;
