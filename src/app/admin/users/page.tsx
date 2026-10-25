"use client";

import React, { useState } from "react";
import { Download, Search, ShieldCheck, ChevronDown, X } from "lucide-react";
import { useAdmin } from "@/lib/admin-store";
import { AdminUser, PlanTier, UserStatus } from "@/lib/types/admin";

export default function AdminUsersPage() {
  const { users, suspendUser, reactivateUser, exportCsvData } = useAdmin();
  const [searchTerm, setSearchTerm] = useState("");
  const [planFilter, setPlanFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedUserId, setSelectedUserId] = useState<string>("usr-001");

  // Modal states
  const [isSuspendModalOpen, setIsSuspendModalOpen] = useState(false);
  const [isReactivateModalOpen, setIsReactivateModalOpen] = useState(false);
  const [modalReason, setModalReason] = useState("");
  const [modalError, setModalError] = useState("");

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPlan = planFilter === "All" || u.plan === planFilter;
    const matchesStatus = statusFilter === "All" || u.status === statusFilter;
    return matchesSearch && matchesPlan && matchesStatus;
  });

  const selectedUser = users.find((u) => u.id === selectedUserId) || users[0];

  const handleOpenSuspend = () => {
    setModalReason("");
    setModalError("");
    setIsSuspendModalOpen(true);
  };

  const handleOpenReactivate = () => {
    setModalReason("");
    setModalError("");
    setIsReactivateModalOpen(true);
  };

  const handleConfirmSuspend = () => {
    if (!modalReason.trim()) {
      setModalError("A reason is required to suspend an account.");
      return;
    }
    const res = suspendUser(selectedUser.id, modalReason);
    if (!res.success) {
      setModalError(res.error || "Failed to suspend account");
      return;
    }
    setIsSuspendModalOpen(false);
  };

  const handleConfirmReactivate = () => {
    if (!modalReason.trim()) {
      setModalError("A reason is required to reactivate an account.");
      return;
    }
    const res = reactivateUser(selectedUser.id, modalReason);
    if (!res.success) {
      setModalError(res.error || "Failed to reactivate account");
      return;
    }
    setIsReactivateModalOpen(false);
  };

  const getStatusDot = (status: UserStatus) => {
    switch (status) {
      case "Active":
        return "bg-emerald-500";
      case "Trialing":
        return "bg-teal-500";
      case "Suspended":
        return "bg-red-500";
      default:
        return "bg-slate-400";
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Users</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Search, review and manage accounts. Synthetic data only.
          </p>
        </div>

        <button
          onClick={() => exportCsvData("Users")}
          className="inline-flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg px-3.5 py-2 text-sm font-medium transition shadow-sm self-start sm:self-auto"
        >
          <Download className="w-4 h-4 text-slate-500" />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Role Limits Banner */}
      <div className="bg-teal-50/60 border border-teal-200 rounded-xl p-4 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-teal-700 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-teal-900">
          <strong>Role limits:</strong> Support admins can view and suspend users but cannot see revenue or change roles. Every action is written to the audit log.
        </p>
      </div>

      {/* Search and Filters Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-center gap-3 flex-1 max-w-2xl">
          {/* Search Input */}
          <div className="relative w-full sm:w-72">
            <input
              type="text"
              placeholder="Search by name or email"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3.5 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-teal-600 shadow-sm"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          </div>

          {/* Plan Filter */}
          <div className="relative w-full sm:w-40">
            <select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
              className="w-full appearance-none bg-white border border-slate-200 rounded-lg px-3.5 py-2 pr-8 text-sm text-slate-700 focus:outline-none focus:border-teal-600 shadow-sm"
            >
              <option value="All">Plan: All</option>
              <option value="Guardian">Guardian</option>
              <option value="Sentinel">Sentinel</option>
              <option value="Aegis">Aegis</option>
              <option value="None">None</option>
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Status Filter */}
          <div className="relative w-full sm:w-40">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full appearance-none bg-white border border-slate-200 rounded-lg px-3.5 py-2 pr-8 text-sm text-slate-700 focus:outline-none focus:border-teal-600 shadow-sm"
            >
              <option value="All">Status: All</option>
              <option value="Active">Active</option>
              <option value="Trialing">Trialing</option>
              <option value="Cancelled">Cancelled</option>
              <option value="Suspended">Suspended</option>
              <option value="Not subscribed">Not subscribed</option>
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        <div className="text-xs text-slate-500 font-medium">
          Showing {filteredUsers.length} of 120 users
        </div>
      </div>

      {/* Main Split Content: Table on Left + Detail Panel on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* User Table (8 cols) */}
        <div className="lg:col-span-7 xl:col-span-8 bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">User</th>
                  <th className="px-4 py-3.5">Plan</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-3 py-3.5 text-center">Checks</th>
                  <th className="px-3 py-3.5 text-center">Vault</th>
                  <th className="px-4 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((user) => {
                  const isSelected = user.id === selectedUser?.id;
                  return (
                    <tr
                      key={user.id}
                      onClick={() => setSelectedUserId(user.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? "bg-teal-50/40" : "hover:bg-slate-50/80"
                      }`}
                    >
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-900">{user.name}</div>
                        <div className="text-xs text-slate-500">{user.email}</div>
                      </td>
                      <td className="px-4 py-3.5 text-slate-700">
                        {user.plan === "None" ? "None" : user.plan}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center gap-1.5 text-xs text-slate-700">
                          <span className={`w-2 h-2 rounded-full ${getStatusDot(user.status)}`}></span>
                          {user.status}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 text-center text-slate-700 font-medium">
                        {user.checksCount}
                      </td>
                      <td className="px-3 py-3.5 text-center text-slate-700 font-medium">
                        {user.vaultCount}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedUserId(user.id);
                          }}
                          className={`text-xs font-semibold px-2.5 py-1 rounded transition ${
                            isSelected
                              ? "text-teal-800 bg-teal-100/60"
                              : "text-teal-700 hover:text-teal-800 hover:bg-teal-50"
                          }`}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* User Detail Card (5 cols) */}
        {selectedUser && (
          <div className="lg:col-span-5 xl:col-span-4 bg-white rounded-xl border border-slate-200 p-6 shadow-sm sticky top-6 space-y-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900">{selectedUser.name}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{selectedUser.email}</p>
            </div>

            <div className="divide-y divide-slate-100 text-sm">
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-500">Plan</span>
                <span className="font-semibold text-slate-900">
                  {selectedUser.plan}
                  {selectedUser.billingAmount > 0 ? `, LKR ${selectedUser.billingAmount}` : ""}
                </span>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-500">Status</span>
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-900">
                  <span className={`w-2 h-2 rounded-full ${getStatusDot(selectedUser.status)}`}></span>
                  {selectedUser.status}
                </span>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-500">Renews</span>
                <span className="font-medium text-slate-900">{selectedUser.renewal}</span>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-500">Joined</span>
                <span className="font-medium text-slate-900">{selectedUser.joined}</span>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-500">Checks this month</span>
                <span className="font-semibold text-slate-900">{selectedUser.checksCount}</span>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-500">Vault entries</span>
                <span className="font-semibold text-slate-900">
                  {selectedUser.vaultCount} (count only)
                </span>
              </div>
            </div>

            {/* Support notes */}
            <div>
              <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                Support notes
              </div>
              {selectedUser.supportNotes && selectedUser.supportNotes.length > 0 ? (
                <div className="space-y-1 mt-1 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  {selectedUser.supportNotes.map((note, idx) => (
                    <div key={idx}>• {note}</div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">No open support notes for this user.</p>
              )}
            </div>

            {/* Zero Knowledge Privacy Callout */}
            <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-600 border border-slate-200">
              Passwords, vault entries and pasted messages are never shown to admins.
            </div>

            {/* Suspend / Reactivate Action Buttons */}
            <div className="space-y-2 pt-2">
              {selectedUser.status === "Suspended" ? (
                <>
                  <button
                    onClick={handleOpenReactivate}
                    className="w-full py-2.5 px-4 rounded-lg bg-[#0F766E] hover:bg-[#115E59] text-white text-sm font-semibold transition shadow-sm"
                  >
                    Reactivate account
                  </button>
                  <button
                    disabled
                    className="w-full py-2.5 px-4 rounded-lg bg-slate-100 text-slate-400 text-sm font-medium cursor-not-allowed"
                  >
                    Suspend account (already suspended)
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleOpenSuspend}
                    className="w-full py-2.5 px-4 rounded-lg bg-[#B91C1C] hover:bg-[#991B1B] text-white text-sm font-semibold transition shadow-sm"
                  >
                    Suspend account
                  </button>
                  <button
                    disabled
                    className="w-full py-2.5 px-4 rounded-lg bg-slate-100 text-slate-400 text-sm font-medium cursor-not-allowed"
                  >
                    Reactivate (account is active)
                  </button>
                </>
              )}
            </div>

            <p className="text-[11px] text-slate-400 text-center">
              Suspending asks for a reason and is recorded in the audit log.
            </p>
          </div>
        )}
      </div>

      {/* Page 13: Suspend User Modal */}
      {isSuspendModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div>
              <h3 className="text-xl font-bold text-slate-900">Suspend {selectedUser.name}?</h3>
              <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                This account loses access immediately. Vault data is not deleted. You can reactivate the account later.
              </p>
            </div>

            <div>
              <label htmlFor="suspend-reason" className="block text-sm font-semibold text-slate-700 mb-1.5">
                Reason (required)
              </label>
              <textarea
                id="suspend-reason"
                rows={3}
                value={modalReason}
                onChange={(e) => setModalReason(e.target.value)}
                placeholder="Explain why this account is being suspended"
                className="w-full bg-white border border-slate-300 rounded-xl p-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600"
              />
              {modalError && <p className="text-xs text-red-600 mt-1">{modalError}</p>}
            </div>

            <div className="text-xs text-slate-500">
              This action is written to the audit log.
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsSuspendModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSuspend}
                className="px-4 py-2 rounded-lg bg-[#B91C1C] hover:bg-[#991B1B] text-white text-sm font-medium transition"
              >
                Suspend account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Page 14: Reactivate User Modal */}
      {isReactivateModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div>
              <h3 className="text-xl font-bold text-slate-900">Reactivate {selectedUser.name}?</h3>
              <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                This account regains access to its plan and tools right away. Vault data was kept while the account was suspended.
              </p>
            </div>

            <div>
              <label htmlFor="reactivate-reason" className="block text-sm font-semibold text-slate-700 mb-1.5">
                Reason (required)
              </label>
              <textarea
                id="reactivate-reason"
                rows={3}
                value={modalReason}
                onChange={(e) => setModalReason(e.target.value)}
                placeholder="Explain why this account is being reactivated"
                className="w-full bg-white border border-slate-300 rounded-xl p-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
              />
              {modalError && <p className="text-xs text-red-600 mt-1">{modalError}</p>}
            </div>

            <div className="text-xs text-slate-500">
              This action is written to the audit log.
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsReactivateModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReactivate}
                className="px-4 py-2 rounded-lg bg-[#0F766E] hover:bg-[#115E59] text-white text-sm font-medium transition"
              >
                Reactivate account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
