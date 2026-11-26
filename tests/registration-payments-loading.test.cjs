// Functional DOM/API regressions for the shared payment loader. No rendering or screenshots.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const tick = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };

function harness(role = 'organizer') {
  const dom = new JSDOM(read('registration.html'), { url: 'http://localhost/registration.html', runScripts: 'outside-only' });
  const w = dom.window;
  const h = { w, dom, role, calls: [], messages: [], overrides: new Map(),
    event: { id: 42, status: 'ongoing', registrationFeeType: 'NON', registrationFeeCost: 0, hasWorkshopsServices: false },
    schools: [{ id: 4, name: 'Academy' }, { id: 5, name: 'Other school' }],
    rows: [
      { id: 1, event_id: 42, school_id: 4, school_name: 'Academy', amount: 1200, payment_type: 'PAY', status: 'VAL', by_organizer: 1 },
      { id: 2, event_id: 42, school_id: 4, school_name: 'Academy', amount: 300, payment_type: 'PAY', status: 'PEN', by_organizer: 0 },
      { id: 3, event_id: 42, school_id: 5, school_name: 'Other school', amount: 5000, payment_type: 'PAY', status: 'VAL', by_organizer: 1 },
      { id: 4, event_id: 42, school_id: 4, school_name: 'Academy', amount: 600, payment_type: 'INV', status: 'VAL' },
      { id: 5, event_id: 42, school_id: 5, school_name: 'Other school', amount: 50, payment_type: 'INV', status: 'VAL' }
    ] };
  w.Headers = Headers;
  w.localStorage.setItem('token', 'test-token');
  w.jwt_decode = () => ({ role, id: role === 'school' ? 4 : 99, exp: Date.now() / 1000 + 3600 });
  w.fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    const method = options.method || 'GET';
    const body = typeof options.body === 'string' ? JSON.parse(options.body)
      : options.body ? Object.fromEntries(options.body.entries()) : undefined;
    const call = { url: parsed, method, body, headers: Object.fromEntries(new Headers(options.headers).entries()), cache: options.cache };
    h.calls.push(call);
    let result;
    const override = h.overrides.get(`${method} ${parsed.pathname}`);
    if (override) result = await override(call);
    else if (parsed.pathname === '/api/registrations/payments' && method === 'GET') {
      result = { data: h.rows.filter(row => String(row.event_id) === parsed.searchParams.get('event_id') && (role !== 'school' || row.school_id === 4)) };
    } else if (parsed.pathname === '/api/registrations/payments' && method === 'POST') {
      const row = { ...body, id: 100 + h.rows.length, event_id: Number(body.event_id), school_id: Number(body.school_id),
        school_name: h.schools.find(school => school.id === Number(body.school_id))?.name, amount: Number(body.amount), status: 'PEN' };
      h.rows.push(row); result = { status: 201, data: row };
    } else if (parsed.pathname.startsWith('/api/registrations/payments/')) {
      const id = Number(parsed.pathname.split('/')[4]);
      const row = h.rows.find(row => row.id === id);
      if (method === 'PUT') row.amount = body.amount;
      else if (method === 'DELETE') h.rows = h.rows.filter(row => row.id !== id);
      else if (method === 'POST') { row.status = parsed.pathname.endsWith('/validate') ? 'VAL' : 'REJ'; row.reject_reason = body?.reject_reason; }
      result = { data: row || {} };
    } else if (parsed.pathname === '/api/schools') result = { data: h.schools };
    else if (['/api/registrations/choreographies', '/api/registrations/categories', '/api/registrations/styles', '/api/participants'].includes(parsed.pathname)) result = { data: [] };
    else throw new Error(`Unexpected request: ${method} ${parsed.pathname}`);
    return new Response(JSON.stringify(result.data), { status: result.status || 200 });
  };
  const run = file => vm.runInContext(read(file), dom.getInternalVMContext(), { filename: file });
  run('js/utils.js');
  // Same session/auth wrapper used by common.js; native requests stay fully simulated.
  w.fetch = (url, options = {}) => w.lumoraSessionFetch(url, options, true);
  w.getEvent = () => h.event;
  const language = JSON.parse(read('lang/registration.en.json'));
  w.t = (key, fallback) => language[key] ?? fallback ?? key;
  w.getCurrentAppLanguage = () => 'en';
  w.WaitEventLoaded = async () => h.event;
  w.ensureTranslationsReady = async () => {};
  w.requestAnimationFrame = callback => { queueMicrotask(callback); return 1; };
  w.showMessageModal = message => h.messages.push(message);
  w.bindTableTsvExportButton = () => {};
  w.getFlagEmoji = () => '';
  w.countries = [];
  const modals = new Map();
  w.bootstrap = {
    Modal: class {
      constructor(element) { this.element = element; modals.set(element, this); }
      static getOrCreateInstance(element) { return modals.get(element) || new this(element); }
      show() { this.element.classList.add('show'); }
      hide() { this.element.classList.remove('show'); queueMicrotask(() => this.element.dispatchEvent(new w.Event('hidden.bs.modal'))); }
    },
    Tooltip: class { dispose() {} setContent() {} update() {} static getInstance() { return null; } static getOrCreateInstance() { return new this(); } }
  };
  const addListener = w.document.addEventListener.bind(w.document);
  w.document.addEventListener = (name, ...args) => { if (name !== 'DOMContentLoaded') addListener(name, ...args); };
  run('js/registration.js'); run('js/registration-payments.js');
  h.state = w.eval('registrationState'); h.state.schools = h.schools;
  h.state.school = { id: 4, event_id: 42 };
  h.el = id => w.document.getElementById(id);
  h.gets = () => h.calls.filter(call => call.method === 'GET' && call.url.pathname === '/api/registrations/payments');
  h.mutations = () => h.calls.filter(call => call.method !== 'GET');
  h.init = async (panel = 'dashboard') => {
    w.location.hash = panel; w.setupRegistrationNavigation(w.getRegistrationRole());
    if (role === 'school') w.initSchoolDashboard(); else w.initOrganizerDashboard();
    await tick();
  };
  h.navigate = async panel => { w.showRegistrationPanel(panel); await tick(); };
  h.click = async selector => { const el = w.document.querySelector(selector); assert.ok(el, selector); el.click(); await tick(); };
  h.submit = async id => { h.el(id).dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await tick(); };
  h.file = () => Object.defineProperty(h.el('registrationPaymentsCreateFile'), 'files', { configurable: true, value: [new w.File(['test'], 'receipt.pdf', { type: 'application/pdf' })] });
  h.close = () => dom.window.close();
  return h;
}

