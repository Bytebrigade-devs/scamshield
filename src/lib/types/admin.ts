export type AdminRole = "admin" | "support" | "security_analyst";

export type PlanTier = "Sentinel" | "Guardian" | "Aegis";

export type UserStatus = "Active" | "Trialing" | "Cancelled" | "Suspended";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  plan: PlanTier;
  status: UserStatus;
  joined: string;
  checksCount: number;
  vaultCount: number;
  renewal: string;
  billingAmount: number; // LKR
  supportNotes: string[];
  safetyScore?: number | null;
}

export interface OverviewMetrics {
  totalSignups: number;
  signupsGrowthPct: number;
  activeGuardianSubs: number;
  activeGuardianGrowth: number;
  mockRevenueLKR: number;
  revenueGrowthPct: number;
  scamChecks: number;
  scamChecksGrowthPct: number;
  openSupportCount: number;
  suspendedCount: number;
  totalVaultEntriesCount: number;
  avgSafetyScore: number | null;
}

export interface WeeklyData {
  week: string;
  signups: number;
  checks: number;
}

export interface PlanMixData {
  plan: PlanTier | "Trialing" | "Cancelled";
  count: number;
  color: string;
}

export interface ScamCategoryStat {
  category: string;
  code: string; // X-13 taxonomy code
  count: number;
  percentage: number;
  flaggedHighRisk: number;
}

export interface FunnelMetric {
  step: string;
  description: string;
  count: number;
  pctOfTotal: number;
}

export interface CohortRow {
  month: string;
  m0: number;
  m1: number;
  m2: number;
  m3: number;
  m4: number;
}

export interface ReferralStat {
  source: string;
  type: "referral" | "campaign";
  visits: number;
  signups: number;
  conversionPct: number;
}

export interface SupportTicket {
  id: string;
  ticketNumber: string;
  user: string;
  email: string;
  subject: string;
  category: "Billing" | "Scam Feedback" | "Vault Access" | "General";
  status: "Open" | "In Progress" | "Resolved";
  priority: "High" | "Medium" | "Low";
  createdAt: string;
  notes: string;
}

export interface VerdictFeedback {
  id: string;
  checkId: string;
  userEmail: string;
  category: string;
  systemVerdict: string;
  userReaction: "False Positive" | "False Negative" | "Helpful" | "Disputed";
  userComment: string;
  status: "Pending Review" | "Reviewed" | "Flagged For Model Tuning";
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  adminEmail: string;
  role: string;
  action: string;
  targetUser: string;
  details: string;
  timestamp: string;
  ipAddress: string;
}
