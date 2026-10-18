// Functional DOM/API tests, with no browser rendering or screenshots.
// Requires Node >= 20 and jsdom 26 (can be installed outside the repository).
// Run: node --test tests/registration-extras.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const languages = Object.fromEntries(['es', 'en', 'it', 'fr', 'pt'].map(lang => [lang, JSON.parse(read(`lang/registration.${lang}.json`))]));
const clone = value => JSON.parse(JSON.stringify(value));
const tick = async () => { for (let step = 0; step < 12; step++) await new Promise(resolve => setImmediate(resolve)); };
const summary = { registrations_amount: 100, validated_extras_amount: 40, gross_amount: 140, applied_discount_amount: 15, effective_discount_amount: 15, total_amount: 125 };

function harness({ role = 'school', flag = true, overrides = {} } = {}) {
  const dom = new JSDOM(read('registration.html'), { url: 'http://localhost/registration.html?eventId=demo', runScripts: 'outside-only' });
  const w = dom.window;
  const h = { w, dom, role, calls: [], messages: [], overrides, summary: clone(summary), discount: null, usage: 0, accounts: [{ id: 4, name: 'Academy', user_type: 'SCH' }, { id: 5, name: 'Alex', user_type: 'PAR' }] };
  h.event = { id: 42, code: 'demo', name: 'Test', hasWorkshopsServices: flag, status: 'ongoing', registrationFeeCost: 1000 };
  const workshop = { id: 11, name: 'Workshop <unsafe>', teacher: 'Teacher', description: 'Description', start_at: '2026-10-15T10:00:00', end_at: '2026-10-15T11:00:00', capacity: 1, price: '20.50', validated_count: 1, pending_count: 3, available_count: 0, is_active: true };
  h.data = {
    workshops: [workshop, { ...workshop, id: 13, name: 'Second workshop' }],
    packs: [
      { id: 7, name: 'Fixed', mode: 'FIXED', workshop_count: 2, price: '30.00', is_active: true, workshop_ids: [11, 13], workshops: [] },
      { id: 8, name: 'Flex', mode: 'FLEX', workshop_count: 1, price: '18.00', is_active: true, workshop_ids: [11, 13], workshops: [] }
    ],
    services: [{ id: 31, name: 'Dinner', price: '12.50', is_active: true }],
    participants: [
      { id: 21, name: 'Ada Lovelace', school_id: role === 'school' ? 2 : 4, date_of_birth: '1990-12-10', country: 'ES', registrations: [] },
      { id: 22, name: 'Grace Hopper', school_id: role === 'school' ? 2 : 4, date_of_birth: '1985-12-09', country: 'ES', registrations: [] },
      { id: 23, name: 'Katherine Johnson', school_id: 5, registrations: [] }
    ],
    'discount-codes': [{ id: 9, code: 'WELCOME', amount: '15.00', audience: 'BOTH', valid_from: null, valid_until: null, max_uses: null, is_active: true }],
    bookings: [
      { id: 51, item_type: 'WORKSHOP', attendee_id: 21, workshop_ids: [11], workshops: [workshop], quantity: 1, total_amount: '20.50', status: 'PENDING', registration_school_id: 4 },
      { id: 52, item_type: 'SERVICE', service_id: 31, service: { id: 31, name: 'Dinner' }, quantity: 3, total_amount: '37.50', status: 'VALIDATED', registration_school_id: 5 },
      { id: 53, item_type: 'PACK', pack_id: 7, pack_name: 'Fixed', quantity: 1, total_amount: '30.00', status: 'REJECTED', registration_school_id: 4 }
    ]
  };
  h.data.packs.forEach(pack => { pack.workshops = h.data.workshops; });
  const router = async (url, options = {}) => {
    const parsed = new URL(url);
    const method = options.method || 'GET';
    const route = parsed.pathname.replace('/api/extras', '');
    const call = { url: parsed, path: route, method, body: options.body === undefined ? undefined : JSON.parse(options.body), headers: Object.fromEntries(new Headers(options.headers).entries()) };
    h.calls.push(call);
    const override = h.overrides[`${method} ${route}`];
    let result;
    if (override) result = await override(call, h);
    else if (parsed.pathname.startsWith('/api/participants')) {
      const schoolId = parsed.searchParams.get('school_id');
      const participantId = Number(parsed.pathname.split('/')[3]);
      const person = h.data.participants.find(item => item.id === participantId);
      if (method === 'GET') result = { data: h.data.participants.filter(item => !schoolId || String(item.school_id) === schoolId) };
      else if (method === 'POST') {
        const created = { id: 99, ...call.body, registrations: [] };
        h.data.participants.push(created); result = { data: created };
      } else if (method === 'PUT') { Object.assign(person, call.body, { id: participantId }); result = { data: person }; }
      else if (method === 'DELETE') { h.data.participants.splice(h.data.participants.indexOf(person), 1); result = { data: { deleted: true } }; }
      else throw new Error(`Unexpected participant method: ${method}`);
    }
    else if (parsed.pathname === '/api/registrations/payments') result = { data: [{ id: 100, school_id: 4, amount: 5000, payment_type: 'PAY', status: 'VAL' }] };
    else if (route.endsWith('/summary')) result = { data: h.summary };
    else if (route.endsWith('/discount')) {
      if (method === 'POST') h.discount = { id: 1, code: call.body.code, applied_amount: 15 };
      if (method === 'DELETE') h.discount = null;
      result = { data: h.discount };
    } else {
      const cleaned = route.replace(/^\/admin\/accounts\/\d+/, '').replace(/^\/(admin|catalog)/, '');
      const [, resource, itemId, action] = cleaned.split('/');
      const items = h.data[resource];
      if (!items) throw new Error(`Unexpected test endpoint: ${method} ${route}`);
      const item = items.find(value => value.id === Number(itemId));
      if (action === 'occupancy') result = { data: item };
      else if (action === 'usage') result = { data: { used_count: h.usage, max_uses: null, remaining_uses: null } };
      else if (action === 'workshops') { item.workshop_ids = call.body.workshop_ids; result = { data: item }; }
      else if (action === 'validate' || action === 'reject') { item.status = action === 'validate' ? 'VALIDATED' : 'REJECTED'; result = { data: item }; }
      else if (method === 'GET') result = { data: itemId ? item : resource === 'bookings' ? { data: items, pagination: { page: Number(parsed.searchParams.get('page') || 1), page_size: 20, total_items: 43, total_pages: 3 } } : items };
      else if (method === 'PATCH') { Object.assign(item, call.body); result = { data: item }; }
      else if (method === 'DELETE') { items.splice(items.indexOf(item), 1); result = { data: { deleted: true } }; }
      else if (method === 'POST') result = { status: 201, data: { id: 99, ...call.body, status: 'PENDING' } };
      else throw new Error(`Unexpected test method: ${method} ${route}`);
    }
    const code = result.status || 200;
    return { ok: code >= 200 && code < 300, status: code, json: async () => clone(result.data) };
  };
  w.fetch = router;
  w.Headers = Headers;
  w.localStorage.setItem('token', 'test-token');
  w.localStorage.setItem('lang', 'es');
  w.jwt_decode = () => ({ role: h.role, id: 2, exp: Date.now() / 1000 + 3600 });
  const run = file => vm.runInContext(read(file), dom.getInternalVMContext(), { filename: file });
  run('js/utils.js');
  w.getEvent = () => h.event;
  w.getCurrentAppLanguage = () => w.localStorage.getItem('lang');
  w.t = (key, fallback) => languages[w.getCurrentAppLanguage()][key] ?? fallback ?? key;
  w.WaitEventLoaded = async () => h.event;
  w.ensureTranslationsReady = async () => {};
  w.showMessageModal = (message, title) => h.messages.push({ message, title });
  w.bindTableTsvExportButton = () => {};
  w.getFlagEmoji = () => '';
  w.countries = [{ code: 'ES', name: 'España' }];
  const modals = new Map();
  w.bootstrap = { Modal: class {
    constructor(element) { this.element = element; modals.set(element, this); }
    static getOrCreateInstance(element) { return modals.get(element) || new this(element); }
    show() { this.element.classList.add('show'); queueMicrotask(() => this.element.dispatchEvent(new w.Event('shown.bs.modal'))); }
    hide() { this.element.classList.remove('show'); queueMicrotask(() => this.element.dispatchEvent(new w.Event('hidden.bs.modal'))); }
  } };
  const addListener = w.document.addEventListener.bind(w.document);
  w.document.addEventListener = (name, ...args) => { if (name !== 'DOMContentLoaded') addListener(name, ...args); };
  run('js/registration.js');
  run('js/registration-extras.js');
  run('js/registration-payments.js');
  w.fetchEventSchools = async () => { w.eval('registrationState').schools = h.accounts; return h.accounts; };
  h.init = async () => {
    w.RegistrationExtras.init(w.getRegistrationRole());
    w.setupRegistrationNavigation(w.getRegistrationRole());
    await tick();
  };
  h.navigate = async key => { w.showRegistrationPanel(key); await tick(); };
  h.click = async selector => {
    const element = w.document.querySelector(selector);
    assert.ok(element, `Missing element: ${selector}`);
    element.click(); await tick();
  };
  h.submit = async (values = {}, selector = '#registrationExtrasModal form') => {
    const form = w.document.querySelector(selector);
    assert.ok(form, `Missing form: ${selector}`);
    for (const [key, value] of Object.entries(values)) {
      const field = form.elements.namedItem(key);
      assert.ok(field, `Missing field: ${key}`);
      if (field.type === 'checkbox') field.checked = value;
      else field.value = value;
      field.dispatchEvent(new w.Event('change', { bubbles: true }));
    }
    form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    await tick();
  };
  h.lastMutation = () => h.calls.filter(call => ['POST', 'PATCH', 'PUT', 'DELETE'].includes(call.method)).at(-1);
  h.close = () => dom.window.close();
  return h;
}

