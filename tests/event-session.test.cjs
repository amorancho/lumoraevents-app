// Session and API contract tests only; no browser rendering.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/utils.js'), 'utf8');
const baseUser = {
  id: 123, school_id: 123, account_id: 900, role: 'school',
  eventId: 'origin', event_id: 61, access: ['origin', 'destination'],
  exp: Math.floor(Date.now() / 1000) + 3600
};
const targetUser = { ...baseUser, id: 456, school_id: 456, eventId: 'destination', event_id: 58 };
const encode = user => JSON.stringify(user);
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
function storage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
}
function harness({ user = baseUser, fetch: fetchImpl, confirm = true } = {}) {
  const calls = [], alerts = [], listeners = {}, docListeners = {};
  const localStorage = storage(), sessionStorage = storage();
  if (user) localStorage.setItem('token', encode(user));
  const location = {
    hostname: '127.0.0.1', protocol: 'http:', origin: 'http://127.0.0.1:5501',
    pathname: '/registration.html', search: '?eventId=destination', reload() { this.reloaded = true; }
  };
  const window = {
    location,
    addEventListener: (name, callback) => { listeners[name] = callback; },
    fetch: async (url, options) => {
      calls.push({ url, options });
      return fetchImpl ? fetchImpl(url, options) : json({ success: true, token: encode(targetUser) });
    }
  };
  const context = vm.createContext({
    window, localStorage, sessionStorage, navigator: {},
    document: {
      addEventListener: (name, callback) => { docListeners[name] = callback; },
      documentElement: { getAttribute: () => 'es' }
    },
    jwt_decode: JSON.parse, URL, URLSearchParams, Headers, AbortController, DOMException,
    alert: message => alerts.push(message), confirm: () => confirm, console
  });
  vm.runInContext(source, context);
  return { context, window, localStorage, sessionStorage, calls, alerts, listeners, docListeners };
}
function start(h, event = 'destination', page = 'registration') {
  h.window.lumoraEventSessionReady = h.context.ensureLumoraEventSession(event, page);
  return h.window.lumoraEventSessionReady;
}

test('switch uses current school, persists destination identity, and holds private requests', async () => {
  let finishSwitch;
  const h = harness({ fetch: (url, options) => {
    if (url.endsWith('/switch-event')) return new Promise(resolve => { finishSwitch = resolve; });
    return json([]);
  } });
  const ready = start(h);
  const privateRequest = h.context.lumoraSessionFetch('http://127.0.0.1:3000/api/schools/456', {}, true);
  assert.equal(h.calls.length, 1);
  assert.deepEqual(JSON.parse(h.calls[0].options.body), { school_id: 123, event_code: 'destination' });
  assert.equal(h.calls[0].options.headers.Authorization, `Bearer ${encode(baseUser)}`);
  finishSwitch(json({ success: true, token: encode(targetUser) }));
  await Promise.all([ready, privateRequest]);
  assert.equal(h.context.getUserFromToken().id, 456);
  assert.equal(h.calls[1].options.headers.get('Authorization'), `Bearer ${encode(targetUser)}`);
});

test('explicit API helper reads the new token after the switch', async () => {
  const h = harness();
  start(h);
  await h.context.lumoraApiFetch('/api/participants', {}, { auth: 'required' });
  assert.equal(h.calls[1].options.headers.get('Authorization'), `Bearer ${encode(targetUser)}`);
});

test('same event, admin, guests, and public voting never switch', async () => {
  for (const [user, event, page] of [
    [baseUser, 'origin', 'registration'], [{ ...baseUser, role: 'admin' }, 'destination', 'home'],
    [null, 'destination', 'home'], [baseUser, 'destination', 'public-votes']
  ]) {
    const h = harness({ user });
    await start(h, event, page);
    assert.equal(h.calls.length, 0);
  }
});

test('legacy sessions retain same-event access and never call switch-event', async () => {
  const h = harness({ user: { ...baseUser, account_id: undefined } });
  await start(h, 'origin');
  await assert.rejects(h.context.ensureLumoraEventSession('destination', 'registration'));
  assert.equal(h.calls.length, 0);
});

