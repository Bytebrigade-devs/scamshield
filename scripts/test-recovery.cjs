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
// auth-otp-expiry reads AUTH_OTP_EXPIRY_SECONDS, so each harness loads its own copy with its own
// environment — a module's globals are its own, not shared with the module that imports it.
const templateLib = load('src/lib/auth-email-templates.ts');
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

test('the address and caller budgets are independent', async () => {
  const lim = lib.createBudgetedLimiter({ windowMs: 60000, addressMax: 2, callerMax: 2 });
  const issue = (email, caller, now) => lib.issueRecoveryCode(email, {
    mailConfigured: true, generateCode: async () => '123456', sendCode: async () => true, now: () => now,
  }, lim, { email, caller });
  // One mailbox is capped no matter who asks for it.
  assert.equal((await issue('a@example.test', 'ip-1', 0)).kind, 'sent');
  assert.equal((await issue('a@example.test', 'ip-2', 1)).kind, 'sent');
  assert.equal((await issue('a@example.test', 'ip-3', 2)).kind, 'rate-limited');
  // One caller is capped across mailboxes, separately from the address budget.
  assert.equal((await issue('b@example.test', 'ip-9', 3)).kind, 'sent');
  assert.equal((await issue('c@example.test', 'ip-9', 4)).kind, 'sent');
  assert.equal((await issue('d@example.test', 'ip-9', 5)).kind, 'rate-limited', 'the caller backstop is separate');
});

// ---- route level: what the browser actually sees ----