test('feature flag hides every extra pane and makes zero extras calls', async () => {
  const h = harness({ flag: false });
  try {
    await h.init(); await h.navigate('extras-workshops');
    assert.equal(h.calls.length, 0);
    assert.equal(h.w.getVisibleRegistrationNavItems().some(item => item.extras), false);
    assert.equal(h.w.document.getElementById('extras-workshops').classList.contains('d-none'), true);
    await assert.rejects(h.w.RegistrationExtras.request('/bookings'));
  } finally { h.close(); }
});

test('school/individual navigation keeps the original Participants tab and removes separate attendee management', async () => {
  const h = harness();
  try {
    await h.init();
    assert.deepEqual(Array.from(h.w.getVisibleRegistrationNavItems().filter(item => item.extras), item => item.key), ['extras-workshops', 'extras-services', 'extras-my-bookings']);
    assert.ok(h.w.getVisibleRegistrationNavItems().some(item => item.key === 'participants'));
    assert.equal(h.w.document.querySelector('#extras-attendees'), null);
    await h.navigate('extras-workshops');
    assert.ok(h.calls.some(call => call.path === '/catalog/packs'));
    assert.equal(h.calls.some(call => call.path.startsWith('/admin')), false);
    assert.match(h.w.document.querySelector('#extras-workshops').textContent, /20,50/);
    assert.equal(h.w.document.querySelector('#extras-workshops unsafe'), null);
  } finally { h.close(); }
});

