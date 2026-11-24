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
  h.quotas = [{ id: 1, event_id: 58, category_id: 8, style_id: 12, quota: 100, occupied_places: 37 }];
  h.registrations = [
    { id: 41, event_id: 58, school_id: 2, name: 'Junior group', reg_category_id: 8, reg_style_id: 12, category_name: 'Junior', style_name: 'Hip hop', status: 'CRE', registration_price: 1000, total_amount: 1000, members: [] },
    { id: 42, event_id: 58, school_id: 2, name: 'Unlimited group', category_id: 9, style_id: 12, category_name: 'Adult', style_name: 'Hip hop', status: 'CRE', registration_price: 1000, total_amount: 1000, members: [] }
  ];
  w.Headers = Headers;
  const router = async (url, options = {}) => {
    const parsed = new URL(url);
    const call = { path: parsed.pathname, query: parsed.search, method: options.method || 'GET', headers: Object.fromEntries(new Headers(options.headers)), body: options.body ? JSON.parse(options.body) : undefined };
    h.calls.push(call);
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
  test(`${role}: authenticated availability appears next to status in desktop and mobile lists`, async () => {
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
      const badge = h.el(tableId).querySelector('[data-id="41"] .registration-quota-availability');
      assert.ok(badge, h.messages.join('\n'));
      assert.equal(badge.textContent, 'Plazas: 63/100 disponibles');
      assert.match(badge.getAttribute('aria-label'), /Ocupadas: 37/);
      assert.equal(badge.previousElementSibling.classList.contains('badge'), true);
      assert.equal(h.el(mobileId).querySelector('[data-id="41"] .registration-quota-availability').textContent, badge.textContent);
      assert.equal(h.el(tableId).querySelector('[data-id="42"] .registration-quota-availability'), null);
      assert.equal(h.el(mobileId).querySelector('[data-id="42"] .registration-quota-availability'), null);
      const state = h.w.eval('registrationState');
      const registration = (role === 'school' ? state.registrations : state.organizerRegistrations).find(item => item.id === 41);
      for (const status of ['PEN', 'VAL', 'REJ', 'DEL', 'CRE']) {
        registration.status = status;
        h.w.dispatchEvent(new h.w.CustomEvent('registration:quota-availability-updated'));
        for (const id of [tableId, mobileId]) {
          assert.equal(Boolean(h.el(id).querySelector('[data-id="41"] .registration-quota-availability')), status === 'CRE', `${id}: ${status}`);
        }
      }
      h.quotas[0].occupied_places = 100;
      await h.api.refresh();
      const fullTooltip = role === 'school' ? 'Ponte en contacto con la organización' : 'Revisar el cupo para esta categoría/estilo';
      for (const id of [tableId, mobileId]) {
        const fullBadge = h.el(id).querySelector('[data-id="41"] .registration-quota-availability');
        assert.equal(fullBadge.textContent, 'No quedan plazas');
        assert.equal(fullBadge.dataset.bsTitle, fullTooltip);
        assert.equal(fullBadge.getAttribute('aria-label'), `No quedan plazas. ${fullTooltip}`);
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
    assert.equal(mount.textContent, 'Plazas totales: 100 · Ocupadas: 37 · Disponibles: 63');
    await h.select(8, 13);
    assert.equal(mount.classList.contains('d-none'), true);
    await h.select(9, 12);
    assert.equal(mount.textContent, '');
    await h.click('[data-id="41"].btn-edit-registration');
    assert.equal(h.el('registrationForm').dataset.mode, 'edit');
    assert.match(mount.textContent, /Disponibles: 63/);
    assert.deepEqual(h.messages, []);
  } finally { h.close(); }
});

test('zero and overbooked scopes show zero available and still allow creating and editing', async () => {
  const h = harness();
  try {
    h.quotas[0].occupied_places = 102;
    await h.init();
    for (const id of ['registrationsTable', 'registrationsMobileCards']) {
      const badge = h.el(id).querySelector('.registration-quota-availability');
      assert.equal(badge.textContent, 'No quedan plazas');
      assert.equal(badge.dataset.bsToggle, 'tooltip');
      assert.equal(badge.dataset.bsTitle, 'Ponte en contacto con la organización');
      assert.equal(badge.tabIndex, 0);
    }
    await h.click('#createRegistrationBtn');
    await h.select(8, 12);
    assert.match(h.el('registrationQuotaAvailability').textContent, /Disponibles: 0/);
    assert.equal(h.el('registrationSaveBtn').disabled, false);
    h.el('choreographyName').value = 'New group';
    await h.click('#registrationSaveBtn');
    assert.ok(h.calls.some(call => call.method === 'POST' && call.path.endsWith('/choreographies')));
    await h.click('[data-id="41"].btn-edit-registration');
    await h.select(8, 12);
    await h.click('#registrationSaveBtn');
    assert.ok(h.calls.some(call => call.method === 'PUT' && call.path.endsWith('/choreographies/41')));
    h.quotas[0].quota = 0;
    h.quotas[0].occupied_places = 0;
    await h.api.refresh();
    assert.equal(h.el('registrationsTable').querySelector('.registration-quota-availability').textContent, 'No quedan plazas');
    assert.deepEqual(h.messages, []);
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
    assert.match(h.el('registrationQuotaAvailability').textContent, /Disponibles: 63/);
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
    h.w.localStorage.setItem('lang', 'en');
    h.w.document.documentElement.lang = 'en';
    await tick();
    assert.equal(h.el('registrationsTable').querySelector('.registration-quota-availability').textContent, 'Places: 63/100 available');
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
