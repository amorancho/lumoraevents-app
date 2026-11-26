// Functional DOM/API tests only; no browser rendering, previews or screenshots.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const tick = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };

function harness({ role = 'school', flag = true } = {}) {
  const dom = new JSDOM(read('registration.html'), { url: 'http://localhost/registration.html?eventId=demo', runScripts: 'outside-only' });
  const w = dom.window;
  const h = { dom, w, calls: [], messages: [], event: { id: 58, registrationQuota: flag, registrationFeeType: 'NON' }, response: null };
  h.quotas = [{ id: 1, event_id: 58, category_id: 8, style_id: 12, quota: 100, occupied_places: 37, status: 'OPEN' }];
  h.registrations = [
    { id: 41, event_id: 58, school_id: 2, name: 'Junior group', reg_category_id: 8, reg_style_id: 12, category_name: 'Junior', style_name: 'Hip hop', status: 'CRE', registration_price: 1000, total_amount: 1000, members: [] },
    { id: 42, event_id: 58, school_id: 2, name: 'Unlimited group', category_id: 9, style_id: 12, category_name: 'Adult', style_name: 'Hip hop', status: 'CRE', registration_price: 1000, total_amount: 1000, members: [] }
  ];
  w.Headers = Headers;
  const router = async (url, options = {}) => {
    const parsed = new URL(url);
    const call = { path: parsed.pathname, query: parsed.search, method: options.method || 'GET', headers: Object.fromEntries(new Headers(options.headers)), body: options.body ? JSON.parse(options.body) : undefined };
    h.calls.push(call);
    if (call.path.endsWith('/info')) return new Response(JSON.stringify(h.eventInfo ?? {}));
    if (call.path.endsWith('/quotas/availability')) {
      const result = await h.response?.();
      return new Response(JSON.stringify(result?.data ?? h.quotas), { status: result?.status ?? 200 });
    }
    if (call.path.endsWith('/participants')) return new Response('[]');
    if (call.path.endsWith('/choreographies')) {
      if (call.method === 'GET') return new Response(JSON.stringify(h.registrations));
      return new Response(JSON.stringify({ id: 99 }), { status: 201 });
    }
    if (/\/choreographies\/\d+$/.test(call.path) && call.method === 'PUT') return new Response(JSON.stringify({ id: 41 }));
    if (/\/registrations\/\d+$/.test(call.path)) return new Response(JSON.stringify(h.registrations.find(item => String(item.id) === call.path.split('/').at(-1))));
    throw new Error(`Unexpected endpoint: ${call.method} ${call.path}`);
  };
  w.fetch = router;
  w.localStorage.setItem('token', 'test-token');
  w.localStorage.setItem('lang', 'es');
  w.jwt_decode = () => ({ id: 2, role, exp: Date.now() / 1000 + 3600 });
  const run = file => vm.runInContext(read(file), dom.getInternalVMContext(), { filename: file });
  run('js/utils.js');
  w.getEvent = () => h.event;
  w.getCurrentAppLanguage = () => w.localStorage.getItem('lang');
  const languages = Object.fromEntries(['es', 'en', 'it', 'fr', 'pt'].map(lang => [lang, JSON.parse(read(`lang/registration.${lang}.json`))]));
  w.t = (key, fallback) => languages[w.getCurrentAppLanguage()][key] ?? fallback ?? key;
  w.showMessageModal = message => h.messages.push(message);
  w.bindTableTsvExportButton = () => {};
  const modals = new Map();
  w.bootstrap = {
    Modal: class {
      constructor(element) { this.element = element; modals.set(element, this); }
      static getOrCreateInstance(element) { return modals.get(element) || new this(element); }
      show() { this.element.dispatchEvent(new w.Event('show.bs.modal')); this.element.classList.add('show'); }
      hide() { this.element.classList.remove('show'); this.element.dispatchEvent(new w.Event('hidden.bs.modal')); }
    },
    Tooltip: class { dispose() {} setContent() {} update() {} static getOrCreateInstance() { return new this(); } }
  };
  const listen = w.document.addEventListener.bind(w.document);
  w.document.addEventListener = (name, ...args) => { if (name !== 'DOMContentLoaded') listen(name, ...args); };
  run('js/registration.js');
  run('js/registration-quotas.js');
  run('js/registration-competitions.js');
  w.fetchRegistrationCategories = async () => [{ id: 8, name: 'Junior' }, { id: 9, name: 'Adult' }];
  w.fetchRegistrationStyles = async () => [{ id: 12, name: 'Hip hop' }, { id: 13, name: 'Ballet' }];
  w.fetchEventSchools = async () => [{ id: 2, name: 'School' }];
  h.el = id => w.document.getElementById(id);
  h.api = w.RegistrationQuotaAvailability;
  h.select = async (category, style) => {
    for (const [id, value] of [['registrationCategory', category], ['registrationStyle', style]]) {
      h.el(id).value = String(value);
      h.el(id).dispatchEvent(new w.Event('change'));
    }
    await tick();
  };
  h.click = async selector => { w.document.querySelector(selector).click(); await tick(); };
  h.init = async () => {
    await h.api.init();
    if (role === 'school') w.initCompetitionsTab();
    else if (['organizer', 'admin'].includes(role)) w.initOrganizerRegistrationsTab();
    await tick();
  };
  h.close = () => dom.window.close();
  return h;
}

