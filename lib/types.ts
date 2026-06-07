// ─────────────────────────────────────────────────────────────────
// Application types
// ─────────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'spoc' | 'leadership';

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  spoc_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface DashboardStoreRow {
  id: string;
  key: string;
  value: unknown;
  updated_by: string | null;
  updated_at: string;
}

// ─────────────────────────────────────────────────────────────────
// Supabase Database type (simplified — extend as needed)
// ─────────────────────────────────────────────────────────────────
export type Database = {
  public: {
    Tables: {
      users: {
        Row: UserProfile;
        Insert: Partial<UserProfile> & { id: string; email: string };
        Update: Partial<UserProfile>;
      };
      dashboard_store: {
        Row: DashboardStoreRow;
        Insert: Omit<DashboardStoreRow, 'id' | 'updated_at'> & { id?: string; updated_at?: string };
        Update: Partial<DashboardStoreRow>;
      };
      merchants: {
        Row: {
          id: string; mid: string; name: string; spoc: string | null;
          segment: string | null; exec_sponsor: string | null;
          tags: string[] | null; created_at: string; updated_at: string;
        };
        Insert: { mid: string; name: string; [key: string]: unknown };
        Update: Partial<{ mid: string; name: string; spoc: string; [key: string]: unknown }>;
      };
      pipeline_entries: {
        Row: {
          id: string; pipeline_type: string; mid: string; merchant_name: string;
          spoc: string | null; stage: string | null; amount: number | null;
          expected_close: string | null; notes: string | null; status: string;
          created_by: string | null; created_at: string; updated_at: string;
        };
        Insert: { pipeline_type: string; mid: string; merchant_name: string; [key: string]: unknown };
        Update: Partial<{ spoc: string; stage: string; amount: number; [key: string]: unknown }>;
      };
      merchant_meetings: {
        Row: {
          id: string; mid: string | null; merchant_name: string | null;
          meeting_date: string; meeting_type: string | null; attendees: string[] | null;
          summary: string | null; next_steps: string | null;
          created_by: string | null; created_at: string; updated_at: string;
        };
        Insert: { meeting_date: string; [key: string]: unknown };
        Update: Partial<{ summary: string; next_steps: string; [key: string]: unknown }>;
      };
      action_items: {
        Row: {
          id: string; meeting_id: string | null; mid: string | null;
          merchant_name: string | null; description: string; owner: string | null;
          due_date: string | null; priority: string; status: string;
          created_by: string | null; created_at: string; updated_at: string;
        };
        Insert: { description: string; [key: string]: unknown };
        Update: Partial<{ status: string; owner: string; [key: string]: unknown }>;
      };
      monthly_targets: {
        Row: { id: string; month: string; year: number; product: string; target: number | null; achieved: number | null; updated_by: string | null; updated_at: string };
        Insert: { month: string; year: number; product: string; [key: string]: unknown };
        Update: Partial<{ target: number; achieved: number; [key: string]: unknown }>;
      };
      product_targets: {
        Row: { id: string; product: string; fy: string; target: number | null; stretch_target: number | null; updated_by: string | null; updated_at: string };
        Insert: { product: string; fy: string; [key: string]: unknown };
        Update: Partial<{ target: number; [key: string]: unknown }>;
      };
      amb_growth_tracker: {
        Row: { id: string; mid: string; merchant_name: string | null; spoc: string | null; bank: string | null; current_amb: number | null; amb_potential: number | null; opp_size: string | null; etb_status: string | null; last_followup: string | null; blocker: string | null; notes: string | null; updated_by: string | null; updated_at: string };
        Insert: { mid: string; [key: string]: unknown };
        Update: Partial<{ etb_status: string; notes: string; [key: string]: unknown }>;
      };
      exec_sponsor_accounts: {
        Row: { id: string; mid: string; merchant_name: string | null; spoc: string | null; segment: string | null; exec_sponsor: string | null; status: string | null; last_review: string | null; notes: string | null; updated_by: string | null; updated_at: string };
        Insert: { mid: string; [key: string]: unknown };
        Update: Partial<{ status: string; notes: string; [key: string]: unknown }>;
      };
      apollo_reports: {
        Row: { id: string; report_name: string; report_date: string; data: unknown; file_url: string | null; uploaded_by: string | null; created_at: string };
        Insert: { report_name: string; report_date: string; [key: string]: unknown };
        Update: Partial<{ data: unknown; [key: string]: unknown }>;
      };
    };
    Functions: {
      current_user_role: { Args: Record<string, never>; Returns: UserRole };
      current_user_spoc: { Args: Record<string, never>; Returns: string };
    };
  };
};