test('admin uses bearer auth and numeric event context; organizer and school omit event header', async () => {
  for (const role of ['admin', 'organizer', 'school']) {
    const h = harness({ role });
    try {
      await h.init();
      const call = h.calls.find(call => call.path.endsWith('/summary'));
      assert.equal(call.headers.authorization, 'Bearer test-token');
      assert.equal(call.headers['x-event-id'], role === 'admin' ? '42' : undefined);
      assert.equal(call.headers['x-user-role'], undefined);
      assert.equal(call.headers['accept-language'], 'es');
      assert.equal(h.w.getVisibleRegistrationNavItems().filter(item => item.extras).length, role === 'school' ? 3 : 5);
    } finally { h.close(); }
  }
});

test('summary converts decimal euros once; validated payments reduce balance without changing total due', async () => {
  const h = harness();
  try {
    await h.init();
    const finance = h.w.RegistrationExtras.getFinanceSummary();
    assert.equal(finance.total_amount, 12500);
    assert.equal(finance.effective_discount_amount, 1500);
    h.w.eval('registrationState').paymentDocuments = [{ payment_type: 'PAY', status: 'VAL', amount: 5000 }];
    const metrics = h.w.buildRegistrationDashboardFinanceMetrics([], new Map());
    assert.equal(metrics.totalAmount, 12500);
    assert.equal(metrics.pendingAmount, 7500);
    h.w.initPaymentsTab('school'); await tick();
    assert.match(h.w.document.getElementById('registrationPaymentsTotalValue').textContent, /125,00/);
    assert.match(h.w.document.getElementById('registrationPaymentsPendingValue').textContent, /75,00/);
    assert.match(h.w.document.getElementById('registrationPaymentsAmountValue').textContent, /100,00/);
  } finally { h.close(); }
});

test('legacy finance remains unchanged when extras are disabled', async () => {
  const h = harness({ flag: false });
  try {
    await h.init();
    assert.equal(h.w.RegistrationExtras.getFinanceSummary(), null);
    h.w.eval('registrationState').paymentDocuments = [{ payment_type: 'PAY', status: 'VAL', amount: 500 }];
    const metrics = h.w.buildRegistrationDashboardFinanceMetrics([], new Map());
    assert.equal(metrics.totalAmount, 0);
    assert.equal(metrics.paidAmount, 500);
    assert.equal(metrics.pendingAmount, -500);
  } finally { h.close(); }
});

test('full workshops still allow pending bookings with exactly the contract fields', async () => {
  const h = harness();
  try {
    await h.init(); await h.navigate('extras-workshops');
    await h.click('[data-extras-action="book"][data-resource="workshops"][data-id="11"]');
    await h.submit({ attendee_id: '21' });
    assert.deepEqual(h.lastMutation().body, { item_type: 'WORKSHOP', attendee_id: 21, workshop_ids: [11] });
    assert.match(h.w.document.querySelector('#extras-workshops').textContent, /pendiente de validación/);
    assert.equal(h.data.workshops[0].validated_count, 1);
  } finally { h.close(); }
});

test('FIXED pack bookings send no workshop selection or client prices', async () => {
  const h = harness();
  try {
    await h.init(); await h.navigate('extras-workshops');
    await h.click('[data-extras-action="book"][data-resource="packs"][data-id="7"]');
    assert.equal(h.w.document.querySelector('#registrationExtrasModal [name="workshop_ids"]'), null);
    await h.submit({ attendee_id: '21' });
    assert.deepEqual(h.lastMutation().body, { item_type: 'PACK', attendee_id: 21, pack_id: 7 });
  } finally { h.close(); }
});

test('FLEX booking requires exactly the pack count of different eligible workshops', async () => {
  const h = harness();
  try {
    await h.init(); await h.navigate('extras-workshops');
    await h.click('[data-extras-action="book"][data-resource="packs"][data-id="8"]');
    await h.submit({ attendee_id: '21' });
    assert.equal(h.lastMutation(), undefined);
    h.w.document.querySelector('#registrationExtrasModal [name="workshop_ids"][value="13"]').checked = true;
    await h.submit();
    assert.deepEqual(h.lastMutation().body, { item_type: 'PACK', attendee_id: 21, pack_id: 8, workshop_ids: [13] });
  } finally { h.close(); }
});

test('generic services use quantity and optional attendee without workshop fields', async () => {
  const h = harness();
  try {
    await h.init(); await h.navigate('extras-services');
    await h.click('[data-extras-action="book"][data-id="31"]');
    assert.equal(h.w.document.querySelector('#registrationExtrasModal [name="workshop_ids"]'), null);
    await h.submit({ quantity: '3' });
    assert.deepEqual(h.lastMutation().body, { item_type: 'SERVICE', service_id: 31, quantity: 3 });
  } finally { h.close(); }
});

