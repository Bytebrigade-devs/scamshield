"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { PaymentCardIcon } from "@/components/ui/icons";
import { saveDemoCard } from "@/lib/demo-store";

/** A visual card-entry demo. Credentials never leave this component or get saved. */
export function DemoCardForm({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [code, setCode] = useState("");
  const [save, setSave] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  function addCard(event: React.FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Enter a demo cardholder name.";
    if (number.replace(/\s/g, "") !== "4242424242424242") next.number = "Use the demo card 4242 4242 4242 4242.";
    const match = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(expiry);
    if (!match || new Date(2000 + Number(match[2]), Number(match[1]), 1).getTime() <= Date.now()) next.expiry = "Enter a future date in MM/YY format.";
    if (code !== "123") next.code = "Use the demo security code 123.";
    setErrors(next);
    if (Object.keys(next).length) return;
    if (save) saveDemoCard({ last4: "4242", expiry });
    setName(""); setNumber(""); setExpiry(""); setCode(""); onAdded();
  }
  return <form onSubmit={addCard} noValidate autoComplete="off" className="space-y-4">
    <div className="text-center"><h2 className="text-xl font-semibold">Add Your Card</h2><p className="mt-1 text-sm text-muted">Debit or credit card</p></div>
    <Button variant="text" block onClick={() => { setName("Demo User"); setNumber("4242 4242 4242 4242"); setExpiry(`12/${String(new Date().getFullYear() + 1).slice(-2)}`); setCode("123"); setErrors({}); }}>Fill dummy card details</Button>
    <Field label="Name on card" placeholder="Name" value={name} onChange={e => setName(e.target.value)} maxLength={80} error={errors.name} className="rounded-full bg-background" />
    <Field label="Card number" placeholder="4242 4242 4242 4242" value={number} inputMode="numeric" maxLength={19} onChange={e => setNumber(e.target.value.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim())} error={errors.number} className="rounded-full bg-background tabular" icon={<PaymentCardIcon size={18}/>} />
    <Field label="Expiry date" placeholder="MM/YY" value={expiry} inputMode="numeric" maxLength={5} onChange={e => { const digits = e.target.value.replace(/\D/g, "").slice(0, 4); setExpiry(digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits); }} error={errors.expiry} className="rounded-full bg-background tabular" />
    <Field label="Security code" placeholder="123" value={code} type="password" inputMode="numeric" maxLength={3} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 3))} error={errors.code} className="rounded-full bg-background" />
    <div><label className="flex min-h-11 items-center gap-2 text-sm text-muted"><input type="checkbox" checked={save} onChange={e => setSave(e.target.checked)} className="h-4 w-4 accent-primary"/>Save my card</label><p className="text-sm text-muted">Saves only a dummy card label and expiry in this browser.</p></div>
    <Button type="submit" block size="lg" className="rounded-full">Add Card</Button>
    <p className="text-center text-sm text-muted">Test card: 4242 4242 4242 4242, a future expiry, code 123. Card number and security code are never saved.</p>
  </form>;
}
