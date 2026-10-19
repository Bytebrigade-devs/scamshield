"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  AdminRole,
  AdminUser,
  AuditLogEntry,
  OverviewMetrics,
  SupportTicket,
  VerdictFeedback,
} from "./types/admin";
import {
  initialAuditLogs,
  initialOverviewMetrics,
  initialSupportTickets,
  initialUsers,
  initialVerdictFeedback,
} from "./seed-data";

interface AdminContextType {
  currentRole: AdminRole;
  setCurrentRole: (role: AdminRole) => void;
  adminEmail: string;
  users: AdminUser[];
  auditLogs: AuditLogEntry[];
  supportTickets: SupportTicket[];
  verdictFeedback: VerdictFeedback[];
  metrics: OverviewMetrics;
  suspendUser: (userId: string, reason: string) => { success: boolean; error?: string };
  reactivateUser: (userId: string, reason: string) => { success: boolean; error?: string };
  addSupportNote: (userId: string, note: string) => void;
  updateTicketStatus: (ticketId: string, status: "Open" | "In Progress" | "Resolved") => void;
  exportCsvData: () => void;
  resetToDefaults: () => void;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [currentRole, setCurrentRole] = useState<AdminRole>("admin");
  const adminEmail = currentRole === "admin" 
    ? "admin@scamshield.test" 
    : currentRole === "support" 
    ? "support@scamshield.test" 
    : "analyst@scamshield.test";

  const [users, setUsers] = useState<AdminUser[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("scamshield_m5_users");
      if (saved) {
        try { return JSON.parse(saved); } catch (e) { /* fallback */ }
      }
    }
    return initialUsers;
  });

  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("scamshield_m5_audit");
      if (saved) {
        try { return JSON.parse(saved); } catch (e) { /* fallback */ }
      }
    }
    return initialAuditLogs;
  });

  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>(initialSupportTickets);
  const [verdictFeedback, setVerdictFeedback] = useState<VerdictFeedback[]>(initialVerdictFeedback);
  const [metrics, setMetrics] = useState<OverviewMetrics>(initialOverviewMetrics);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("scamshield_m5_users", JSON.stringify(users));
    }
  }, [users]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("scamshield_m5_audit", JSON.stringify(auditLogs));
    }
  }, [auditLogs]);

  // Record audit log helper
  const logAction = (action: string, targetUser: string, details: string) => {
    const newEntry: AuditLogEntry = {
      id: `aud-${Date.now()}`,
      adminEmail,
      role: currentRole === "admin" ? "Admin" : currentRole === "support" ? "Support" : "Security Analyst",
      action,
      targetUser,
      details,
      timestamp: new Date().toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      ipAddress: "192.168.1.45 (Local Admin)",
    };
    setAuditLogs((prev) => [newEntry, ...prev]);
  };

  const suspendUser = (userId: string, reason: string) => {
    // RBAC check: only admin can suspend accounts (M5-10)
    if (currentRole !== "admin") {
      return { success: false, error: "Access Denied: Only Admin role can suspend accounts (RBAC M5-10)." };
    }

    const target = users.find((u) => u.id === userId);
    if (!target) return { success: false, error: "User not found." };

    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId ? { ...u, status: "Suspended", renewal: "Suspended" } : u
      )
    );

    logAction("ACCOUNT_SUSPENDED", target.email, `Account suspended. Reason: ${reason || "Policy violation"}`);
    setMetrics((prev) => ({ ...prev, suspendedCount: prev.suspendedCount + 1 }));
    return { success: true };
  };

  const reactivateUser = (userId: string, reason: string) => {
    if (currentRole !== "admin") {
      return { success: false, error: "Access Denied: Only Admin role can reactivate accounts (RBAC M5-10)." };
    }

    const target = users.find((u) => u.id === userId);
    if (!target) return { success: false, error: "User not found." };

    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId ? { ...u, status: "Active", renewal: "Active (Next cycle)" } : u
      )
    );

    logAction("ACCOUNT_REACTIVATED", target.email, `Account reactivated. Reason: ${reason || "Account reviewed"}`);
    setMetrics((prev) => ({ ...prev, suspendedCount: Math.max(0, prev.suspendedCount - 1) }));
    return { success: true };
  };

  const addSupportNote = (userId: string, note: string) => {
    const target = users.find((u) => u.id === userId);
    if (!target || !note.trim()) return;

    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId ? { ...u, supportNotes: [note.trim(), ...u.supportNotes] } : u
      )
    );

    logAction("SUPPORT_NOTE_ADDED", target.email, `Note: "${note.trim()}"`);
  };

  const updateTicketStatus = (ticketId: string, status: "Open" | "In Progress" | "Resolved") => {
    setSupportTickets((prev) =>
      prev.map((t) => (t.id === ticketId ? { ...t, status } : t))
    );
    const tkt = supportTickets.find((t) => t.id === ticketId);
    if (tkt) {
      logAction("TICKET_STATUS_UPDATED", tkt.email, `Ticket ${tkt.ticketNumber} marked as ${status}`);
    }
  };

  const exportCsvData = () => {
    const headers = ["User ID", "Name", "Email", "Plan Tier", "Status", "Joined Date", "Checks Count", "Vault Count", "Monthly Billing LKR"];
    const rows = users.map((u) => [
      u.id,
      `"${u.name}"`,
      u.email,
      u.plan,
      u.status,
      `"${u.joined}"`,
      u.checksCount,
      u.vaultCount,
      u.billingAmount,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `scamshield_m5_analytics_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    logAction("CSV_METRICS_EXPORT", "System-Wide", "Exported filtered user & subscription report (M5-07)");
  };

  const resetToDefaults = () => {
    setUsers(initialUsers);
    setAuditLogs(initialAuditLogs);
    setSupportTickets(initialSupportTickets);
    setVerdictFeedback(initialVerdictFeedback);
    setMetrics(initialOverviewMetrics);
    if (typeof window !== "undefined") {
      localStorage.removeItem("scamshield_m5_users");
      localStorage.removeItem("scamshield_m5_audit");
    }
  };

  return (
    <AdminContext.Provider
      value={{
        currentRole,
        setCurrentRole,
        adminEmail,
        users,
        auditLogs,
        supportTickets,
        verdictFeedback,
        metrics,
        suspendUser,
        reactivateUser,
        addSupportNote,
        updateTicketStatus,
        exportCsvData,
        resetToDefaults,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error("useAdmin must be used within an AdminProvider");
  }
  return context;
}