test('unlisted destination is rejected without private requests or token replacement', async () => {
  const h = harness();
  await assert.rejects(start(h, 'forbidden'));
  assert.equal(h.calls.length, 0);
  assert.equal(h.localStorage.getItem('token'), encode(baseUser));
  assert.match(h.window.location.href, /eventId=origin/);
  await assert.rejects(h.context.lumoraSessionFetch('http://127.0.0.1:3000/api/participants'));
});

test('switch failure preserves original context and does not retry', async () => {
  const h = harness({ fetch: () => json({ code: 'school_accounts_disabled', error: 'Disabled' }, 403) });
  await assert.rejects(start(h));
  assert.equal(h.localStorage.getItem('token'), encode(baseUser));
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.alerts, ['Disabled']);
});

test('old/revoked sessions are removed and sent to login', async () => {
  for (const code of ['session_upgrade_required', 'session_revoked', 'token_invalid_or_expired']) {
    const h = harness({ fetch: () => json({ code, error: 'Login required' }, 403) });
    await assert.rejects(start(h));
    assert.equal(h.localStorage.getItem('token'), null);
    assert.match(h.window.location.href, /login.html\?eventId=destination/);
  }
});

test('legal acceptance retains previous session and stores destination for existing login flow', async () => {
  const h = harness({ fetch: () => json({
    success: true, token: encode(targetUser), mustAcceptLegal: true,
    legal: { terms: true, privacy: false, cookies: true }
  }) });
  await assert.rejects(start(h));
  assert.equal(h.localStorage.getItem('token'), encode(baseUser));
  const pending = JSON.parse(h.sessionStorage.getItem('lumoraPendingEventLogin'));
  assert.equal(pending.token, encode(targetUser));
  assert.equal(pending.returnUrl, '/registration.html?eventId=destination');
  assert.equal(pending.legal.cookies, true);
  assert.match(h.window.location.href, /login.html/);
});

test('a response cannot change account or extend session lifetime', async () => {
  for (const override of [{ account_id: 901 }, { exp: baseUser.exp + 100 }, { school_id: 123 }, { eventId: 'other' }]) {
    const h = harness({ fetch: () => json({ success: true, token: encode({ ...targetUser, ...override }) }) });
    await assert.rejects(start(h));
    assert.equal(h.localStorage.getItem('token'), encode(baseUser));
  }
});

test('cancelled navigation ignores late switch response', async () => {
  let finish;
  const h = harness({ fetch: () => new Promise(resolve => { finish = resolve; }) });
  const ready = start(h);
  h.listeners.pagehide();
  finish(json({ success: true, token: encode(targetUser) }));
  await assert.rejects(ready);
  assert.equal(h.localStorage.getItem('token'), encode(baseUser));
});

test('another tab cancels pending requests and navigates to the newly active event', async () => {
  const h = harness({ user: { ...baseUser, eventId: 'destination' }, fetch: (_url, options) =>
    new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
  });
  const request = h.context.lumoraSessionFetch('http://127.0.0.1:3000/api/participants');
  h.localStorage.setItem('token', encode(baseUser));
  h.listeners.storage({ key: 'token', storageArea: h.localStorage });
  await assert.rejects(request);
  assert.match(h.window.location.href, /home.html\?eventId=origin/);
});

test('unsaved edits can postpone other-tab navigation while requests stay blocked', async () => {
  const h = harness({ confirm: false });
  h.docListeners.input({ target: { closest: () => ({}) } });
  h.listeners.storage({ key: 'token', storageArea: h.localStorage });
  assert.equal(h.window.location.href, undefined);
  await assert.rejects(h.context.lumoraSessionFetch('http://127.0.0.1:3000/api/participants'));
  assert.equal(h.calls.length, 0);
});

test('no bearer is attached to public or external requests', async () => {
  const h = harness();
  await h.context.lumoraSessionFetch('http://127.0.0.1:3000/api/public/events/code/destination', {}, true);
  await h.context.lumoraSessionFetch('https://external.example/api/data', {}, true);
  assert.equal(h.calls[0].options.headers, undefined);
  assert.equal(h.calls[1].options.headers, undefined);
});

