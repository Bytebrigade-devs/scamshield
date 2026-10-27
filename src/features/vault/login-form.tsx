"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { useVault } from "./provider";
import { defaultGeneratorOptions, generatePassword, safeWebsite, strength, type Login } from "./model";
import { Advice, Button, Card, Heading, HealthBadge } from "./ui";
import { DialogHost } from "./dialogs";

export function LoginForm({ login, generatedPassword = "", consumeGenerated }: { login?: Login; generatedPassword?: string; consumeGenerated?: () => void }) {
  const router = useRouter();
  const vault = useVault(); const [title, setTitle] = useState(login?.title ?? ""); const [website, setWebsite] = useState(login?.website ?? ""); const [username, setUsername] = useState(login?.username ?? ""); const [password, setPassword] = useState(login?.password ?? generatedPassword); const [folderId, setFolderId] = useState(login?.folderId ?? "personal"); const [notes, setNotes] = useState(login?.notes ?? ""); const [show, setShow] = useState(!!generatedPassword); const [errors, setErrors] = useState<Record<string,string>>({}); const [saved, setSaved] = useState("");
  const back = login ? `/vault/login/${login.id}` : "/vault";
  return <><Heading title={login ? "Edit login" : "Add a login"} description={login ? "Update your saved login details." : "Save the details once. Find them whenever you need them."} action={<Link href={back} className="v-button v-button--secondary" onClick={consumeGenerated}>Cancel</Link>} />
    <div className="two-column"><Card><h2 className="mb-6">Login information</h2><form className="form-stack" noValidate onSubmit={e => {
      e.preventDefault(); const next: Record<string,string> = {};
      if (!title.trim()) next.title = "Enter a title for this login.";
      if (!username.trim()) next.username = "Enter a username or email.";
      if (!password) next.password = "Password is required. Use the generator to create one.";
      if (website.trim() && !safeWebsite(website.trim())) next.website = "Enter a complete http:// or https:// website address.";
      setErrors(next); if (Object.keys(next).length) return;
      const id = login?.id ?? crypto.randomUUID(); vault.saveLogin({ id, title: title.trim(), website: website.trim(), username: username.trim(), password, folderId: vault.folders.some(f => f.id === folderId) ? folderId : "unfiled", notes, favorite: login?.favorite ?? false, updatedAt: new Date().toISOString() }); consumeGenerated?.(); setSaved(id);
    }}>
      <label className="v-field">Title *<input aria-label="Title *" className="v-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Google" maxLength={100} aria-invalid={!!errors.title} aria-describedby={errors.title ? "title-error" : undefined} />{errors.title && <span id="title-error" className="field-error">{errors.title}</span>}</label>
      <label className="v-field">Website<input aria-label="Website" className="v-input" value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://example.com" maxLength={500} aria-invalid={!!errors.website} aria-describedby={errors.website ? "website-error" : undefined} />{errors.website && <span id="website-error" className="field-error">{errors.website}</span>}</label>
      <label className="v-field">Username / email *<input aria-label="Username / email *" className="v-input" value={username} onChange={e => setUsername(e.target.value)} placeholder="you@example.com" maxLength={200} autoComplete="off" aria-invalid={!!errors.username} aria-describedby={errors.username ? "username-error" : undefined} />{errors.username && <span id="username-error" className="field-error">{errors.username}</span>}</label>
      <div className="form-stack"><label className="v-field">Password *<input aria-label="Password *" className="v-input technical" type={show ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter a fictional password" maxLength={256} autoComplete="new-password" aria-invalid={!!errors.password} aria-describedby={errors.password ? "password-error" : undefined} />{errors.password && <span id="password-error" className="field-error">{errors.password}</span>}</label><div className="form-actions"><Button variant="secondary" onClick={() => { setPassword(generatePassword(defaultGeneratorOptions)); setShow(true); }}><KeyRound size={16} />Generate password</Button><Button variant="secondary" onClick={() => setShow(!show)}>{show ? <EyeOff size={16} /> : <Eye size={16} />}{show ? "Hide" : "Show"}</Button></div>{password && <div className="flex items-center gap-3"><HealthBadge health={strength(password)} /><span className="text-xs muted">Preview estimate only</span></div>}</div>
      <label className="v-field">Folder<select className="v-select" value={folderId} onChange={e => setFolderId(e.target.value)}>{vault.folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
      <label className="v-field">Notes (optional)<textarea className="v-textarea" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add a reminder for this login" maxLength={2000} rows={3} /></label>
      {!!Object.keys(errors).length && <p role="alert" className="field-error">Check the highlighted fields before saving.</p>}
      <div className="form-actions"><Button type="submit">{login ? "Save changes" : "Save login"}</Button><Link href={back} className="v-button v-button--secondary" onClick={consumeGenerated}>Cancel</Link></div>
    </form></Card><Advice kind="form" /></div>
    {saved && <DialogHost spec={{ type:"success", title:"Login saved", description:"Your login is saved for this demo session. It is not persisted or encrypted by this frontend.", done: () => router.push(`/vault/login/${saved}`) }} close={() => setSaved("")} />}
  </>;
}