test('pending bookings PATCH only changed fields; resolved bookings have no edit/delete actions', async () => {
  const h = harness();
  try {
    await h.init(); await h.navigate('extras-my-bookings');
    assert.equal(h.w.document.querySelector('[data-extras-action="edit"][data-id="52"]'), null);
    assert.equal(h.w.document.querySelector('[data-extras-action="delete"][data-id="53"]'), null);
    await h.click('[data-extras-action="edit"][data-id="51"]');
    const attendee = h.w.document.querySelector('#registrationExtrasModal [name="attendee_id"]');
    assert.equal(attendee.value, '21');
    assert.equal(attendee.querySelector('[value="22"]').textContent, 'Grace Hopper');
    await h.submit({ attendee_id: '22' });
    assert.equal(h.lastMutation().method, 'PATCH');
    assert.deepEqual(h.lastMutation().body, { attendee_id: 22 });
  } finally { h.close(); }
});

test('all organizer booking filters and server pagination are passed through', async () => {
  const h = harness({ role: 'organizer' });
  try {
    await h.init(); await h.navigate('extras-bookings');
    await h.submit({ registration_school_id: '4', user_type: 'SCH', item_type: 'WORKSHOP', status: 'PENDING', workshop_id: '11', pack_id: '7', service_id: '31', attendee_id: '21', page_size: '50' }, '#extras-bookings [data-extras-filters]');
    const call = h.calls.filter(value => value.path === '/admin/bookings').at(-1);
    assert.equal(call.url.searchParams.get('registration_school_id'), '4');
    assert.equal(call.url.searchParams.get('page_size'), '50');
    assert.equal(call.url.searchParams.get('attendee_id'), '21');
    await h.click('#extras-bookings [data-extras-action="next"]');
    assert.equal(h.calls.filter(value => value.path === '/admin/bookings').at(-1).url.searchParams.get('page'), '2');
  } finally { h.close(); }
});

test('validation/rejection have no bodies and resolved bookings lose actions', async () => {
  for (const action of ['validate', 'reject']) {
    const h = harness({ role: 'organizer' });
    try {
      await h.init(); await h.navigate('extras-bookings');
      await h.click(`[data-extras-action="${action}"][data-id="51"]`);
      await h.submit();
      assert.equal(h.lastMutation().path, `/admin/bookings/51/${action}`);
      assert.equal(h.lastMutation().body, undefined);
      assert.equal(h.w.document.querySelector(`[data-extras-action="${action}"][data-id="51"]`), null);
    } finally { h.close(); }
  }
});

test('409 capacity conflict keeps the booking pending and displays the server error', async () => {
  const h = harness({ role: 'organizer', overrides: { 'POST /admin/bookings/51/validate': () => ({ status: 409, data: { error: 'Sin plazas disponibles' } }) } });
  try {
    await h.init(); await h.navigate('extras-bookings');
    await h.click('[data-extras-action="validate"][data-id="51"]'); await h.submit();
    assert.equal(h.data.bookings[0].status, 'PENDING');
    assert.match(h.w.document.querySelector('[data-extras-dialog-feedback]').textContent, /Sin plazas disponibles/);
  } finally { h.close(); }
});

test('organizer pack creation validates FIXED/FLEX and edits composition with PUT', async () => {
  const h = harness({ role: 'organizer' });
  try {
    await h.init(); await h.navigate('extras-packs');
    await h.click('#extras-packs [data-extras-action="create"]');
    await h.submit({ name: 'New pack', price: '25', workshop_count: '1' });
    assert.equal(h.lastMutation(), undefined);
    h.w.document.querySelector('#registrationExtrasModal [name="workshop_ids"][value="11"]').checked = true;
    await h.submit();
    assert.deepEqual(h.lastMutation().body.workshop_ids, [11]);
    assert.equal(h.lastMutation().path, '/admin/packs');
    await h.click('#extras-packs [data-extras-action="edit"][data-id="8"]');
    h.w.document.querySelector('#registrationExtrasModal [name="workshop_ids"][value="13"]').checked = false;
    await h.submit();
    assert.equal(h.lastMutation().method, 'PUT');
    assert.equal(h.lastMutation().path, '/admin/packs/8/workshops');
    assert.deepEqual(h.lastMutation().body, { workshop_ids: [11] });
  } finally { h.close(); }
});

test('used discount code fields are disabled and PATCH is_active only', async () => {
  const h = harness({ role: 'organizer' }); h.usage = 1;
  try {
    await h.init(); await h.navigate('extras-discounts');
    await h.click('#extras-discounts [data-extras-action="edit"][data-id="9"]');
    assert.equal(h.w.document.querySelector('#registrationExtrasModal [name="amount"]').disabled, true);
    assert.equal(h.w.document.querySelector('#registrationExtrasModal [name="code"]').disabled, true);
    await h.submit({ is_active: false });
    assert.deepEqual(h.lastMutation().body, { is_active: false });
  } finally { h.close(); }
});

