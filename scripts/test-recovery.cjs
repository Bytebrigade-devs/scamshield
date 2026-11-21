// Recovery-code issuance and the /api/auth/recovery-code route, tested without a mailbox, a
// Supabase project or a Resend account. Rules under test are documented in src/lib/recovery-code.ts.
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');

function load(file, dependencies = {}, environment = {}) {
  const source = fs.readFileSync(file, 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  vm.runInNewContext(js, {
    exports, require: name => dependencies[name],
    Date, Object, Number, Math, Error, JSON, RegExp, Array, Promise, String, Boolean,
    ...environment,
  });
  return exports;
}

const lib = load('src/lib/recovery-code.ts');
const otpLib = load('src/lib/otp.ts');
// Values created inside the VM carry a different prototype, so structural assertions are
// normalised through JSON first; otherwise deepEqual rejects identical shapes.
const plain = value => JSON.parse(JSON.stringify(value));
const limiter = () => lib.createInMemoryLimiter({ windowMs: 60000, max: 3 });
const keys = (email, caller = 'ip-1') => ({ email, caller });

test('a known address produces one code, delivered once, and the code is never returned', async () => {
  const sent = [];
  const outcome = await lib.issueRecoveryCode('user@example.test', {
    mailConfigured: true,
    generateCode: async () => '654321',
    sendCode: async (email, code) => { sent.push([email, code]); return true; },
    now: () => 0,
  }, limiter(), keys('user@example.test'));
  assert.deepEqual(plain(outcome), { kind: 'sent' });
  assert.deepEqual(plain(sent), [['user@example.test', '654321']]);
  assert.equal(JSON.stringify(outcome).includes('654321'), false, 'the outcome must not carry the code');
});

test('an unknown address answers exactly like a real send and delivers nothing', async () => {
  let sent = 0;
  const outcome = await lib.issueRecoveryCode('nobody@example.test', {
    mailConfigured: true,
    generateCode: async () => null,
    sendCode: async () => { sent += 1; return true; },
    now: () => 0,
  }, limiter(), keys('nobody@example.test'));
  assert.deepEqual(plain(outcome), { kind: 'sent' });
  assert.equal(sent, 0);
});

test('a missing mail sender is reported instead of faked, and no code is generated', async () => {
  let generated = 0;
  const outcome = await lib.issueRecoveryCode('user@example.test', {
    mailConfigured: false,
    generateCode: async () => { generated += 1; return '111111'; },
    sendCode: async () => true,
    now: () => 0,
  }, limiter(), keys('user@example.test'));
  assert.deepEqual(plain(outcome), { kind: 'mail-not-configured' });
  assert.equal(generated, 0);
});

test('a failed delivery or a rejected admin call is unavailable, never a silent success', async () => {
  const failedSend = await lib.issueRecoveryCode('user@example.test', {
    mailConfigured: true, generateCode: async () => '123456', sendCode: async () => false, now: () => 0,
  }, limiter(), keys('user@example.test'));
  assert.deepEqual(plain(failedSend), { kind: 'unavailable' });

  const threw = await lib.issueRecoveryCode('user@example.test', {
    mailConfigured: true,
    generateCode: async () => { throw new Error('recovery-code-unavailable'); },
    sendCode: async () => true,
    now: () => 0,
  }, limiter(), keys('user@example.test', 'ip-2'));
  assert.deepEqual(plain(threw), { kind: 'unavailable' });
});

test('the limiter allows three per window, then blocks with a retry hint, then slides', async () => {
  const lim = lib.createInMemoryLimiter({ windowMs: 60000, max: 3 });
  const attempt = now => lib.issueRecoveryCode('user@example.test', {
    mailConfigured: true, generateCode: async () => '123456', sendCode: async () => true, now: () => now,
  }, lim, keys('user@example.test', 'ip-9'));
  for (const at of [0, 1000, 2000]) assert.equal((await attempt(at)).kind, 'sent');
  const blocked = await attempt(3000);
  assert.equal(blocked.kind, 'rate-limited');
  assert.ok(blocked.retryAfterSeconds > 0, 'the caller is told how long to wait');
  assert.equal((await attempt(61000)).kind, 'sent', 'the window slides, it is not a permanent lock');
});

// ---- route level: what the browser actually sees ----

function routeHarness(options = {}) {
  const { env = {}, otp = '246810', otpShape = 'properties', userFound = true, resendOk = true } = options;
  const sent = [];
  const generated = [];
  const files = [];
  const routes = load('src/app/api/auth/recovery-code/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => ({ body, ...init }) } },
    'node:fs': {
      mkdirSync: () => undefined,
      writeFileSync: (file, contents) => { files.push({ file, contents }); },
    },
    '@supabase/supabase-js': {
      createClient: () => ({
        auth: {
          admin: {
            generateLink: async ({ type, email }) => {
              generated.push([type, email]);
              if (!userFound) return { data: null, error: { message: 'User not found' } };
              // The SDK nests the code under `properties`; the flat REST shape must work too.
              return otpShape === 'flat'
                ? { data: { email_otp: otp }, error: null }
                : { data: { properties: { email_otp: otp, verification_type: 'recovery' } }, error: null };
            },
          },
        },
      }),
    },
    '@/lib/recovery-code': lib,
    '@/lib/otp': otpLib,
  }, {
    process: {
      env: {
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.test',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
        RESEND_API_KEY: 're_test_key',
        AUTH_EMAIL_FROM: 'ScamShield <no-reply@example.test>',
        ...env,
      },
    },
    fetch: async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return { ok: resendOk }; },
    AbortSignal: { timeout: () => undefined },
    console: { warn: () => undefined, log: () => undefined, error: () => undefined },
  });
  const request = (body, headers = {}) => routes.POST({
    json: async () => body,
    headers: { get: name => headers[name.toLowerCase()] ?? null },
  });
  return { routes, sent, generated, files, request };
}

