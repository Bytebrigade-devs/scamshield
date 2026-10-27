"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Alert, Card } from "@/components/ui/Card";

export default function PasswordRecovery({ reset = false }: { reset?: boolean }) {
  const [value, setValue] = useState(""); const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (reset && (value.length < 8 || value !== confirm)) { setError("Use at least 8 characters and matching passwords."); return; }
    setBusy(true);
    await new Promise(resolve => setTimeout(resolve, 250));
    setDone(true); setValue(""); setConfirm(""); setBusy(false);
  }
  return <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12"><Card className="p-8"><h1 className="text-[28px] font-bold">{reset ? "Set a new password" : "Reset your password"}</h1>
    <p className="mt-3 text-sm text-muted">Demo only. No email is sent and no password is stored.</p>
    {done ? <div className="mt-6 space-y-4"><Alert tone="success">{reset ? "Demo password updated successfully. You can now return to login." : "Your demo reset link is ready. Open it below to continue."}</Alert><Link href={reset ? "/login" : "/reset-password"} className="link">{reset ? "Go to login" : "Open demo reset link"}</Link><Button variant="text" block onClick={() => setDone(false)}>Try again</Button></div> : <form className="mt-6 space-y-4" onSubmit={submit}>
    <Field label={reset ? "New password" : "Email"} type={reset ? "password" : "email"} autoComplete="off" required minLength={reset ? 8 : undefined} value={value} onChange={e => setValue(e.target.value)}/>
    {reset && <Field label="Confirm password" type="password" autoComplete="off" required minLength={8} value={confirm} onChange={e => setConfirm(e.target.value)}/>}
    {error && <Alert tone="danger">{error}</Alert>}
    <Button type="submit" block loading={busy} loadingLabel="Please wait…">{reset ? "Update password" : "Send reset link"}</Button>
  </form>}</Card><Link href="/login" className="link mt-6 text-center">Back to login</Link></main>;
}