for (const role of ['school', 'organizer', 'admin']) {
  test(`payments loading: ${role} starts with one GET and every Dashboard/Payments entry makes one fresh GET`, async () => {
    const h = harness(role);
    try {
      await h.init(); assert.equal(h.gets().length, 1);
      h.w.initPaymentsTab(h.w.getRegistrationRole()); await tick(); assert.equal(h.gets().length, 1);
      h.w.notifySchoolRegistrationsUpdate(); h.w.notifyOrganizerRegistrationsUpdate();
      h.w.notifyRegistrationConfigUpdate(); h.w.notifyRegistrationSchoolsUpdate(); await tick();
      assert.equal(h.gets().length, 1);
      await h.navigate('payments'); assert.equal(h.gets().length, 2);
      await h.navigate('dashboard'); assert.equal(h.gets().length, 3);
      await h.navigate('participants'); assert.equal(h.gets().length, 3);
      h.w.notifyOrganizerRegistrationsUpdate(); h.w.notifySchoolRegistrationsUpdate(); await tick(); assert.equal(h.gets().length, 3);
      await h.navigate('payments'); assert.equal(h.gets().length, 4);
      assert.ok(h.gets().every(call => call.url.search === '?event_id=42' && call.cache === 'no-store' && call.headers.authorization === 'Bearer test-token'));
      assert.equal(h.el('registrationPaymentsTable').querySelectorAll('tr').length, role === 'school' ? 2 : 3);
      assert.equal(h.el('registrationInvoicesTable').querySelectorAll('tr').length, role === 'school' ? 1 : 2);
      if (role === 'school') {
        assert.equal(h.el('registrationPaymentsTable').querySelector('[data-id="1"] [data-payment-action="delete"]'), null);
        assert.equal(h.el('registrationInvoicesAddBtn').classList.contains('d-none'), true);
      }
    } finally { h.close(); }
  });
}

