"use client";

import React, { useState } from "react";
import {
  TrendingUp,
  Download,
  Filter,
  Users,
  Percent,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  GitBranch,
} from "lucide-react";
import { useAdmin } from "@/lib/admin-store";
import {
  initialFunnelMetrics,
  initialCohorts,
  initialReferralStats,
} from "@/lib/seed-data";

export default function AnalyticsPage() {
  const { exportCsvData } = useAdmin();
  const [dateRange, setDateRange] = useState("30d");

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-[#eaf1f7]">
              Business & growth analytics
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs bg-[#13203a] text-[#8ea0b3] border border-[#1f2d45]">
              M5-05 · M5-06 · M5-08
            </span>
          </div>
          <p className="text-xs text-[#8ea0b3] mt-1">
            Funnel drop-off, subscription retention cohorts, and growth campaign attribution.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Date range picker simulation */}
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="text-xs bg-[#13203a] border border-[#1f2d45] rounded-lg px-3 py-2 text-[#eaf1f7] focus:outline-none focus:border-[#2dd4bf]"
          >
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days (Default)</option>
            <option value="90d">Last 90 Days</option>
          </select>

          {/* CSV Export Button (M5-07) */}
          <button
            onClick={exportCsvData}
            className="px-3 py-2 rounded-lg text-xs font-semibold bg-[#2dd4bf] text-[#0b1322] hover:bg-[#5eead4] transition flex items-center gap-1.5 shadow-lg shadow-[#2dd4bf]/10"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV (M5-07)
          </button>
        </div>
      </div>

      {/* Top 4 Growth KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Conversion rate */}
        <div className="p-5 rounded-xl bg-[#0e1726] border border-[#1f2d45] space-y-2">
          <div className="flex items-center justify-between text-xs text-[#8ea0b3]">
            <span>Visitor → Signup</span>
            <TrendingUp className="w-4 h-4 text-[#2dd4bf]" />
          </div>
          <div className="text-3xl font-bold text-[#eaf1f7]">8.4%</div>
          <div className="flex items-center gap-1 text-xs text-[#34d399] font-medium">
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>▲ 0.6 pts vs prior</span>
          </div>
        </div>

        {/* Card 2: Trial -> Paid */}
        <div className="p-5 rounded-xl bg-[#0e1726] border border-[#1f2d45] space-y-2">
          <div className="flex items-center justify-between text-xs text-[#8ea0b3]">
            <span>Trial → Paid</span>
            <Percent className="w-4 h-4 text-[#2dd4bf]" />
          </div>
          <div className="text-3xl font-bold text-[#eaf1f7]">41%</div>
          <div className="flex items-center gap-1 text-xs text-[#34d399] font-medium">
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>▲ 3 pts conversion</span>
          </div>
        </div>

        {/* Card 3: Monthly Churn */}
        <div className="p-5 rounded-xl bg-[#0e1726] border border-[#1f2d45] space-y-2">
          <div className="flex items-center justify-between text-xs text-[#8ea0b3]">
            <span>Monthly churn</span>
            <Users className="w-4 h-4 text-[#2dd4bf]" />
          </div>
          <div className="text-3xl font-bold text-[#eaf1f7]">5.2%</div>
          <div className="flex items-center gap-1 text-xs text-[#34d399] font-medium">
            <ArrowDownRight className="w-3.5 h-3.5" />
            <span>▼ 0.4 pts improvement</span>
          </div>
        </div>

        {/* Card 4: Referral Signups */}
        <div className="p-5 rounded-xl bg-[#0e1726] border border-[#1f2d45] space-y-2">
          <div className="flex items-center justify-between text-xs text-[#8ea0b3]">
            <span>Referral signups</span>
            <Sparkles className="w-4 h-4 text-[#2dd4bf]" />
          </div>
          <div className="text-3xl font-bold text-[#eaf1f7]">19</div>
          <div className="flex items-center gap-1 text-xs text-[#34d399] font-medium">
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>▲ 5 from viral loop</span>
          </div>
        </div>
      </div>

      {/* Row 2: Funnel Drop-off & Cohort Retention Heatmap */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Funnel Drop-off (from M1 events) */}
        <div className="lg:col-span-6 p-5 rounded-xl bg-[#0e1726] border border-[#1f2d45] space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[#eaf1f7]">
                Funnel drop-off (from M1 events)
              </h2>
              <p className="text-xs text-[#8ea0b3]">
                Drop-off telemetry passed from landing page & onboarding (M1)
              </p>
            </div>
            <span className="text-[11px] text-[#2dd4bf] px-2 py-0.5 rounded bg-[#13203a] border border-[#1f2d45]">
              Overall: 8.4%
            </span>
          </div>

          <div className="space-y-4 pt-2">
            {initialFunnelMetrics.map((step, idx) => (
              <div key={step.step} className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <div>
                    <span className="font-semibold text-[#eaf1f7]">
                      {idx + 1}. {step.step}
                    </span>
                    <span className="text-[11px] text-[#8ea0b3] ml-2 hidden sm:inline">
                      ({step.description})
                    </span>
                  </div>
                  <span className="font-medium text-[#eaf1f7]">
                    {step.count.toLocaleString()}
                    <span className="text-[11px] text-[#8ea0b3] ml-1">
                      ({step.pctOfTotal}%)
                    </span>
                  </span>
                </div>
                <div className="w-full bg-[#13203a] rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-[#2dd4bf] h-2.5 rounded-full transition-all duration-500"
                    style={{ width: `${step.pctOfTotal}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Cohort Retention Matrix (M5-06) */}
        <div className="lg:col-span-6 p-5 rounded-xl bg-[#0e1726] border border-[#1f2d45] space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[#eaf1f7]">Cohort retention</h2>
              <p className="text-xs text-[#8ea0b3]">Monthly active retention matrix</p>
            </div>
            <span className="text-xs text-[#8ea0b3]">Monthly Active %</span>
          </div>

          <div className="overflow-x-auto pt-1">
            <table className="w-full text-center text-xs border-separate border-spacing-1.5">
              <thead>
                <tr className="text-[#8ea0b3]">
                  <th className="text-left font-medium pb-2 text-[11px]">Cohort</th>
                  <th className="font-medium pb-2">M0</th>
                  <th className="font-medium pb-2">M1</th>
                  <th className="font-medium pb-2">M2</th>
                  <th className="font-medium pb-2">M3</th>
                  <th className="font-medium pb-2">M4</th>
                </tr>
              </thead>
              <tbody>
                {initialCohorts.map((row) => (
                  <tr key={row.month}>
                    <td className="text-left font-medium text-[#8ea0b3] py-2">{row.month}</td>
                    <td className="p-2.5 rounded-lg bg-[#2dd4bf]/70 text-[#0b1322] font-bold">
                      {row.m0}%
                    </td>
                    <td className="p-2.5 rounded-lg bg-[#2dd4bf]/50 text-[#eaf1f7] font-semibold">
                      {row.m1}%
                    </td>
                    <td className="p-2.5 rounded-lg bg-[#2dd4bf]/40 text-[#eaf1f7] font-semibold">
                      {row.m2}%
                    </td>
                    <td
                      className={`p-2.5 rounded-lg ${
                        row.m3 > 0
                          ? "bg-[#2dd4bf]/35 text-[#eaf1f7] font-semibold"
                          : "bg-[#13203a] text-slate-600"
                      }`}
                    >
                      {row.m3 > 0 ? `${row.m3}%` : "—"}
                    </td>
                    <td
                      className={`p-2.5 rounded-lg ${
                        row.m4 > 0
                          ? "bg-[#2dd4bf]/30 text-[#eaf1f7] font-semibold"
                          : "bg-[#13203a] text-slate-600"
                      }`}
                    >
                      {row.m4 > 0 ? `${row.m4}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Row 3: Referral & A/B Campaign Performance (M5-08) */}
      <div className="p-5 rounded-xl bg-[#0e1726] border border-[#1f2d45] space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[#eaf1f7]">
              Referral & A/B performance (M5-08)
            </h2>
            <p className="text-xs text-[#8ea0b3]">
              Campaign conversion breakdown tracking growth initiatives
            </p>
          </div>
          <span className="text-xs text-[#2dd4bf] flex items-center gap-1">
            <GitBranch className="w-3.5 h-3.5" />
            Variant B leads by +2.3%
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#1f2d45] text-[#8ea0b3] bg-[#0b1322]">
                <th className="py-3 px-4 font-medium">Source / Campaign</th>
                <th className="py-3 px-4 font-medium">Visits</th>
                <th className="py-3 px-4 font-medium">Signups</th>
                <th className="py-3 px-4 font-medium">Conversion Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1f2d45]">
              {initialReferralStats.map((ref) => (
                <tr key={ref.source} className="hover:bg-[#13203a]/50 transition">
                  <td className="py-3 px-4 font-medium text-[#eaf1f7]">{ref.source}</td>
                  <td className="py-3 px-4 text-[#8ea0b3]">{ref.visits.toLocaleString()}</td>
                  <td className="py-3 px-4 text-[#eaf1f7] font-semibold">{ref.signups}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-0.5 rounded-full font-semibold ${
                        ref.conversionPct >= 10
                          ? "bg-[#34d399]/15 text-[#34d399] border border-[#34d399]/40"
                          : "text-[#eaf1f7]"
                      }`}
                    >
                      {ref.conversionPct}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
