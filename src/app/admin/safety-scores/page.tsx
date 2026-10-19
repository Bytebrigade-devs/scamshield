"use client";

import React, { useState } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Info,
  CheckCircle,
  HelpCircle,
  TrendingUp,
  Layers,
  ArrowRight,
} from "lucide-react";
import { useAdmin } from "@/lib/admin-store";

export default function SafetyScoreCoordinatorPage() {
  const { users } = useAdmin();

  // Score brackets
  const safeCount = users.filter((u) => u.safetyScore && u.safetyScore >= 80).length;
  const fairCount = users.filter((u) => u.safetyScore && u.safetyScore >= 60 && u.safetyScore < 80).length;
  const atRiskCount = users.filter((u) => u.safetyScore && u.safetyScore < 60).length;
  const uncalculatedCount = users.filter((u) => u.safetyScore === null || u.safetyScore === undefined).length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-[#eaf1f7]">
              Digital Safety Score — Admin View
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs bg-[#2dd4bf]/20 text-[#2dd4bf] border border-[#2dd4bf]/40">
              Module 6 Coordination · M6-05
            </span>
          </div>
          <p className="text-xs text-[#8ea0b3] mt-1">
            Coordinating three safe module summaries (M2 Account Security + M3 Vault Health + M4 Scam Activity) into an aggregate score.
          </p>
        </div>
      </div>

      {/* Coordinator Responsibilities Banner */}
      <div className="p-4 rounded-xl bg-[#0e1726] border border-[#1f2d45] space-y-2 text-xs">
        <div className="flex items-center gap-2 font-semibold text-[#2dd4bf]">
          <Layers className="w-4 h-4" />
          <span>Module 6 Team Agreement (Confirmed 18 October 2026)</span>
        </div>
        <p className="text-[#8ea0b3] leading-relaxed">
          Module 6 is shared across all five teammates. Vishmi (@Vish-Himaya) coordinates the design assembly (M6-09), calculation logic, and the admin aggregate view (M6-05). Each owner provides an isolated summary card.
        </p>
      </div>

      {/* Score Health Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl bg-[#0e1726] border border-[#1f2d45] space-y-2">
          <div className="flex items-center justify-between text-xs text-[#8ea0b3]">
            <span>Optimal (&ge; 80)</span>
            <ShieldCheck className="w-4 h-4 text-[#34d399]" />
          </div>
          <div className="text-3xl font-bold text-[#34d399]">{safeCount}</div>
          <div className="text-[11px] text-[#8ea0b3]">Strong password hygiene & 2FA</div>
        </div>

        <div className="p-5 rounded-xl bg-[#0e1726] border border-[#1f2d45] space-y-2">
          <div className="flex items-center justify-between text-xs text-[#8ea0b3]">
            <span>Fair (60 - 79)</span>
            <ShieldAlert className="w-4 h-4 text-[#f59e0b]" />
          </div>
          <div className="text-3xl font-bold text-[#f59e0b]">{fairCount}</div>
          <div className="text-[11px] text-[#8ea0b3]">E.g. Reused passwords detected</div>
        </div>

        <div className="p-5 rounded-xl bg-[#0e1726] border border-[#1f2d45] space-y-2">
          <div className="flex items-center justify-between text-xs text-[#8ea0b3]">
            <span>At Risk (&lt; 60)</span>
            <AlertTriangle className="w-4 h-4 text-[#f06a6a]" />
          </div>
          <div className="text-3xl font-bold text-[#f06a6a]">{atRiskCount}</div>
          <div className="text-[11px] text-[#8ea0b3]">Multiple weak credentials</div>
        </div>

        <div className="p-5 rounded-xl bg-[#0e1726] border border-[#1f2d45] space-y-2">
          <div className="flex items-center justify-between text-xs text-[#8ea0b3]">
            <span>Pending Calculation</span>
            <HelpCircle className="w-4 h-4 text-[#8ea0b3]" />
          </div>
          <div className="text-3xl font-bold text-[#eaf1f7]">{uncalculatedCount}</div>
          <div className="text-[11px] text-[#8ea0b3]">Missing vault or account signals</div>
        </div>
      </div>

      {/* Three Input Signals Breakdown */}
      <div className="p-5 rounded-xl bg-[#0e1726] border border-[#1f2d45] space-y-4">
        <h2 className="text-sm font-semibold text-[#eaf1f7]">
          The Three Safe Inputs (Zero Private Data Boundary)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* Input 1: Vault Health (M3) */}
          <div className="p-4 rounded-lg bg-[#13203a] border border-[#1f2d45] space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#eaf1f7]">1. Password Health (M3)</span>
              <span className="text-[10px] text-[#2dd4bf] font-mono">Owner: Prashni</span>
            </div>
            <p className="text-[#8ea0b3] leading-relaxed">
              Provides counts of reused, weak, and leaked credentials. <strong>Never transmits passwords, notes, or encryption keys.</strong>
            </p>
            <div className="pt-2 text-[11px] text-[#34d399] font-medium">✓ Input format agreed</div>
          </div>

          {/* Input 2: Account Security (M2) */}
          <div className="p-4 rounded-lg bg-[#13203a] border border-[#1f2d45] space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#eaf1f7]">2. Account Security (M2)</span>
              <span className="text-[10px] text-[#2dd4bf] font-mono">Owner: Lahiru</span>
            </div>
            <p className="text-[#8ea0b3] leading-relaxed">
              Provides authentication strength, 2FA status, and session age. <strong>Subscription tier or payment never influences the score.</strong>
            </p>
            <div className="pt-2 text-[11px] text-[#34d399] font-medium">✓ Boundary enforced</div>
          </div>

          {/* Input 3: Scam Activity (M4) */}
          <div className="p-4 rounded-lg bg-[#13203a] border border-[#1f2d45] space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#eaf1f7]">3. Scam Activity (M4)</span>
              <span className="text-[10px] text-[#2dd4bf] font-mono">Owner: Svishwa</span>
            </div>
            <p className="text-[#8ea0b3] leading-relaxed">
              Provides check counts and detected category indicators. Currently marked <strong>non-scoring</strong> until protective accuracy is reviewed.
            </p>
            <div className="pt-2 text-[11px] text-[#f59e0b] font-medium">⏳ Model under review</div>
          </div>
        </div>
      </div>

      {/* Cohort Safety Score Table */}
      <div className="rounded-xl bg-[#0e1726] border border-[#1f2d45] overflow-hidden">
        <div className="p-4 border-b border-[#1f2d45] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#eaf1f7]">
            Active User Safety Score Snapshot
          </h2>
          <span className="text-xs text-[#8ea0b3]">Formula Version: 1.0 (Draft)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#1f2d45] text-[#8ea0b3] bg-[#0b1322]">
                <th className="py-3 px-4 font-medium">User</th>
                <th className="py-3 px-4 font-medium">Plan</th>
                <th className="py-3 px-4 font-medium">Calculated Score</th>
                <th className="py-3 px-4 font-medium">Rating</th>
                <th className="py-3 px-4 font-medium">Primary Recommendation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1f2d45]">
              {users.map((u) => {
                const score = u.safetyScore;
                let rating = "Not scored yet";
                let badgeClass = "text-[#8ea0b3] border-[#1f2d45]";
                let recommendation = "Perform initial security check";

                if (score !== null && score !== undefined) {
                  if (score >= 80) {
                    rating = "Optimal";
                    badgeClass = "text-[#34d399] border-[#34d399]/40 bg-[#34d399]/10";
                    recommendation = "Keep up periodic vault reviews";
                  } else if (score >= 60) {
                    rating = "Fair";
                    badgeClass = "text-[#f59e0b] border-[#f59e0b]/40 bg-[#f59e0b]/10";
                    recommendation = "Change 2 reused passwords in vault";
                  } else {
                    rating = "At Risk";
                    badgeClass = "text-[#f06a6a] border-[#f06a6a]/40 bg-[#f06a6a]/10";
                    recommendation = "Enable 2FA and replace weak credentials";
                  }
                }

                return (
                  <tr key={u.id} className="hover:bg-[#13203a]/50">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[#eaf1f7]">{u.name}</div>
                      <div className="text-[11px] text-[#8ea0b3]">{u.email}</div>
                    </td>
                    <td className="py-3 px-4 text-[#8ea0b3]">{u.plan}</td>
                    <td className="py-3 px-4 font-mono font-bold text-sm text-[#eaf1f7]">
                      {score !== null && score !== undefined ? `${score}/100` : "—"}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${badgeClass}`}>
                        {rating}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[#8ea0b3]">{recommendation}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