test('route: a valid request emails the code and returns no code to the browser', async () => {
  const api = routeHarness();
  const result = await api.request({ email: 'User@Example.test ' });
  assert.equal(result.status, 200);
  assert.deepEqual(plain(result.body), { ok: true });
  assert.equal(JSON.stringify(result.body).includes('246810'), false);
  assert.deepEqual(plain(api.generated[0]), ['recovery', 'user@example.test'], 'the address is normalised server-side');
  assert.equal(api.sent.length, 1);
  assert.equal(api.sent[0].url, 'https://api.resend.com/emails');
  assert.deepEqual(plain(api.sent[0].body.to), ['user@example.test']);
  assert.ok(api.sent[0].body.text.includes('246810'), 'the code travels only inside the email');
  assert.equal(api.sent[0].body.from, 'ScamShield <no-reply@example.test>');
});

test('route: an unknown address is indistinguishable and sends nothing', async () => {
  const api = routeHarness({ userFound: false });
  const result = await api.request({ email: 'nobody@example.test' });
  assert.equal(result.status, 200);
  assert.deepEqual(plain(result.body), { ok: true });
  assert.equal(api.sent.length, 0);
});

test('route: missing sender configuration is a 503 with the reason, not a fake success', async () => {
  const api = routeHarness({ env: { RESEND_API_KEY: '' } });
  const result = await api.request({ email: 'user@example.test' });
  assert.equal(result.status, 503);
  assert.match(result.body.error, /not configured/);
  assert.equal(api.generated.length, 0, 'no code is generated that cannot be delivered');
  assert.equal(api.sent.length, 0);
});

test('route: a delivery failure is reported as a failure', async () => {
  const api = routeHarness({ resendOk: false });
  const result = await api.request({ email: 'user@example.test' });
  assert.equal(result.status, 502);
  assert.match(result.body.error, /could not be issued/);
});

