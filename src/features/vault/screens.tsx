"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, TriangleAlert, Copy, Eye, EyeOff, ArrowLeft, Star, LockKeyhole } from "lucide-react";
import { Heading, Card, Button, Advice, HealthBadge } from "./ui";
import { useVault } from "./provider";
import { LoginList } from "./login-list";
import { LoginForm } from "./login-form";
import { LockedScreen } from "./shell";
import { DialogHost, type DialogSpec } from "./dialogs";
import { healthOf, safeWebsite, type Login } from "./model";
import { Generator, Health } from "./password-tools";
import { Notes, Folders, ActivityHistory, InterfaceStates } from "./supporting-screens";

export function VaultScreen({ segments }: { segments: string[] }) {
  const vault = useVault();
  const path = segments.join("/");
  if (path === "locked") return <LockedScreen />;
  if (path === "") return <AllItems />;
  if (path === "new") return <LoginForm key="new" generatedPassword={vault.generatedDraft} consumeGenerated={() => vault.setGeneratedDraft("")} />;
  if (segments[0] === "login" && (segments.length === 2 || (segments.length === 3 && segments[2] === "edit"))) {
    const item = vault.logins.find(login => login.id === segments[1]);
    if (!item) return <Unavailable />;
    return segments[2] === "edit" ? <LoginForm key={item.id} login={item} /> : <LoginDetails key={item.id} login={item} />;
  }
  if (path === "generator") return <Generator />;
  if (path === "health") return <Health />;
  if (path === "notes") return <Notes />;
  if (path === "folders") return <Folders />;
  if (path === "activity") return <ActivityHistory />;
  if (path === "states") return <InterfaceStates />;
  return <Unavailable />;
}
function AllItems() {
  const vault = useVault(); const attention = vault.logins.filter(login => healthOf(login, vault.logins) !== "strong").length;
  return <><Heading title="Password vault" description="A safer home for your passwords, notes and everyday accounts." action={<Link className="v-button v-button--primary" href="/vault/new"><Plus size={17} />Add item</Link>} />
    <div className="stats-grid"><Stat number={vault.logins.length} label="Saved logins" /><Stat number={vault.notes.length.toString().padStart(2,"0")} label="Secure notes" /><Stat number={attention.toString().padStart(2,"0")} label="Need attention" warning /><Card><p className="stat-number text-primary">82<span className="text-xl">/100</span></p><p className="stat-label">Password health</p><p className="stat-small">Illustrative score · not calculated</p></Card></div>
    {!!attention && <div className="warning-banner"><TriangleAlert size={19} /><p>{attention} passwords need attention. Small changes can make your accounts safer.</p><Link className="v-button v-button--secondary" href="/vault/health">Review health</Link></div>}
    <LoginList />
  </>;
}
function Stat({ number, label, warning = false }: { number: number | string; label: string; warning?: boolean }) { return <Card><p className="stat-number" style={warning ? { color:"var(--color-warning)" } : undefined}>{number}</p><p className="stat-label">{label}</p></Card>; }
function LoginDetails({ login }: { login: Login }) {
  const vault = useVault(); const router = useRouter(); const [revealed, setRevealed] = useState(false); const [dialog, setDialog] = useState<DialogSpec | null>(null);
  async function copyPassword() { if (await vault.copy(login.password, "Password")) setDialog({ type:"success", title:"Password copied", description:"We will try to clear it after 30 seconds. Browser permissions may prevent clipboard clearing." }); }
  const health = healthOf(login, vault.logins);
  return <><Heading title="Login details" description="All the information you need, kept in one private place." action={<Link className="v-button v-button--primary" href={`/vault/login/${login.id}/edit`}>Edit login</Link>} />
    <div className="two-column"><Card><div className="detail-header"><span className="entry-letter">{login.title[0]}</span><div><h2>{login.title}</h2><p className="text-xs muted mt-1">{login.website ? new URL(safeWebsite(login.website) ?? "https://example.com").hostname : "No website"}</p></div><HealthBadge health={health} /></div>
      <div className="form-stack"><label className="v-field">Username / email<input className="v-input" readOnly value={login.username} /></label><Button className="self-start" variant="quiet" onClick={async () => { if (await vault.copy(login.username,"Username")) vault.notify("Username copied."); }}><Copy size={15} />Copy username</Button>
      <label className="v-field">Password<input className="v-input technical" type={revealed ? "text" : "password"} readOnly value={login.password} autoComplete="off" /></label><div className="form-actions"><Button variant="secondary" onClick={() => setRevealed(!revealed)}>{revealed ? <EyeOff size={16} /> : <Eye size={16} />}{revealed ? "Hide password" : "Show password"}</Button><Button variant="secondary" onClick={copyPassword}><Copy size={15} />Copy password</Button></div>
      <label className="v-field">Website<input className="v-input" readOnly value={login.website || "No website saved"} /></label><label className="v-field">Folder<input className="v-input" readOnly value={vault.folderName(login.folderId)} /></label>
      <div className="detail-section"><h3>Notes</h3><p className="whitespace-pre-wrap">{login.notes || "No notes added."}</p><p className="text-xs muted">Updated {login.updatedAt.slice(0,10)}</p></div></div>
    </Card><div className="side-stack"><Advice /><Card><h3>Manage this login</h3><Button variant="secondary" onClick={() => setDialog({ type:"move", ids:[login.id] })}>Move to folder</Button><Button variant="secondary" onClick={() => vault.toggleFavorite(login.id)}><Star size={15} fill={login.favorite ? "currentColor" : "none"} />{login.favorite ? "Remove from favourites" : "Add to favourites"}</Button><Button variant="danger" onClick={() => setDialog({ type:"delete", ids:[login.id], name:login.title, done:() => router.push("/vault") })}>Delete login</Button></Card><Card><h3>{health === "strong" ? "Looking good" : "A small change can help"}</h3><p className="muted text-xs">{health === "strong" ? "This sample meets the preview length check and is not reused in this demo vault." : "Review this password. Update it on the account's own website before updating your saved login."}</p></Card></div></div>
    <Link className="v-button v-button--quiet mt-5" href="/vault"><ArrowLeft size={15} />Back to vault</Link>{dialog && <DialogHost key={dialog.type} spec={dialog} close={() => setDialog(null)} />}
  </>;
}
function Unavailable() { return <Card className="empty-state"><LockKeyhole size={30} /><h2>This item is unavailable</h2><p>The item may have been removed or the address is invalid. Return to your vault to view the available demo items.</p><Link className="v-button v-button--primary" href="/vault">Return to my vault</Link></Card>; }
