"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ShieldAlert,
  Users,
  BarChart3,
  ClipboardList,
  ShieldCheck,
  Radar,
  Lock,
  ArrowRightLeft,
  RotateCcw,
} from "lucide-react";
import { useAdmin } from "@/lib/admin-store";
import { AdminRole } from "@/lib/types/admin";

export default function AdminSidebar() {
  const pathname = usePathname();
  const { currentRole, setCurrentRole, adminEmail, resetToDefaults } = useAdmin();

  const navItems = [
    { name: "Overview", href: "/admin", icon: BarChart3, tag: "M5-14" },
    { name: "Users", href: "/admin/users", icon: Users, tag: "M5-09" },
    { name: "Analytics", href: "/admin/analytics", icon: BarChart3, tag: "M5-05" },
    { name: "Scam Intelligence", href: "/admin/scams", icon: Radar, tag: "M5-04" },
    { name: "Support & Audit", href: "/admin/support-audit", icon: ClipboardList, tag: "M5-11" },
    { name: "Safety Scores (M6)", href: "/admin/safety-scores", icon: ShieldAlert, tag: "M6-05" },
  ];

  return (
    <aside className="w-64 flex-shrink-0 bg-[#0b1322] border-r border-[#1f2d45] flex flex-col min-h-screen text-[#8ea0b3]">
      {/* Brand Header */}
      <div className="p-5 border-b border-[#1f2d45]">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-teal-500/10 border border-[#2dd4bf] flex items-center justify-center text-[#2dd4bf]">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="text-base font-bold text-[#eaf1f7] tracking-tight">ScamShield</div>
            <div className="text-xs text-[#2dd4bf] font-medium">Admin & Operations (M5)</div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#13203a] border border-[#1f2d45] text-[11px] text-[#8ea0b3]">
          <span className="w-2 h-2 rounded-full bg-[#34d399] animate-pulse"></span>
          <span>Synthetic seed data · Mock payments</span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="p-3 space-y-1.5 flex-1">
        <div className="px-3 py-2 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
          Administration
        </div>
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? "bg-[#2dd4bf]/15 text-[#2dd4bf] border border-[#2dd4bf]/30"
                  : "text-[#8ea0b3] hover:text-[#eaf1f7] hover:bg-[#13203a]/60"
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`h-4 w-4 ${isActive ? "text-[#2dd4bf]" : "text-[#8ea0b3]"}`} />
                <span>{item.name}</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#13203a] text-slate-400 border border-[#1f2d45]">
                {item.tag}
              </span>
            </Link>
          );
        })}

        <div className="pt-4 px-3 py-2 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
          Evaluation Sandbox
        </div>
        
        {/* Role Switcher for Viva Demo */}
        <div className="mx-2 p-3 rounded-xl bg-[#0e1726] border border-[#1f2d45] space-y-2">
          <div className="flex items-center justify-between text-xs text-[#eaf1f7]">
            <span className="font-semibold flex items-center gap-1.5">
              <ArrowRightLeft className="w-3.5 h-3.5 text-[#2dd4bf]" />
              Role Simulator
            </span>
            <span className="text-[10px] text-[#2dd4bf]">RBAC M5-10</span>
          </div>
          <select
            value={currentRole}
            onChange={(e) => setCurrentRole(e.target.value as AdminRole)}
            className="w-full text-xs bg-[#13203a] border border-[#1f2d45] rounded-md px-2.5 py-1.5 text-[#eaf1f7] focus:outline-none focus:border-[#2dd4bf]"
          >
            <option value="admin">Admin (Full Access)</option>
            <option value="support">Support (View & Note only)</option>
            <option value="security_analyst">Security Analyst (Read Only)</option>
          </select>
          <p className="text-[10px] text-[#8ea0b3] leading-relaxed">
            {currentRole === "admin"
              ? "All actions enabled: suspend, reactivate, exports."
              : currentRole === "support"
              ? "Support mode: can add notes, suspension disabled."
              : "Analyst mode: read-only metrics, no moderation."}
          </p>
        </div>
      </nav>

      {/* Admin User Badge & Footer */}
      <div className="p-4 border-t border-[#1f2d45] space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs">
            <div className="text-[11px] text-[#8ea0b3]">Signed in as</div>
            <div className="text-sm font-semibold text-[#eaf1f7] truncate max-w-[130px]">{adminEmail}</div>
            <div className="text-[11px] text-[#2dd4bf] mt-0.5">Role: {currentRole.toUpperCase()} · M5-01</div>
          </div>
          <button
            onClick={() => resetToDefaults()}
            title="Reset seed data to defaults"
            className="p-1.5 rounded-md hover:bg-[#13203a] text-[#8ea0b3] hover:text-[#2dd4bf] transition"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        <div className="pt-2 border-t border-[#1f2d45]/60 flex items-center gap-2 text-[11px] text-slate-400">
          <Lock className="w-3.5 h-3.5 text-[#2dd4bf]" />
          <span>Zero-Knowledge vault boundaries enforced</span>
        </div>
      </div>
    </aside>
  );
}
