"use client";

import React from "react";
import { ShieldCheck, Lock, CheckCircle2, XCircle, AlertOctagon } from "lucide-react";

export default function AdminRolesPage() {
  const capabilities = [
    { name: "View signups, plans and status", support: "Allowed", super: "Allowed" },
    { name: "View usage and category charts (counts only)", support: "Allowed", super: "Allowed" },
    { name: "Search and open user records", support: "Allowed", super: "Allowed" },
    { name: "Suspend or reactivate accounts", support: "Allowed", super: "Allowed" },
    { name: "Reply to support requests", support: "Allowed", super: "Allowed" },
    { name: "View mock revenue", support: "Not allowed", super: "Allowed" },
    { name: "Change admin roles", support: "Not allowed", super: "Allowed" },
    { name: "See vault passwords, secret notes or checked messages", support: "Never", super: "Never" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Roles and permissions</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          What each admin role can open and change. Draft for review.
        </p>
      </div>

      {/* Governance Banner */}
      <div className="bg-teal-50/60 border border-teal-200 rounded-xl p-4 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-teal-700 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-teal-900">
          Every role change and every denied attempt is written to the audit log. Final limits follow the team access decision (M5-10).
        </p>
      </div>

      {/* Role Summary Cards (2 columns) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <h2 className="text-base font-bold text-slate-900">Super admin</h2>
          </div>
          <p className="text-sm text-slate-600 mt-2 leading-relaxed">
            Full access to business views, including revenue, plus user actions and role changes.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-teal-500"></span>
            <h2 className="text-base font-bold text-slate-900">Support admin</h2>
          </div>
          <p className="text-sm text-slate-600 mt-2 leading-relaxed">
            Can view and suspend users and answer support requests. Cannot see revenue or change roles.
          </p>
        </div>
      </div>

      {/* Capability Matrix Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Capability</th>
                <th className="px-6 py-4 text-center">Support admin</th>
                <th className="px-6 py-4 text-center">Super admin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {capabilities.map((row) => (
                <tr key={row.name} className="hover:bg-slate-50/70 transition">
                  <td className="px-6 py-4 font-medium text-slate-900">
                    {row.name}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {row.support === "Allowed" ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Allowed
                      </span>
                    ) : row.support === "Not allowed" ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                        <XCircle className="w-3.5 h-3.5 text-slate-400" />
                        Not allowed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-700 bg-red-50 px-2.5 py-1 rounded-full">
                        <AlertOctagon className="w-3.5 h-3.5" />
                        Never
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {row.super === "Allowed" ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Allowed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-700 bg-red-50 px-2.5 py-1 rounded-full">
                        <AlertOctagon className="w-3.5 h-3.5" />
                        Never
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-4 bg-slate-50/70 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-teal-700" />
            <span>Strict Zero-Knowledge boundary: sensitive credentials never leave client encryption.</span>
          </div>
          <span className="text-[11px] text-slate-400">Team Decision M5-10</span>
        </div>
      </div>
    </div>
  );
}
