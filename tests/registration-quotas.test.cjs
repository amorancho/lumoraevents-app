// Functional DOM/API tests only; no rendering, previews or screenshots.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const tick = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };

function harness({ role = 'organizer', flag = true, initial = false } = {}) {
  const dom = new JSDOM(read('registration.html'), { url: 'http://localhost/registration.html?eventId=demo', runScripts: 'outside-only' });
  const w = dom.window;
  const h = { dom, w, calls: [], overrides: {}, confirm: true, event: { id: 58, registrationQuota: flag } };
  h.categories = [{ id: 8, name: 'Junior' }, { id: 9, name: '<img src=x>' }];
  h.styles = [{ id: 12, name: 'Contemporary' }, { id: 13, name: 'Hip hop' }];
  h.quotas = [{ id: 1, event_id: 58, category_id: 8, style_id: 12, quota: 100, occupied_places: 7 }];
  w.Headers = Headers;
  w.fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    const call = { path: parsed.pathname, query: parsed.search, method: options.method || 'GET', headers: Object.fromEntries(new Headers(options.headers)), body: options.body ? JSON.parse(options.body) : undefined };
    h.calls.push(call);
    let result = await h.overrides[`${call.method} ${call.path}`]?.(call);
    if (!result) {
      const id = Number(call.path.split('/').at(-1));
      if (call.method === 'GET') result = { data: call.path.endsWith('/categories') ? h.categories : call.path.endsWith('/styles') ? h.styles : h.quotas };
      if (call.method === 'POST') { h.quotas.push({ id: 99, ...call.body, occupied_places: 0 }); result = { status: 201, data: 99 }; }
      if (call.method === 'PUT') { Object.assign(h.quotas.find(item => item.id === id), call.body); result = { data: { message: 'Updated' } }; }
      if (call.method === 'DELETE') { h.quotas = h.quotas.filter(item => item.id !== id); result = { data: { message: 'Deleted' } }; }
    }
    return new Response(JSON.stringify(result.data), { status: result.status || 200 });
  };
  w.localStorage.setItem('token', 'test-token');
  w.localStorage.setItem('lang', 'es');
  w.jwt_decode = () => ({ role, id: 2, exp: Date.now() / 1000 + 3600 });
  const run = file => vm.runInContext(read(file), dom.getInternalVMContext(), { filename: file });
  run('js/utils.js');
  w.getEvent = () => h.event;
  const translations = JSON.parse(read('lang/registration.es.json'));
  w.t = (key, fallback) => translations[key] ?? fallback ?? key;
  w.confirm = () => h.confirm;
  const listen = w.document.addEventListener.bind(w.document);
  w.document.addEventListener = (name, ...args) => { if (name !== 'DOMContentLoaded') listen(name, ...args); };
  run('js/registration.js');
  run('js/registration-quotas.js');
  w.eval(`registrationNavigationState.role = getRegistrationRole(); registrationNavigationState.activeKey = '${initial ? 'registration-quotas' : 'dashboard'}';`);
  w.initRegistrationQuotas();
  h.el = suffix => w.document.getElementById(`registrationQuota${suffix}`);
  h.open = async () => { w.dispatchEvent(new w.CustomEvent('registration:panel-changed', { detail: { key: 'registration-quotas' } })); await tick(); };
  h.click = async selector => { w.document.querySelector(selector).click(); await tick(); };
  h.submit = async (category, style, quota) => {
    h.el('Category').value = String(category);
    h.el('Style').value = style == null ? '' : String(style);
    h.el('Value').value = String(quota);
    h.el('Form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    await tick();
  };
  h.writes = () => h.calls.filter(call => call.method !== 'GET');
  h.close = () => dom.window.close();
  return h;
}