test('payments loading: opening an unrelated tab and loading initial registration data cause zero payment GETs', async () => {
  for (const role of ['school', 'organizer']) {
    const h = harness(role);
    try {
      await h.init(role === 'school' ? 'competitions' : 'schools');
      if (role === 'school') {
        vm.runInContext(read('js/registration-competitions.js'), h.dom.getInternalVMContext()); h.w.initCompetitionsTab();
      } else {
        h.w.initSchoolsTab(); h.w.initOrganizerRegistrationsTab(); h.w.initRegistrationCategoriesTab(); h.w.initRegistrationDisciplinesTab();
      }
      await tick(); assert.equal(h.gets().length, 0);
      await h.navigate('dashboard'); assert.equal(h.gets().length, 1);
    } finally { h.close(); }
  }
});

test('payments loading: payment tables, invoices and dashboard totals share the same successful response', async () => {
  const h = harness();
  try {
    await h.init();
    assert.equal(h.el('organizerDashboardPaidAmountValue').textContent, h.w.formatRegistrationCurrency(6200));
    assert.equal(h.el('registrationPaymentsPaidValue').textContent, h.w.formatRegistrationCurrency(6200));
    assert.equal(h.el('registrationPaymentsInvoicedValue').textContent, h.w.formatRegistrationCurrency(650));
    await h.navigate('payments');
    const filter = h.el('registrationPaymentsSharedSchoolFilter');
    filter.value = 'id:4'; filter.dispatchEvent(new h.w.Event('change')); await tick();
    assert.equal(h.el('registrationPaymentsTable').querySelectorAll('tr').length, 2);
    assert.equal(h.el('registrationInvoicesTable').querySelectorAll('tr').length, 1);
    assert.equal(h.el('registrationPaymentsPaidValue').textContent, h.w.formatRegistrationCurrency(1200));
    h.el('registrationPaymentsStatusFilter').value = 'PEN'; h.el('registrationPaymentsStatusFilter').dispatchEvent(new h.w.Event('change')); await tick();
    assert.equal(h.el('registrationPaymentsTable').querySelectorAll('tr').length, 1);
    h.w.document.documentElement.lang = 'en'; await tick();
    h.el('registrationPaymentsSharedFilterClear').click(); await tick();
    assert.equal(h.gets().length, 2);
  } finally { h.close(); }
});

test('payments loading: late school and registration data refresh filter options without another GET', async () => {
  const h = harness();
  try {
    h.state.schools = []; await h.init('payments');
    h.state.schools = [...h.schools, { id: 6, name: 'School without payments' }];
    h.w.notifyRegistrationSchoolsUpdate(); await tick();
    assert.ok(h.el('registrationPaymentsSharedSchoolFilter').querySelector('option[value="id:6"]'));
    h.el('registrationPaymentsSharedSchoolFilter').value = 'id:4';
    h.w.notifyOrganizerRegistrationsUpdate(); await tick();
    assert.equal(h.el('registrationPaymentsSharedSchoolFilter').value, 'id:4');
    assert.equal(h.gets().length, 1);
  } finally { h.close(); }
});

test('payments loading: rapid navigation and old errors cannot overwrite a newer response or show a stale error', async () => {
  const h = harness(); const pending = [];
  h.overrides.set('GET /api/registrations/payments', () => new Promise(resolve => pending.push(resolve)));
  try {
    await h.init('payments'); await h.navigate('dashboard');
    pending[1]({ data: [h.rows[0]] }); await tick();
    pending[0]({ status: 500, data: { error: 'Old failure' } }); await tick();
    assert.equal(h.state.paymentDocuments.length, 1);
    assert.equal(h.el('organizerDashboardPaidAmountValue').textContent, h.w.formatRegistrationCurrency(1200));
    assert.equal(h.messages.length, 0);
    await h.navigate('payments'); await h.navigate('schools');
    pending[2]({ data: h.rows }); await tick();
    assert.equal(h.state.paymentDocuments.length, 1);
    assert.equal(h.gets().length, 3);
  } finally { pending.forEach(resolve => resolve({ data: [] })); h.close(); }
});

