"use client";

import React, { useState } from "react";
import { Download, ChevronDown } from "lucide-react";
import { useAdmin } from "@/lib/admin-store";
import {
  initialSignupsOverTime,
  initialScamChecksPerWeek,
} from "@/lib/seed-data";

export default function AdminOverviewPage() {
  const { currentRole, exportCsvData, users, supportTickets } = useAdmin();
  const [timeRange, setTimeRange] = useState("Last 30 days");

  const openTicketsCount = supportTickets.filter((t) => t.status !== "Resolved").length;
  const suspendedCount = users.filter((u) => u.status === "Suspended").length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Overview</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Synthetic data only. Last 30 days (Sep 21 to Oct 20, 2026).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="appearance-none bg-white border border-slate-200 rounded-lg px-3.5 py-2 pr-9 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:border-teal-600"
            >
              <option>Last 7 days</option>
              <option>Last 30 days</option>
              <option>Last 90 days</option>
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <button
            onClick={() => exportCsvData("Overview")}
            className="inline-flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg px-3.5 py-2 text-sm font-medium transition shadow-sm"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* 4 Top KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Signups */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="text-sm font-medium text-slate-600">Signups</div>
          <div className="text-3xl font-bold text-slate-900 mt-2">120</div>
          <div className="text-xs text-slate-500 mt-1">Synthetic total for the period</div>
        </div>

        {/* Card 2: Active subscribers */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="text-sm font-medium text-slate-600">Active subscribers</div>
          <div className="text-3xl font-bold text-slate-900 mt-2">40</div>
          <div className="text-xs text-slate-500 mt-1">Guardian plan in this sample</div>
        </div>

        {/* Card 3: Mock revenue (RBAC protected) */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="text-sm font-medium text-slate-600">Mock revenue</div>
          {currentRole === "support" ? (
            <>
              <div className="text-xl font-bold text-slate-400 mt-2.5">LKR — (Hidden)</div>
              <div className="text-xs text-amber-700 mt-1">Role limit: Support admin</div>
            </>
          ) : (
            <>
              <div className="text-3xl font-bold text-slate-900 mt-2">LKR 39,600</div>
              <div className="text-xs text-slate-500 mt-1">40 active x LKR 990, simulated</div>
            </>
          )}
        </div>

        {/* Card 4: Scam checks */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="text-sm font-medium text-slate-600">Scam checks</div>
          <div className="text-3xl font-bold text-slate-900 mt-2">900</div>
          <div className="text-xs text-slate-500 mt-1">Counts only, never message text</div>
        </div>
      </div>

      {/* Middle Row: Signups over time & Signups by status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Signups over time chart */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <div>
            <h2 className="text-base font-bold text-slate-900">Signups over time</h2>
            <p className="text-xs text-slate-500 mt-0.5">Signups per 5–day period (total 120)</p>
          </div>

          <div className="mt-8">
            <div className="flex items-end justify-between gap-3 h-48 pt-6 pb-2 border-b border-slate-200">
              {initialSignupsOverTime.map((item) => {
                const heightPct = (item.signups / 28) * 100;
                return (
                  <div key={item.period} className="flex-1 flex flex-col items-center gap-2 group">
                    <span className="text-xs font-semibold text-slate-700 group-hover:text-teal-700">
                      {item.signups}
                    </span>
                    <div className="w-full max-w-[56px] bg-slate-100 rounded-t-sm h-full flex items-end">
                      <div
                        style={{ height: `${heightPct}%` }}
                        className="w-full bg-[#0F766E] rounded-t-sm transition-all hover:bg-[#115E59]"
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[11px] text-slate-500 mt-2 px-1">
              {initialSignupsOverTime.map((item) => (
                <span key={item.period} className="truncate text-center">
                  {item.period}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Signups by status */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-bold text-slate-900">Signups by status</h2>
              <span className="text-xs text-slate-500 font-medium">Total 120</span>
            </div>

            <div className="mt-7 space-y-5">
              {/* Active */}
              <div>
                <div className="flex justify-between text-sm font-medium mb-1.5">
                  <span className="text-slate-700">Active</span>
                  <span className="text-slate-900 font-semibold">40</span>
                </div>
                <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                  <div className="bg-[#0F766E] h-full rounded-full" style={{ width: "33.3%" }}></div>
                </div>
              </div>

              {/* Trialing */}
              <div>
                <div className="flex justify-between text-sm font-medium mb-1.5">
                  <span className="text-slate-700">Trialing</span>
                  <span className="text-slate-900 font-semibold">35</span>
                </div>
                <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                  <div className="bg-[#0D9488] h-full rounded-full" style={{ width: "29.1%" }}></div>
                </div>
              </div>

              {/* Cancelled */}
              <div>
                <div className="flex justify-between text-sm font-medium mb-1.5">
                  <span className="text-slate-700">Cancelled</span>
                  <span className="text-slate-900 font-semibold">15</span>
                </div>
                <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                  <div className="bg-[#475569] h-full rounded-full" style={{ width: "12.5%" }}></div>
                </div>
              </div>

              {/* No plan yet */}
              <div>
                <div className="flex justify-between text-sm font-medium mb-1.5">
                  <span className="text-slate-700">No plan yet</span>
                  <span className="text-slate-900 font-semibold">30</span>
                </div>
                <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                  <div className="bg-[#94A3B8] h-full rounded-full" style={{ width: "25%" }}></div>
                </div>
              </div>
            </div>
          </div>

          <div className="text-xs text-slate-400 pt-4 border-t border-slate-100 mt-4">
            Aggregated counts only. Customer identities remain decoupled from analytics telemetry.
          </div>
        </div>
      </div>

      {/* Bottom Row: Scam checks per week & Product health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Scam checks per week */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <div>
            <h2 className="text-base font-bold text-slate-900">Scam checks per week</h2>
            <p className="text-xs text-slate-500 mt-0.5">Usage counts from the checker (total 900)</p>
          </div>

          <div className="mt-8">
            <div className="flex items-end justify-between gap-4 h-44 pt-6 pb-2 border-b border-slate-200">
              {initialScamChecksPerWeek.map((item) => {
                const heightPct = (item.checks / 280) * 100;
                return (
                  <div key={item.week} className="flex-1 flex flex-col items-center gap-2 group">
                    <span className="text-xs font-semibold text-slate-700 group-hover:text-teal-700">
                      {item.checks}
                    </span>
                    <div className="w-full max-w-[64px] bg-slate-100 rounded-t-sm h-full flex items-end">
                      <div
                        style={{ height: `${heightPct}%` }}
                        className="w-full bg-[#0F766E] rounded-t-sm transition-all hover:bg-[#115E59]"
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[11px] text-slate-500 mt-2 px-1">
              {initialScamChecksPerWeek.map((item) => (
                <span key={item.week} className="truncate text-center">
                  {item.week}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Product health */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Product health</h2>
            <p className="text-xs text-slate-500 mt-0.5">Last 7 days. Alert thresholds not set yet.</p>

            <div className="mt-6 divide-y divide-slate-100">
              <div className="py-3 flex items-center justify-between">
                <span className="text-sm text-slate-700">Checker provider failures</span>
                <span className="text-sm font-semibold text-slate-900">3</span>
              </div>
              <div className="py-3 flex items-center justify-between">
                <span className="text-sm text-slate-700">Open support requests</span>
                <span className="text-sm font-semibold text-slate-900">{openTicketsCount}</span>
              </div>
              <div className="py-3 flex items-center justify-between">
                <span className="text-sm text-slate-700">Suspended accounts</span>
                <span className="text-sm font-semibold text-slate-900">{suspendedCount}</span>
              </div>
              <div className="py-3 flex items-center justify-between">
                <span className="text-sm text-slate-700">Audit log events today</span>
                <span className="text-sm font-semibold text-slate-900">14</span>
              </div>
            </div>
          </div>

          <div className="text-xs text-slate-400 pt-3 border-t border-slate-100 mt-3">
            Real-time status synced with operational telemetry and append-only audit trail.
          </div>
        </div>
      </div>
    </div>
  );
}
