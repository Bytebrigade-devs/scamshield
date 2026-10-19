"use client";

import React from "react";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { AdminProvider } from "@/lib/admin-store";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminProvider>
      <div className="flex min-h-screen bg-[#080e1a] text-[#eaf1f7] font-sans antialiased selection:bg-[#2dd4bf] selection:text-[#0b1322]">
        <AdminSidebar />
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          <main className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full">
            {children}
          </main>
          {/* Global Privacy Footer Boundary */}
          <footer className="px-8 py-4 border-t border-[#1f2d45] text-xs text-[#8ea0b3] flex flex-col sm:flex-row items-center justify-between gap-2 bg-[#0b1322]">
            <p>
              🔒 <strong className="text-[#eaf1f7]">Strict Zero-Knowledge Principle:</strong> Admin views show counts and metadata only. No passwords, secret notes, or submitted message texts are ever stored or accessible here.
            </p>
            <p className="text-[11px] text-slate-400">
              ScamShield IS2901 · Byte Brigade
            </p>
          </footer>
        </div>
      </div>
    </AdminProvider>
  );
}
