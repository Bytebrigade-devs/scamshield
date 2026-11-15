"use client";

import React, { useState } from "react";
import { Download, ChevronDown } from "lucide-react";
import { useAdmin } from "@/lib/admin-store";
import {
  initialFunnelMetrics,
  initialTrialChanges,
  initialSignupCohorts,
  initialReferralPerformance,
} from "@/lib/seed-data";

export default function AdminAnalyticsPage() {
  const { exportCsvData } = useAdmin();
  const [activeRange, setActiveRange] = useState("30 days");
  const [planFilter, setPlanFilter] = useState("All");

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Analytics</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Conversion, churn, funnel drop-off and referrals. Synthetic data only. Last 30 days.
          </p>
        </div>

        <button
          onClick={() => exportCsvData("Analytics")}
          className="inline-flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg px-3.5 py-2 text-sm font-medium transition shadow-sm self-start sm:self-auto"
        >
          <Download className="w-4 h-4 text-slate-500" />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Filter Controls Row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Time Pills */}
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          {["7 days", "30 days", "90 days", "Custom"].map((range) => (
            <button
              key={range}
              onClick={() => setActiveRange(range)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                activeRange === range
                  ? "bg-[#0F766E] text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              {range}
            </button>
          ))}
        </div>

        {/* Plan Filter Dropdown */}
        <div className="relative">
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="appearance-none bg-white border border-slate-200 rounded-lg px-3.5 py-1.5 pr-8 text-xs font-medium text-slate-700 focus:outline-none focus:border-teal-600 shadow-sm"
          >
            <option value="All">Plan: All</option>
            <option value="Guardian">Guardian</option>
            <option value="Sentinel">Sentinel</option>
            <option value="Aegis">Aegis</option>
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {/* Compare Dropdown */}
        <div className="relative">
          <select
            defaultValue="previous"
            className="appearance-none bg-white border border-slate-200 rounded-lg px-3.5 py-1.5 pr-8 text-xs font-medium text-slate-700 focus:outline-none focus:border-teal-600 shadow-sm"
          >
            <option value="previous">Compare: previous period</option>
            <option value="year">Compare: same period last year</option>
            <option value="none">No comparison</option>
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {/* 4 Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="text-sm font-medium text-slate-600">Visit to signup</div>
          <div className="text-3xl font-bold text-slate-900 mt-2">12.0%</div>
          <div className="text-xs text-slate-500 mt-1">120 of 1,000 visits</div>
        </div>

        {/* Metric 2 */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="text-sm font-medium text-slate-600">Plan to active</div>
          <div className="text-3xl font-bold text-slate-900 mt-2">44%</div>
          <div className="text-xs text-slate-500 mt-1">40 of 90 who chose a plan</div>
        </div>

        {/* Metric 3 */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="text-sm font-medium text-slate-600">Churn</div>
          <div className="text-3xl font-bold text-slate-900 mt-2">16.7%</div>
          <div className="text-xs text-slate-500 mt-1">15 cancelled of 90 on a plan</div>
        </div>

        {/* Metric 4 */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="text-sm font-medium text-slate-600">Referral signups</div>
          <div className="text-3xl font-bold text-slate-900 mt-2">45</div>
          <div className="text-xs text-slate-500 mt-1">37.5% of all signups</div>
        </div>
      </div>

      {/* Mid Row: Funnel drop-off & Trial changes */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Funnel Drop-off (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Funnel drop–off</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Visitors who reach each step. Event names follow the shared event contract (X-02).
            </p>

            <div className="mt-6 space-y-4">
              {initialFunnelMetrics.map((item) => (
                <div key={item.step}>
                  <div className="flex justify-between text-xs font-medium text-slate-700 mb-1">
                    <span>{item.step}</span>
                    <span className="space-x-2">
                      <strong className="text-slate-900">{item.count.toLocaleString()}</strong>
                      <span className="text-slate-500">{item.pctOfTotal}%</span>
                      {item.dropOffPct && (
                        <span className="text-slate-400">({item.dropOffPct}%)</span>
                      )}
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-[#0F766E] h-full rounded-full transition-all"
                      style={{ width: `${item.pctOfTotal}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 pt-3 border-t border-slate-100 text-xs text-slate-500">
            Largest drop-off: completed onboarding to signed up (−60%). Shared with Module 1 to improve the funnel.
          </div>
        </div>

        {/* Trial and Churn Changes (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Trial and churn changes</h2>
            <p className="text-xs text-slate-500 mt-0.5">Subscription state changes in the period (mock).</p>

            <div className="mt-6 divide-y divide-slate-100 text-sm">
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-600">New trials started</span>
                <span className="font-semibold text-slate-900">
                  {initialTrialChanges.newTrialsStarted}
                </span>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-600">Trials converted to active</span>
                <span className="font-semibold text-slate-900">
                  {initialTrialChanges.trialsConvertedToActive}
                </span>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-600">Trials expired</span>
                <span className="font-semibold text-slate-900">
                  {initialTrialChanges.trialsExpired}
                </span>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-600">Cancelled</span>
                <span className="font-semibold text-slate-900">
                  {initialTrialChanges.cancelled}
                </span>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-600">Reactivated</span>
                <span className="font-semibold text-slate-900">
                  {initialTrialChanges.reactivated}
                </span>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="font-semibold text-slate-900">Net active change</span>
                <span className="font-bold text-[#0F766E]">
                  +{initialTrialChanges.netActiveChange}
                </span>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 pt-3 border-t border-slate-100 mt-4">
            Trial status events are emitted on plan selection and recurring lifecycle renew checks.
          </div>
        </div>
      </div>

      {/* Bottom Row: Signup cohorts & Referral performance */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Signup cohorts heatmap (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-6 shadow-sm overflow-hidden">
          <div>
            <h2 className="text-base font-bold text-slate-900">Signup cohorts</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Share of each 5–day signup cohort still on an active or trialing plan.
            </p>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2.5">Cohort</th>
                  <th className="px-3 py-2.5 text-center">Signups</th>
                  <th className="px-3 py-2.5 text-center">Period +1</th>
                  <th className="px-3 py-2.5 text-center">Period +2</th>
                  <th className="px-3 py-2.5 text-center">Period +3</th>
                  <th className="px-3 py-2.5 text-center">Period +4</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {initialSignupCohorts.map((row) => (
                  <tr key={row.cohort}>
                    <td className="px-3 py-2.5 font-medium text-slate-800">{row.cohort}</td>
                    <td className="px-3 py-2.5 text-center text-slate-600 font-semibold">{row.signups}</td>
                    <td className="px-2 py-2.5 text-center">
                      {row.p1 !== null ? (
                        <span className="inline-block px-2.5 py-1 rounded bg-teal-100 text-teal-800 font-medium">
                          {row.p1}%
                        </span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      {row.p2 !== null ? (
                        <span className="inline-block px-2.5 py-1 rounded bg-teal-100 text-teal-800 font-medium">
                          {row.p2}%
                        </span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      {row.p3 !== null ? (
                        <span className="inline-block px-2.5 py-1 rounded bg-teal-100/70 text-teal-800 font-medium">
                          {row.p3}%
                        </span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      {row.p4 !== null ? (
                        <span className="inline-block px-2.5 py-1 rounded bg-teal-100/50 text-teal-800 font-medium">
                          {row.p4}%
                        </span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Referral performance (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Referral performance</h2>
            <p className="text-xs text-slate-500 mt-0.5">Signups and paid plans by source tag.</p>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2">Source</th>
                    <th className="px-3 py-2 text-right">Signups</th>
                    <th className="px-3 py-2 text-right">Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {initialReferralPerformance.map((row) => (
                    <tr key={row.source}>
                      <td className="px-3 py-2.5 text-slate-700">{row.source}</td>
                      <td className="px-3 py-2.5 text-right font-medium text-slate-900">{row.signups}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-teal-700">{row.paid}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50/70 font-semibold text-slate-900">
                    <td className="px-3 py-2.5">Total</td>
                    <td className="px-3 py-2.5 text-right">120</td>
                    <td className="px-3 py-2.5 text-right text-teal-800">40</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-[11px] text-slate-500">
            <p>
              <strong>A/B hook:</strong> landing variant B 13.1% vs A 11.2% visit to signup. Sample too small to call a winner.
            </p>
            <p className="text-slate-400">
              Attribution uses source tags only. No names or messages.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