for (const role of ['school', 'organizer', 'admin']) {
  test(`${role}: loads authenticated availability for the modal without showing it in desktop or mobile lists`, async () => {
    const h = harness({ role });
    try {
      await h.init();
      const calls = h.calls.filter(call => call.path.endsWith('/quotas/availability'));
      assert.ok(calls.length > 0);
      for (const call of calls) {
        assert.equal(call.query, '?event_id=58');
        assert.equal(call.headers.authorization, 'Bearer test-token');
        assert.equal(call.headers['x-event-id'], role === 'admin' ? '58' : undefined);
      }
      const tableId = role === 'school' ? 'registrationsTable' : 'orgRegistrationsTable';
      const mobileId = role === 'school' ? 'registrationsMobileCards' : 'orgRegistrationsMobileCards';
      for (const occupied of [37, 100, 102]) {
        h.quotas[0].occupied_places = occupied;
        await h.api.refresh();
        assert.equal(h.api.getAvailability(8, 12).available, Math.max(0, 100 - occupied));
        for (const id of [tableId, mobileId]) {
          assert.ok(h.el(id).querySelector('[data-id="41"]'));
          assert.equal(h.el(id).querySelector('.registration-quota-availability'), null);
          assert.doesNotMatch(h.el(id).textContent, /Plazas:|No quedan plazas/);
        }
      }
      assert.deepEqual(h.messages, []);
    } finally { h.close(); }
  });
}

test('modal shows selected scope on create/edit, and clears availability for unlimited scopes', async () => {
  const h = harness();
  try {
    await h.init();
    await h.click('#createRegistrationBtn');
    const mount = h.el('registrationQuotaAvailability');
    assert.equal(mount.classList.contains('d-none'), true);
    await h.select(8, 12);
    assert.equal(mount.textContent, 'Plazas disponibles: 63');
    await h.select(8, 13);
    assert.equal(mount.classList.contains('d-none'), true);
    await h.select(9, 12);
    assert.equal(mount.textContent, '');
    await h.click('[data-id="41"].btn-edit-registration');
    assert.equal(h.el('registrationForm').dataset.mode, 'edit');
    assert.match(mount.textContent, /Plazas disponibles: 63/);
    assert.deepEqual(h.messages, []);
  } finally { h.close(); }
});

