// Functional form/API checks only. No rendering or screenshots.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const tick = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };
function harness({ role = 'school', account_id = 900, respond } = {}) {
  const dom = new JSDOM(read('registration.html'), {
    url: 'http://127.0.0.1:5501/registration.html?eventId=demo',
    runScripts: 'outside-only', virtualConsole: new VirtualConsole()
  });
  const w = dom.window;
  const calls = [];
  const user = { id: 123, school_id: 123, account_id, role, eventId: 'demo', exp: Math.floor(Date.now() / 1000) + 3600 };
  const token = JSON.stringify(user);
  w.localStorage.setItem('token', token);
  w.localStorage.setItem('lang', 'es');
  w.Headers = Headers;
  w.jwt_decode = JSON.parse;
  w.alert = () => {};
  w.fetch = async (url, options) => {
    calls.push({ url, options });
    return respond ? respond(url, options) : new Response(JSON.stringify({ success: true }));
  };
  const listen = w.document.addEventListener.bind(w.document);
  w.document.addEventListener = (event, ...args) => { if (event !== 'DOMContentLoaded') listen(event, ...args); };
  w.eval(read('js/utils.js'));
  const dictionary = JSON.parse(read('lang/registration.es.json'));
  w.t = (key, fallback) => dictionary[key] || fallback;
  w.eval(read('js/registration.js'));
  w.initSchoolPasswordChange(user);
  const get = id => w.document.getElementById(id);
  const form = get('schoolChangePasswordForm');
  const current = get('schoolCurrentPassword');
  const next = get('schoolNewPassword');
  const toggle = get('schoolChangePasswordToggle');
  const feedback = get('schoolPasswordFeedback');
  const submit = async () => { form.dispatchEvent(new w.Event('submit', { cancelable: true })); await tick(); };
  return { w, dom, calls, user, token, get, form, current, next, toggle, feedback, submit };
}

test('access details are after the profile form and password editing is restricted to account schools', () => {
  for (const options of [{}, { role: 'organizer' }, { role: 'admin' }, { account_id: null }]) {
    const h = harness(options);
    assert.equal(h.get('schoolUsername').closest('form'), null);
    assert.equal(h.form.closest('#schoolForm'), null);
    assert.equal(h.form.hidden, true);
    assert.equal(h.toggle.classList.contains('d-none'), Boolean(options.role || options.account_id === null));
    h.dom.window.close();
  }
});

test('password change sends exact strings with bearer, no IDs, and retains the session', async () => {
  const h = harness();
  h.toggle.click();
  assert.equal(h.form.hidden, false);
  h.current.value = '  Current! 001 ';
  h.next.value = ' New PASSWORD! 002 ';
  await h.submit();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].url, 'http://127.0.0.1:3000/api/auth/change-password');
  assert.equal(h.calls[0].options.method, 'POST');
  assert.equal(h.calls[0].options.headers.get('Authorization'), `Bearer ${h.token}`);
  assert.equal(h.calls[0].options.headers.get('Content-Type'), 'application/json');
  assert.deepEqual(JSON.parse(h.calls[0].options.body), {
    current_password: '  Current! 001 ', new_password: ' New PASSWORD! 002 '
  });
  assert.equal(h.w.localStorage.getItem('token'), h.token);
  assert.equal(h.form.hidden, true);
  assert.equal(h.current.value, '');
  assert.equal(h.next.value, '');
  assert.equal(h.feedback.classList.contains('alert-success'), true);
  h.dom.window.close();
});

test('empty/oversized passwords never send; a single space and 2000 characters are preserved', async () => {
  const h = harness();
  h.toggle.click();
  h.next.value = 'valid';
  await h.submit();
  assert.equal(h.calls.length, 0);
  h.current.value = 'current';
  h.next.value = 'x'.repeat(2001);
  await h.submit();
  assert.equal(h.calls.length, 0);
  h.current.value = ' ';
  h.next.value = 'x'.repeat(2000);
  await h.submit();
  assert.equal(h.calls.length, 1);
  assert.equal(JSON.parse(h.calls[0].options.body).current_password, ' ');
  assert.equal(JSON.parse(h.calls[0].options.body).new_password.length, 2000);
  h.dom.window.close();
});

test('incorrect current password shows server error, preserves token, and allows correction', async () => {
  const h = harness({ respond: () => new Response(JSON.stringify({
    error: 'Current password incorrect', code: 'current_password_incorrect'
  }), { status: 400 }) });
  h.toggle.click(); h.current.value = 'wrong'; h.next.value = 'new';
  await h.submit();
  assert.equal(h.feedback.textContent, 'Current password incorrect');
  assert.equal(h.current.validity.customError, true);
  assert.equal(h.current.getAttribute('aria-invalid'), 'true');
  assert.equal(h.form.hidden, false);
  assert.equal(h.w.localStorage.getItem('token'), h.token);
  h.current.value = 'corrected';
  h.current.dispatchEvent(new h.w.Event('input'));
  assert.equal(h.current.validity.customError, false);
  assert.equal(h.get('schoolChangePasswordSubmit').disabled, false);
  h.dom.window.close();
});

test('duplicate submissions are blocked; cancelling clears both fields', async () => {
  let finish;
  const h = harness({ respond: () => new Promise(resolve => { finish = resolve; }) });
  h.toggle.click(); h.current.value = 'current'; h.next.value = 'new';
  await h.submit(); await h.submit();
  assert.equal(h.calls.length, 1);
  assert.equal(h.toggle.disabled, true);
  assert.equal(h.current.disabled, true);
  finish(new Response(JSON.stringify({ code: 'invalid_parameters', error: 'Invalid parameters' }), { status: 400 }));
  await tick();
  assert.equal(h.feedback.textContent, 'Invalid parameters');
  h.get('schoolChangePasswordCancel').click();
  assert.equal(h.current.value, ''); assert.equal(h.next.value, '');
  assert.equal(h.form.hidden, true);
  h.dom.window.close();
});

test('unauthorized, expired and revoked sessions use the shared login flow', async () => {
  for (const [code, status] of [['unauthorized', 401], ['token_invalid_or_expired', 403], ['session_revoked', 403]]) {
    const h = harness({ respond: () => new Response(JSON.stringify({ code, error: 'Login required' }), { status }) });
    h.toggle.click(); h.current.value = 'old'; h.next.value = 'new';
    await h.submit();
    assert.equal(h.w.localStorage.getItem('token'), null);
    assert.equal(h.feedback.classList.contains('alert-success'), false);
    h.dom.window.close();
  }
});

test('all five languages translate the new account password flow', () => {
  for (const lang of ['es', 'en', 'it', 'pt', 'fr']) {
    const dictionary = JSON.parse(read(`lang/registration.${lang}.json`));
    for (const key of ['school_access_title', 'school_change_password', 'school_current_password', 'school_new_password',
      'school_password_changed', 'school_password_incorrect', 'school_password_error', 'school_password_length']) {
      assert.ok(dictionary[key], `${lang}: ${key}`);
    }
  }
});
