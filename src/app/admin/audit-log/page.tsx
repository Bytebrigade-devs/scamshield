"use client";

import React, { useState } from "react";
import { Download, Search, ChevronDown, ShieldCheck, Lock } from "lucide-react";
import { useAdmin } from "@/lib/admin-store";

export default function AdminAuditLogPage() {
  const { auditLogs, exportCsvData } = useAdmin();
  const [searchTerm, setSearchTerm] = useState("");
  const [actionFilter, setActionFilter] = useState("All");
  const [adminFilter, setAdminFilter] = useState("All");
  const [resultFilter, setResultFilter] = useState("All");
  const [timeRange, setTimeRange] = useState("Last 7 days");

  const filteredLogs = auditLogs.filter((log) => {
    const matchesSearch =
      log.admin.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.target.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.reason.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesAction = actionFilter === "All" || log.action === actionFilter;
    const matchesAdmin = adminFilter === "All" || log.admin === adminFilter;
    const matchesResult = resultFilter === "All" || log.result === resultFilter;

    return matchesSearch && matchesAction && matchesAdmin && matchesResult;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Audit log</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Every admin action is recorded and cannot be edited. Synthetic data only.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
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

          <button
            onClick={() => exportCsvData("Audit_Log")}
            className="inline-flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg px-3.5 py-2 text-sm font-medium transition shadow-sm"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <input
            type="text"
            placeholder="Search by admin, action or target"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3.5 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-teal-600 shadow-sm"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        </div>

        <div className="relative w-full sm:w-44">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="w-full appearance-none bg-white border border-slate-200 rounded-lg px-3.5 py-2 pr-8 text-sm text-slate-700 focus:outline-none focus:border-teal-600 shadow-sm"
          >
            <option value="All">Action: All</option>
            <option value="Suspended account">Suspended account</option>
            <option value="Reactivated account">Reactivated account</option>
            <option value="Viewed user record">Viewed user record</option>
            <option value="Exported CSV">Exported CSV</option>
            <option value="Viewed revenue">Viewed revenue</option>
            <option value="Changed role">Changed role</option>
          </select>
          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        <div className="relative w-full sm:w-40">
          <select
            value={adminFilter}
            onChange={(e) => setAdminFilter(e.target.value)}
            className="w-full appearance-none bg-white border border-slate-200 rounded-lg px-3.5 py-2 pr-8 text-sm text-slate-700 focus:outline-none focus:border-teal-600 shadow-sm"
          >
            <option value="All">Admin: All</option>
            <option value="Super admin">Super admin</option>
            <option value="Support admin">Support admin</option>
          </select>
          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        <div className="relative w-full sm:w-36">
          <select
            value={resultFilter}
            onChange={(e) => setResultFilter(e.target.value)}
            className="w-full appearance-none bg-white border border-slate-200 rounded-lg px-3.5 py-2 pr-8 text-sm text-slate-700 focus:outline-none focus:border-teal-600 shadow-sm"
          >
            <option value="All">Result: All</option>
            <option value="Success">Success</option>
            <option value="Denied">Denied</option>
          </select>
          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Time</th>
                <th className="px-4 py-3.5">Admin</th>
                <th className="px-5 py-3.5">Action</th>
                <th className="px-4 py-3.5">Target</th>
                <th className="px-4 py-3.5">Result</th>
                <th className="px-5 py-3.5">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-5 py-3.5 text-xs text-slate-600 whitespace-nowrap font-medium">
                    {log.time}
                  </td>
                  <td className="px-4 py-3.5 text-slate-800 font-medium">
                    {log.admin}
                  </td>
                  <td className="px-5 py-3.5 text-slate-900 font-semibold">
                    {log.action}
                  </td>
                  <td className="px-4 py-3.5 text-slate-700">
                    {log.target}
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                        log.result === "Success" ? "text-emerald-700" : "text-red-700"
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          log.result === "Success" ? "bg-emerald-500" : "bg-red-500"
                        }`}
                      ></span>
                      {log.result}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-500">
                    {log.reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer info banner */}
        <div className="p-4 bg-slate-50/60 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-teal-700" />
            <span>
              <strong>Tamper-Proof Guarantee:</strong> UPDATE and DELETE permissions are permanently revoked on public.audit_logs.
            </span>
          </div>
          <span className="text-[11px] text-slate-400">IS2901 M5 Compliance</span>
        </div>
      </div>
    </div>
  );
}
