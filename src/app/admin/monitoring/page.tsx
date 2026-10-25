"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ShieldAlert,
  ShieldCheck,
  ChevronDown,
  ArrowLeft,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { useAdmin } from "@/lib/admin-store";
import {
  initialMonitoringComponents,
  initialMonitoringChecks,
  initialFailedSignins,
  initialScamChecksPerWeek,
} from "@/lib/seed-data";
import { SystemAlert } from "@/lib/types/admin";

export default function AdminMonitoringPage() {
  const { systemAlerts, acknowledgeAlert } = useAdmin();
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState("Last 24 hours");

  const selectedAlert = systemAlerts.find((a) => a.id === selectedAlertId);

  // Page 10: Alert Detail View
  if (selectedAlert) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => setSelectedAlertId(null)}
          className="inline-flex items-center gap-2 text-sm font-semibold text-teal-800 hover:text-teal-900 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to monitoring
        </button>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {selectedAlert.alertType}
              </h1>
              <span
                className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                  selectedAlert.severity === "High"
                    ? "bg-red-50 text-red-700 border-red-200"
                    : selectedAlert.severity === "Medium"
                    ? "bg-amber-50 text-amber-700 border-amber-200"
                    : "bg-slate-50 text-slate-700 border-slate-200"
                }`}
              >
                {selectedAlert.severity}
              </span>
              <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
                {selectedAlert.status}
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Alert detected {selectedAlert.timeDetected}. Synthetic data only.
            </p>
          </div>
        </div>

        {/* 2-Column Grid matching Page 10 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Summary + What we know (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Summary card */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h2 className="text-base font-bold text-slate-900 mb-4">Summary</h2>
              <div className="divide-y divide-slate-100 text-sm">
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-500">Alert type</span>
                  <span className="font-semibold text-slate-900">{selectedAlert.alertType}</span>
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-500">Severity</span>
                  <span className="font-medium text-slate-900">{selectedAlert.severity}</span>
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-500">Status</span>
                  <span className="font-medium text-slate-900">{selectedAlert.status}</span>
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-500">Component</span>
                  <span className="font-semibold text-slate-900">{selectedAlert.component}</span>
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-500">Related module</span>
                  <span className="font-medium text-slate-900">{selectedAlert.relatedModule}</span>
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-500">Time detected</span>
                  <span className="font-medium text-slate-900">{selectedAlert.timeDetected}</span>
                </div>
                <div className="py-2.5 flex items-start justify-between gap-4">
                  <span className="text-slate-500 flex-shrink-0">Reason</span>
                  <span className="font-medium text-slate-900 text-right">{selectedAlert.reason}</span>
                </div>
              </div>
            </div>

            {/* What we know card */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h2 className="text-base font-bold text-slate-900">What we know</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Counts and component status only. No message text.
              </p>

              <div className="mt-4 space-y-2.5">
                {selectedAlert.whatWeKnow.map((item, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 rounded-lg text-xs text-slate-700 leading-relaxed border border-slate-100">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Timeline + Suggested next steps + Actions (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            {/* Timeline */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h2 className="text-base font-bold text-slate-900">Timeline</h2>
              <p className="text-xs text-slate-500 mt-0.5">Latest events for this alert.</p>

              <div className="mt-4 space-y-3">
                {selectedAlert.timeline.map((step, idx) => (
                  <div key={idx} className="flex items-start gap-3 text-xs">
                    <span className="font-mono text-slate-400 font-semibold flex-shrink-0">{step.time}</span>
                    <span className="text-slate-700 leading-snug">{step.event}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Suggested next steps */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h2 className="text-base font-bold text-slate-900">Suggested next steps</h2>
              <p className="text-xs text-slate-500 mt-0.5">For the admin to review.</p>

              <div className="mt-4 space-y-2">
                {selectedAlert.suggestedSteps.map((step, idx) => (
                  <div key={idx} className="text-xs text-slate-800 font-medium">
                    {step}
                  </div>
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-3">
              <button
                onClick={() => {
                  acknowledgeAlert(selectedAlert.id);
                  alert("Alert acknowledged and recorded in the audit trail.");
                }}
                className="w-full py-2.5 px-4 rounded-lg bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-semibold transition shadow-sm"
              >
                Acknowledge alert
              </button>

              <Link
                href="/admin/support-inbox"
                className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition"
              >
                <span>Open related support request</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              </Link>

              <p className="text-[11px] text-slate-400 text-center">
                Acknowledging is written to the audit log.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Page 9: Main System Monitoring View
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">System monitoring</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Component health, alerts and activity trends. Synthetic data only. Last checked Oct 20, 2026, 09:45.
          </p>
        </div>

        <div className="relative self-start sm:self-auto">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="appearance-none bg-white border border-slate-200 rounded-lg px-3.5 py-2 pr-9 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:border-teal-600 shadow-sm"
          >
            <option>Last 24 hours</option>
            <option>Last 7 days</option>
            <option>Last 30 days</option>
          </select>
          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {/* Privacy Notice Banner */}
      <div className="bg-teal-50/60 border border-teal-200 rounded-xl p-4 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-teal-700 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-teal-900">
          Monitoring shows component status and counts only. It never includes passwords, notes or message text.
        </p>
      </div>

      {/* Top 3 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="text-sm font-medium text-slate-600">Operational components</div>
          <div className="text-3xl font-bold text-slate-900 mt-2">5 of 6</div>
          <div className="text-xs text-slate-500 mt-1">Web app, admin, database, sign–in, payments</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="text-sm font-medium text-slate-600">Need attention</div>
          <div className="text-3xl font-bold text-amber-600 mt-2">1</div>
          <div className="text-xs text-slate-500 mt-1">Scam checker (AI provider)</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="text-sm font-medium text-slate-600">Last monitoring check</div>
          <div className="text-3xl font-bold text-slate-900 mt-2">09:45</div>
          <div className="text-xs text-slate-500 mt-1">5 checks in the last 45 minutes</div>
        </div>
      </div>

      {/* Components Status & Recent Checks (2 columns) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Components (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-base font-bold text-slate-900">Components</h2>
          <p className="text-xs text-slate-500 mt-0.5">Current status of each part of ScamShield. Synthetic.</p>

          <div className="mt-4 divide-y divide-slate-100">
            {initialMonitoringComponents.map((comp) => (
              <div key={comp.id} className="py-3 flex items-center justify-between text-sm">
                <div>
                  <div className="font-semibold text-slate-900">{comp.name}</div>
                  <div className="text-xs text-slate-500">{comp.detail}</div>
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                    comp.status === "Operational"
                      ? "text-emerald-700"
                      : comp.status === "Needs attention"
                      ? "text-amber-700"
                      : "text-red-700"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      comp.status === "Operational"
                        ? "bg-emerald-500"
                        : comp.status === "Needs attention"
                        ? "bg-amber-500"
                        : "bg-red-500"
                    }`}
                  ></span>
                  {comp.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Monitoring Checks (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-base font-bold text-slate-900">Recent monitoring checks</h2>
          <p className="text-xs text-slate-500 mt-0.5">Latest automated checks. Synthetic.</p>

          <div className="mt-4 divide-y divide-slate-100 text-xs">
            {initialMonitoringChecks.map((chk) => (
              <div key={chk.id} className="py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-slate-400 font-semibold">{chk.time}</span>
                  <span className="font-medium text-slate-800">{chk.name}</span>
                </div>
                <span
                  className={`inline-flex items-center gap-1 font-semibold ${
                    chk.result === "Passed" ? "text-emerald-700" : "text-amber-700"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      chk.result === "Passed" ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                  ></span>
                  {chk.result}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Alerts Section */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">Alerts</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            5 active alerts: 1 high, 1 medium, 3 low. Examples only; alert thresholds are not set yet.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3">Alert type</th>
                <th className="px-3 py-3">Severity</th>
                <th className="px-3 py-3">Time detected</th>
                <th className="px-4 py-3">Component</th>
                <th className="px-5 py-3">Reason</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {systemAlerts.map((alt) => (
                <tr key={alt.id} className="hover:bg-slate-50/70 transition">
                  <td className="px-5 py-3.5 font-semibold text-slate-900 leading-tight">
                    {alt.alertType}
                  </td>
                  <td className="px-3 py-3.5">
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                        alt.severity === "High"
                          ? "text-red-700"
                          : alt.severity === "Medium"
                          ? "text-amber-700"
                          : "text-slate-600"
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          alt.severity === "High"
                            ? "bg-red-500"
                            : alt.severity === "Medium"
                            ? "bg-amber-500"
                            : "bg-slate-300"
                        }`}
                      ></span>
                      {alt.severity}
                    </span>
                  </td>
                  <td className="px-3 py-3.5 text-xs text-slate-500 whitespace-nowrap">
                    {alt.timeDetected}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-slate-700 font-medium">
                    {alt.component}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-600 max-w-sm">
                    {alt.reason}
                  </td>
                  <td className="px-4 py-3.5 text-right whitespace-nowrap">
                    <button
                      onClick={() => setSelectedAlertId(alt.id)}
                      className="px-3 py-1 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition"
                    >
                      View details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4 Bottom Mini Panels: Scam activity, Password security, Digital Safety Score, Failed sign-ins */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Scam activity */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Scam activity</h3>
            <p className="text-[11px] text-slate-400">Checks per week. Counts only.</p>

            <div className="mt-4 flex items-end justify-between gap-2 h-28 border-b border-slate-200 pb-1">
              {initialScamChecksPerWeek.map((item) => (
                <div key={item.week} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] font-semibold text-slate-600">{item.checks}</span>
                  <div className="w-full bg-slate-100 h-20 rounded-t-sm flex items-end">
                    <div
                      style={{ height: `${(item.checks / 280) * 100}%` }}
                      className="w-full bg-[#0F766E] rounded-t-sm"
                    ></div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 mt-1">
              <span>Sep 21</span>
              <span>Sep 28</span>
              <span>Oct 5</span>
              <span>Oct 12</span>
            </div>
          </div>
          <div className="text-[11px] text-slate-400 mt-2">Counts only, never message text.</div>
        </div>

        {/* Password security */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Password security</h3>
            <p className="text-[11px] text-slate-400">Flags from Module 3. Counts only.</p>

            <div className="mt-4 divide-y divide-slate-100 text-xs">
              <div className="py-2 flex justify-between">
                <span className="text-slate-600">Reused passwords</span>
                <span className="font-semibold text-slate-900">9 users</span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-slate-600">Weak passwords</span>
                <span className="font-semibold text-slate-900">15 users</span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-slate-600">Common passwords</span>
                <span className="font-semibold text-slate-900">6 users</span>
              </div>
            </div>
          </div>
          <div className="text-[11px] text-slate-400 mt-2">Never passwords, sites or notes.</div>
        </div>

        {/* Digital Safety Score */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Digital Safety Score</h3>
            <p className="text-[11px] text-slate-400">Availability, not a score.</p>

            <div className="mt-3">
              <span className="inline-block text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                Not available
              </span>
              <p className="text-[11px] text-slate-500 mt-1.5 leading-snug">
                Formula and weights are not approved, so no score is calculated.
              </p>
            </div>

            <div className="mt-3 divide-y divide-slate-100 text-xs">
              <div className="py-1.5 flex justify-between">
                <span className="text-slate-500">Password health</span>
                <span className="text-slate-700 font-medium">Under review</span>
              </div>
              <div className="py-1.5 flex justify-between">
                <span className="text-slate-500">Account security</span>
                <span className="text-slate-700 font-medium">Under review</span>
              </div>
              <div className="py-1.5 flex justify-between">
                <span className="text-slate-500">Scam activity</span>
                <span className="text-slate-700 font-medium">Non–scoring proposal</span>
              </div>
            </div>
          </div>
        </div>

        {/* Failed sign-ins */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Failed sign–ins</h3>
            <p className="text-[11px] text-slate-400">Daily, Oct 14 to Oct 20.</p>

            <div className="mt-4 flex items-end justify-between gap-1.5 h-28 border-b border-slate-200 pb-1">
              {initialFailedSignins.map((item) => (
                <div key={item.day} className="flex-1 flex flex-col items-center gap-1">
                  <span className={`text-[10px] font-semibold ${item.count === 12 ? "text-red-600" : "text-slate-600"}`}>
                    {item.count}
                  </span>
                  <div className="w-full bg-slate-100 h-20 rounded-t-sm flex items-end">
                    <div
                      style={{ height: `${(item.count / 14) * 100}%` }}
                      className={`w-full rounded-t-sm ${
                        item.count === 12 ? "bg-amber-600" : "bg-[#0F766E]"
                      }`}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 mt-1 px-1">
              {initialFailedSignins.map((item) => (
                <span key={item.day}>{item.day}</span>
              ))}
            </div>
          </div>
          <div className="text-[11px] text-slate-400 mt-2">
            Needs authentication logs from Module 2. Example data until they exist.
          </div>
        </div>
      </div>
    </div>
  );
}
