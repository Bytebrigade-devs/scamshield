"use client";

import React, { useState } from "react";
import {
  ClipboardList,
  LifeBuoy,
  ShieldCheck,
  Search,
  Filter,
  CheckCircle,
  Clock,
  AlertTriangle,
  History,
  MessageSquare,
  Lock,
} from "lucide-react";
import { useAdmin } from "@/lib/admin-store";
import { AuditLogEntry, SupportTicket, VerdictFeedback } from "@/lib/types/admin";

export default function SupportAndAuditPage() {
  const {
    auditLogs,
    supportTickets,
    verdictFeedback,
    updateTicketStatus,
  } = useAdmin();

  const [activeTab, setActiveTab] = useState<"audit" | "tickets" | "feedback">("audit");
  const [auditSearch, setAuditSearch] = useState("");
  const [auditActionFilter, setAuditActionFilter] = useState("All");

  // Filtered audit logs
  const filteredAudit = auditLogs.filter((log) => {
    const matchesSearch =
      log.targetUser.toLowerCase().includes(auditSearch.toLowerCase()) ||
      log.details.toLowerCase().includes(auditSearch.toLowerCase()) ||
      log.adminEmail.toLowerCase().includes(auditSearch.toLowerCase());
    const matchesAction = auditActionFilter === "All" || log.action === auditActionFilter;
    return matchesSearch && matchesAction;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-[#eaf1f7]">
              Operations: Support & audit log
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs bg-[#13203a] text-[#8ea0b3] border border-[#1f2d45]">
              M5-11 · M5-12
            </span>
          </div>
          <p className="text-xs text-[#8ea0b3] mt-1">
            Immutable administrative event trail, user inquiries, and AI scam verdict reviews.
          </p>
        </div>
      </div>

      {/* View Switcher Tabs */}
      <div className="flex border-b border-[#1f2d45] gap-4 text-xs font-medium">
        <button
          onClick={() => setActiveTab("audit")}
          className={`pb-3 px-1 border-b-2 transition flex items-center gap-2 ${
            activeTab === "audit"
              ? "border-[#2dd4bf] text-[#2dd4bf]"
              : "border-transparent text-[#8ea0b3] hover:text-[#eaf1f7]"
          }`}
        >
          <History className="w-4 h-4" />
          <span>Immutable Audit Log (M5-11)</span>
          <span className="px-2 py-0.5 rounded-full bg-[#13203a] text-[10px] text-[#8ea0b3] border border-[#1f2d45]">
            {auditLogs.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("tickets")}
          className={`pb-3 px-1 border-b-2 transition flex items-center gap-2 ${
            activeTab === "tickets"
              ? "border-[#2dd4bf] text-[#2dd4bf]"
              : "border-transparent text-[#8ea0b3] hover:text-[#eaf1f7]"
          }`}
        >
          <LifeBuoy className="w-4 h-4" />
          <span>Support Inbox (M5-12)</span>
          <span className="px-2 py-0.5 rounded-full bg-[#13203a] text-[10px] text-[#f59e0b] border border-[#1f2d45]">
            {supportTickets.filter((t) => t.status === "Open").length} open
          </span>
        </button>

        <button
          onClick={() => setActiveTab("feedback")}
          className={`pb-3 px-1 border-b-2 transition flex items-center gap-2 ${
            activeTab === "feedback"
              ? "border-[#2dd4bf] text-[#2dd4bf]"
              : "border-transparent text-[#8ea0b3] hover:text-[#eaf1f7]"
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>AI Verdict Feedback</span>
          <span className="px-2 py-0.5 rounded-full bg-[#13203a] text-[10px] text-[#8ea0b3] border border-[#1f2d45]">
            {verdictFeedback.length}
          </span>
        </button>
      </div>

      {/* TAB 1: IMMUTABLE AUDIT LOG */}
      {activeTab === "audit" && (
        <div className="space-y-4">
          {/* Audit Search Toolbar */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-8 relative">
              <Search className="w-4 h-4 text-[#8ea0b3] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                placeholder="Search audit actions, administrator, or target email..."
                className="w-full bg-[#13203a] border border-[#1f2d45] rounded-xl pl-10 pr-4 py-2.5 text-xs text-[#eaf1f7] placeholder-[#8ea0b3] focus:outline-none focus:border-[#2dd4bf]"
              />
            </div>
            <div className="sm:col-span-4">
              <select
                value={auditActionFilter}
                onChange={(e) => setAuditActionFilter(e.target.value)}
                className="w-full bg-[#13203a] border border-[#1f2d45] rounded-xl px-3 py-2.5 text-xs text-[#eaf1f7] focus:outline-none focus:border-[#2dd4bf]"
              >
                <option value="All">All action types</option>
                <option value="ACCOUNT_SUSPENDED">Account Suspensions</option>
                <option value="ACCOUNT_REACTIVATED">Account Reactivations</option>
                <option value="SUPPORT_NOTE_ADDED">Internal Notes</option>
                <option value="CSV_METRICS_EXPORT">Data Exports</option>
                <option value="TICKET_STATUS_UPDATED">Ticket Updates</option>
              </select>
            </div>
          </div>

          {/* Audit Table */}
          <div className="rounded-xl bg-[#0e1726] border border-[#1f2d45] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#1f2d45] text-[#8ea0b3] bg-[#0b1322]">
                    <th className="py-3 px-4 font-medium">Timestamp</th>
                    <th className="py-3 px-4 font-medium">Actor</th>
                    <th className="py-3 px-4 font-medium">Action</th>
                    <th className="py-3 px-4 font-medium">Target</th>
                    <th className="py-3 px-4 font-medium">Details & Justification</th>
                    <th className="py-3 px-4 font-medium text-right">IP Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1f2d45]">
                  {filteredAudit.map((log) => {
                    const isSuspension = log.action === "ACCOUNT_SUSPENDED";
                    const isReactivation = log.action === "ACCOUNT_REACTIVATED";
                    return (
                      <tr key={log.id} className="hover:bg-[#13203a]/50 transition">
                        <td className="py-3 px-4 text-[#8ea0b3] whitespace-nowrap">{log.timestamp}</td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-[#eaf1f7]">{log.adminEmail}</div>
                          <div className="text-[10px] text-[#2dd4bf]">Role: {log.role}</div>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded font-mono text-[11px] font-medium border ${
                              isSuspension
                                ? "bg-rose-500/10 text-[#f06a6a] border-[#f06a6a]/40"
                                : isReactivation
                                ? "bg-emerald-500/10 text-[#34d399] border-[#34d399]/40"
                                : "bg-[#13203a] text-[#8ea0b3] border-[#1f2d45]"
                            }`}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-medium text-[#eaf1f7]">{log.targetUser}</td>
                        <td className="py-3 px-4 text-[#eaf1f7] max-w-xs truncate">{log.details}</td>
                        <td className="py-3 px-4 text-right text-[11px] font-mono text-[#8ea0b3]">
                          {log.ipAddress}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SUPPORT TICKETS */}
      {activeTab === "tickets" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3">
            {supportTickets.map((ticket) => (
              <div
                key={ticket.id}
                className="p-5 rounded-xl bg-[#0e1726] border border-[#1f2d45] space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-[#2dd4bf] font-semibold">
                      {ticket.ticketNumber}
                    </span>
                    <span className="text-sm font-semibold text-[#eaf1f7]">{ticket.subject}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-[#13203a] text-[#8ea0b3] border border-[#1f2d45]">
                      {ticket.category}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        ticket.status === "Open"
                          ? "bg-[#f59e0b]/15 text-[#f59e0b] border border-[#f59e0b]/40"
                          : ticket.status === "In Progress"
                          ? "bg-sky-500/15 text-sky-400 border border-sky-500/40"
                          : "bg-[#34d399]/15 text-[#34d399] border border-[#34d399]/40"
                      }`}
                    >
                      {ticket.status}
                    </span>
                    <select
                      value={ticket.status}
                      onChange={(e) =>
                        updateTicketStatus(ticket.id, e.target.value as "Open" | "In Progress" | "Resolved")
                      }
                      className="text-xs bg-[#13203a] border border-[#1f2d45] rounded px-2 py-1 text-[#eaf1f7]"
                    >
                      <option value="Open">Set Open</option>
                      <option value="In Progress">Set In Progress</option>
                      <option value="Resolved">Set Resolved</option>
                    </select>
                  </div>
                </div>

                <p className="text-xs text-[#8ea0b3]">{ticket.notes}</p>

                <div className="pt-2 border-t border-[#1f2d45] flex items-center justify-between text-[11px] text-[#8ea0b3]">
                  <div>
                    From: <strong className="text-[#eaf1f7]">{ticket.user}</strong> ({ticket.email})
                  </div>
                  <div>Reported: {ticket.createdAt}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: VERDICT FEEDBACK */}
      {activeTab === "feedback" && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-[#13203a] border border-[#1f2d45] text-xs text-[#8ea0b3]">
            Users can submit feedback directly on AI scam verdicts (e.g., flagging false positives or confirming accurate detections). This fuels prompt calibration and model evaluation for Module 4.
          </div>

          <div className="grid grid-cols-1 gap-3">
            {verdictFeedback.map((fb) => (
              <div
                key={fb.id}
                className="p-5 rounded-xl bg-[#0e1726] border border-[#1f2d45] space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-[#2dd4bf]">{fb.checkId}</span>
                    <span className="text-xs font-semibold text-[#eaf1f7]">{fb.category}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                        fb.userReaction === "False Positive"
                          ? "bg-rose-500/10 text-[#f06a6a] border-[#f06a6a]/30"
                          : "bg-emerald-500/10 text-[#34d399] border-[#34d399]/30"
                      }`}
                    >
                      {fb.userReaction}
                    </span>
                  </div>
                  <span className="text-xs text-[#8ea0b3]">{fb.createdAt}</span>
                </div>

                <p className="text-xs text-[#eaf1f7] bg-[#13203a]/60 p-3 rounded-lg border border-[#1f2d45]">
                  &ldquo;{fb.userComment}&rdquo;
                </p>

                <div className="flex items-center justify-between text-[11px] text-[#8ea0b3]">
                  <span>System Verdict: <strong className="text-[#eaf1f7]">{fb.systemVerdict}</strong></span>
                  <span>User: {fb.userEmail}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