for (const eventName of ['input', 'change']) {
  test(`modal updates on category ${eventName} with the only style preselected`, async () => {
    const h = harness();
    try {
      h.w.fetchRegistrationStyles = async () => [{ id: 12, name: 'Hip hop' }];
      await h.init();
      await h.click('#createRegistrationBtn');
      const category = h.el('registrationCategory');
      const mount = h.el('registrationQuotaAvailability');
      assert.equal(h.el('registrationStyle').value, '12');
      assert.equal(mount.classList.contains('d-none'), true);
      for (const [value, visible] of [['8', true], ['9', false], ['8', true], ['', false]]) {
        category.value = value;
        category.dispatchEvent(new h.w.Event(eventName));
        assert.equal(mount.classList.contains('d-none'), !visible);
        if (visible) assert.match(mount.textContent, /Plazas disponibles: 63/);
        else assert.equal(mount.textContent, '');
      }
      assert.deepEqual(h.messages, []);
    } finally { h.close(); }
  });

  test(`modal updates on style ${eventName} with a category already selected`, async () => {
    const h = harness();
    try {
      await h.init();
      await h.click('#createRegistrationBtn');
      h.el('registrationCategory').value = '8';
      const style = h.el('registrationStyle');
      const mount = h.el('registrationQuotaAvailability');
      for (const [value, visible] of [['12', true], ['13', false], ['12', true], ['', false]]) {
        style.value = value;
        style.dispatchEvent(new h.w.Event(eventName));
        assert.equal(mount.classList.contains('d-none'), !visible);
        if (visible) assert.match(mount.textContent, /Plazas disponibles: 63/);
        else assert.equal(mount.textContent, '');
      }
      assert.deepEqual(h.messages, []);
    } finally { h.close(); }
  });
}

test('full or closed quotas block creation, recover on selection changes and remain editable', async () => {
  const h = harness();
  try {
    await h.init();
    await h.click('#createRegistrationBtn');
    h.el('choreographyName').value = 'New group';
    const mount = h.el('registrationQuotaAvailability');
    assert.equal(mount.parentElement, h.el('registrationCategory').parentElement.parentElement);
    for (const [status, quota, occupied] of [['CLOSE', 100, 37], ['OPEN', 0, 0], ['OPEN', 100, 100], ['OPEN', 100, 102]]) {
      Object.assign(h.quotas[0], { status, quota, occupied_places: occupied });
      await h.api.refresh();
      await h.select(8, 12);
      assert.equal(mount.textContent, 'Esta categoría está cerrada. Ponte en contacto con el organizador.');
      assert.equal(mount.classList.contains('registration-quota-modal-info--closed'), true);
      assert.ok(mount.querySelector('strong'));
      assert.equal(h.el('registrationSaveBtn').disabled, true);
      h.el('registrationForm').dispatchEvent(new h.w.Event('submit', { bubbles: true, cancelable: true }));
      await tick();
      assert.equal(h.calls.some(call => call.method === 'POST' && call.path.endsWith('/choreographies')), false);
      await h.select(9, 12);
      assert.equal(mount.classList.contains('d-none'), true);
      assert.equal(h.el('registrationSaveBtn').disabled, false);
      await h.select(8, 13);
      assert.equal(h.el('registrationSaveBtn').disabled, false);
    }
    Object.assign(h.quotas[0], { status: 'OPEN', quota: 100, occupied_places: 37 });
    await h.select(8, 12);
    await h.api.refresh();
    assert.equal(mount.textContent, 'Plazas disponibles: 63');
    assert.equal(mount.classList.contains('registration-quota-modal-info--closed'), false);
    assert.equal(h.el('registrationSaveBtn').disabled, false);
    await h.click('#registrationSaveBtn');
    assert.ok(h.calls.some(call => call.method === 'POST' && call.path.endsWith('/choreographies')));
    h.quotas[0].status = 'CLOSE';
    await h.api.refresh();
    await h.click('[data-id="41"].btn-edit-registration');
    assert.equal(h.el('registrationSaveBtn').disabled, false);
    await h.click('#registrationSaveBtn');
    assert.ok(h.calls.some(call => call.method === 'PUT' && call.path.endsWith('/choreographies/41')));
    assert.deepEqual(h.messages, []);
  } finally { h.close(); }
});

