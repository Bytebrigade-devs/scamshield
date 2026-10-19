import Link from "next/link";

// Placeholder home page; Module 1 (Landing Page) will replace this.
export default function Home() {
  return (
    <main className="mx-auto max-w-xl p-10 text-center">
      <h1 className="text-3xl font-bold">ScamShield</h1>
      <p className="mt-2 text-slate-600">Digital safety, simplified.</p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href="/signup" className="rounded bg-blue-600 px-4 py-2 text-white">Sign up</Link>
        <Link href="/login" className="rounded border px-4 py-2">Log in</Link>
        <Link href="/pricing" className="rounded border px-4 py-2">Pricing</Link>
      </div>
    </main>
  );
}
