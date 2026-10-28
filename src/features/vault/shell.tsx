"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ShieldCheck, LayoutGrid, LockKeyhole, KeyRound, Activity, Folder, Clock3, NotebookText, Menu, X, ChevronRight } from "lucide-react";
import { useVault } from "./provider";
import { Button } from "./ui";

const sections = [
  { href: "/vault", label: "All items", Icon: LayoutGrid },
  { href: "/vault/notes", label: "Secure notes", Icon: NotebookText },
  { href: "/vault/generator", label: "Generator", Icon: KeyRound },
  { href: "/vault/health", label: "Password health", Icon: Activity },
  { href: "/vault/folders", label: "Folders", Icon: Folder },
  { href: "/vault/activity", label: "Activity history", Icon: Clock3 },
];
export function VaultShell({ children }: { children: ReactNode }) {
  const pathname = usePathname(); const [menu, setMenu] = useState(false); const vault = useVault();
  const locked = vault.locked || pathname === "/vault/locked";
  return <div className="vault-app">
    {menu && <button aria-label="Close navigation" className="sidebar-backdrop" onClick={() => setMenu(false)} />}
    <aside className={`vault-sidebar ${menu ? "is-open" : ""}`}>
      <Link href="/vault" className="brand" onClick={() => setMenu(false)}><ShieldCheck size={27} strokeWidth={1.7} /><span>ScamShield</span></Link>
      <button className="mobile-menu-close icon-button" aria-label="Close menu" onClick={() => setMenu(false)}><X size={21} /></button>
      <p className="nav-caption">Your safety space</p>
      <nav aria-label="Application navigation" className="primary-nav">
        <button onClick={() => vault.notify("The shared overview will connect when the other modules are integrated.")}><LayoutGrid size={19} />Overview</button>
        <Link href="/vault" className="module-selected" onClick={() => setMenu(false)}><LockKeyhole size={19} />Password vault</Link>
        <button onClick={() => vault.notify("The scam checker belongs to Module 4 and is not connected in this branch.")}><ShieldCheck size={19} />Scam checker</button>
      </nav>
      <div className="nav-divider" /><p className="nav-caption">Password vault</p>
      <nav aria-label="Vault navigation" className="section-nav">{sections.map(({ href, label, Icon }) => {
        const active = href === "/vault" ? pathname === href || pathname.startsWith("/vault/login") || pathname === "/vault/new" : pathname.startsWith(href);
        return <Link key={href} href={locked ? "/vault/locked" : href} aria-current={active ? "page" : undefined} onClick={() => setMenu(false)}><Icon size={19} strokeWidth={1.7} />{label}</Link>;
      })}</nav>
      <div className="sidebar-bottom"><Button variant="secondary" onClick={() => { setMenu(false); vault.lock(); }} disabled={locked}><LockKeyhole size={16} />{locked ? "Vault locked" : "Lock vault"}</Button><p>Auto-lock after 5 min of inactivity</p></div>
    </aside>
    <div className="vault-workspace">
      <header className="vault-topbar"><div className="desktop-breadcrumb">ScamShield <ChevronRight size={14} /> Module 3</div><div className="mobile-brand"><button className="icon-button" aria-label="Open navigation" onClick={() => setMenu(true)}><Menu size={21} /></button><ShieldCheck size={22} /><strong>ScamShield</strong></div><div className="vault-session"><ShieldCheck size={17} /><span>{locked ? "Vault locked" : "Demo vault unlocked"}</span><span className="avatar" aria-label="Demo user Nimal Perera">NP</span><button className="icon-button mobile-lock" aria-label="Lock vault" onClick={vault.lock}><LockKeyhole size={18} /></button></div></header>
      <div className="demo-notice">Frontend demo <span>· Changes stay in memory. Use fictional details only.</span></div>
      <main id="main" className="vault-main">{locked && pathname !== "/vault/locked" ? <LockedScreen /> : children}</main>
      <footer className="vault-footer"><span>ScamShield / Password vault</span><Link href="/vault/states">Preview interface states</Link></footer>
    </div>
    <nav className="mobile-bottom-nav" aria-label="Quick navigation">{[sections[0], sections[2], sections[3]].map(({ href, label, Icon }) => <Link key={href} href={locked ? "/vault/locked" : href} aria-current={pathname === href ? "page" : undefined}><Icon size={20} /><span>{label === "All items" ? "Vault" : label === "Password health" ? "Health" : label}</span></Link>)}</nav>
    {vault.toast && <div role="status" className="vault-toast">{vault.toast}<button className="icon-button" aria-label="Dismiss notification" onClick={() => vault.notify("")}><X size={16} /></button></div>}
  </div>;
}
export function LockedScreen() {
  const vault = useVault();
  return <><div className="page-heading"><div><h1>Your vault is locked</h1><p className="muted mt-2">Your private items are hidden while locked.</p></div></div><section className="locked-panel v-card"><LockKeyhole size={32} className="text-primary" /><h2>Welcome back, Nimal</h2><p className="muted">This is a frontend demonstration. Account verification will be connected through Module 2.</p><Button onClick={vault.unlock}>Continue with demo data</Button><p className="text-xs muted">Continuing resets the fictional sample vault. Demo locking is not an authentication boundary.</p><p className="text-xs muted">Auto-lock: 5 minutes of inactivity</p></section></>;
}