test('route: malformed addresses are refused before any admin call, and GET is not allowed', async () => {
  for (const email of ['', 'not-an-email', 'a@b', 'a b@c.test', null, {}, 42]) {
    const api = routeHarness();
    const result = await api.request({ email });
    assert.equal(result.status, 400, `rejected: ${JSON.stringify(email)}`);
    assert.equal(api.generated.length, 0);
    assert.equal(api.sent.length, 0);
  }
  const api = routeHarness();
  assert.equal(api.routes.GET().status, 405);
});

test('route: the fourth request from one caller is rate limited with a retry hint', async () => {
  const api = routeHarness();
  for (let i = 0; i < 3; i += 1) assert.equal((await api.request({ email: 'user@example.test' })).status, 200);
  const blocked = await api.request({ email: 'user@example.test' });
  assert.equal(blocked.status, 429);
  assert.ok(blocked.body.retryAfterSeconds > 0);
  assert.equal(api.sent.length, 3, 'a blocked request sends no email');
});

test('route: an 8-digit code, which is what this project issues, is emailed intact', async () => {
  const api = routeHarness({ otp: '43984357' });
  const result = await api.request({ email: 'user@example.test' });
  assert.equal(result.status, 200);
  assert.ok(api.sent[0].body.text.includes('43984357'), 'the code must not be truncated to six digits');
});

test('route: the flat REST shape is accepted as well as the SDK properties shape', async () => {
  const api = routeHarness({ otp: '43984357', otpShape: 'flat' });
  const result = await api.request({ email: 'user@example.test' });
  assert.equal(result.status, 200);
  assert.equal(api.sent.length, 1);
  assert.ok(api.sent[0].body.text.includes('43984357'));
});

test('route: a malformed code from the admin API is an error, never a silent success', async () => {
  for (const otp of ['12345', 'abcdefgh', '', '123456789012']) {
    const api = routeHarness({ otp });
    const result = await api.request({ email: 'user@example.test' });
    assert.equal(result.status, 502, `rejected malformed code ${JSON.stringify(otp)}`);
    assert.equal(api.sent.length, 0, 'nothing is emailed when the code is not trustworthy');
  }
});

test('route: the development outbox delivers with no mail provider and says so', async () => {
  const api = routeHarness({
    env: {
      RESEND_API_KEY: '', AUTH_EMAIL_FROM: '', TRIAL_EMAIL_FROM: '',
      NODE_ENV: 'development', AUTH_MAIL_DRIVER: 'outbox', AUTH_MAIL_OUTBOX: '.dev-outbox',
    },
  });
  const result = await api.request({ email: 'user@example.test' });
  assert.equal(result.status, 200);
  assert.equal(result.body.devChannel, 'outbox');
  assert.equal(api.sent.length, 0, 'nothing is emailed');
  assert.equal(api.files.length, 1);
  assert.match(api.files[0].file, /^\.dev-outbox[\\/]recovery-/);
  const written = JSON.parse(api.files[0].contents);
  assert.equal(written.code, '246810');
  assert.equal(written.to, 'user@example.test');
  assert.equal(JSON.stringify(result.body).includes('246810'), false, 'the code still never reaches the browser');
});

test('route: a production build refuses the outbox driver and writes nothing', async () => {
  const api = routeHarness({
    env: { RESEND_API_KEY: '', AUTH_EMAIL_FROM: '', TRIAL_EMAIL_FROM: '', NODE_ENV: 'production', AUTH_MAIL_DRIVER: 'outbox' },
  });
  const result = await api.request({ email: 'user@example.test' });
  assert.equal(result.status, 503);
  assert.equal(api.files.length, 0, 'no reset code is ever written to disk in production');
  assert.equal(api.generated.length, 0);
});

test('route: a configured Resend sender takes precedence over the outbox', async () => {
  const api = routeHarness({ env: { NODE_ENV: 'development', AUTH_MAIL_DRIVER: 'outbox' } });
  const result = await api.request({ email: 'user@example.test' });
  assert.equal(result.status, 200);
  assert.equal(result.body.devChannel, undefined);
  assert.equal(api.sent.length, 1);
  assert.equal(api.files.length, 0);
});