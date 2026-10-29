"use client";

import React from "react";


export default function AdminSafetyScorePage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Digital Safety Score</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Admin aggregation view. Draft design for layout review.
        </p>
      </div>

      {/* Amber Warning Notice: Formula not approved */}
      <div className="bg-amber-50/90 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 flex-shrink-0 mt-1.5"></span>
        <div className="text-sm text-amber-950">
          <strong className="font-semibold">Formula not approved</strong> — No weights or thresholds are approved, so no real scores are shown. A missing input is never shown as safe.
        </div>
      </div>

      {/* 3 Pillar Component Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Pillar 1: Password health */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">Password health</h2>
              <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                Under review
              </span>
            </div>
            <div className="text-xs text-slate-400 mt-0.5 font-medium">Module 3</div>
            <p className="text-xs text-slate-600 mt-3 leading-relaxed">
              Counts only: weak and reused totals. Never passwords, sites or notes.
            </p>
          </div>

          <div className="pt-6 border-t border-slate-100 mt-6">
            <div className="text-xl font-bold text-slate-400">Not scored yet</div>
          </div>
        </div>

        {/* Pillar 2: Account security */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">Account security</h2>
              <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                Under review
              </span>
            </div>
            <div className="text-xs text-slate-400 mt-0.5 font-medium">Module 2</div>
            <p className="text-xs text-slate-600 mt-3 leading-relaxed">
              Account-security facts only. Plan, price and payment never affect the score.
            </p>
          </div>

          <div className="pt-6 border-t border-slate-100 mt-6">
            <div className="text-xl font-bold text-slate-400">Not scored yet</div>
          </div>
        </div>

        {/* Pillar 3: Scam activity */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">Scam activity</h2>
              <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                Non-scoring proposal
              </span>
            </div>
            <div className="text-xs text-slate-400 mt-0.5 font-medium">Module 4</div>
            <p className="text-xs text-slate-600 mt-3 leading-relaxed">
              Availability and limitations only. Running more checks never raises the score.
            </p>
          </div>

          <div className="pt-6 border-t border-slate-100 mt-6">
            <div className="text-xl font-bold text-slate-400">Not scored yet</div>
          </div>
        </div>
      </div>

      {/* Per-user score view */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">Per–user score view</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Components shown separately. Synthetic users, counts only.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">User</th>
                <th className="px-4 py-3.5">Password health</th>
                <th className="px-4 py-3.5">Account security</th>
                <th className="px-4 py-3.5">Scam activity</th>
                <th className="px-4 py-3.5 text-right">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr className="hover:bg-slate-50/70 transition">
                <td className="px-5 py-3.5 font-semibold text-slate-900">Nimal P.</td>
                <td className="px-4 py-3.5 text-slate-700">2 reused, 1 weak</td>
                <td className="px-4 py-3.5 text-slate-700">Login protection on</td>
                <td className="px-4 py-3.5 text-slate-400 italic">Not scored yet</td>
                <td className="px-4 py-3.5 text-right font-medium text-slate-400">Not scored yet</td>
              </tr>
              <tr className="hover:bg-slate-50/70 transition">
                <td className="px-5 py-3.5 font-semibold text-slate-900">Sachini R.</td>
                <td className="px-4 py-3.5 text-slate-400">Not available</td>
                <td className="px-4 py-3.5 text-slate-400">Not available</td>
                <td className="px-4 py-3.5 text-slate-400 italic">Not scored yet</td>
                <td className="px-4 py-3.5 text-right font-medium text-slate-400">Not scored yet</td>
              </tr>
              <tr className="hover:bg-slate-50/70 transition">
                <td className="px-5 py-3.5 font-semibold text-slate-900">Kasun D.</td>
                <td className="px-4 py-3.5 text-slate-400">Not available</td>
                <td className="px-4 py-3.5 text-slate-400">Not available</td>
                <td className="px-4 py-3.5 text-slate-400 italic">Not scored yet</td>
                <td className="px-4 py-3.5 text-right font-medium text-slate-400">Not scored yet</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Rules the aggregation must follow card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-base font-bold text-slate-900 mb-4">
          Rules the aggregation must follow
        </h2>

        <div className="divide-y divide-slate-100 text-sm">
          <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="font-medium text-slate-900">Missing input</span>
            <span className="text-slate-600 text-sm">Shown as &quot;Not scored yet&quot;, never as zero or safe</span>
          </div>

          <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="font-medium text-slate-900">Subscription</span>
            <span className="text-slate-600 text-sm">Plan, price and payment status never change the score</span>
          </div>

          <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="font-medium text-slate-900">Scam checks</span>
            <span className="text-slate-600 text-sm">Running more checks never raises safety</span>
          </div>

          <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="font-medium text-slate-900">Privacy</span>
            <span className="text-slate-600 text-sm">No passwords, notes or raw messages reach this view</span>
          </div>
        </div>
      </div>
    </div>
  );
}
