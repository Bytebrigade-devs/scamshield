"use client";

import React from "react";
import { initialScamCategories } from "@/lib/seed-data";

const dailyVolume = [
  { day: "Oct 06", count: 48 },
  { day: "Oct 08", count: 56 },
  { day: "Oct 10", count: 62 },
  { day: "Oct 12", count: 71 },
  { day: "Oct 14", count: 68 },
  { day: "Oct 16", count: 79 },
  { day: "Oct 18", count: 85 },
];

export default function ScamIntelligencePage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Scam Intelligence & Threat Feed
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs bg-teal-50 text-teal-800 border border-teal-200 font-medium">
              M5-04 · Canonical X-13 Taxonomy
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Standardized threat taxonomy breakdown from Module 4 AI evaluations. Zero raw customer messages stored.
          </p>
        </div>
      </div>

      {/* Top 3 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="text-sm font-medium text-slate-600">Total checks classified</div>
          <div className="text-3xl font-bold text-slate-900 mt-2">900</div>
          <div className="text-xs text-slate-500 mt-1">Categorized under X-13 contract</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="text-sm font-medium text-slate-600">Top category</div>
          <div className="text-3xl font-bold text-teal-700 mt-2">Phishing</div>
          <div className="text-xs text-slate-500 mt-1">45.5% of submitted checks</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="text-sm font-medium text-slate-600">High-concern flagged</div>
          <div className="text-3xl font-bold text-red-600 mt-2">727</div>
          <div className="text-xs text-slate-500 mt-1">Triggered security warnings</div>
        </div>
      </div>

      {/* Category Breakdown Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">Shared taxonomy breakdown (X-13)</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Standard threat taxonomy agreed between Module 4 AI Checker and Module 5 Analytics.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3">Category</th>
                <th className="px-4 py-3">X-13 Contract Code</th>
                <th className="px-4 py-3 text-right">Volume</th>
                <th className="px-4 py-3 text-right">Share</th>
                <th className="px-5 py-3 text-right">High Concern</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {initialScamCategories.map((cat) => (
                <tr key={cat.code} className="hover:bg-slate-50/70 transition">
                  <td className="px-5 py-3.5 font-semibold text-slate-900">{cat.category}</td>
                  <td className="px-4 py-3.5 text-xs font-mono text-slate-500">{cat.code}</td>
                  <td className="px-4 py-3.5 text-right font-medium text-slate-900">{cat.count}</td>
                  <td className="px-4 py-3.5 text-right font-medium text-teal-700">{cat.percentage}%</td>
                  <td className="px-5 py-3.5 text-right font-semibold text-red-600">{cat.flaggedHighRisk}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Daily Volume Trend */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-base font-bold text-slate-900">14-Day evaluation volume trend</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Spike on Oct 18 (+40% above baseline) triggered automated anomaly alert.
        </p>

        <div className="mt-6 flex items-end justify-between gap-3 h-36 border-b border-slate-200 pb-2">
          {dailyVolume.map((item) => (
            <div key={item.day} className="flex-1 flex flex-col items-center gap-1.5">
              <span className={`text-xs font-semibold ${item.count >= 80 ? "text-red-600" : "text-slate-700"}`}>
                {item.count}
              </span>
              <div className="w-full bg-slate-100 h-24 rounded-t-sm flex items-end">
                <div
                  style={{ height: `${(item.count / 90) * 100}%` }}
                  className={`w-full rounded-t-sm transition-all ${
                    item.count >= 80 ? "bg-amber-600" : "bg-[#0F766E]"
                  }`}
                ></div>
              </div>
              <span className="text-[11px] text-slate-400 mt-1">{item.day}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
