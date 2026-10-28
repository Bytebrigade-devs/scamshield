export type AdminRole = "admin" | "support" | "none";

export type PlanTier = "Guardian" | "Sentinel" | "Aegis" | "None";

export type UserStatus = "Active" | "Trialing" | "Cancelled" | "Suspended" | "Not subscribed";

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
  billingAmount: number; // LKR: Sentinel: 490, Guardian: 990, Aegis: 1990
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
  plan: PlanTier | "Trialing" | "Cancelled" | "Not subscribed";
  count: number;
  color: string;
}

// X-13 Canonical Threat Taxonomy Codes
export type X13TaxonomyCode =
  | "phishing"
  | "romance_scam"
  | "fake_invoice"
  | "prize_lottery_scam"
  | "unknown_other";

export interface ScamCategoryStat {
  category: string;
  code: X13TaxonomyCode; // X-13 canonical taxonomy code
  count: number;
  percentage: number;
  flaggedHighRisk: number;
}

export interface FunnelMetric {
  step: string;
  description: string;
  count: number;
  pctOfTotal: number;
  dropOffPct?: number;
}

export interface CohortRow {
  cohort: string;
  signups: number;
  p1: number | null;
  p2: number | null;
  p3: number | null;
  p4: number | null;
}

export interface ReferralStat {
  source: string;
  visits?: number;
  signups: number;
  paid: number;
  conversionPct?: number;
}

export interface SupportMessage {
  id: string;
  sender: string;
  senderType: "user" | "admin" | "system";
  timestamp: string;
  text: string;
}

export interface SupportTicket {
  id: string;
  ticketNumber: string;
  user: string;
  email: string;
  subject: string;
  category: "Billing" | "Checker" | "Account" | "Login" | "Vault";
  status: "New" | "In progress" | "Waiting on user" | "Resolved";
  priority: "High" | "Normal" | "Low";
  age: string;
  openedDate: string;
  accountStatus: UserStatus;
  messages: SupportMessage[];
  relatedAuditEntry?: string;
}

export interface AuditLogEntry {
  id: string;
  time: string;
  admin: string;
  action: string;
  target: string;
  result: "Success" | "Denied";
  reason: string;
  ipAddress?: string;
}

export interface MonitoringComponent {
  id: string;
  name: string;
  detail: string;
  status: "Operational" | "Needs attention" | "Degraded" | "Offline" | "Unknown";
}

export interface MonitoringCheck {
  id: string;
  time: string;
  name: string;
  result: "Passed" | "1 timeout" | "Failed";
}

export interface SystemAlert {
  id: string;
  alertType: string;
  severity: "High" | "Medium" | "Low";
  timeDetected: string;
  component: string;
  relatedModule: string;
  reason: string;
  status: "Open" | "Acknowledged" | "Resolved";
  whatWeKnow: string[];
  timeline: { time: string; event: string }[];
  suggestedSteps: string[];
  relatedSupportTicketId?: string;
}
