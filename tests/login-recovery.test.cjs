// Functional DOM and API checks; no rendering, previews or screenshots.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const tick = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };
const genericMessage = 'If an eligible account exists, instructions will be emailed.';
const json = (data, status = 200, headers) => new Response(JSON.stringify(data), { status, headers });

async function harness({ code = 'costaflow27', confirmed = true, respond } = {}) {
  const dom = new JSDOM(read('login.html'), {
    url: `http://127.0.0.1:5501/login.html?eventId=${code}`, runScripts: 'outside-only'
  });
  const w = dom.window;
  const calls = [], confirmations = [];
  const listen = w.document.addEventListener.bind(w.document);
  w.document.addEventListener = (event, ...args) => { if (event !== 'DOMContentLoaded') listen(event, ...args); };
  w.localStorage.setItem('token', 'existing-session');
  w.localStorage.setItem('lang', 'es');
  w.Headers = Headers;
  w.confirm = message => { confirmations.push(message); return confirmed; };
  w.fetch = async (url, options = {}) => {
    if (url.startsWith('/lang/')) return json(JSON.parse(read(url.slice(1))));
    calls.push({ url, options });
    return respond ? respond(url, options) : json({ success: true, message: genericMessage });
  };
  w.eval(read('js/utils.js'));
  w.eval(read('js/login.js'));
  await w.loadLoginTranslations('es');
  w.applyLoginTranslations();
  w.initLoginPasswordRecovery(code);
  const get = id => w.document.getElementById(id);
  const link = get('forgotPasswordLink'), form = get('forgotPasswordForm');
  const input = get('forgotPasswordUsername'), button = get('forgotPasswordSubmit');
  const feedback = get('forgotPasswordFeedback');
  const submit = async () => { form.dispatchEvent(new w.Event('submit', { cancelable: true })); await tick(); };
  return { w, dom, get, link, form, input, button, feedback, calls, confirmations, submit };
}

test('recovery replaces old help only for the four account events', async () => {
  for (const code of ['onstage27', 'tedvision27', 'givemehype27', 'costaflow27', 'other']) {
    const h = await harness({ code });
    const supported = code !== 'other';
    assert.equal(h.link.hidden, !supported);
    assert.equal(h.get('loginHelp').hidden, supported);
    assert.equal(h.form.hidden, true);
    if (supported) {
      h.get('username').value = 'demo@example.com';
      h.link.click();
      assert.equal(h.form.hidden, false);
      assert.equal(h.input.value, 'demo@example.com');
      assert.equal(h.link.getAttribute('aria-expanded'), 'true');
      h.link.click();
      assert.equal(h.form.hidden, true);
    }
    h.dom.window.close();
  }
});

test('confirmed recovery sends exact public contract without bearer or URL parameters', async () => {
  const h = await harness();
  h.link.click(); h.input.value = '  Demo@Example.COM  ';
  await h.submit();
  assert.equal(h.confirmations.length, 1);
  assert.equal(h.calls.length, 1);
  const { url, options } = h.calls[0];
  assert.equal(url, 'http://127.0.0.1:3000/api/auth/forgot-password');
  assert.equal(options.method, 'POST');
  assert.equal(options.credentials, 'omit');
  assert.equal(options.headers.Authorization, undefined);
  assert.equal(options.headers['Accept-Language'], 'es');
  assert.equal(options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(options.body), { eventId: 'costaflow27', username: 'demo@example.com' });
  assert.equal(h.feedback.textContent, genericMessage);
  assert.equal(h.feedback.dataset.state, 'success');
  assert.equal(h.w.localStorage.getItem('token'), 'existing-session');
  h.dom.window.close();
});

test('cancelling confirmation and invalid usernames never send requests', async () => {
  const h = await harness({ confirmed: false });
  h.link.click();
  for (const username of ['', '   ', 'x'.repeat(192)]) {
    h.input.value = username;
    await h.submit();
  }
  assert.equal(h.confirmations.length, 0);
  h.input.value = 'demo';
  await h.submit();
  assert.equal(h.confirmations.length, 1);
  assert.equal(h.calls.length, 0);
  h.dom.window.close();
});

test('recovery preserves API error messages for every documented error', async () => {
  for (const [status, code] of [[400, 'invalid_parameters'], [403, 'school_accounts_disabled'],
    [403, 'event_access_forbidden'], [429, 'forgot_password_rate_limited'], [503, 'forgot_password_unavailable']]) {
    const h = await harness({ respond: () => json({ error: `Error: ${code}`, code }, status) });
    h.link.click(); h.input.value = 'demo';
    await h.submit();
    assert.equal(h.feedback.dataset.state, 'error');
    assert.equal(h.feedback.textContent, `Error: ${code}`);
    assert.equal(h.button.disabled, false);
    h.dom.window.close();
  }
});

test('Retry-After disables retries, shows seconds, then allows another request', async () => {
  const h = await harness({ respond: () => json({ error: 'Rate limited', code: 'forgot_password_rate_limited' }, 429, { 'Retry-After': '60' }) });
  let now = Date.now(), interval;
  h.w.Date.now = () => now;
  h.w.setInterval = callback => { interval = callback; return 1; };
  h.w.clearInterval = () => {};
  h.link.click(); h.input.value = 'demo';
  await h.submit();
  assert.equal(h.button.disabled, true);
  assert.match(h.feedback.textContent, /60 segundos/);
  await h.submit();
  assert.equal(h.calls.length, 1);
  assert.equal(h.confirmations.length, 1);
  now += 61000; interval();
  assert.equal(h.button.disabled, false);
  assert.equal(h.feedback.textContent, 'Rate limited');
  h.dom.window.close();
});

test('pending recovery prevents duplicate requests and network errors restore the form', async () => {
  let rejectRequest;
  const h = await harness({ respond: () => new Promise((_resolve, reject) => { rejectRequest = reject; }) });
  h.link.click(); h.input.value = 'demo';
  await h.submit(); await h.submit();
  assert.equal(h.calls.length, 1);
  assert.equal(h.button.disabled, true);
  rejectRequest(new Error('Network unavailable'));
  await tick();
  assert.equal(h.button.disabled, false);
  assert.equal(h.feedback.textContent, 'Network unavailable');
  h.dom.window.close();
});

test('all supported languages include the recovery strings and Retry-After placeholder', () => {
  const dictionaries = ['es', 'en', 'it', 'pt', 'fr'].map(lang => JSON.parse(read(`lang/login.${lang}.json`)));
  for (const dictionary of dictionaries) {
    assert.deepEqual(Object.keys(dictionary).sort(), Object.keys(dictionaries[0]).sort());
    assert.match(dictionary.forgot_password_retry_after, /\{seconds\}/);
    for (const [key, value] of Object.entries(dictionary)) if (key.startsWith('forgot_password_')) assert.ok(value);
  }
});
