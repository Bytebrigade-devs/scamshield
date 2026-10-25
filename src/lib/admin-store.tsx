"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  AdminRole,
  AdminUser,
  AuditLogEntry,
  OverviewMetrics,
  SupportTicket,
  SystemAlert,
} from "./types/admin";
import {
  initialAuditLogs,
  initialOverviewMetrics,
  initialSupportTickets,
  initialSystemAlerts,
  initialUsers,
} from "./seed-data";

interface AdminContextType {
  currentRole: AdminRole;
  setCurrentRole: (role: AdminRole) => void;
  adminName: string;
  adminEmail: string;
  users: AdminUser[];
  auditLogs: AuditLogEntry[];
  supportTickets: SupportTicket[];
  systemAlerts: SystemAlert[];
  metrics: OverviewMetrics;
  suspendUser: (userId: string, reason: string) => { success: boolean; error?: string };
  reactivateUser: (userId: string, reason: string) => { success: boolean; error?: string };
  replyToTicket: (ticketId: string, replyText: string) => void;
  resolveTicket: (ticketId: string) => void;
  acknowledgeAlert: (alertId: string) => void;
  exportCsvData: (reportType?: string) => void;
  resetToDefaults: () => void;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [currentRole, setCurrentRole] = useState<AdminRole>("admin");
  const adminName = currentRole === "admin" ? "Super admin" : currentRole === "support" ? "Support admin" : "Standard user";
  const adminEmail = currentRole === "admin"
    ? "superadmin@scamshield.test"
    : currentRole === "support"
    ? "support@scamshield.test"
    : "user@example.test";