for (const role of ['organizer', 'admin']) {
  test(`${role}: conditional menu ordering and authenticated CRUD, including zero and required style`, async () => {
    const h = harness({ role });
    try {
      assert.equal(h.calls.length, 0);
      const keys = h.w.getVisibleRegistrationNavItems('organizer').map(item => item.key);
      assert.equal(keys.indexOf('registration-quotas'), keys.indexOf('registration-disciplines') + 1);
      await h.open();
      assert.equal(h.calls.length, 3);
      assert.ok(h.calls.every(call => call.query === '?event_id=58'));
      assert.equal(h.el('sTable').rows[0].cells[3].textContent, '7');
      assert.equal(h.el('sTable').rows[0].cells[3].dataset.label, 'Plazas ocupadas');
      await h.submit(8, 13, 0);
      assert.deepEqual(h.writes()[0].body, { event_id: 58, category_id: 8, style_id: 13, quota: 0 });
      assert.equal(h.el('sTable').rows[1].cells[3].textContent, '0');
      await h.click('[data-quota-action="edit"][data-id="99"]');
      assert.equal(h.el('Value').value, '0');
      await h.submit(9, 12, 25);
      assert.equal(h.writes()[1].method, 'PUT');
      assert.equal(h.writes()[1].path, '/api/registrations/quotas/99');
      assert.deepEqual(h.writes()[1].body, { event_id: 58, category_id: 9, style_id: 12, quota: 25 });
      assert.equal(h.el('sTable').querySelector('img'), null);
      h.confirm = false;
      await h.click('[data-quota-action="delete"][data-id="99"]');
      assert.equal(h.writes().length, 2);
      h.confirm = true;
      await h.click('[data-quota-action="delete"][data-id="99"]');
      assert.equal(h.writes()[2].method, 'DELETE');
      assert.equal(h.el('sTable').rows.length, 1);
      for (const call of h.calls) {
        assert.equal(call.headers.authorization, 'Bearer test-token');
        assert.equal(call.headers['accept-language'], 'es');
        assert.equal(call.headers['x-event-id'], role === 'admin' ? '58' : undefined);
      }
    } finally { h.close(); }
  });
}

test('disabled flag, school and guest hide the menu/panel and never request quotas, even via hash', async () => {
  for (const options of [{ flag: false }, { role: 'school' }, { role: 'guest' }]) {
    const h = harness({ ...options, initial: true });
    try {
      await h.open();
      assert.equal(h.w.getVisibleRegistrationNavItems().some(item => item.key === 'registration-quotas'), false);
      h.w.applyRegistrationRoleVisibility(h.w.getRegistrationRole());
      assert.equal(h.w.document.getElementById('registration-quotas').classList.contains('d-none'), true);
      assert.equal(h.w.showRegistrationPanel('registration-quotas'), false);
      assert.equal(h.calls.length, 0);
    } finally { h.close(); }
  }
});

test('validates integers and duplicates, permits editing itself and cancels editing', async () => {
  const h = harness();
  try {
    await h.open();
    await h.submit(8, 12, 101);
    assert.equal(h.writes().length, 0);
    assert.match(h.el('sFeedback').textContent, /ya tiene un cupo/);
    for (const quota of ['', '-1', '1.5', '2147483648']) await h.submit(9, 12, quota);
    await h.submit('', 12, 10);
    assert.equal(h.el('Style').required, true);
    await h.submit(9, null, 10);
    assert.equal(h.el('Style').validity.customError, true);
    assert.equal(h.el('Style').options[0].textContent, 'Selecciona un estilo');
    assert.equal(h.writes().length, 0);
    await h.click('[data-quota-action="edit"][data-id="1"]');
    await h.submit(8, null, 50);
    assert.equal(h.writes().length, 0, 'editing also requires a style');
    await h.submit(8, 12, 50);
    assert.equal(h.writes()[0].method, 'PUT');
    await h.click('[data-quota-action="edit"][data-id="1"]');
    await h.click('#registrationQuotaCancel');
    assert.equal(h.el('Value').value, '');
    assert.equal(h.el('Cancel').classList.contains('d-none'), true);
  } finally { h.close(); }
});

