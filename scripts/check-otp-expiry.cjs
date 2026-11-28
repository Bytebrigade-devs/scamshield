// Prove, against the real Supabase project, that an emailed auth token actually dies when the
// configured window passes. Nothing in the app can enforce that window — GoTrue owns the token —
// so this is the only way to know that AUTH_OTP_EXPIRY_SECONDS and the project setting agree.
//
// Usage:
//   node scripts/check-otp-expiry.cjs --quick        prove the mechanism only (seconds)
//   node scripts/check-otp-expiry.cjs                also wait out the window and prove it expired
//   node scripts/check-otp-expiry.cjs --wait=900     wait 900s instead of the configured window
//
// It creates two throwaway accounts and deletes them again, including when the check fails.
// Codes, tokens and links are never printed. Not part of CI: the full run takes longer than the
// configured window.
const fs = require('node:fs');
const path = require('node:path');

function readEnv() {
  const file = path.join(__dirname, '..', '.env.local');
  const env = {};
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
      if (m) env[m[1]] = m[2].trim();
    }
  }
  return env;
}

const args = process.argv.slice(2);
const quick = args.includes('--quick');
const waitArg = args.map((a) => /^--wait=(\d+)$/.exec(a)).find(Boolean);
const env = readEnv();

const BASE = (env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY || '';
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const declared = Number(env.AUTH_OTP_EXPIRY_SECONDS || '') > 0 ? Number(env.AUTH_OTP_EXPIRY_SECONDS) : 300;

if (!BASE || !SERVICE || !ANON) {
  console.error('NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set in .env.local.');
  process.exit(2);
}

async function call(route, { method = 'POST', key = SERVICE, body } = {}) {
  const res = await fetch(`${BASE}/auth/v1${route}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  return { status: res.status, json: safeJson(text) };
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Outcome is described without ever echoing the token: status plus GoTrue's own error code. */
function describe(step, result) {
  const code = result.json?.error_code ?? result.json?.code ?? null;
  const msg = result.json?.msg ?? result.json?.error_description ?? null;
  return { step, status: result.status, errorCode: code, message: typeof msg === 'string' ? msg.slice(0, 120) : null };
}

async function makeUser(label) {
  const email = `otp-expiry-${label}-${Date.now()}@scamshield.test`;
  const created = await call('/admin/users', { body: { email, password: `Expiry${Date.now()}!x`, email_confirm: true } });
  if (!created.json?.id) throw new Error(`createUser(${label}) failed: HTTP ${created.status}`);
  return { id: created.json.id, email };
}

async function issueCode(email) {
  const generated = await call('/admin/generate_link', { body: { type: 'recovery', email } });
  // GoTrue returns the code either nested under `properties` (the JS SDK shape) or flat at the top
  // level (the plain REST shape this script sees). Accept both, exactly as the route does.
  const properties = generated.json?.properties ?? generated.json ?? null;
  const otp = properties?.email_otp ?? null;
  if (typeof otp !== 'string' || !/^\d{6,10}$/.test(otp)) {
    throw new Error(`generate_link returned no usable code (HTTP ${generated.status}, keys: ${Object.keys(generated.json ?? {}).join(',') || 'none'})`);
  }
  return otp;
}

async function verify(email, token) {
  return call('/verify', { key: ANON, body: { email, token, type: 'recovery' } });
}

async function remove(user) {
  if (!user) return;
  await call(`/admin/users/${user.id}`, { method: 'DELETE' });
}

async function main() {
  const report = { declaredSeconds: declared, checks: [] };
  let fresh = null;
  let stale = null;
  try {
    // 1. The mechanism: a code generated now must verify now, or nothing else is meaningful.
    fresh = await makeUser('fresh');
    const liveCode = await issueCode(fresh.email);
    const live = await verify(fresh.email, liveCode);
    report.checks.push({ ...describe('A code issued now verifies now', live), sessionIssued: typeof live.json?.access_token === 'string' });
    if (live.status !== 200 || typeof live.json?.access_token !== 'string') {
      console.error(`FAIL: a freshly issued code did not verify (HTTP ${live.status}).`);
      console.error(JSON.stringify(report, null, 2));
      // Do not process.exit() here: it would skip the finally block that deletes both accounts.
      process.exitCode = 1;
      return;
    }

    if (quick) {
      report.note = 'Ran with --quick: the expiry window itself was not exercised.';
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    // 2. The window: wait it out, then the same call must be refused.
    stale = await makeUser('stale');
    const staleCode = await issueCode(stale.email);
    const waitSeconds = waitArg ? Number(waitArg[1]) : declared + 20;
    console.log(`Waiting ${waitSeconds}s for the ${declared}s window to pass (Ctrl+C can leave the two throwaway accounts behind)...`);
    await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
    const expired = await verify(stale.email, staleCode);
    report.checks.push({
      ...describe(`A code issued ${waitSeconds}s ago is refused`, expired),
      accepted: expired.status === 200,
    });

    if (expired.status === 200) {
      console.error(
        `FAIL: a code still verified after ${waitSeconds}s, but AUTH_OTP_EXPIRY_SECONDS says ${declared}s. ` +
          'Set the Supabase project email OTP expiry to match, or correct AUTH_OTP_EXPIRY_SECONDS.',
      );
      console.log(JSON.stringify(report, null, 2));
      // A return, not process.exit(), so the finally block still deletes both accounts.
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify(report, null, 2));
    console.log(`OK: the project rejects a code after its window, and the app states ${declared}s.`);
  } finally {
    await remove(fresh);
    await remove(stale);
  }
}

main().catch(async (error) => {
  console.error(`Probe failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});