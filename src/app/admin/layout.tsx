"use client";

import React from "react";
import Link from "next/link";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { AdminProvider, useAdmin } from "@/lib/admin-store";
import { ShieldAlert, LogOut } from "lucide-react";

function AdminLayoutContent({ children }: { children: React.ReactNode }) {
  const { currentRole } = useAdmin();

  // Page 12: Admin role required (Access Denied view when role is none)
  if (currentRole === "none") {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center">
          <div className="w-12 h-12 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div className="text-xs font-semibold text-teal-800 uppercase tracking-wide mb-1">
            Admin role required
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-3">
            You do not have access to the admin console
          </h2>
          <p className="text-sm text-slate-600 mb-6 leading-relaxed">
            Your account is signed in, but it does not have an admin role. If you think this is a mistake, ask a super admin to review your role.
          </p>

          <div className="flex justify-center">
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium transition shadow-sm"
            >
              <LogOut className="w-4 h-4" />
              Back to my account
            </Link>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 text-xs text-slate-400">
            Client-side RBAC simulation for preview; production deployment enforces verified server-side session checks.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#F8FAFC] text-slate-900 antialiased font-sans">
      <AdminSidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <main className="flex-1 p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
        {/* Global Privacy Footer Boundary */}
        <footer className="px-8 py-4 border-t border-slate-200 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2 bg-white">
          <p>
            🔒 <strong className="text-slate-800">Zero Raw-Content Access:</strong> Admin views show counts and metadata only. Passwords, vault records (server-side AES-256-GCM encrypted in Module 3), and submitted scam message texts are never stored or accessible in the admin console.
          </p>
          <p className="text-[11px] text-slate-400">
            ScamShield IS2901 · Byte Brigade
          </p>
        </footer>
      </div>
    </div>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminProvider>
      <AdminLayoutContent>{children}</AdminLayoutContent>
    </AdminProvider>
  );
}