  const [users, setUsers] = useState<AdminUser[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("scamshield_m5_users_v2");
      if (saved) {
        try { return JSON.parse(saved); } catch (e) { /* fallback */ }
      }
    }
    return initialUsers;
  });

  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("scamshield_m5_audit_v2");
      if (saved) {
        try { return JSON.parse(saved); } catch (e) { /* fallback */ }
      }
    }
    return initialAuditLogs;
  });

  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("scamshield_m5_tickets_v2");
      if (saved) {
        try { return JSON.parse(saved); } catch (e) { /* fallback */ }
      }
    }
    return initialSupportTickets;
  });

  const [systemAlerts, setSystemAlerts] = useState<SystemAlert[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("scamshield_m5_alerts_v2");
      if (saved) {
        try { return JSON.parse(saved); } catch (e) { /* fallback */ }
      }
    }
    return initialSystemAlerts;
  });

  const [metrics, setMetrics] = useState<OverviewMetrics>(initialOverviewMetrics);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("scamshield_m5_users_v2", JSON.stringify(users));
    }
  }, [users]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("scamshield_m5_audit_v2", JSON.stringify(auditLogs));
    }
  }, [auditLogs]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("scamshield_m5_tickets_v2", JSON.stringify(supportTickets));
    }
  }, [supportTickets]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("scamshield_m5_alerts_v2", JSON.stringify(systemAlerts));
    }
  }, [systemAlerts]);

  // Log action helper
  const logAudit = (action: string, target: string, result: "Success" | "Denied", reason: string) => {
    const now = new Date();
    const timeStr = `${now.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
    const newEntry: AuditLogEntry = {
      id: `aud-${Date.now()}`,
      time: timeStr,
      admin: adminName,
      action,
      target,
      result,
      reason: reason || "-",
      ipAddress: "127.0.0.1",
    };
    setAuditLogs((prev) => [newEntry, ...prev]);
  };

  const suspendUser = (userId: string, reason: string) => {
    if (currentRole !== "admin" && currentRole !== "support") {
      logAudit("Suspended account", `User ID: ${userId}`, "Denied", "Unauthorized role");
      return { success: false, error: "Only admins can suspend accounts." };
    }

    const targetUser = users.find((u) => u.id === userId);
    if (!targetUser) return { success: false, error: "User not found" };

    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId
          ? {
              ...u,
              status: "Suspended",
              supportNotes: [
                `Suspended by ${adminName} on ${new Date().toLocaleDateString()}. Reason: ${reason}`,
                ...u.supportNotes,
              ],
            }
          : u
      )
    );

    logAudit("Suspended account", targetUser.name, "Success", reason);
    return { success: true };
  };

  const reactivateUser = (userId: string, reason: string) => {
    if (currentRole !== "admin" && currentRole !== "support") {
      logAudit("Reactivated account", `User ID: ${userId}`, "Denied", "Unauthorized role");
      return { success: false, error: "Only admins can reactivate accounts." };
    }

    const targetUser = users.find((u) => u.id === userId);
    if (!targetUser) return { success: false, error: "User not found" };

    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId
          ? {
              ...u,
              status: "Active",
              supportNotes: [
                `Reactivated by ${adminName} on ${new Date().toLocaleDateString()}. Reason: ${reason}`,
                ...u.supportNotes,
              ],
            }
          : u
      )
    );

    logAudit("Reactivated account", targetUser.name, "Success", reason || "Issue resolved");
    return { success: true };
  };

  const replyToTicket = (ticketId: string, replyText: string) => {
    const now = new Date();
    const timeStr = `${now.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}`;

    setSupportTickets((prev) =>
      prev.map((t) => {
        if (t.id === ticketId) {
          return {
            ...t,
            status: "In progress",
            messages: [
              ...t.messages,
              {
                id: `m-${Date.now()}`,
                sender: adminName,
                senderType: "admin",
                timestamp: timeStr,
                text: replyText,
              },
            ],
          };
        }
        return t;
      })
    );

    const ticket = supportTickets.find((t) => t.id === ticketId);
    logAudit("Replied to ticket", ticket ? ticket.ticketNumber : ticketId, "Success", "Customer support reply");
  };

  const resolveTicket = (ticketId: string) => {
    setSupportTickets((prev) =>
      prev.map((t) => (t.id === ticketId ? { ...t, status: "Resolved" } : t))
    );
    const ticket = supportTickets.find((t) => t.id === ticketId);
    logAudit("Resolved ticket", ticket ? ticket.ticketNumber : ticketId, "Success", "Marked resolved by admin");
  };

  const acknowledgeAlert = (alertId: string) => {
    setSystemAlerts((prev) =>
      prev.map((a) => (a.id === alertId ? { ...a, status: "Acknowledged" } : a))
    );
    const alert = systemAlerts.find((a) => a.id === alertId);
    logAudit("Acknowledged alert", alert ? alert.alertType : alertId, "Success", "Alert reviewed by admin");
  };

  const exportCsvData = (reportType: string = "Audit_Report") => {
    let csvContent = "data:text/csv;charset=utf-8,";
    if (reportType === "Users") {
      csvContent += "ID,Name,Email,Plan,Status,ChecksCount,VaultCount,Renewal\n";
      users.forEach((u) => {
        csvContent += `"${u.id}","${u.name}","${u.email}","${u.plan}","${u.status}",${u.checksCount},${u.vaultCount},"${u.renewal}"\n`;
      });
    } else {
      csvContent += "Time,Admin,Action,Target,Result,Reason\n";
      auditLogs.forEach((l) => {
        csvContent += `"${l.time}","${l.admin}","${l.action}","${l.target}","${l.result}","${l.reason}"\n`;
      });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `ScamShield_${reportType}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    logAudit("Exported CSV", `${reportType} report`, "Success", "-");
  };

  const resetToDefaults = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("scamshield_m5_users_v2");
      localStorage.removeItem("scamshield_m5_audit_v2");
      localStorage.removeItem("scamshield_m5_tickets_v2");
      localStorage.removeItem("scamshield_m5_alerts_v2");
    }
    setUsers(initialUsers);
    setAuditLogs(initialAuditLogs);
    setSupportTickets(initialSupportTickets);
    setSystemAlerts(initialSystemAlerts);
    setMetrics(initialOverviewMetrics);
    setCurrentRole("admin");
  };

  return (
    <AdminContext.Provider
      value={{
        currentRole,
        setCurrentRole,
        adminName,
        adminEmail,
        users,
        auditLogs,
        supportTickets,
        systemAlerts,
        metrics,
        suspendUser,
        reactivateUser,
        replyToTicket,
        resolveTicket,
        acknowledgeAlert,
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