function routeHarness(options = {}) {
  const {
    env = {}, otp = '246810', otpShape = 'properties', userFound = true,
    resendOk = true, resendStatus = null, resendMessage = null,
    // A non-404 failure is a real admin/network outage; it must not be reported as "sent".
    generateFailure = null,
  } = options;
  const sent = [];
  const generated = [];
  const files = [];
  const processEnv = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.test',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    RESEND_API_KEY: 're_test_key',
    AUTH_EMAIL_FROM: 'ScamShield <no-reply@example.test>',
    ...env,
  };
  const fetchImpl = async (url, init) => {
    sent.push({ url, body: JSON.parse(init.body) });
    const result = { ok: resendOk };
    if (typeof resendStatus === 'number') result.status = resendStatus;
    if (resendMessage) result.json = async () => ({ message: resendMessage });
    return result;
  };
  const fsImpl = { mkdirSync: () => undefined, writeFileSync: (file, contents) => { files.push({ file, contents }); } };
  const authMail = load('src/lib/auth-mail.ts', { 'node:fs': fsImpl }, {
    process: { env: processEnv },
    fetch: fetchImpl,
    AbortSignal: { timeout: () => undefined },
    console: { warn: () => undefined, log: () => undefined, error: () => undefined },
  });
  const expiry = load('src/lib/auth-otp-expiry.ts', { './otp': otpLib }, { process: { env: processEnv } });
  const routes = load('src/app/api/auth/recovery-code/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => ({ body, ...init }) } },
    '@supabase/supabase-js': {
      createClient: () => ({
        auth: {
          admin: {
            generateLink: async ({ type, email }) => {
              generated.push([type, email]);
              if (generateFailure) return { data: null, error: generateFailure };
              if (!userFound) return { data: null, error: { status: 404, code: 'user_not_found', message: 'User with this email not found' } };
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
    '@/lib/auth-mail': authMail,
    '@/lib/auth-email-templates': templateLib,
    '@/lib/auth-otp-expiry': expiry,
  }, { process: { env: processEnv } });
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
  assert.deepEqual(plain(result.body), { ok: true, expiresInSeconds: 300 });
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
  assert.deepEqual(plain(result.body), { ok: true, expiresInSeconds: 300 });
  assert.equal(api.sent.length, 0);
});

test('route: an admin outage is reported as unavailable, never as a fake send', async () => {
  for (const failure of [
    { status: 500, message: 'database error' },
    { code: 'unexpected_failure', message: 'fetch failed' },
  ]) {
    const api = routeHarness({ generateFailure: failure });
    const result = await api.request({ email: 'user@example.test' });
    assert.equal(result.status, 502, JSON.stringify(failure));
    assert.match(result.body.error, /could not be issued/);
    assert.equal(api.sent.length, 0, 'nothing is emailed when no code was generated');
  }
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
  assert.ok(written.text.includes('246810'), 'the outbox record carries the code inside the message text');
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

// ---- registration confirmation link ----

function signupHarness(options = {}) {
  const {
    env = {}, resendOk = true, existingUser = false, linkOk = true,
    resendStatus = null, resendMessage = null,
    // Default: the account exists, is unconfirmed, and the password is correct.
    probeCode = 'email_not_confirmed', probeStatus = null,
  } = options;
  const sent = [];
  const files = [];
  const created = [];
  const deleted = [];
  const probeCalls = [];
  let linkCalls = 0;
  const processEnv = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.test',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    RESEND_API_KEY: 're_test_key',
    AUTH_EMAIL_FROM: 'ScamShield <no-reply@example.test>',
    ...env,
  };
  const fetchImpl = async (url, init) => {
    sent.push({ url, body: JSON.parse(init.body) });
    const result = { ok: resendOk };
    if (typeof resendStatus === 'number') result.status = resendStatus;
    if (resendMessage) result.json = async () => ({ message: resendMessage });
    return result;
  };
  const fsImpl = { mkdirSync: () => undefined, writeFileSync: (file, contents) => { files.push({ file, contents }); } };
  const authMail = load('src/lib/auth-mail.ts', { 'node:fs': fsImpl }, {
    process: { env: processEnv },
    fetch: fetchImpl,
    AbortSignal: { timeout: () => undefined },
    console: { warn: () => undefined, log: () => undefined, error: () => undefined },
  });
  const expiry = load('src/lib/auth-otp-expiry.ts', { './otp': otpLib }, { process: { env: processEnv } });
  const routes = load('src/app/api/auth/confirmation-link/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => ({ body, ...init }) } },
    '@supabase/supabase-js': {
      // The route picks the admin client by service key and the resend probe by anon key.
      createClient: (_url, key) => (key === 'service-role-key'
        ? {
            auth: {
              admin: {
                createUser: async ({ email }) => {
                  if (existingUser) return { data: null, error: { message: 'User already registered' } };
                  created.push(email);
                  return { data: { user: { id: 'new-user-id' } }, error: null };
                },
                generateLink: async ({ type, email }) => {
                  linkCalls += 1;
                  return linkOk
                    ? { data: { properties: { action_link: `https://example.test/verify?type=${type}&email=${email}` } }, error: null }
                    : { data: null, error: { message: 'link generation failed' } };
                },
                deleteUser: async id => { deleted.push(id); return { data: null, error: null }; },
              },
            },
          }
        : {
            auth: {
              signInWithPassword: async ({ email, password }) => {
                probeCalls.push({ email, password });
                if (probeCode === null) return { data: { session: { access_token: 'probe-session' } }, error: null };
                return {
                  data: { session: null },
                  error: { code: probeCode, status: probeStatus ?? 400, message: probeCode },
                };
              },
            },
          }),
    },
    '@/lib/auth-mail': authMail,
    '@/lib/recovery-code': lib,
    '@/lib/auth-email-templates': templateLib,
    '@/lib/auth-otp-expiry': expiry,
  }, { process: { env: processEnv } });
  const request = body => routes.POST({ json: async () => body, headers: { get: () => null } });
  return {
    routes, sent, files, created, deleted, probeCalls,
    get linkCalls() { return linkCalls; },
    request,
  };
}

test('signup route: creates the account and emails its verification link, returning no link', async () => {
  const api = signupHarness();
  const result = await api.request({ email: 'New@Example.test ', password: 'longenough1' });
  assert.equal(result.status, 200);
  assert.deepEqual(plain(result.body), { ok: true, expiresInSeconds: 300 });
  assert.equal(JSON.stringify(result.body).includes('verify?type=signup'), false, 'the link stays in the email');
  assert.deepEqual(api.created, ['new@example.test']);
  assert.equal(api.sent.length, 1);
  assert.equal(api.sent[0].url, 'https://api.resend.com/emails');
  assert.ok(api.sent[0].body.text.includes('https://example.test/verify?type=signup&email=new@example.test'));
  assert.equal(api.sent[0].body.subject, 'Confirm your ScamShield account');
});

test('signup route: no sender configured is a 503 and creates nothing', async () => {
  const api = signupHarness({ env: { RESEND_API_KEY: '' } });
  const result = await api.request({ email: 'new@example.test', password: 'longenough1' });
  assert.equal(result.status, 503);
  assert.match(result.body.error, /not configured/);
  assert.equal(api.created.length, 0);
  assert.equal(api.sent.length, 0);
});

test('signup route: an existing address is refused without sending anything', async () => {
  const api = signupHarness({ existingUser: true });
  const result = await api.request({ email: 'new@example.test', password: 'longenough1' });
  assert.equal(result.status, 409);
  assert.match(result.body.error, /already exists/);
  assert.equal(api.sent.length, 0);
});

test('signup route: a failed send removes the account it just created', async () => {
  const api = signupHarness({ resendOk: false });
  const result = await api.request({ email: 'new@example.test', password: 'longenough1' });
  assert.equal(result.status, 502);
  assert.deepEqual(api.created, ['new@example.test']);
  assert.deepEqual(api.deleted, ['new-user-id'], 'no unusable unverified row is left behind');
});

test('signup route: a failed link generation also removes the account', async () => {
  const api = signupHarness({ linkOk: false });
  const result = await api.request({ email: 'new@example.test', password: 'longenough1' });
  assert.equal(result.status, 502);
  assert.deepEqual(api.deleted, ['new-user-id']);
  assert.equal(api.sent.length, 0);
});

// ---- the expiry window ----

function expiryWith(value) {
  const env = value === undefined ? {} : { AUTH_OTP_EXPIRY_SECONDS: value };
  return load('src/lib/auth-otp-expiry.ts', { './otp': otpLib }, { process: { env } });
}

test('a missing or unusable window falls back to five minutes', () => {
  assert.equal(expiryWith(undefined).otpExpirySeconds(), 300);
  assert.equal(expiryWith('').otpExpirySeconds(), 300);
  assert.equal(expiryWith('not-a-number').otpExpirySeconds(), 300);
  assert.equal(expiryWith(undefined).otpExpiryLabel(), '5 minutes');
});

test('the window is clamped so a typo cannot produce a dead or endless token', () => {
  assert.equal(expiryWith('600').otpExpirySeconds(), 600);
  assert.equal(expiryWith('5').otpExpirySeconds(), 60);
  assert.equal(expiryWith('0').otpExpirySeconds(), 60);
  assert.equal(expiryWith('-30').otpExpirySeconds(), 60);
  assert.equal(expiryWith('999999').otpExpirySeconds(), 86400);
  assert.equal(expiryWith('900').otpExpiryLabel(), '15 minutes');
});

test('the emailed reset code states the window and carries an HTML part', async () => {
  const api = routeHarness();
  const result = await api.request({ email: 'user@example.test' });
  assert.equal(result.status, 200);
  const mail = api.sent[0].body;
  assert.ok(mail.text.includes('expires in 5 minutes'), 'the plain-text part states the window');
  assert.ok(mail.html.includes('expires in 5 minutes'), 'the HTML part states the same window');
  assert.ok(mail.html.includes('246810'), 'the HTML part carries the code');
  assert.deepEqual(plain(mail.tags), [{ name: 'flow', value: 'recovery' }]);
  assert.equal(result.body.expiresInSeconds, 300, 'the browser is told the same window');
});

test('the emailed confirmation link states the window and carries an HTML part', async () => {
  const api = signupHarness();
  const result = await api.request({ email: 'new@example.test', password: 'longenough1' });
  assert.equal(result.status, 200);
  const mail = api.sent[0].body;
  assert.ok(mail.text.includes('expires in 5 minutes'), 'the plain-text part states the window');
  assert.ok(mail.html.includes('expires in 5 minutes'), 'the HTML part states the same window');
  assert.ok(
    mail.html.includes('https://example.test/verify?type=signup&amp;email=new@example.test'),
    'the link is escaped so an HTML attribute cannot end early',
  );
  assert.deepEqual(plain(mail.tags), [{ name: 'flow', value: 'confirm' }]);
  assert.equal(result.body.expiresInSeconds, 300);
  assert.equal(mail.html.includes('<img'), false, 'no remote logo: it is a tracking pixel and a broken image');
});

test('a configured window reaches both the email copy and the response', async () => {
  const api = routeHarness({ env: { AUTH_OTP_EXPIRY_SECONDS: '900' } });
  const result = await api.request({ email: 'user@example.test' });
  assert.equal(result.body.expiresInSeconds, 900);
  assert.ok(api.sent[0].body.text.includes('expires in 15 minutes'));
  assert.ok(api.sent[0].body.html.includes('expires in 15 minutes'));
});

test('a provider throttle is reported as a wait, not as a retry-now failure', async () => {
  const recovery = routeHarness({ resendOk: false, resendStatus: 429, resendMessage: 'Too many requests' });
  const resetResult = await recovery.request({ email: 'user@example.test' });
  assert.equal(resetResult.status, 429);
  assert.match(resetResult.body.error, /busy/);
  assert.ok(resetResult.body.retryAfterSeconds > 0);

  const signup = signupHarness({ resendOk: false, resendStatus: 429, resendMessage: 'Too many requests' });
  const signupResult = await signup.request({ email: 'new@example.test', password: 'longenough1' });
  assert.equal(signupResult.status, 429);
  assert.match(signupResult.body.error, /Too many confirmation emails/);
  assert.deepEqual(signup.deleted, ['new-user-id'], 'a throttled send leaves no unusable unverified row');
});

test('a non-throttle provider rejection stays a plain failure', async () => {
  const api = routeHarness({
    resendOk: false,
    resendStatus: 403,
    resendMessage: 'The example.test domain is not verified',
  });
  const result = await api.request({ email: 'user@example.test' });
  assert.equal(result.status, 502);
  assert.match(result.body.error, /could not be issued/);
});

// ---- Reply-To ----

test('a configured Reply-To is attached to both auth emails', async () => {
  const replyTo = 'support@example.test';
  const recovery = routeHarness({ env: { AUTH_EMAIL_REPLY_TO: replyTo } });
  await recovery.request({ email: 'user@example.test' });
  assert.equal(recovery.sent[0].body.reply_to, replyTo);

  const signup = signupHarness({ env: { AUTH_EMAIL_REPLY_TO: replyTo } });
  await signup.request({ email: 'new@example.test', password: 'longenough1' });
  assert.equal(signup.sent[0].body.reply_to, replyTo);
});

test('with no Reply-To configured the header is absent, not empty', async () => {
  const api = routeHarness();
  await api.request({ email: 'user@example.test' });
  assert.equal('reply_to' in api.sent[0].body, false, 'an empty Reply-To must never be sent');
});

test('signup route: resend for an unknown address creates nothing, sends nothing, answers like success', async () => {
  // Live evidence, 28 November 2026: generateLink({ type: "signup" }) creates an unconfirmed
  // account for an unknown address, with the password the caller supplied. A resend must never
  // reach it. A missing password is still refused up front (AuthForm keeps the typed value for
  // the "Resend confirmation email" button).
  const api = signupHarness({ probeCode: 'invalid_credentials' });
  const missingPassword = await api.request({ email: 'ghost@example.test', resend: true });
  assert.equal(missingPassword.status, 400);
  assert.equal(api.sent.length, 0);

  const result = await api.request({ email: 'ghost@example.test', resend: true, password: 'longenough1' });
  assert.equal(result.status, 200);
  assert.deepEqual(plain(result.body), { ok: true, expiresInSeconds: 300 });
  assert.equal(api.probeCalls.length, 1);
  assert.equal(api.sent.length, 0);
  assert.equal(api.created.length, 0, 'a resend must never create an account');
  assert.equal(api.linkCalls, 0, 'no signup link is generated for an address that is not unconfirmed');
  assert.equal(api.deleted.length, 0);
});

test('signup route: resend for an unconfirmed account emails a link without creating a user', async () => {
  const api = signupHarness({ probeCode: 'email_not_confirmed' });
  const result = await api.request({ email: 'waiting@example.test', resend: true, password: 'longenough1' });
  assert.equal(result.status, 200);
  assert.equal(api.created.length, 0, 'the account already exists; resend must not create another');
  assert.equal(api.linkCalls, 1);
  assert.equal(api.sent.length, 1);
  assert.ok(api.sent[0].body.text.includes('verify?type=signup'));
});

test('signup route: resend with the wrong password sends nothing and reveals nothing', async () => {
  const api = signupHarness({ probeCode: 'invalid_credentials' });
  const result = await api.request({ email: 'waiting@example.test', resend: true, password: 'wrong-password' });
  assert.equal(result.status, 200);
  assert.deepEqual(plain(result.body), { ok: true, expiresInSeconds: 300 });
  assert.equal(api.linkCalls, 0);
  assert.equal(api.sent.length, 0);
});

test('signup route: resend without an anon key fails honestly instead of generating a link', async () => {
  const api = signupHarness({ env: { NEXT_PUBLIC_SUPABASE_ANON_KEY: '' } });
  const result = await api.request({ email: 'waiting@example.test', resend: true, password: 'longenough1' });
  assert.equal(result.status, 503);
  assert.match(result.body.error, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  assert.equal(api.linkCalls, 0);
  assert.equal(api.sent.length, 0);
});

test('signup route: weak passwords and bad addresses are refused before any admin call', async () => {
  for (const body of [{ email: 'new@example.test', password: 'short' }, { email: 'nope', password: 'longenough1' }, { email: '', password: 'longenough1' }]) {
    const api = signupHarness();
    const result = await api.request(body);
    assert.equal(result.status, 400, JSON.stringify(body));
    assert.equal(api.created.length, 0);
    assert.equal(api.sent.length, 0);
  }
});

test('signup route: the development outbox carries the link and says so', async () => {
  const api = signupHarness({ env: { RESEND_API_KEY: '', NODE_ENV: 'development', AUTH_MAIL_DRIVER: 'outbox' } });
  const result = await api.request({ email: 'new@example.test', password: 'longenough1' });
  assert.equal(result.status, 200);
  assert.equal(result.body.devChannel, 'outbox');
  assert.equal(api.sent.length, 0);
  assert.equal(api.files.length, 1);
  assert.match(api.files[0].file, /^\.dev-outbox[\\/]confirm-/);
  assert.ok(JSON.parse(api.files[0].contents).text.includes('verify?type=signup'));
});