test('workshop and pack selectors use account participants without competition registrations', async () => {
  const h = harness();
  try {
    await h.init(); await h.navigate('extras-workshops');
    for (const resource of ['workshops', 'packs']) {
      await h.click(`[data-extras-action="book"][data-resource="${resource}"][data-id="${resource === 'packs' ? 7 : 11}"]`);
      const select = h.w.document.querySelector('#registrationExtrasModal [name="attendee_id"]');
      assert.deepEqual(Array.from(select.options, option => [option.value, option.textContent]).slice(1), [['21', 'Ada Lovelace'], ['22', 'Grace Hopper']]);
      const call = h.calls.filter(call => call.path === '/api/participants').at(-1);
      assert.equal(call.url.searchParams.get('school_id'), '2');
      assert.equal(call.url.searchParams.get('event_id'), '42');
      assert.equal(call.url.searchParams.size, 2);
      await h.submit({ attendee_id: '21' });
      assert.equal(h.lastMutation().body.attendee_id, 21);
    }
    assert.equal(h.calls.some(call => call.path.includes('/attendees')), false);
  } finally { h.close(); }
});

test('empty participant accounts explain the existing registration flow and still allow services', async () => {
  const h = harness();
  h.data.participants = [];
  try {
    await h.init(); await h.navigate('extras-workshops');
    for (const [resource, productId] of [['workshops', 11], ['packs', 7]]) {
      await h.click(`[data-extras-action="book"][data-resource="${resource}"][data-id="${productId}"]`);
      const modal = h.w.document.querySelector('#registrationExtrasModal');
      assert.match(modal.textContent, /pestaña Participantes de Inscripciones/);
      assert.equal(modal.querySelector('[name="attendee_id"]').required, true);
      assert.equal(modal.querySelector('[name="first_name"]'), null);
      await h.submit();
      assert.equal(h.lastMutation(), undefined);
      await h.click('#registrationExtrasModal [data-bs-dismiss]');
    }
    await h.navigate('extras-services');
    await h.click('[data-extras-action="book"][data-id="31"]');
    assert.equal(h.w.document.querySelector('#registrationExtrasModal [name="attendee_id"]').required, false);
    await h.submit({ quantity: '3' });
    assert.deepEqual(h.lastMutation().body, { item_type: 'SERVICE', service_id: 31, quantity: 3 });
  } finally { h.close(); }
});

test('services can attach a registration participant and clear it from a pending booking', async () => {
  const h = harness();
  try {
    await h.init(); await h.navigate('extras-services');
    await h.click('[data-extras-action="book"][data-id="31"]');
    await h.submit({ attendee_id: '22', quantity: '2' });
    assert.deepEqual(h.lastMutation().body, { item_type: 'SERVICE', attendee_id: 22, service_id: 31, quantity: 2 });
    Object.assign(h.data.bookings[1], { status: 'PENDING', attendee_id: 22 });
    await h.navigate('extras-my-bookings');
    await h.click('[data-extras-action="edit"][data-id="52"]');
    assert.equal(h.w.document.querySelector('#registrationExtrasModal [name="attendee_id"]').value, '22');
    await h.submit({ attendee_id: '' });
    assert.equal(h.lastMutation().path, '/bookings/52');
    assert.deepEqual(h.lastMutation().body, { attendee_id: null });
  } finally { h.close(); }
});

test('a failed participant query does not prevent a service booking without a person', async () => {
  const h = harness({ overrides: { 'GET /api/participants': () => ({ status: 500, data: {} }) } });
  try {
    await h.init(); await h.navigate('extras-services');
    await h.click('[data-extras-action="book"][data-id="31"]');
    assert.match(h.w.document.querySelector('#registrationExtrasModal [role="status"]').textContent, /participantes/);
    await h.submit({ quantity: '2' });
    assert.deepEqual(h.lastMutation().body, { item_type: 'SERVICE', service_id: 31, quantity: 2 });
  } finally { h.close(); }
});

test('a participant lookup failure cannot silently remove the person from an existing service', async () => {
  const h = harness({ overrides: { 'GET /api/participants': () => ({ status: 500, data: {} }) } });
  Object.assign(h.data.bookings[1], { status: 'PENDING', attendee_id: 22 });
  try {
    await h.init(); await h.navigate('extras-my-bookings');
    await h.click('[data-extras-action="edit"][data-id="52"]');
    assert.equal(h.w.document.querySelector('#registrationExtrasModal'), null);
    assert.match(h.w.document.querySelector('#extras-my-bookings [data-extras-feedback]').textContent, /participantes/);
    assert.equal(h.lastMutation(), undefined);
    assert.equal(h.data.bookings[1].attendee_id, 22);
  } finally { h.close(); }
});

test('own and organizer booking lists and details resolve participant IDs from the shared endpoint', async () => {
  for (const role of ['school', 'organizer', 'admin']) {
    const h = harness({ role });
    try {
      await h.init(); await h.navigate(role === 'school' ? 'extras-my-bookings' : 'extras-bookings');
      const pane = h.w.document.getElementById(role === 'school' ? 'extras-my-bookings' : 'extras-bookings');
      assert.match(pane.querySelector('tbody').textContent, /Ada Lovelace/);
      assert.match(pane.querySelector('.extras-mobile-list').textContent, /Ada Lovelace/);
      const call = h.calls.find(call => call.path === '/api/participants');
      assert.equal(call.url.searchParams.get('event_id'), '42');
      assert.equal(call.url.searchParams.get('school_id'), role === 'school' ? '2' : null);
      await h.click('[data-extras-action="details"][data-id="51"]');
      assert.match(h.w.document.querySelector('#registrationExtrasModal').textContent, /Ada Lovelace/);
      assert.equal(h.calls.some(call => call.path.includes('/attendees')), false);
    } finally { h.close(); }
  }
});

