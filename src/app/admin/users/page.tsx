"use client";

import React, { useState } from "react";
import {
  Search,
  Filter,
  ShieldAlert,
  UserX,
  UserCheck,
  PlusCircle,
  AlertCircle,
  FileText,
  Lock,
  ChevronRight,
  Send,
} from "lucide-react";
import { useAdmin } from "@/lib/admin-store";
import { AdminUser, PlanTier, UserStatus } from "@/lib/types/admin";

export default function UserManagementPage() {
  const { users, currentRole, suspendUser, reactivateUser, addSupportNote } = useAdmin();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<string>("All");
  const [selectedStatus, setSelectedStatus] = useState<string>("All");
  const [selectedUser, setSelectedUser] = useState<AdminUser>(users[0]);
  const [newNote, setNewNote] = useState("");
  const [actionModal, setActionModal] = useState<{
    isOpen: boolean;
    type: "suspend" | "reactivate";
    user?: AdminUser;
  }>({ isOpen: false, type: "suspend" });
  const [actionReason, setActionReason] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filtered users
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPlan = selectedPlan === "All" || u.plan === selectedPlan;
    const matchesStatus = selectedStatus === "All" || u.status === selectedStatus;
    return matchesSearch && matchesPlan && matchesStatus;
  });

  const handleOpenActionModal = (type: "suspend" | "reactivate", user: AdminUser) => {
    setErrorMessage(null);
    setActionReason("");
    setActionModal({ isOpen: true, type, user });
  };

  const handleConfirmAction = () => {
    if (!actionModal.user) return;
    if (actionModal.type === "suspend") {
      const res = suspendUser(actionModal.user.id, actionReason);
      if (!res.success) {
        setErrorMessage(res.error || "Action failed.");
        return;
      }
    } else {
      const res = reactivateUser(actionModal.user.id, actionReason);
      if (!res.success) {
        setErrorMessage(res.error || "Action failed.");
        return;
      }
    }
    // Update active selection
    const updated = users.find((u) => u.id === actionModal.user?.id);
    if (updated) setSelectedUser(updated);
    setActionModal({ isOpen: false, type: "suspend" });
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    addSupportNote(selectedUser.id, newNote);
    setNewNote("");
  };

  const getStatusBadge = (status: UserStatus) => {
    switch (status) {
      case "Active":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium border border-[#34d399] text-[#34d399]">
            Active
          </span>
        );
      case "Trialing":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium border border-[#f59e0b] text-[#f59e0b]">
            Trialing
          </span>
        );
      case "Cancelled":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium border border-[#f59e0b] text-[#f59e0b]">
            Cancelled
          </span>
        );
      case "Suspended":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium border border-[#f06a6a] text-[#f06a6a]">
            Suspended
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-[#eaf1f7]">User management</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs bg-[#13203a] text-[#8ea0b3] border border-[#1f2d45]">
              M5-09 · M5-10
            </span>
          </div>
          <p className="text-xs text-[#8ea0b3] mt-1">
            Search registered accounts, review subscription status, add internal notes, and enforce policy moderation.
          </p>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
        <div className="sm:col-span-6 relative">
          <Search className="w-4 h-4 text-[#8ea0b3] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search name or email..."
            className="w-full bg-[#13203a] border border-[#1f2d45] rounded-xl pl-10 pr-4 py-2.5 text-xs text-[#eaf1f7] placeholder-[#8ea0b3] focus:outline-none focus:border-[#2dd4bf]"
          />
        </div>

        <div className="sm:col-span-3">
          <select
            value={selectedPlan}
            onChange={(e) => setSelectedPlan(e.target.value)}
            className="w-full bg-[#13203a] border border-[#1f2d45] rounded-xl px-3 py-2.5 text-xs text-[#eaf1f7] focus:outline-none focus:border-[#2dd4bf]"
          >
            <option value="All">All plans (All)</option>
            <option value="Sentinel">Sentinel</option>
            <option value="Guardian">Guardian</option>
            <option value="Aegis">Aegis</option>
          </select>
        </div>

        <div className="sm:col-span-3">
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full bg-[#13203a] border border-[#1f2d45] rounded-xl px-3 py-2.5 text-xs text-[#eaf1f7] focus:outline-none focus:border-[#2dd4bf]"
          >
            <option value="All">All statuses (All)</option>
            <option value="Active">Active</option>
            <option value="Trialing">Trialing</option>
            <option value="Cancelled">Cancelled</option>
            <option value="Suspended">Suspended</option>
          </select>
        </div>
      </div>

      {/* User Directory Table */}
      <div className="rounded-xl bg-[#0e1726] border border-[#1f2d45] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#1f2d45] text-[#8ea0b3] bg-[#0b1322]">
                <th className="py-3 px-4 font-medium">User</th>
                <th className="py-3 px-4 font-medium">Plan</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium">Joined</th>
                <th className="py-3 px-4 font-medium">Scam Checks</th>
                <th className="py-3 px-4 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1f2d45]">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-[#8ea0b3]">
                    No users matching criteria.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isSelected = selectedUser.id === u.id;
                  return (
                    <tr
                      key={u.id}
                      onClick={() => setSelectedUser(u)}
                      className={`hover:bg-[#13203a]/50 cursor-pointer transition ${
                        isSelected ? "bg-[#13203a]/80" : ""
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="font-semibold text-[#eaf1f7]">{u.name}</div>
                        <div className="text-[11px] text-[#8ea0b3]">{u.email}</div>
                      </td>
                      <td className="py-3 px-4 font-medium text-[#eaf1f7]">{u.plan}</td>
                      <td className="py-3 px-4">{getStatusBadge(u.status)}</td>
                      <td className="py-3 px-4 text-[#8ea0b3]">{u.joined}</td>
                      <td className="py-3 px-4 font-semibold text-[#eaf1f7]">{u.checksCount}</td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          className="px-2.5 py-1 rounded bg-[#13203a] text-[#2dd4bf] hover:bg-[#2dd4bf]/20 border border-[#1f2d45] font-medium"
                        >
                          {isSelected ? "Inspecting" : "Open"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected User Record Inspection Drawer (M5-09 / M5-10) */}
      {selectedUser && (
        <div className="p-6 rounded-xl bg-[#0e1726] border border-[#1f2d45] space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-[#1f2d45]">
            <div>
              <div className="text-sm font-semibold text-[#eaf1f7] flex items-center gap-2">
                <span>User record · {selectedUser.name}</span>
                {getStatusBadge(selectedUser.status)}
              </div>
              <p className="text-xs text-[#8ea0b3] mt-0.5">ID: {selectedUser.id}</p>
            </div>

            {/* Moderation Controls (RBAC Enforcement) */}
            <div className="flex items-center gap-2">
              {selectedUser.status === "Suspended" ? (
                <button
                  onClick={() => handleOpenActionModal("reactivate", selectedUser)}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#2dd4bf] text-[#0b1322] hover:bg-[#5eead4] transition flex items-center gap-1.5"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  Reactivate Account
                </button>
              ) : (
                <button
                  onClick={() => handleOpenActionModal("suspend", selectedUser)}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold border border-[#f06a6a] text-[#f06a6a] hover:bg-[#f06a6a]/15 transition flex items-center gap-1.5"
                >
                  <UserX className="w-3.5 h-3.5" />
                  Suspend
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div className="p-3 rounded-lg bg-[#13203a] border border-[#1f2d45] space-y-1">
              <span className="text-[#8ea0b3]">Email Address</span>
              <div className="font-medium text-[#eaf1f7] truncate">{selectedUser.email}</div>
            </div>
            <div className="p-3 rounded-lg bg-[#13203a] border border-[#1f2d45] space-y-1">
              <span className="text-[#8ea0b3]">Plan & Price</span>
              <div className="font-medium text-[#eaf1f7]">
                {selectedUser.plan} · LKR {selectedUser.billingAmount} / mo
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[#13203a] border border-[#1f2d45] space-y-1">
              <span className="text-[#8ea0b3]">Next Renewal / Expiry</span>
              <div className="font-medium text-[#eaf1f7]">{selectedUser.renewal}</div>
            </div>
            <div className="p-3 rounded-lg bg-[#13203a] border border-[#1f2d45] space-y-1">
              <span className="text-[#8ea0b3]">Scam Checks Run</span>
              <div className="font-medium text-[#eaf1f7]">{selectedUser.checksCount} total checks</div>
            </div>
          </div>

          {/* Internal Support Notes Section */}
          <div className="space-y-3 pt-2">
            <h3 className="text-xs font-semibold text-[#eaf1f7] flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-[#2dd4bf]" />
              Internal Support Notes ({selectedUser.supportNotes.length})
            </h3>

            {/* Add note input */}
            <form onSubmit={handleAddNote} className="flex gap-2">
              <input
                type="text"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Add an internal note regarding this account..."
                className="flex-1 bg-[#13203a] border border-[#1f2d45] rounded-lg px-3 py-2 text-xs text-[#eaf1f7] placeholder-[#8ea0b3] focus:outline-none focus:border-[#2dd4bf]"
              />
              <button
                type="submit"
                className="px-3 py-2 bg-[#2dd4bf] text-[#0b1322] rounded-lg text-xs font-semibold hover:bg-[#5eead4] transition flex items-center gap-1"
              >
                <Send className="w-3.5 h-3.5" />
                Add Note
              </button>
            </form>

            {/* Note items */}
            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {selectedUser.supportNotes.length === 0 ? (
                <div className="text-xs text-[#8ea0b3] italic">No support notes recorded yet.</div>
              ) : (
                selectedUser.supportNotes.map((note, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded bg-[#13203a]/60 border border-[#1f2d45] text-xs text-[#eaf1f7]"
                  >
                    • {note}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Privacy Guarantee Banner */}
          <div className="p-3.5 rounded-lg bg-[#2dd4bf]/10 border border-[#2dd4bf]/30 flex items-start gap-2.5 text-xs text-[#8ea0b3]">
            <Lock className="w-4 h-4 text-[#2dd4bf] flex-shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong className="text-[#eaf1f7]">Hidden by design:</strong> Vault passwords, secret notes, and pasted scam message content are zero-knowledge and never accessible to administrators. Support role can view records; only Admin can suspend/reactivate accounts. Every action generates an immutable audit log entry.
            </p>
          </div>
        </div>
      )}

      {/* Moderation Confirmation Modal */}
      {actionModal.isOpen && actionModal.user && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0e1726] border border-[#1f2d45] rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div
                className={`p-2 rounded-lg ${
                  actionModal.type === "suspend"
                    ? "bg-[#f06a6a]/15 text-[#f06a6a]"
                    : "bg-[#2dd4bf]/15 text-[#2dd4bf]"
                }`}
              >
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#eaf1f7]">
                  {actionModal.type === "suspend" ? "Suspend Account" : "Reactivate Account"}
                </h3>
                <p className="text-xs text-[#8ea0b3]">Target: {actionModal.user.email}</p>
              </div>
            </div>

            {errorMessage && (
              <div className="p-3 rounded bg-[#f06a6a]/15 border border-[#f06a6a] text-xs text-[#f06a6a] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="space-y-1.5 text-xs">
              <label className="text-[#eaf1f7] font-medium">Audit Reason / Justification</label>
              <textarea
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                rows={3}
                placeholder={
                  actionModal.type === "suspend"
                    ? "E.g., Automated API request abuse, fraudulent behavior detected..."
                    : "E.g., Account cleared after security verification..."
                }
                className="w-full bg-[#13203a] border border-[#1f2d45] rounded-lg p-2.5 text-xs text-[#eaf1f7] placeholder-[#8ea0b3] focus:outline-none focus:border-[#2dd4bf]"
              />
              <p className="text-[11px] text-[#8ea0b3]">
                This reason will be immutably stamped into the system audit trail (M5-11).
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActionModal({ isOpen: false, type: "suspend" })}
                className="px-3.5 py-2 rounded-lg text-xs font-medium text-[#8ea0b3] hover:bg-[#13203a] transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAction}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
                  actionModal.type === "suspend"
                    ? "bg-[#f06a6a] text-white hover:bg-rose-600"
                    : "bg-[#2dd4bf] text-[#0b1322] hover:bg-[#5eead4]"
                }`}
              >
                Confirm {actionModal.type === "suspend" ? "Suspension" : "Reactivation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