test('payments loading: an older successful response cannot overwrite more recent tables or dashboard totals', async () => {
  const h = harness(); const pending = [];
  h.overrides.set('GET /api/registrations/payments', () => new Promise(resolve => pending.push(resolve)));
  try {
    await h.init('dashboard'); await h.navigate('payments');
    pending[1]({ data: [h.rows[0], h.rows[3]] }); await tick();
    pending[0]({ data: h.rows }); await tick();
    assert.equal(h.state.paymentDocuments.length, 2);
    assert.equal(h.el('registrationPaymentsTable').querySelectorAll('tr').length, 1);
    assert.equal(h.el('registrationInvoicesTable').querySelectorAll('tr').length, 1);
    assert.equal(h.el('organizerDashboardPaidAmountValue').textContent, h.w.formatRegistrationCurrency(1200));
    assert.equal(h.gets().length, 2);
  } finally { pending.forEach(resolve => resolve({ data: [] })); h.close(); }
});

test('payments loading: event changes clear old rows and reject responses from the previous event', async () => {
  const h = harness(); let release;
  try {
    await h.init();
    h.overrides.set('GET /api/registrations/payments', () => new Promise(resolve => { release = resolve; }));
    await h.navigate('payments'); h.event = { ...h.event, id: 43 };
    h.overrides.delete('GET /api/registrations/payments'); await h.navigate('dashboard');
    release({ data: h.rows }); await tick();
    assert.equal(h.state.paymentDocuments.length, 0);
    assert.equal(h.gets().length, 3);
    assert.equal(h.gets()[2].url.search, '?event_id=43');
  } finally { if (release) release({ data: [] }); h.close(); }
});

test('payments loading: failures do not retry and a new entry recovers in one GET', async () => {
  const h = harness();
  try {
    h.overrides.set('GET /api/registrations/payments', () => ({ status: 429, data: { error: 'Rate limited' } }));
    await h.init('payments'); await tick();
    assert.equal(h.gets().length, 1); assert.deepEqual(h.messages, ['Rate limited']);
    assert.equal(h.state.paymentDocuments.length, 0);
    h.overrides.delete('GET /api/registrations/payments'); await h.navigate('dashboard');
    assert.equal(h.gets().length, 2); assert.equal(h.state.paymentDocuments.length, 5);
  } finally { h.close(); }
});

for (const role of ['school', 'organizer']) {
  test(`payments loading: ${role} can create payments with the original permissions and exactly one reload`, async () => {
    const h = harness(role);
    try {
      await h.init('payments');
      await h.click(role === 'school' ? '#registrationPaymentsAddBtn' : '#registrationPaymentsOrganizerAddBtn');
      h.el('registrationPaymentsCreateAmount').value = '12.34';
      if (role === 'organizer') {
        await h.submit('registrationPaymentsCreateForm'); assert.equal(h.mutations().length, 0);
        h.el('registrationPaymentsCreateSchoolSelect').value = '5';
      } else {
        await h.submit('registrationPaymentsCreateForm'); assert.equal(h.mutations().length, 0);
        h.file();
      }
      await h.submit('registrationPaymentsCreateForm');
      assert.equal(h.mutations().length, 1); assert.equal(h.gets().length, 2);
      const call = h.mutations()[0];
      assert.equal(call.body.amount, '1234'); assert.equal(call.body.school_id, role === 'school' ? '4' : '5');
      assert.equal(call.body.payment_type, 'PAY'); assert.equal(call.body.by_organizer, role === 'school' ? undefined : '1');
      assert.equal(Boolean(call.body.payment), role === 'school');
      assert.equal(call.headers.authorization, 'Bearer test-token');
    } finally { h.close(); }
  });
}

test('payments loading: invoice creation retains the PDF requirement and performs one reload', async () => {
  const h = harness();
  try {
    await h.init('payments'); await h.click('#registrationInvoicesAddBtn');
    h.el('registrationPaymentsCreateSchoolSelect').value = '4'; h.el('registrationPaymentsCreateAmount').value = '20';
    await h.submit('registrationPaymentsCreateForm'); assert.equal(h.mutations().length, 0);
    h.file(); await h.submit('registrationPaymentsCreateForm');
    assert.equal(h.mutations().length, 1); assert.equal(h.gets().length, 2);
    assert.equal(h.mutations()[0].body.payment_type, 'INV'); assert.equal(h.mutations()[0].body.by_organizer, undefined);
    assert.equal(h.el('registrationInvoicesTable').querySelectorAll('tr').length, 3);
  } finally { h.close(); }
});