test('organizer editing and creation select participants belonging to each account', async () => {
  const h = harness({ role: 'organizer' });
  try {
    await h.init();
    h.w.dispatchEvent(new h.w.CustomEvent('registration:account-opened', { detail: { account: h.accounts[0] } })); await tick();
    await h.click('#registrationAccountExtras [data-extras-action="edit"][data-id="51"]');
    let selector = h.w.document.querySelector('#registrationExtrasModal [name="attendee_id"]');
    assert.equal(selector.value, '21');
    assert.deepEqual(Array.from(selector.options, option => option.value), ['', '21', '22']);
    await h.submit({ attendee_id: '22' });
    assert.equal(h.lastMutation().path, '/admin/accounts/4/bookings/51');
    assert.deepEqual(h.lastMutation().body, { attendee_id: 22 });
    assert.match(h.w.document.querySelector('#registrationAccountExtras tbody').textContent, /Grace Hopper/);
    h.w.dispatchEvent(new h.w.CustomEvent('registration:account-opened', { detail: { account: h.accounts[1] } })); await tick();
    await h.click('#registrationAccountExtras [data-extras-action="create"]');
    selector = h.w.document.querySelector('#registrationExtrasModal [name="attendee_id"]');
    assert.deepEqual(Array.from(selector.options, option => [option.value, option.textContent]).slice(1), [['23', 'Katherine Johnson']]);
    const call = h.calls.filter(call => call.path === '/api/participants').at(-1);
    assert.equal(call.url.searchParams.get('school_id'), '5');
    await h.submit({ product_id: '11', attendee_id: '23' });
    assert.equal(h.lastMutation().path, '/admin/accounts/5/bookings');
    assert.deepEqual(h.lastMutation().body, { item_type: 'WORKSHOP', attendee_id: 23, workshop_ids: [11] });
  } finally { h.close(); }
});

test('booking submission rejects a participant from another account', async () => {
  const h = harness({ role: 'organizer', overrides: { 'GET /api/participants': (call, h) => ({ data: h.data.participants }) } });
  try {
    await h.init();
    h.w.dispatchEvent(new h.w.CustomEvent('registration:account-opened', { detail: { account: h.accounts[0] } })); await tick();
    await h.click('#registrationAccountExtras [data-extras-action="create"]');
    const selector = h.w.document.querySelector('#registrationExtrasModal [name="attendee_id"]');
    assert.equal(selector.querySelector('[value="23"]'), null);
    selector.add(new h.w.Option('Katherine Johnson', '23'));
    await h.submit({ product_id: '11', attendee_id: '23' });
    assert.equal(h.lastMutation(), undefined);
    assert.match(h.w.document.querySelector('[data-extras-dialog-feedback]').textContent, /elemento válido/);
  } finally { h.close(); }
});

test('the original Participants tab still loads, creates, edits and deletes through its own endpoints', async () => {
  const h = harness();
  try {
    await h.init();
    h.w.eval('registrationState').school = { id: 2, country: 'ES' };
    h.w.initParticipantsTab('school'); await tick();
    assert.equal(h.w.eval('registrationState').participants.length, 2);
    assert.match(h.w.document.getElementById('participantsTable').textContent, /Ada Lovelace/);
    await h.click('#addParticipantBtn');
    await h.submit({ participantName: 'New Participant', participantDob: '1995-05-05', participantCountry: 'ES' }, '#participantForm');
    await h.click('#participantSaveBtn');
    assert.equal(h.lastMutation().path, '/api/participants');
    assert.equal(h.lastMutation().body.school_id, 2);
    await h.click('#participantsTable .btn-edit-participant[data-id="21"]');
    await h.submit({ participantName: 'Ada Updated' }, '#participantForm');
    await h.click('#participantSaveBtn');
    assert.equal(h.lastMutation().path, '/api/participants/21');
    assert.equal(h.lastMutation().method, 'PUT');
    assert.match(h.w.document.getElementById('participantsTable').textContent, /Ada Updated/);
    await h.click('#participantsTable .btn-delete-participant[data-id="21"]');
    await h.click('#confirmDeleteParticipantBtn');
    assert.equal(h.lastMutation().method, 'DELETE');
    assert.equal(h.w.eval('registrationState').participants.some(person => person.id === 21), false);
    await h.navigate('extras-workshops');
    await h.click('[data-extras-action="book"][data-resource="workshops"][data-id="11"]');
    assert.match(h.w.document.querySelector('#registrationExtrasModal [name="attendee_id"]').textContent, /New Participant/);
    assert.doesNotMatch(h.w.document.querySelector('#registrationExtrasModal [name="attendee_id"]').textContent, /Ada/);
  } finally { h.close(); }
});

test('discount application sends code only, supports null and refreshes the summary', async () => {
  const h = harness();
  try {
    await h.init();
    assert.ok(h.w.document.querySelector('#registrationExtrasFinance [name="code"]'));
    await h.submit({ code: 'WELCOME' }, '#registrationExtrasFinance form');
    assert.deepEqual(h.lastMutation().body, { code: 'WELCOME' });
    assert.equal(h.lastMutation().path, '/account/discount');
    await h.click('#registrationExtrasFinance [data-extras-action="discount-remove"]'); await h.submit();
    assert.equal(h.lastMutation().method, 'DELETE');
    assert.equal(h.lastMutation().body, undefined);
    assert.equal(h.discount, null);
  } finally { h.close(); }
});

