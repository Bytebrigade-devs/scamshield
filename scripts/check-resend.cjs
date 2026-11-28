// Verify the Resend configuration without ever printing the key: list verified domains, and when
// an address is given, send one test mail through the same API the auth mails use.
// Usage: node scripts/check-resend.cjs [you@example.com]
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

async function main() {
  const env = readEnv();
  const key = env.RESEND_API_KEY || '';
  const from = env.AUTH_EMAIL_FROM || env.TRIAL_EMAIL_FROM || '';
  if (!key) {
    console.error('RESEND_API_KEY is not set in .env.local. Add it (Resend -> API Keys) and re-run.');
    process.exit(2);
  }
  const domains = await fetch('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${key}` } });
  if (!domains.ok) {
    console.error(`Resend rejected the key: HTTP ${domains.status}. Create or copy a valid API key.`);
    process.exit(2);
  }
  const list = ((await domains.json()) || {}).data || [];
  console.log(`Key accepted. Verified domains (${list.length}):`);
  for (const d of list) console.log(`  - ${d.name} [${d.status}]`);
  if (!list.some((d) => d.status === 'verified')) {
    console.warn(
      "No verified domain on this Resend account, so no real sender exists yet. onboarding@resend.dev can only deliver to the Resend account owner's own address and to delivered@resend.dev; every other recipient is refused. Verify a domain before relying on this for real users.",
    );
  }
  if (!from) {
    console.error('AUTH_EMAIL_FROM (or TRIAL_EMAIL_FROM) is not set. Use an address on a verified domain above.');
    process.exit(2);
  }
  console.log(`Sender: ${from}`);
  const to = process.argv[2];
  if (!to) {
    console.log('Configuration looks good. To send a test mail: node scripts/check-resend.cjs you@example.com');
    return;
  }
  const send = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [to],
      subject: 'ScamShield mail configuration test',
      text: 'If you can read this, ScamShield can email you through Resend.',
    }),
  });
  const body = await send.json().catch(() => null);
  if (!send.ok) {
    console.error(`Send failed: HTTP ${send.status} ${JSON.stringify(body)}`);
    process.exit(2);
  }
  console.log(`Test mail accepted by Resend (id ${body && body.id}). Check ${to}, and the spam folder.`);
}

main();