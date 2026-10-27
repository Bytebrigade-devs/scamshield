import Link from "next/link";
import { buttonClass } from "@/components/ui/Button";
import { ShieldIcon } from "@/components/ui/icons";

// Placeholder home page; Module 1 (Landing Page) will replace this.
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-4 text-center">
      <ShieldIcon size={40} className="text-primary" />
      <h1 className="mt-4 text-[36px] font-bold leading-tight">ScamShield</h1>
      <p className="mt-2 text-muted">Digital safety, simplified.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/signup" className={buttonClass({ size: "lg" })}>Sign up</Link>
        <Link href="/login" className={buttonClass({ variant: "secondary", size: "lg" })}>Log in</Link>
        <Link href="/pricing" className={buttonClass({ variant: "text", size: "lg" })}>Pricing</Link>
      </div>
    </main>
  );
}
