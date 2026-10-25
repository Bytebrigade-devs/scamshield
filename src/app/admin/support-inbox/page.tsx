"use client";

import React, { useState } from "react";
import { Search, ShieldCheck, ChevronDown, CheckCircle2, Send, UserPlus } from "lucide-react";
import { useAdmin } from "@/lib/admin-store";
import { SupportTicket } from "@/lib/types/admin";

export default function AdminSupportInboxPage() {
  const { supportTickets, replyToTicket, resolveTicket } = useAdmin();
  const [selectedTicketId, setSelectedTicketId] = useState<string>("tkt-003");
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("Open");
  const [replyText, setReplyText] = useState("");

  const filteredTickets = supportTickets.filter((t) => {
    const matchesSearch =
      t.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.user.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = categoryFilter === "All" || t.category === categoryFilter;
    const matchesPriority = priorityFilter === "All" || t.priority === priorityFilter;
    const matchesStatus =
      statusFilter === "All"
        ? true
        : statusFilter === "Open"
        ? t.status !== "Resolved"
        : t.status === "Resolved";

    return matchesSearch && matchesCat && matchesPriority && matchesStatus;
  });

  const selectedTicket =
    supportTickets.find((t) => t.id === selectedTicketId) || filteredTickets[0] || supportTickets[0];

  const handleSendReply = () => {
    if (!replyText.trim() || !selectedTicket) return;
    replyToTicket(selectedTicket.id, replyText);
    setReplyText("");
  };

  const handleMarkResolved = () => {
    if (!selectedTicket) return;
    resolveTicket(selectedTicket.id);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Support inbox</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Review and resolve user requests. Synthetic data only.
          </p>
        </div>

        <div className="relative self-start sm:self-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="appearance-none bg-white border border-slate-200 rounded-lg px-3.5 py-2 pr-9 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:border-teal-600 shadow-sm"
          >
            <option value="Open">Status: Open</option>
            <option value="Resolved">Status: Resolved</option>
            <option value="All">Status: All</option>
          </select>
          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {/* Zero Knowledge Privacy Notice */}
      <div className="bg-teal-50/60 border border-teal-200 rounded-xl p-4 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-teal-700 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-teal-900">
          Support admins see only what a user chose to send. Passwords, vault entries and checked messages are never attached to a request.
        </p>
      </div>

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="text-sm font-medium text-slate-600">Open requests</div>
          <div className="text-3xl font-bold text-slate-900 mt-2">7</div>
          <div className="text-xs text-slate-500 mt-1">Matches the Overview count</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="text-sm font-medium text-slate-600">Waiting on user</div>
          <div className="text-3xl font-bold text-slate-900 mt-2">2</div>
          <div className="text-xs text-slate-500 mt-1">Reply sent, no answer yet</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="text-sm font-medium text-slate-600">Resolved this week</div>
          <div className="text-3xl font-bold text-slate-900 mt-2">12</div>
          <div className="text-xs text-slate-500 mt-1">Synthetic sample</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="text-sm font-medium text-slate-600">First response</div>
          <div className="text-3xl font-bold text-slate-900 mt-2">3 h</div>
          <div className="text-xs text-slate-500 mt-1">Median, last 7 days</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto flex-1 max-w-xl">
          <div className="relative w-full sm:w-72">
            <input
              type="text"
              placeholder="Search subject or user"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3.5 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-teal-600 shadow-sm"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          </div>

          <div className="relative w-full sm:w-40">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full appearance-none bg-white border border-slate-200 rounded-lg px-3.5 py-2 pr-8 text-sm text-slate-700 focus:outline-none focus:border-teal-600 shadow-sm"
            >
              <option value="All">Category: All</option>
              <option value="Billing">Billing</option>
              <option value="Checker">Checker</option>
              <option value="Account">Account</option>
              <option value="Login">Login</option>
              <option value="Vault">Vault</option>
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <div className="relative w-full sm:w-40">
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="w-full appearance-none bg-white border border-slate-200 rounded-lg px-3.5 py-2 pr-8 text-sm text-slate-700 focus:outline-none focus:border-teal-600 shadow-sm"
            >
              <option value="All">Priority: All</option>
              <option value="High">Priority: High</option>
              <option value="Normal">Priority: Normal</option>
              <option value="Low">Priority: Low</option>
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        <div className="text-xs text-slate-500 font-medium self-end sm:self-auto">
          Showing {filteredTickets.length} of 7 open requests
        </div>
      </div>

      {/* Main Split Layout: Tickets Table + Ticket Detail Pane */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Ticket List Table (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Request</th>
                  <th className="px-3 py-3">Category</th>
                  <th className="px-3 py-3">Priority</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Age</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTickets.map((ticket) => {
                  const isSelected = ticket.id === selectedTicket?.id;
                  return (
                    <tr
                      key={ticket.id}
                      onClick={() => setSelectedTicketId(ticket.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? "bg-teal-50/50" : "hover:bg-slate-50/80"
                      }`}
                    >
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-900 leading-tight">
                          {ticket.subject}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">{ticket.user}</div>
                      </td>
                      <td className="px-3 py-3.5 text-xs text-slate-600">
                        {ticket.category}
                      </td>
                      <td className="px-3 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                            ticket.priority === "High"
                              ? "text-red-700"
                              : ticket.priority === "Normal"
                              ? "text-slate-700"
                              : "text-slate-500"
                          }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${
                              ticket.priority === "High"
                                ? "bg-red-500"
                                : ticket.priority === "Normal"
                                ? "bg-amber-500"
                                : "bg-slate-300"
                            }`}
                          ></span>
                          {ticket.priority}
                        </span>
                      </td>
                      <td className="px-3 py-3.5">
                        <span className="inline-flex items-center gap-1.5 text-xs text-slate-700">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              ticket.status === "New"
                                ? "bg-teal-500"
                                : ticket.status === "In progress"
                                ? "bg-emerald-500"
                                : "bg-slate-400"
                            }`}
                          ></span>
                          {ticket.status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right text-xs text-slate-500 font-medium">
                        {ticket.age}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Ticket Detail Pane (5 cols) */}
        {selectedTicket && (
          <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900 leading-tight">
                {selectedTicket.subject}
              </h2>
              <div className="text-xs text-slate-500 mt-1">
                {selectedTicket.user} · {selectedTicket.email}
              </div>
            </div>

            {/* Meta facts grid */}
            <div className="grid grid-cols-2 gap-y-2 text-xs py-3 border-y border-slate-100">
              <div className="text-slate-500">Category</div>
              <div className="font-semibold text-slate-900 text-right">{selectedTicket.category}</div>

              <div className="text-slate-500">Priority</div>
              <div className="text-right">
                <span className="inline-flex items-center gap-1 font-semibold text-slate-900">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      selectedTicket.priority === "High" ? "bg-red-500" : "bg-amber-500"
                    }`}
                  ></span>
                  {selectedTicket.priority}
                </span>
              </div>

              <div className="text-slate-500">Status</div>
              <div className="text-right">
                <span className="inline-flex items-center gap-1 font-semibold text-slate-900">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  {selectedTicket.status}
                </span>
              </div>

              <div className="text-slate-500">Opened</div>
              <div className="font-medium text-slate-900 text-right">{selectedTicket.openedDate}</div>

              <div className="text-slate-500">Account status</div>
              <div className="text-right">
                <span className="inline-flex items-center gap-1 font-semibold text-slate-900">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      selectedTicket.accountStatus === "Suspended"
                        ? "bg-red-500"
                        : "bg-emerald-500"
                    }`}
                  ></span>
                  {selectedTicket.accountStatus}
                </span>
              </div>
            </div>

            {/* Conversation messages */}
            <div className="space-y-4">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Conversation
              </div>

              <div className="space-y-3">
                {selectedTicket.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`p-3.5 rounded-xl text-xs space-y-1 ${
                      msg.senderType === "user"
                        ? "bg-slate-50 border border-slate-200 text-slate-800"
                        : "bg-teal-50/70 border border-teal-200 text-teal-950"
                    }`}
                  >
                    <div className="flex items-center justify-between font-semibold">
                      <span>{msg.sender}</span>
                      <span className="text-[11px] font-normal text-slate-400">{msg.timestamp}</span>
                    </div>
                    <p className="leading-relaxed">{msg.text}</p>
                  </div>
                ))}

                {/* Related audit log box if present */}
                {selectedTicket.relatedAuditEntry && (
                  <div className="p-3 rounded-lg bg-amber-50/80 border border-amber-200 text-[11px] text-amber-900">
                    <strong>Related audit entry:</strong> {selectedTicket.relatedAuditEntry}
                  </div>
                )}
              </div>
            </div>

            {/* Privacy reminder */}
            <div className="bg-slate-50 rounded-lg p-3 text-[11px] text-slate-600 border border-slate-200 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-teal-700 flex-shrink-0 mt-0.5" />
              <span>Never ask users for passwords, one-time codes or scam message text in support replies.</span>
            </div>

            {/* Reply Input Form */}
            <div className="space-y-3">
              <textarea
                rows={3}
                placeholder="Write a reply..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl p-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600 shadow-sm"
              />

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleSendReply}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-semibold transition shadow-sm"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send reply</span>
                </button>

                <button
                  type="button"
                  onClick={handleMarkResolved}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Mark resolved</span>
                </button>

                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-medium transition"
                >
                  <UserPlus className="w-3.5 h-3.5 text-slate-400" />
                  <span>Assign to me</span>
                </button>
              </div>

              <p className="text-[11px] text-slate-400">
                Replies and status changes are written to the audit log.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