test('payments loading: editing amounts, validating, rejecting and deleting each reload once and update both consumers', async () => {
  const h = harness();
  try {
    await h.init('payments');
    await h.click('#registrationPaymentsTable [data-id="1"] [data-payment-action="edit-amount"]');
    h.el('registrationPaymentsAmountEditInput').value = '20'; await h.submit('registrationPaymentsAmountEditForm');
    assert.equal(h.gets().length, 2); assert.equal(h.mutations()[0].method, 'PUT');
    assert.equal(h.el('organizerDashboardPaidAmountValue').textContent, h.w.formatRegistrationCurrency(7000));
    await h.click('#registrationPaymentsTable [data-id="2"] [data-payment-action="validate"]');
    await h.click('#confirmValidateRegistrationPaymentBtn');
    assert.equal(h.gets().length, 3); assert.equal(h.rows.find(row => row.id === 2).status, 'VAL');
    assert.equal(h.el('registrationPaymentsPaidValue').textContent, h.w.formatRegistrationCurrency(7300));
    await h.click('#registrationPaymentsTable [data-id="2"] [data-payment-action="reject"]');
    h.el('registrationPaymentsRejectReason').value = 'Incorrect receipt'; await h.click('#confirmRejectRegistrationPaymentBtn');
    assert.equal(h.gets().length, 4); assert.equal(h.rows.find(row => row.id === 2).status, 'REJ');
    assert.equal(h.el('organizerDashboardPaidAmountValue').textContent, h.w.formatRegistrationCurrency(7000));
    await h.click('#registrationInvoicesTable [data-id="4"] [data-payment-action="delete"]');
    await h.click('#confirmDeleteRegistrationPaymentBtn');
    assert.equal(h.gets().length, 5); assert.equal(h.mutations().length, 4);
    assert.equal(h.el('registrationInvoicesTable').querySelectorAll('tr').length, 1);
    assert.equal(h.el('registrationPaymentsInvoicedValue').textContent, h.w.formatRegistrationCurrency(50));
  } finally { h.close(); }
});

test('payments loading: failed or cancelled payment operations do not refetch or discard current data', async () => {
  const h = harness();
  try {
    await h.init('payments');
    await h.click('#registrationPaymentsTable [data-id="2"] [data-payment-action="validate"]');
    h.w.bootstrap.Modal.getOrCreateInstance(h.el('registrationPaymentsValidateModal')).hide(); await tick();
    assert.equal(h.gets().length, 1); assert.equal(h.mutations().length, 0);
    h.overrides.set('PUT /api/registrations/payments/1/amount', () => ({ status: 409, data: { error: 'Conflict' } }));
    await h.click('#registrationPaymentsTable [data-id="1"] [data-payment-action="edit-amount"]');
    h.el('registrationPaymentsAmountEditInput').value = '20'; await h.submit('registrationPaymentsAmountEditForm');
    assert.equal(h.gets().length, 1); assert.equal(h.state.paymentDocuments.length, 5);
    assert.ok(h.messages.includes('Conflict'));
  } finally { h.close(); }
});

test('payments loading: a write completed after leaving Payments defers its reload until the next consumer entry', async () => {
  const h = harness(); let release;
  try {
    await h.init('payments'); await h.click('#registrationPaymentsOrganizerAddBtn');
    h.el('registrationPaymentsCreateSchoolSelect').value = '4'; h.el('registrationPaymentsCreateAmount').value = '10';
    h.overrides.set('POST /api/registrations/payments', () => new Promise(resolve => { release = resolve; }));
    await h.submit('registrationPaymentsCreateForm'); await h.navigate('schools');
    release({ data: {} }); await tick(); assert.equal(h.gets().length, 1);
    await h.navigate('dashboard'); assert.equal(h.gets().length, 2);
  } finally { if (release) release({ data: {} }); h.close(); }
});
