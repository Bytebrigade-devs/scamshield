import Link from "next/link";
import { ShieldCheck, BarChart3, Users, Lock } from "lucide-react";

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl p-10 text-center space-y-8">
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/30 text-teal-700 text-xs font-semibold mb-4">
          <ShieldCheck className="w-4 h-4 text-teal-600" />
          IS2901 Software Development Project · Byte Brigade
        </div>
        <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">ScamShield</h1>
        <p className="mt-2 text-slate-600">Digital safety, simplified.</p>
      </div>

      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wider">
          Module 5: Admin Dashboard & Operations
        </h2>
        <p className="text-xs text-slate-600 max-w-md mx-auto">
          Access the real-time control room with user management, subscription analytics, AI threat monitoring, and audit trails.
        </p>
        <div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-700 text-white hover:bg-teal-800 text-sm font-semibold shadow-md transition"
          >
            <BarChart3 className="w-4 h-4" />
            Open Admin Dashboard (/admin)
          </Link>
        </div>
      </div>

      <div className="pt-2 flex justify-center gap-3 text-xs">
        <Link href="/signup" className="rounded-lg bg-slate-900 px-4 py-2 text-white hover:bg-slate-800">
          Sign up (M2)
        </Link>
        <Link href="/login" className="rounded-lg border border-slate-300 px-4 py-2 hover:bg-slate-100">
          Log in (M2)
        </Link>
        <Link href="/pricing" className="rounded-lg border border-slate-300 px-4 py-2 hover:bg-slate-100">
          Pricing (M2)
        </Link>
      </div>
    </main>
  );
}