test('account tools reuse the existing account dialog and route writes through account ID only', async () => {
  const h = harness({ role: 'organizer' });
  try {
    await h.init();
    const accountModal = h.w.document.getElementById('schoolDetailsModal');
    h.w.bootstrap.Modal.getOrCreateInstance(accountModal).show();
    h.w.dispatchEvent(new h.w.CustomEvent('registration:account-opened', { detail: { account: h.accounts[0] } }));
    await tick();
    assert.ok(h.calls.some(call => call.path === '/admin/accounts/4/bookings'));
    assert.equal(h.w.document.querySelector('[data-extras-account-tab="attendees"]'), null);
    await h.click('#registrationAccountExtras [data-extras-action="create"]');
    assert.equal(accountModal.classList.contains('show'), false);
    assert.deepEqual(Array.from(h.w.document.querySelector('#registrationExtrasModal [name="attendee_id"]').options, option => option.value), ['', '21', '22']);
    await h.submit({ product_id: '11', attendee_id: '21' });
    assert.equal(h.lastMutation().path, '/admin/accounts/4/bookings');
    assert.deepEqual(h.lastMutation().body, { item_type: 'WORKSHOP', attendee_id: 21, workshop_ids: [11] });
    assert.equal(accountModal.classList.contains('show'), true);
    await h.click('[data-extras-account-tab="summary"]');
    await h.submit({ code: 'WELCOME' }, '#registrationAccountExtras [data-extras-discount-form]');
    assert.equal(h.lastMutation().path, '/admin/accounts/4/discount');
  } finally { h.close(); }
});

test('event changes clear cached summaries and stale responses cannot overwrite the new event', async () => {
  let release;
  const oldRequest = new Promise(resolve => { release = resolve; });
  let defer = true;
  const h = harness({ overrides: { 'GET /account/summary': async () => defer ? await oldRequest : { data: { ...summary, total_amount: 200 } } } });
  try {
    await h.init();
    h.event = { ...h.event, id: 43 }; defer = false;
    h.w.RegistrationExtras.init('school'); await tick();
    release({ data: summary }); await tick();
    assert.equal(h.w.RegistrationExtras.getFinanceSummary().total_amount, 20000);
    h.event = { ...h.event, id: 44, hasWorkshopsServices: false };
    h.w.RegistrationExtras.init('school'); await tick();
    assert.equal(h.w.RegistrationExtras.getFinanceSummary(), null);
  } finally { release({ data: summary }); h.close(); }
});

test('API errors retain translated server messages for 400/401/403/404/409/422', async () => {
  for (const status of [400, 401, 403, 404, 409, 422]) {
    const h = harness({ overrides: { 'GET /bookings': () => ({ status, data: { error: `Translated error ${status}` } }) } });
    try {
      await h.init();
      await assert.rejects(h.w.RegistrationExtras.request('/bookings'), error => error.status === status && error.message === `Translated error ${status}`);
    } finally { h.close(); }
  }
});

test('five dictionaries have identical nonempty extras keys and preserve accented text', () => {
  const keys = Object.keys(languages.es).filter(key => key.startsWith('extras_')).sort();
  assert.ok(keys.length > 100);
  for (const language of Object.values(languages)) {
    assert.deepEqual(Object.keys(language).filter(key => key.startsWith('extras_')).sort(), keys);
    assert.ok(keys.every(key => typeof language[key] === 'string' && language[key].length));
  }
  assert.equal(languages.es.extras_discounts, 'Descuentos');
  assert.equal(languages.es.extras_occupancy, 'Ocupación');
  assert.equal(languages.fr.extras_bookings, 'Réservations');
  assert.equal(languages.pt.extras_services, 'Serviços');
});

for (const resource of ['workshops', 'services', 'discount-codes']) {
  test(`organizer ${resource}: create, details, edit, toggle and delete use the CRUD contract`, async () => {
    const pane = { workshops: 'extras-workshops', services: 'extras-services', 'discount-codes': 'extras-discounts' }[resource];
    const h = harness({ role: 'organizer' });
    const item = h.data[resource][0];
    try {
      await h.init(); await h.navigate(pane);
      await h.click(`#${pane} [data-extras-action="create"]`);
      const values = resource === 'discount-codes' ? { code: 'TEST', amount: '5', audience: 'SCH' } : { name: 'New item', price: '10.25' };
      if (resource === 'workshops') Object.assign(values, { teacher: 'Teacher', start_at: '2026-10-16T10:00', end_at: '2026-10-16T11:00', capacity: '15' });
      await h.submit(values);
      assert.equal(h.lastMutation().path, `/admin/${resource}`);
      assert.equal(h.lastMutation().method, 'POST');
      assert.equal(h.lastMutation().body.event_id, undefined);
      await h.click(`#${pane} [data-extras-action="details"][data-id="${item.id}"]`);
      assert.ok(h.calls.some(call => call.path === `/admin/${resource}/${item.id}`));
      if (resource === 'workshops') assert.ok(h.calls.some(call => call.path.endsWith('/occupancy')));
      if (resource === 'discount-codes') {
        assert.ok(h.calls.some(call => call.path.endsWith('/usage')));
        assert.match(h.w.document.querySelector('#registrationExtrasModal').textContent, /Sin límite/);
      }
      await h.click('#registrationExtrasModal [data-bs-dismiss]');
      await h.click(`#${pane} [data-extras-action="edit"][data-id="${item.id}"]`);
      await h.submit(resource === 'discount-codes' ? { amount: '7.25' } : { price: '21.75' });
      assert.equal(h.lastMutation().method, 'PATCH');
      assert.deepEqual(h.lastMutation().body, resource === 'discount-codes' ? { amount: 7.25 } : { price: 21.75 });
      await h.click(`#${pane} [data-extras-action="toggle"][data-id="${item.id}"]`);
      assert.deepEqual(h.lastMutation().body, { is_active: false });
      await h.click(`#${pane} [data-extras-action="delete"][data-id="${item.id}"]`); await h.submit();
      assert.equal(h.lastMutation().method, 'DELETE');
      assert.equal(h.lastMutation().body, undefined);
    } finally { h.close(); }
  });
}

