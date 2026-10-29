-- =====================================================================
-- ScamShield — Module 5: Database Schema & Operations Contract
-- Owner: Vishmi Himaya (@Vish-Himaya) · IS2901 Software Development Project
-- Database: Supabase PostgreSQL
-- =====================================================================

-- 1. IMMUTABLE AUDIT LOGS (M5-11)
-- Stores every sensitive administrative action. Immutable by design (append-only).
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    admin_email TEXT NOT NULL,
    admin_role TEXT NOT NULL CHECK (admin_role IN ('admin', 'support', 'superadmin')),
    action TEXT NOT NULL, -- e.g., 'ACCOUNT_SUSPENDED', 'ACCOUNT_REACTIVATED', 'SUPPORT_NOTE_ADDED', 'CSV_METRICS_EXPORT'
    target_user_id UUID,
    target_identifier TEXT NOT NULL, -- email or 'System-Wide'
    details TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index for speedy querying in admin view
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON public.audit_logs(target_identifier);

-- 2. SUPPORT TICKETS & USER INQUIRIES (M5-12)
CREATE TABLE IF NOT EXISTS public.support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number TEXT UNIQUE NOT NULL, -- e.g. 'SUP-2026-0041'
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('Billing', 'Scam Feedback', 'Vault Access', 'General')),
    status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'In Progress', 'Resolved')),
    priority TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('High', 'Medium', 'Low')),
    internal_notes TEXT,
    assigned_to UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status);

-- 3. AI SCAM VERDICT FEEDBACK & DISPUTES (M5-12 / M4 Interface)
CREATE TABLE IF NOT EXISTS public.verdict_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    check_id TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    taxonomy_category TEXT NOT NULL, -- X-13 canonical taxonomy code (e.g. 'phishing')
    system_verdict TEXT NOT NULL,
    user_reaction TEXT NOT NULL CHECK (user_reaction IN ('False Positive', 'False Negative', 'Helpful', 'Disputed')),
    user_comment TEXT,
    status TEXT NOT NULL DEFAULT 'Pending Review' CHECK (status IN ('Pending Review', 'Reviewed', 'Flagged For Model Tuning')),
    reviewed_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 4. TELEMETRY & ANALYTICS EVENTS (M5-04, M5-05, M5-08)
-- Privacy boundary: Zero raw content. No passwords, keys, or raw message texts!
CREATE TABLE IF NOT EXISTS public.analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name TEXT NOT NULL, -- 'landing_view', 'funnel_step_completed', 'signup_completed', 'scam_check_performed'
    source_module TEXT NOT NULL, -- 'M1', 'M2', 'M3', 'M4'
    visitor_id TEXT, -- anonymous session cookie / hash
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'::jsonb, -- sanitized metadata (e.g. { "category": "phishing", "funnel_step": 2, "referral_source": "friend" })
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analytics_event_name ON public.analytics_events(event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON public.analytics_events(created_at DESC);

-- 5. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verdict_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Only authenticated users with admin/superadmin claim can view audit logs
CREATE POLICY "Admins can view audit logs"
    ON public.audit_logs
    FOR SELECT
    TO authenticated
    USING (
        (auth.jwt() ->> 'role') IN ('admin', 'superadmin', 'support')
    );

-- Only verified admins can insert audit logs (restricted from open WITH CHECK true)
CREATE POLICY "Admins can append audit logs"
    ON public.audit_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (auth.jwt() ->> 'role') IN ('admin', 'superadmin', 'support')
    );

-- Disallow update and delete on audit logs (Enforcing immutability)
CREATE POLICY "No update on audit logs"
    ON public.audit_logs
    FOR UPDATE
    TO authenticated
    USING (false);

CREATE POLICY "No delete on audit logs"
    ON public.audit_logs
    FOR DELETE
    TO authenticated
    USING (false);
