"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  BarChart3,
  Mail,
  FileText,
  Shield,
  Activity,

  ShieldCheck,

  KeyRound,
} from "lucide-react";
import { useAdmin } from "@/lib/admin-store";
import { AdminRole } from "@/lib/types/admin";

export default function AdminSidebar() {
  const pathname = usePathname();
  const { currentRole, setCurrentRole, adminName } = useAdmin();

  const navItems = [
    { name: "Overview", href: "/admin", icon: LayoutDashboard },
    { name: "Users", href: "/admin/users", icon: Users },
    { name: "Analytics", href: "/admin/analytics", icon: BarChart3 },
    { name: "Support inbox", href: "/admin/support-inbox", icon: Mail },
    { name: "Audit log", href: "/admin/audit-log", icon: FileText },
    { name: "Safety score", href: "/admin/safety-scores", icon: Shield },
    { name: "Monitoring", href: "/admin/monitoring", icon: Activity },
  ];

  return (
    <aside className="w-60 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col justify-between min-h-screen">
      {/* Top Section */}
      <div>
        {/* Brand Header */}
        <div className="p-6 pb-5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 leading-tight">ScamShield</h1>
            <p className="text-xs text-slate-500 font-medium">Admin console</p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="px-3 space-y-1 mt-1">
          {navItems.map((item) => {
            const isActive =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-teal-50 text-teal-800 font-semibold"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                <Icon
                  className={`w-4 h-4 ${
                    isActive ? "text-teal-700" : "text-slate-400"
                  }`}
                />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Governance / Roles Link */}
        <div className="px-3 pt-4 border-t border-slate-100 mt-4">
          <Link
            href="/admin/roles"
            className={`flex items-center gap-3 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors ${
              pathname === "/admin/roles"
                ? "bg-teal-50 text-teal-800 font-semibold"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
            }`}
          >
            <KeyRound className="w-3.5 h-3.5 text-slate-400" />
            <span>Roles and permissions</span>
          </Link>
        </div>
      </div>

      {/* Bottom Footer: User Status & Role Switcher */}
      <div className="p-4 border-t border-slate-100 bg-slate-50/60 m-3 rounded-xl">
        <div className="text-xs text-slate-500">Signed in as</div>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-900">{adminName}</span>
          <span className="w-2 h-2 rounded-full bg-emerald-500" title="Online"></span>
        </div>
        <div className="text-[11px] text-slate-400 mt-0.5">Synthetic data only</div>

        {/* Interactive Role Switcher for Presentation & Viva */}
        <div className="mt-3 pt-2 border-t border-slate-200">
          <label htmlFor="role-select" className="text-[11px] font-medium text-slate-600 block mb-1">
            Simulate Role:
          </label>
          <select
            id="role-select"
            value={currentRole}
            onChange={(e) => setCurrentRole(e.target.value as AdminRole)}
            className="w-full text-xs bg-white border border-slate-200 rounded-md px-2 py-1 text-slate-800 focus:outline-none focus:border-teal-600"
          >
            <option value="admin">Super admin (Full access)</option>
            <option value="support">Support admin (Role limits)</option>
            <option value="none">No admin role (Deny view)</option>
          </select>
        </div>
      </div>
    </aside>
  );
}