test('initial hash loads, read errors retry, and server conflicts preserve the form', async () => {
  const h = harness({ initial: true });
  try {
    await tick();
    assert.equal(h.el('sTable').rows.length, 1);
    h.overrides['GET /api/registrations/quotas'] = () => ({ status: 500, data: { error: 'Read failure' } });
    await h.open();
    assert.equal(h.el('Save').disabled, true);
    assert.equal(h.el('sTable').rows.length, 0);
    assert.equal(h.el('sFeedback').textContent, 'Read failure');
    delete h.overrides['GET /api/registrations/quotas'];
    await h.click('#registrationQuotasRetry');
    assert.equal(h.el('Save').disabled, false);
    h.overrides['POST /api/registrations/quotas'] = () => ({ status: 409, data: { error: 'Duplicate' } });
    await h.submit(9, 12, 0);
    assert.equal(h.el('Value').value, '0');
    assert.equal(h.el('sFeedback').textContent, 'Duplicate');
    assert.equal(h.el('Save').disabled, false);
  } finally { h.close(); }
});

test('blocks double submission and writes after the event context changes', async () => {
  const h = harness();
  try {
    await h.open();
    let release;
    h.overrides['POST /api/registrations/quotas'] = () => new Promise(resolve => { release = resolve; });
    await h.submit(9, 12, 0);
    await h.submit(9, 12, 0);
    assert.equal(h.writes().length, 1);
    assert.equal(h.el('Save').disabled, true);
    h.event = { id: 59, registrationQuota: true };
    release({ data: 99 });
    await tick();
    assert.equal(h.el('Save').disabled, true);
    await h.submit(9, 12, 0);
    assert.equal(h.writes().length, 1);
  } finally { h.close(); }
});

test('missing styles or categories disable creation and explain what to configure', async () => {
  const h = harness();
  try {
    h.styles = [];
    await h.open();
    assert.equal(h.el('Save').disabled, true);
    await h.submit(9, 12, 100);
    assert.equal(h.writes().length, 0);
    assert.match(h.el('sStatus').textContent, /Añade estilos/);
    h.styles = [{ id: 12, name: 'Contemporary' }];
    h.categories = [];
    await h.open();
    assert.equal(h.el('Save').disabled, true);
    assert.match(h.el('sStatus').textContent, /Añade categorías/);
  } finally { h.close(); }
});

test('Admin places the switch after reg_create_part and round-trips numeric values', () => {
  const dom = new JSDOM(read('admin.html'), { url: 'http://localhost/admin.html', runScripts: 'outside-only' });
  const w = dom.window;
  try {
    w.document.addEventListener = () => {};
    vm.runInContext(read('js/admin-panel.js'), dom.getInternalVMContext());
    const config = w.document.createElement('div');
    const registrations = w.document.createElement('div');
    w.document.getElementById('eventForm').append(config, registrations);
    w.rebuildEventDetailTabLayouts(config, registrations);
    const field = w.document.getElementById('reg_quota');
    const row = field.closest('.row');
    assert.deepEqual([...row.querySelectorAll('input')].map(input => input.id), ['reg_create_part', 'reg_quota']);
    // Isolate the form's data binding from logo, client and panel rendering.
    for (const name of ['populateClientSelect', 'updateLogoPreview', 'updateUrlPreview', 'setEventPanelState', 'setEventWelcomeInfo']) w[name] = () => {};
    w.buildOrganizerInfo = () => '';
    for (const value of [1, 0, '1', undefined]) {
      w.populateEventForm({ id: 58, reg_quota: value });
      assert.equal(field.checked, Number(value) === 1);
      assert.equal(w.collectEventFormData().reg_quota, Number(value) === 1 ? 1 : 0);
    }
    field.checked = true;
    w.resetEventForm();
    assert.equal(w.collectEventFormData().reg_quota, 0);
  } finally { dom.window.close(); }
});

test('common exposes API reg_quota through the shared event object', async () => {
  for (const value of [1, '1', 0, undefined]) {
    const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost/admin.html?eventId=demo', runScripts: 'outside-only' });
    const w = dom.window;
    try {
      w.Headers = Headers;
      w.AbortController = AbortController;
      w.document.addEventListener = () => {};
      w.fetch = async () => new Response(JSON.stringify({ id: 58, code: 'demo', reg_quota: value }));
      vm.runInContext(read('js/utils.js'), dom.getInternalVMContext());
      vm.runInContext(read('js/common.js'), dom.getInternalVMContext());
      await w.WaitEventLoaded();
      assert.equal(w.getEvent().registrationQuota, Number(value) === 1);
    } finally { dom.window.close(); }
  }
});