test('real common and registration entry wait for the new school session', async () => {
  let finishSwitch;
  const h = harness({ fetch: url => {
    if (url.endsWith('/switch-event')) return new Promise(resolve => { finishSwitch = resolve; });
    if (url.includes('/api/public/events/')) return json({ id: 58, code: 'destination', start: '2027-01-01', end: '2027-01-02' });
    return json({});
  } });
  h.context.document.getElementById = () => null;
  h.context.document.querySelectorAll = () => [];
  h.context.fetch = (...args) => h.window.fetch(...args);
  h.window.location.pathname = '/registrationhome.html';
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/common.js'), 'utf8'), h.context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/registrationhome.js'), 'utf8'), h.context);
  const entry = h.docListeners.DOMContentLoaded();
  const request = h.window.fetch('http://127.0.0.1:3000/api/participants');
  assert.equal(h.calls.filter(call => call.url.includes('/api/participants')).length, 0);
  assert.equal(h.window.location.href, undefined);
  finishSwitch(json({ success: true, token: encode(targetUser) }));
  await Promise.all([entry, request]);
  assert.equal(h.context.getEvent().id, 58);
  assert.equal(h.window.location.href, 'registration.html?eventId=destination');
  const privateCall = h.calls.find(call => call.url.includes('/api/participants'));
  assert.equal(privateCall.options.headers.get('Authorization'), `Bearer ${encode(targetUser)}`);
  assert.equal(privateCall.options.headers.get('X-User-Id'), '456');
});

test('existing login modal accepts destination legal documents and returns to the requested page', async () => {
  const h = harness({ fetch: url => json(url.includes('/legal/accept') ? { success: true } : {}) });
  // The real page must load the decoder itself; the harness injection used to
  // hide a missing dependency that left users at the credentials form.
  delete h.context.jwt_decode;
  const loginHtml = fs.readFileSync(path.join(__dirname, '../login.html'), 'utf8');
  const scripts = [...loginHtml.matchAll(/<script\s+src="([^"]+)"/g)].map(match => match[1]);
  const decoderIndex = scripts.findIndex(src => src.includes('/jwt-decode/'));
  assert.ok(decoderIndex >= 0, 'login.html must load the JWT decoder');
  assert.ok(decoderIndex < scripts.indexOf('js/utils.js'), 'load the decoder before session helpers');
  assert.ok(decoderIndex < scripts.findIndex(src => src.split('?')[0] === 'js/login.js'), 'load the decoder before pending legal acceptance');
  h.context.jwt_decode = JSON.parse;
  h.window.location.pathname = '/login.html';
  h.sessionStorage.setItem('lumoraPendingEventLogin', JSON.stringify({
    token: encode(targetUser), previousToken: encode(baseUser), eventCode: 'destination',
    legal: { terms: true, privacy: false, cookies: true },
    returnUrl: '/registration.html?eventId=destination'
  }));
  const elements = Object.fromEntries(['regName', 'legalAcceptModal', 'legalAcceptConfirmBtn', 'legalAcceptLinks', 'eventName']
    .map(key => [key, { addEventListener() {}, appendChild() {} }]));
  const form = { addEventListener() {}, hidden: false };
  Object.assign(h.context.document, {
    querySelector: () => form, querySelectorAll: () => [],
    getElementById: key => elements[key], createElement: () => ({})
  });
  let shown = false;
  h.context.bootstrap = { Modal: class { show() { shown = true; } hide() {} } };
  h.context.fetch = (...args) => h.window.fetch(...args);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/login.js'), 'utf8'), h.context);
  await h.docListeners.DOMContentLoaded();
  assert.equal(form.hidden, true);
  assert.equal(shown, true);
  assert.equal(h.localStorage.getItem('token'), encode(baseUser));
  await h.context.acceptLegalDocuments();
  const acceptance = h.calls.find(call => call.url.includes('/legal/accept'));
  assert.equal(acceptance.options.headers.Authorization, `Bearer ${encode(targetUser)}`);
  assert.deepEqual(JSON.parse(acceptance.options.body), { terms: true, privacy: false, cookies: true });
  assert.equal(h.localStorage.getItem('token'), encode(targetUser));
  assert.equal(h.window.location.href, '/registration.html?eventId=destination');
});