test('closed warning uses email_contact from event info, omitting empty contacts', async () => {
  const h = harness();
  try {
    h.quotas[0].status = 'CLOSE';
    await h.init();
    await h.click('#createRegistrationBtn');
    await h.select(8, 12);
    const mount = h.el('registrationQuotaAvailability');
    const message = 'Esta categoría está cerrada. Ponte en contacto con el organizador.';
    for (const [email, suffix] of [[' contacto@example.com ', ' (contacto@example.com)'], ['', ''], [null, ''], ['<img src=x>', ' (<img src=x>)']]) {
      h.eventInfo = { email_contact: email };
      await h.w.loadRegistrationEventInfo();
      assert.equal(mount.textContent, message + suffix);
      assert.equal(mount.querySelector('img'), null);
    }
    h.quotas[0].status = 'OPEN';
    await h.api.refresh();
    assert.equal(mount.textContent, 'Plazas disponibles: 63');
  } finally { h.close(); }
});

test('disabled quota flag and guest sessions make no availability calls and show nothing', async () => {
  for (const options of [{ flag: false }, { role: 'guest' }]) {
    const h = harness(options);
    try {
      await h.api.init();
      await h.api.refresh();
      assert.equal(h.calls.length, 0);
      assert.equal(h.api.createIndicator(h.registrations[0]), null);
      assert.equal(h.el('registrationQuotaAvailability').classList.contains('d-none'), true);
    } finally { h.close(); }
  }
});

test('a failed or malformed response clears stale counts, explains the failure and supports retry', async () => {
  const h = harness();
  try {
    await h.init();
    await h.click('#createRegistrationBtn');
    await h.select(8, 12);
    for (const response of [{ status: 500, data: { error: 'Unavailable' } }, { data: {} }, { data: [{ ...h.quotas[0], occupied_places: null }] }]) {
      h.response = () => response;
      await h.api.refresh();
      assert.equal(h.el('registrationQuotaAvailabilityFeedback').classList.contains('d-none'), false);
      assert.match(h.el('registrationQuotaAvailability').textContent, /No se ha podido consultar/);
      assert.equal(h.el('registrationsTable').querySelector('.registration-quota-availability'), null);
      assert.equal(h.el('registrationSaveBtn').disabled, false);
    }
    h.response = null;
    await h.click('#registrationQuotaAvailabilityRetry');
    assert.equal(h.el('registrationQuotaAvailabilityFeedback').classList.contains('d-none'), true);
    assert.match(h.el('registrationQuotaAvailability').textContent, /Plazas disponibles: 63/);
    h.quotas = [];
    await h.api.refresh();
    assert.equal(h.el('registrationQuotaAvailability').classList.contains('d-none'), true);
    assert.equal(h.el('registrationsTable').querySelector('.registration-quota-availability'), null);
  } finally { h.close(); }
});

test('ignores responses after changing event and refreshes labels when changing language', async () => {
  const h = harness();
  try {
    await h.init();
    await h.click('#createRegistrationBtn');
    await h.select(8, 12);
    h.w.localStorage.setItem('lang', 'en');
    h.w.document.documentElement.lang = 'en';
    await tick();
    assert.match(h.el('registrationQuotaAvailability').textContent, /Available places: 63/);
    let release;
    h.response = () => new Promise(resolve => { release = resolve; });
    const request = h.api.refresh();
    h.event = { id: 59, registrationQuota: true };
    release({ data: h.quotas });
    await request;
    assert.equal(h.api.getAvailability(8, 12), null);
    assert.equal(h.el('registrationsTable').querySelector('.registration-quota-availability'), null);
  } finally { h.close(); }
});
