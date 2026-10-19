"use client";

import React from "react";
import Link from "next/link";
import {
  Users,
  CreditCard,
  Search,
  ShieldCheck,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  ExternalLink,
  LifeBuoy,
  UserX,
  FileCheck2,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";
import { useAdmin } from "@/lib/admin-store";
import {
  initialWeeklyData,
  initialPlanMix,
  initialScamCategories,
} from "@/lib/seed-data";

export default function AdminOverviewPage() {
  const { metrics, users, supportTickets } = useAdmin();

  const openTicketsCount = supportTickets.filter((t) => t.status === "Open").length;
  const suspendedUsersCount = users.filter((u) => u.status === "Suspended").length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-[#eaf1f7]">Admin overview</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs bg-[#13203a] text-[#8ea0b3] border border-[#1f2d45]">
              M5-14
            </span>
          </div>
          <p className="text-xs text-[#8ea0b3] mt-1">
            Real-time control room monitoring platform health, mock financials, and scam check traffic.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/users"
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#2dd4bf] text-[#0b1322] hover:bg-[#5eead4] transition flex items-center gap-1.5"
          >
            <Users className="w-3.5 h-3.5" />
            Manage Users
          </Link>
          <Link
            href="/admin/analytics"
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#13203a] text-[#eaf1f7] hover:bg-[#1f2d45] border border-[#1f2d45] transition flex items-center gap-1.5"
          >
            Detailed Analytics
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Top 4 KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Signups */}
        <div className="p-5 rounded-xl bg-[#0e1726] border border-[#1f2d45] space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-[#8ea0b3]">
            <span>Signups (M5-02)</span>
            <Users className="w-4 h-4 text-[#2dd4bf]" />
          </div>
          <div className="text-3xl font-bold text-[#eaf1f7]">{metrics.totalSignups}</div>
          <div className="flex items-center gap-1 text-xs text-[#34d399] font-medium">
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>▲ {metrics.signupsGrowthPct}% vs prior month</span>
          </div>
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#2dd4bf]/5 rounded-full blur-2xl pointer-events-none" />
        </div>

        {/* Card 2: Active Guardian Subs */}
        <div className="p-5 rounded-xl bg-[#0e1726] border border-[#1f2d45] space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-[#8ea0b3]">
            <span>Active Guardian subs</span>
            <ShieldCheck className="w-4 h-4 text-[#2dd4bf]" />
          </div>
          <div className="text-3xl font-bold text-[#eaf1f7]">{metrics.activeGuardianSubs}</div>
          <div className="flex items-center gap-1 text-xs text-[#34d399] font-medium">
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>▲ {metrics.activeGuardianGrowth} net added</span>
          </div>
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
        </div>

        {/* Card 3: Mock Revenue */}
        <div className="p-5 rounded-xl bg-[#0e1726] border border-[#1f2d45] space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-[#8ea0b3]">
            <span>Mock revenue (M5-03)</span>
            <CreditCard className="w-4 h-4 text-[#2dd4bf]" />
          </div>
          <div className="text-3xl font-bold text-[#eaf1f7]">
            LKR {metrics.mockRevenueLKR.toLocaleString()}
          </div>
          <div className="flex items-center gap-1 text-xs text-[#34d399] font-medium">
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>▲ {metrics.revenueGrowthPct}% estimated MRR</span>
          </div>
          <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none" />
        </div>

        {/* Card 4: Scam Checks */}
        <div className="p-5 rounded-xl bg-[#0e1726] border border-[#1f2d45] space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-[#8ea0b3]">
            <span>Scam checks (M5-04)</span>
            <Search className="w-4 h-4 text-[#2dd4bf]" />
          </div>
          <div className="text-3xl font-bold text-[#eaf1f7]">{metrics.scamChecks}</div>
          <div className="flex items-center gap-1 text-xs text-[#f06a6a] font-medium">
            <ArrowDownRight className="w-3.5 h-3.5" />
            <span>▼ 3% volume fluctuation</span>
          </div>
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full blur-2xl pointer-events-none" />
        </div>
      </div>

      {/* Charts Row: Weekly Signups & Plan Mix */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Weekly Signups Chart */}
        <div className="lg:col-span-7 p-5 rounded-xl bg-[#0e1726] border border-[#1f2d45] space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[#eaf1f7]">Signups per week</h2>
              <p className="text-xs text-[#8ea0b3]">Weekly cohort acquisition trend</p>
            </div>
            <span className="text-xs px-2 py-0.5 rounded bg-[#13203a] text-[#2dd4bf] border border-[#1f2d45]">
              Last 6 Weeks
            </span>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={initialWeeklyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2d45" vertical={false} />
                <XAxis dataKey="week" stroke="#8ea0b3" tickLine={false} fontSize={12} />
                <YAxis stroke="#8ea0b3" tickLine={false} fontSize={12} domain={[0, 35]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#13203a",
                    borderColor: "#1f2d45",
                    borderRadius: "8px",
                    color: "#eaf1f7",
                    fontSize: "12px",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="signups"
                  stroke="#2dd4bf"
                  strokeWidth={3}
                  dot={{ fill: "#2dd4bf", r: 4 }}
                  activeDot={{ r: 6, fill: "#5eead4" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Plan Mix Breakdown */}
        <div className="lg:col-span-5 p-5 rounded-xl bg-[#0e1726] border border-[#1f2d45] space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[#eaf1f7]">Plan mix</h2>
              <p className="text-xs text-[#8ea0b3]">Current subscriber distribution</p>
            </div>
            <Link href="/admin/users" className="text-xs text-[#2dd4bf] hover:underline flex items-center gap-1">
              View table <ExternalLink className="w-3 h-3" />
            </Link>
          </div>

          <div className="space-y-3 pt-2">
            {/* Sentinel */}
            <div>
              <div className="flex justify-between text-xs text-[#eaf1f7] mb-1.5">
                <span className="font-medium">Sentinel (Entry)</span>
                <span className="text-[#8ea0b3]">52 users</span>
              </div>
              <div className="w-full bg-[#13203a] rounded-full h-2 overflow-hidden">
                <div className="bg-[#2dd4bf] h-2 rounded-full" style={{ width: "43.3%" }}></div>
              </div>
            </div>

            {/* Guardian */}
            <div>
              <div className="flex justify-between text-xs text-[#eaf1f7] mb-1.5">
                <span className="font-medium">Guardian (Recommended)</span>
                <span className="text-[#8ea0b3]">40 users</span>
              </div>
              <div className="w-full bg-[#13203a] rounded-full h-2 overflow-hidden">
                <div className="bg-[#0f766e] h-2 rounded-full" style={{ width: "33.3%" }}></div>
              </div>
            </div>

            {/* Aegis */}
            <div>
              <div className="flex justify-between text-xs text-[#eaf1f7] mb-1.5">
                <span className="font-medium">Aegis (Ultimate)</span>
                <span className="text-[#8ea0b3]">18 users</span>
              </div>
              <div className="w-full bg-[#13203a] rounded-full h-2 overflow-hidden">
                <div className="bg-[#38bdf8] h-2 rounded-full" style={{ width: "15%" }}></div>
              </div>
            </div>

            <div className="pt-3 border-t border-[#1f2d45] flex items-center justify-between text-xs text-[#8ea0b3]">
              <span>Trialing / Cancelled</span>
              <span className="font-semibold text-[#eaf1f7]">22 / 9</span>
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Checks by Category & Needs Attention */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Checks by category (X-13) */}
        <div className="lg:col-span-7 p-5 rounded-xl bg-[#0e1726] border border-[#1f2d45] space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[#eaf1f7]">Checks by category (X-13)</h2>
              <p className="text-xs text-[#8ea0b3]">
                Metadata tags passed from M4 AI Scam Pipeline — no raw messages
              </p>
            </div>
            <Link href="/admin/scams" className="text-xs text-[#2dd4bf] hover:underline flex items-center gap-1">
              Full breakdown <ExternalLink className="w-3 h-3" />
            </Link>
          </div>

          <div className="space-y-3.5 pt-1">
            {initialScamCategories.map((cat) => (
              <div key={cat.code}>
                <div className="flex justify-between text-xs text-[#eaf1f7] mb-1">
                  <span className="font-medium">{cat.category}</span>
                  <span className="text-[#8ea0b3]">
                    <strong className="text-[#eaf1f7]">{cat.count}</strong> checks ({cat.percentage}%)
                  </span>
                </div>
                <div className="w-full bg-[#13203a] rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-[#2dd4bf] h-2 rounded-full transition-all duration-500"
                    style={{ width: `${(cat.count / 410) * 100}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Needs Attention Widget */}
        <div className="lg:col-span-5 p-5 rounded-xl bg-[#0e1726] border border-[#1f2d45] space-y-4">
          <h2 className="text-sm font-semibold text-[#eaf1f7]">Needs attention</h2>
          <div className="space-y-3">
            {/* Item 1: Open Support Requests */}
            <Link
              href="/admin/support-audit"
              className="flex items-center justify-between p-3 rounded-lg bg-[#13203a]/70 hover:bg-[#13203a] border border-[#1f2d45] transition"
            >
              <div className="flex items-center gap-3">
                <LifeBuoy className="w-4 h-4 text-[#f59e0b]" />
                <span className="text-xs font-medium text-[#eaf1f7]">Open support requests</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold border border-[#f59e0b] text-[#f59e0b]">
                {openTicketsCount}
              </span>
            </Link>

            {/* Item 2: Suspended Accounts */}
            <Link
              href="/admin/users"
              className="flex items-center justify-between p-3 rounded-lg bg-[#13203a]/70 hover:bg-[#13203a] border border-[#1f2d45] transition"
            >
              <div className="flex items-center gap-3">
                <UserX className="w-4 h-4 text-[#f06a6a]" />
                <span className="text-xs font-medium text-[#eaf1f7]">Suspended accounts</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold border border-[#f06a6a] text-[#f06a6a]">
                {suspendedUsersCount}
              </span>
            </Link>

            {/* Item 3: Vault Entries count */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-[#13203a]/70 border border-[#1f2d45]">
              <div className="flex items-center gap-3">
                <FileCheck2 className="w-4 h-4 text-[#2dd4bf]" />
                <span className="text-xs font-medium text-[#eaf1f7]">Vault entries (count only)</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-xs font-medium border border-[#1f2d45] text-[#8ea0b3]">
                {metrics.totalVaultEntriesCount.toLocaleString()}
              </span>
            </div>

            {/* Item 4: Safety Score Status */}
            <Link
              href="/admin/safety-scores"
              className="flex items-center justify-between p-3 rounded-lg bg-[#13203a]/70 hover:bg-[#13203a] border border-[#1f2d45] transition"
            >
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-4 h-4 text-[#8ea0b3]" />
                <span className="text-xs font-medium text-[#eaf1f7]">Digital Safety Score (M6)</span>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-medium border border-[#1f2d45] text-[#8ea0b3]">
                Not scored yet
              </span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
