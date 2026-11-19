"use client";
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { X, ShieldCheck, TriangleAlert, Check, KeyRound } from "lucide-react";
import type { Health } from "./model";

export function Button({ variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "quiet" }) {
  return <button type="button" {...props} className={`v-button v-button--${variant} ${className}`} />;
}
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) { return <section className={`v-card ${className}`}>{children}</section>; }
export function Heading({ title, description, action }: { title: string; description: string; action?: ReactNode }) { return <div className="page-heading"><div><h1>{title}</h1><p className="muted mt-2">{description}</p></div>{action}</div>; }
export function HealthBadge({ health, long = false }: { health: Health; long?: boolean }) {
  const Icon = health === "strong" ? ShieldCheck : health === "reused" ? KeyRound : TriangleAlert;
  const label = { strong: long ? "Strong · unique" : "Strong", weak: "Weak", reused: "Reused", common: "Common" }[health];
  return <span className={`health-badge health-${health}`}><Icon size={13} />{label}</span>;
}
export function Advice({ kind = "privacy" }: { kind?: "privacy" | "generator" | "form" }) {
  return <Card className="advice-card"><ShieldCheck size={23} /><h2>{kind === "privacy" ? "Private by design" : kind === "generator" ? "Built for better habits" : <>A little stronger.<br />A lot safer.</>}</h2><p>{kind === "privacy" ? "Your passwords and notes belong in your vault, not in analytics or AI requests." : "Use a different password for every account. Aim for at least 14 characters and avoid predictable words."}</p><p className="text-xs">{kind === "privacy" ? "Demo only. Encrypted storage and account verification are not connected." : "Only summary health information is intended to contribute to your Digital Safety Score."}</p></Card>;
}
export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; const previous = document.activeElement as HTMLElement | null; dialog?.showModal(); return () => { dialog?.close(); previous?.focus(); }; }, []);
  return <dialog ref={ref} className="v-modal" onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }} aria-labelledby="modal-title"><div className="modal-inner"><button className="icon-button modal-close" aria-label="Close dialog" onClick={onClose}><X size={20} /></button><h2 id="modal-title">{title}</h2>{children}</div></dialog>;
}
export function SuccessIcon() { return <span className="success-circle"><Check size={24} /></span>; }