test('pending deletion and account booking edits use their respective paths', async () => {
  const h = harness({ role: 'organizer' });
  try {
    await h.init();
    h.w.dispatchEvent(new h.w.CustomEvent('registration:account-opened', { detail: { account: h.accounts[0] } })); await tick();
    await h.click('#registrationAccountExtras [data-extras-action="edit"][data-id="51"]');
    await h.submit({ product_id: '13' });
    assert.equal(h.lastMutation().path, '/admin/accounts/4/bookings/51');
    assert.deepEqual(h.lastMutation().body, { workshop_ids: [13] });
    await h.click('#registrationAccountExtras [data-extras-action="delete"][data-id="51"]'); await h.submit();
    assert.equal(h.lastMutation().path, '/admin/accounts/4/bookings/51');
    assert.equal(h.lastMutation().method, 'DELETE');
    await h.click('#registrationAccountExtras [data-extras-action="create"]');
    await h.submit({ item_type: 'SERVICE', product_id: '31', quantity: '2' });
    assert.equal(h.lastMutation().path, '/admin/accounts/4/bookings');
    assert.deepEqual(h.lastMutation().body, { item_type: 'SERVICE', service_id: 31, quantity: 2 });
  } finally { h.close(); }
});

test('failed summaries show unavailable totals instead of silently dropping extras', async () => {
  const h = harness({ overrides: { 'GET /account/summary': () => ({ status: 403, data: { error: 'No summary access' } }) } });
  try {
    await h.init(); h.w.initPaymentsTab('school'); await tick();
    assert.equal(h.w.RegistrationExtras.getFinanceSummary(), null);
    assert.equal(h.w.document.getElementById('registrationPaymentsTotalValue').textContent, '—');
    assert.equal(h.w.document.getElementById('registrationPaymentsPendingValue').textContent, '—');
    assert.match(h.w.document.getElementById('registrationExtrasFinance').textContent, /No summary access/);
  } finally { h.close(); }
});

test('effective discounts and zero totals come from the API even when applied discount exceeds gross amount', async () => {
  const h = harness();
  h.summary = { registrations_amount: 0, validated_extras_amount: 5, gross_amount: 5, applied_discount_amount: 15, effective_discount_amount: 5, total_amount: 0 };
  try {
    await h.init();
    assert.equal(h.w.RegistrationExtras.getFinanceSummary().effective_discount_amount, 500);
    assert.equal(h.w.RegistrationExtras.getFinanceSummary().total_amount, 0);
    assert.equal(h.w.buildRegistrationDashboardFinanceMetrics([], new Map()).totalAmount, 0);
  } finally { h.close(); }
});

test('FLEX administrative composition requires at least the configured count; pack price updates are independent', async () => {
  const h = harness({ role: 'organizer' });
  try {
    await h.init(); await h.navigate('extras-packs');
    await h.click('#extras-packs [data-extras-action="create"]');
    await h.submit({ name: 'Flexible', mode: 'FLEX', workshop_count: '2', price: '40' });
    h.w.document.querySelector('#registrationExtrasModal [name="workshop_ids"][value="11"]').checked = true;
    await h.submit(); assert.equal(h.lastMutation(), undefined);
    h.w.document.querySelector('#registrationExtrasModal [name="workshop_ids"][value="13"]').checked = true;
    await h.submit(); assert.equal(h.lastMutation().body.workshop_ids.length, 2);
    await h.click('#extras-packs [data-extras-action="edit"][data-id="7"]');
    await h.submit({ price: '35' });
    assert.deepEqual(h.lastMutation().body, { price: 35 });
    assert.equal(h.lastMutation().method, 'PATCH');
    assert.equal(h.calls.some(call => call.method === 'PUT'), false);
  } finally { h.close(); }
});

test('language changes update navigation and loaded catalogs after translations are ready', async () => {
  const h = harness();
  try {
    await h.init(); await h.navigate('extras-services');
    h.w.localStorage.setItem('lang', 'fr');
    h.w.document.documentElement.setAttribute('lang', 'fr'); await tick();
    assert.match(h.w.document.querySelector('#extras-services').textContent, /Réserver/);
    assert.match(h.w.document.querySelector('[data-registration-nav-key="extras-my-bookings"]').textContent, /Mes réservations/);
  } finally { h.close(); }
});
