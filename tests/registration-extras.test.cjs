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
  h.event = { id: 42, code: 'demo', name: 'Test', hasWorkshopsServices: flag, status: 'ongoing', registrationFeeCost: 1000, registrationStart: '2026-10-01T15:00:00', registrationEnd: '2026-12-31T09:00:00' };
  h.prices = {};
  h.validatedSummary = { event_id: 42, workshops: [], packs: [], services: [] };
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
    else if (route === '/admin/summary') result = { data: h.validatedSummary };
    else if (route.endsWith('/summary')) result = { data: h.summary };
    else if (route.endsWith('/discount')) {
      if (method === 'POST') h.discount = { id: 1, code: call.body.code, applied_amount: 15 };
      if (method === 'DELETE') h.discount = null;
      result = { data: h.discount };
    } else if (route === '/admin/workshops/prices' && method === 'POST') {
      const prices = [];
      for (const workshop of h.data.workshops) {
        const existing = h.prices[`workshops/${workshop.id}`] ||= [];
        for (const range of call.body.ranges) {
          const price = { id: 100 + existing.length, workshop_id: workshop.id, start_date: range.inicio, end_date: range.fin, price: Number(range.precio) };
          existing.push(price); prices.push(price);
        }
      }
      result = { status: 201, data: { event_id: call.body.event_id, workshops_count: h.data.workshops.length, prices_count: prices.length, prices } };
    } else {
      const cleaned = route.replace(/^\/admin\/accounts\/\d+/, '').replace(/^\/(admin|catalog)/, '');
      const [, resource, itemId, action, priceId] = cleaned.split('/');
      const items = h.data[resource];
      if (!items) throw new Error(`Unexpected test endpoint: ${method} ${route}`);
      const item = items.find(value => value.id === Number(itemId));
      if (action === 'prices') {
        const prices = h.prices[`${resource}/${itemId}`] ||= [];
        const price = prices.find(value => String(value.id) === priceId);
        if (method === 'GET') result = { data: priceId ? price : prices };
        else if (method === 'POST') { const created = { id: 100 + prices.length, ...call.body }; prices.push(created); result = { status: 201, data: created }; }
        else if (method === 'PATCH') { Object.assign(price, call.body); result = { data: price }; }
        else if (method === 'DELETE') { prices.splice(prices.indexOf(price), 1); result = { data: { deleted: true } }; }
      }
      else if (action === 'occupancy') result = { data: item };
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
    return new Response(code === 204 ? null : JSON.stringify(result.data), { status: code });
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

for (const resource of ['workshops', 'packs', 'services']) {
  test(`${resource}: the visible Add price button submits the entered range`, async () => {
    const h = harness({ role: 'organizer' });
    const product = h.data[resource][0];
    try {
      await h.init(); await h.navigate(`extras-${resource}`);
      await h.click(`#extras-${resource} [data-extras-action="prices"][data-id="${product.id}"]`);
      const form = h.w.document.querySelector('#registrationExtrasModal form');
      assert.equal(form.querySelector('.modal-body').textContent.includes(product.name), false);
      assert.equal(form.textContent.includes(languages.es.extras_prices_hint), false);
      for (const [key, value] of Object.entries({ start_date: '2026-11-01', end_date: '2026-11-30', price: '25.50' })) {
        form.elements.namedItem(key).value = value;
        form.elements.namedItem(key).dispatchEvent(new h.w.Event('input', { bubbles: true }));
      }
      const addButton = [...form.querySelectorAll('button')].find(button => button.textContent === languages.es.extras_add_price);
      assert.ok(addButton);
      addButton.click(); await tick();
      assert.equal(h.lastMutation()?.path, `/admin/${resource}/${product.id}/prices`);
      assert.deepEqual(h.lastMutation().body, { start_date: '2026-11-01', end_date: '2026-11-30', price: '25.50' });
      assert.equal(form.querySelectorAll('[type="submit"]').length, 1);
      assert.equal(form.querySelector('[data-extras-price-action="reset"]').hidden, true);
      await h.click('[data-extras-price-action="edit"][data-price-id="100"]');
      assert.equal(form.querySelector('[type="submit"]').textContent, languages.es.extras_save_price);
      form.elements.namedItem('price').value = '30';
      await h.click('#registrationExtrasModal [type="submit"]');
      assert.equal(h.lastMutation().method, 'PATCH');
      assert.deepEqual(h.lastMutation().body, { price: '30' });
      await h.click('[data-extras-price-action="edit"][data-price-id="100"]');
      const mutationCount = h.calls.filter(call => call.method !== 'GET').length;
      await h.click('[data-extras-price-action="reset"]');
      assert.equal(h.calls.filter(call => call.method !== 'GET').length, mutationCount);
      assert.equal(form.elements.namedItem('price').value, '');
      assert.equal(form.querySelector('[type="submit"]').textContent, languages.es.extras_add_price);
    } finally { h.close(); }
  });

  test(`${resource}: date prices use nested CRUD, inclusive days and partial PATCH without product fields`, async () => {
    const h = harness({ role: 'organizer' });
    const pane = `extras-${resource}`, product = h.data[resource][0];
    const base = `/admin/${resource}/${product.id}`;
    try {
      await h.init(); await h.navigate(pane);
      const doc = h.w.document;
      assert.equal(Array.from(doc.querySelectorAll(`#${pane} thead th`)).some(th => th.textContent === languages.es.extras_price), false);
      assert.equal(Array.from(doc.querySelectorAll(`#${pane} .extras-mobile-list dt`)).some(dt => dt.textContent === languages.es.extras_price), false);
      await h.click(`#${pane} [data-extras-action="prices"][data-id="${product.id}"]`);
      const form = doc.querySelector('#registrationExtrasModal form');
      assert.match(form.textContent, /No hay precios configurados/);
      assert.equal(form.elements.namedItem('start_date').min, '2026-10-01');
      assert.equal(form.elements.namedItem('end_date').max, '2026-12-31');
      await h.submit({ start_date: '2026-10-01', end_date: '2026-10-01', price: '25.50' });
      assert.deepEqual(h.lastMutation().body, { start_date: '2026-10-01', end_date: '2026-10-01', price: '25.50' });
      assert.equal(h.lastMutation().path, `${base}/prices`);
      assert.equal(h.lastMutation().method, 'POST');
      assert.equal(doc.querySelector('#registrationExtrasModal').classList.contains('show'), true);
      assert.match(form.querySelector('[data-extras-prices-list]').textContent, /25,50/);
      await h.click('[data-extras-price-action="edit"][data-price-id="100"]');
      await h.submit({ price: '30' });
      assert.equal(h.lastMutation().path, `${base}/prices/100`);
      assert.equal(h.lastMutation().method, 'PATCH');
      assert.deepEqual(h.lastMutation().body, { price: '30' });
      // Adjacent ranges may start the day after an inclusive end.
      await h.submit({ start_date: '2026-10-02', end_date: '2026-12-31', price: '10' });
      assert.equal(h.lastMutation().method, 'POST');
      await h.click('[data-extras-price-action="delete"][data-price-id="100"]');
      assert.equal(h.lastMutation().method, 'POST');
      await h.click('[data-extras-price-action="confirm-delete"]');
      assert.equal(h.lastMutation().method, 'DELETE');
      assert.equal(h.lastMutation().body, undefined);
      assert.equal(h.lastMutation().path, `${base}/prices/100`);
      assert.equal(form.querySelector('[data-extras-price-action="edit"][data-price-id="100"]'), null);
      assert.ok(h.calls.filter(call => call.method === 'GET' && call.path === base).length >= 5);
      assert.ok(h.calls.filter(call => call.method === 'GET' && call.path === `${base}/prices`).length >= 5);
      for (const call of h.calls.filter(call => call.path.startsWith(`${base}/prices`))) {
        assert.equal(call.url.search, '');
        assert.equal(call.headers.authorization, 'Bearer test-token');
        assert.equal(call.headers['x-event-id'], undefined);
      }
    } finally { h.close(); }
  });

  test(`${resource}: no current price is unavailable in the catalog and blocks new bookings`, async () => {
    const h = harness();
    const product = h.data[resource][0];
    product.price = null;
    try {
      await h.init(); await h.navigate(resource === 'services' ? 'extras-services' : 'extras-workshops');
      if (resource === 'packs') await h.click('[data-extras-catalog-tab="packs"]');
      const button = h.w.document.querySelector(`[data-extras-action="book"][data-resource="${resource}"][data-id="${product.id}"]`);
      assert.equal(button.disabled, true);
      assert.match(button.closest('article').textContent, /Sin tarifa vigente/);
      assert.doesNotMatch(button.closest('article').textContent, /0,00/);
      // Administrative booking creation also blocks unavailable selections.
      h.role = 'organizer'; await h.init();
      h.w.dispatchEvent(new h.w.CustomEvent('registration:account-opened', { detail: { account: h.accounts[0] } })); await tick();
      await h.click('#registrationAccountExtras [data-extras-action="create"]');
      await h.submit({ item_type: { workshops: 'WORKSHOP', packs: 'PACK', services: 'SERVICE' }[resource], product_id: String(product.id), attendee_id: '21' });
      assert.equal(h.lastMutation(), undefined);
      assert.equal(h.w.document.querySelector('#registrationExtrasModal [type="submit"]').disabled, true);
    } finally { h.close(); }
  });
}

test('date prices reject shared endpoints, reversed dates, outside dates and invalid amounts', async () => {
  const h = harness({ role: 'organizer' });
  h.prices['workshops/11'] = [{ id: 100, start_date: '2026-11-01', end_date: '2026-11-30', price: 25 }];
  try {
    await h.init(); await h.navigate('extras-workshops');
    await h.click('#extras-workshops [data-extras-action="prices"][data-id="11"]');
    for (const values of [
      { start_date: '2026-10-31', end_date: '2026-11-01', price: '10' },
      { start_date: '2026-11-30', end_date: '2026-12-01', price: '10' },
      { start_date: '2026-12-02', end_date: '2026-12-01', price: '10' },
      { start_date: '2026-09-30', end_date: '2026-10-01', price: '10' },
      { start_date: '2026-12-31', end_date: '2027-01-01', price: '10' },
      { start_date: '2026-12-01', end_date: '2026-12-01', price: '0' },
      { start_date: '2026-12-01', end_date: '2026-12-01', price: '-1' },
      { start_date: '2026-12-01', end_date: '2026-12-01', price: '1.234' },
      { start_date: '2026-12-01', end_date: '2026-12-01', price: '1e2' },
      { start_date: '2026-12-01', end_date: '2026-12-01', price: '100000000' },
      { start_date: '2026-02-30', end_date: '2026-12-01', price: '10' }
    ]) {
      await h.submit(values);
      assert.equal(h.lastMutation(), undefined, JSON.stringify(values));
    }
    await h.click('[data-extras-price-action="edit"][data-price-id="100"]');
    await h.submit({ price: '25.50' });
    assert.deepEqual(h.lastMutation().body, { price: '25.50' });
  } finally { h.close(); }
});

test('missing registration period disables price writes while retaining deletion', async () => {
  const h = harness({ role: 'organizer' });
  h.event.registrationStart = null;
  h.prices['services/31'] = [{ id: 100, start_date: '2026-11-01', end_date: '2026-11-30', price: 25 }];
  try {
    await h.init(); await h.navigate('extras-services');
    await h.click('#extras-services [data-extras-action="prices"][data-id="31"]');
    const form = h.w.document.querySelector('#registrationExtrasModal form');
    assert.match(form.textContent, /periodo de inscripción válido/);
    assert.equal(form.querySelector('[type="submit"]').disabled, true);
    assert.equal(form.querySelector('[data-extras-price-action="edit"]').disabled, true);
    await h.submit();
    assert.equal(h.lastMutation(), undefined);
    await h.click('[data-extras-price-action="delete"]');
    await h.click('[data-extras-price-action="confirm-delete"]');
    assert.equal(h.lastMutation().method, 'DELETE');
    assert.equal(form.querySelector('[type="submit"]').disabled, true);
  } finally { h.close(); }
});

test('concurrent price conflict refreshes ranges and keeps the form and server error', async () => {
  const h = harness({ role: 'organizer', overrides: {
    'POST /admin/workshops/11/prices': (call, h) => {
      h.prices['workshops/11'] = [{ id: 200, ...call.body }];
      return { status: 409, data: { error: 'Concurrent range conflict', code: 'extras_price_overlapping_range' } };
    }
  } });
  try {
    await h.init(); await h.navigate('extras-workshops');
    await h.click('#extras-workshops [data-extras-action="prices"][data-id="11"]');
    await h.submit({ start_date: '2026-11-01', end_date: '2026-11-30', price: '25.50' });
    const form = h.w.document.querySelector('#registrationExtrasModal form');
    assert.match(form.querySelector('[data-extras-dialog-feedback]').textContent, /Concurrent range conflict/);
    assert.ok(form.querySelector('[data-price-id="200"]'));
    assert.equal(form.elements.namedItem('price').value, '25.50');
    assert.equal(h.w.document.querySelector('#registrationExtrasModal').classList.contains('show'), true);
  } finally { h.close(); }
});

test('price list load failure prevents writes and supports retry', async () => {
  const h = harness({ role: 'organizer', overrides: { 'GET /admin/services/31/prices': () => ({ status: 403, data: { error: 'No price access' } }) } });
  try {
    await h.init(); await h.navigate('extras-services');
    await h.click('#extras-services [data-extras-action="prices"][data-id="31"]');
    const form = h.w.document.querySelector('#registrationExtrasModal form');
    assert.match(form.textContent, /No price access/);
    assert.equal(form.querySelector('[type="submit"]').disabled, true);
    delete h.overrides['GET /admin/services/31/prices'];
    await h.click('[data-extras-price-action="refresh"]');
    assert.equal(form.querySelector('[type="submit"]').disabled, false);
  } finally { h.close(); }
});

test('expired current prices preserve pending booking historical amounts and service quantity changes', async () => {
  const h = harness();
  h.data.services[0].price = null;
  h.data.bookings = [{ id: 55, item_type: 'SERVICE', service_id: 31, quantity: 2, unit_price: 8.5, total_amount: 17, status: 'PENDING' }];
  try {
    await h.init(); await h.navigate('extras-my-bookings');
    await h.click('[data-extras-action="edit"][data-id="55"]');
    const form = h.w.document.querySelector('#registrationExtrasModal form');
    assert.match(form.querySelector('[data-extras-product-fields]').textContent, /8,50/);
    assert.equal(form.querySelector('[type="submit"]').disabled, false);
    await h.submit({ quantity: '3' });
    assert.deepEqual(h.lastMutation().body, { quantity: 3 });
    assert.equal(h.lastMutation().path, '/bookings/55');
  } finally { h.close(); }
});

test('pending workshop product changes require a current price; returning to the historical product stays editable', async () => {
  const h = harness();
  h.data.workshops.forEach(product => { product.price = null; });
  try {
    await h.init(); await h.navigate('extras-my-bookings');
    await h.click('[data-extras-action="edit"][data-id="51"]');
    const form = h.w.document.querySelector('#registrationExtrasModal form');
    assert.equal(form.querySelector('[type="submit"]').disabled, false);
    await h.submit({ product_id: '13' });
    assert.equal(h.lastMutation(), undefined);
    assert.equal(form.querySelector('[type="submit"]').disabled, true);
    await h.submit({ product_id: '11', attendee_id: '22' });
    assert.deepEqual(h.lastMutation().body, { attendee_id: 22 });
    assert.equal(h.lastMutation().path, '/bookings/51');
  } finally { h.close(); }
});

test('pending FLEX selections retain historical price when the pack has no current tariff', async () => {
  const h = harness();
  h.data.packs[1].price = null;
  h.data.bookings = [{ id: 55, item_type: 'PACK', pack_id: 8, workshop_ids: [11], attendee_id: 21, unit_price: 15, total_amount: 15, status: 'PENDING' }];
  try {
    await h.init(); await h.navigate('extras-my-bookings');
    await h.click('[data-extras-action="edit"][data-id="55"]');
    const form = h.w.document.querySelector('#registrationExtrasModal form');
    assert.match(form.querySelector('[data-extras-product-fields]').textContent, /15,00/);
    form.querySelector('[name="workshop_ids"][value="11"]').checked = false;
    form.querySelector('[name="workshop_ids"][value="13"]').checked = true;
    await h.submit();
    assert.deepEqual(h.lastMutation().body, { workshop_ids: [13] });
  } finally { h.close(); }
});

test('price saves block duplicate mutations and remain recoverable if the following refresh fails', async () => {
  let release;
  const h = harness({ role: 'organizer', overrides: {
    'POST /admin/services/31/prices': async () => {
      await new Promise(resolve => { release = resolve; });
      return { status: 201, data: { id: 100, start_date: '2026-11-01', end_date: '2026-11-30', price: 25 } };
    }
  } });
  try {
    await h.init(); await h.navigate('extras-services');
    await h.click('#extras-services [data-extras-action="prices"][data-id="31"]');
    await h.submit({ start_date: '2026-11-01', end_date: '2026-11-30', price: '25' });
    await h.submit();
    assert.equal(h.calls.filter(call => call.method === 'POST').length, 1);
    h.overrides['GET /admin/services/31/prices'] = () => ({ status: 500, data: { error: 'Refresh failed' } });
    release(); await tick();
    const form = h.w.document.querySelector('#registrationExtrasModal form');
    assert.match(form.textContent, /Refresh failed/);
    assert.equal(form.elements.namedItem('price').value, '');
    assert.equal(form.querySelector('[type="submit"]').disabled, true);
    delete h.overrides['GET /admin/services/31/prices'];
    await h.click('[data-extras-price-action="refresh"]');
    assert.equal(form.querySelector('[type="submit"]').disabled, false);
  } finally { h.close(); }
});

test('422 price-not-available refreshes catalog and blocks another new booking attempt', async () => {
  const h = harness({ overrides: { 'POST /bookings': (call, h) => {
    h.data.services[0].price = null;
    return { status: 422, data: { error: 'Price expired', code: 'extras_price_not_available' } };
  } } });
  try {
    await h.init(); await h.navigate('extras-services');
    await h.click('[data-extras-action="book"][data-resource="services"][data-id="31"]');
    await h.submit();
    const form = h.w.document.querySelector('#registrationExtrasModal form');
    assert.match(form.querySelector('[data-extras-dialog-feedback]').textContent, /Price expired/);
    assert.equal(form.querySelector('[type="submit"]').disabled, true);
    assert.equal(h.w.document.querySelector('[data-extras-action="book"][data-resource="services"][data-id="31"]').disabled, true);
    await h.submit();
    assert.equal(h.calls.filter(call => call.path === '/bookings' && call.method === 'POST').length, 1);
  } finally { h.close(); }
});

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

test('school catalog tabs support keyboard navigation and keep the selected tab after refresh', async () => {
  const h = harness();
  try {
    await h.init(); await h.navigate('extras-workshops');
    const doc = h.w.document;
    assert.equal(h.w.getVisibleRegistrationNavItems().find(item => item.key === 'extras-workshops').labelKey, 'extras_workshops_packs');
    assert.equal(doc.querySelector('#extras-workshops h2, #extras-workshops h3'), null);
    assert.equal(doc.querySelector('#extras-workshops-workshops-catalog').hidden, false);
    assert.equal(doc.querySelector('#extras-workshops-packs-catalog').hidden, true);
    doc.querySelector('[data-extras-catalog-tab="workshops"]').dispatchEvent(new h.w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert.equal(doc.querySelector('#extras-workshops-workshops-catalog').hidden, true);
    assert.equal(doc.querySelector('#extras-workshops-packs-catalog').hidden, false);
    assert.equal(doc.activeElement.dataset.extrasCatalogTab, 'packs');
    await h.click('#extras-workshops [data-extras-action="catalog-refresh"]');
    assert.equal(doc.querySelector('[data-extras-catalog-tab="packs"]').getAttribute('aria-selected'), 'true');
    assert.equal(doc.querySelector('#extras-workshops-packs-catalog').hidden, false);
    await h.click('[data-extras-catalog-tab="workshops"]');
    assert.equal(doc.querySelector('#extras-workshops-packs-catalog').hidden, true);
  } finally { h.close(); }
});

test('new workshop, pack and service bookings automatically select the sole account participant', async () => {
  for (const resource of ['workshops', 'packs', 'services']) {
    const h = harness();
    h.data.participants = [h.data.participants.find(person => person.id === 21)];
    h.data.bookings = [];
    try {
      await h.init(); await h.navigate(resource === 'services' ? 'extras-services' : 'extras-workshops');
      if (resource === 'services') assert.equal(h.w.getVisibleRegistrationNavItems().find(item => item.key === 'extras-services').labelKey, 'extras_galas_extras');
      if (resource === 'packs') await h.click('[data-extras-catalog-tab="packs"]');
      await h.click(`[data-extras-action="book"][data-resource="${resource}"][data-id="${resource === 'services' ? 31 : resource === 'packs' ? 7 : 11}"]`);
      assert.equal(h.w.document.querySelector('#registrationExtrasModal [name="attendee_id"]').value, '21');
      await h.submit();
      assert.equal(h.lastMutation().body.attendee_id, 21);
      assert.equal(h.lastMutation().body.item_type, resource === 'services' ? 'SERVICE' : resource === 'packs' ? 'PACK' : 'WORKSHOP');
    } finally { h.close(); }
  }
});

test('catalog marks each participant and status across booking pages, including actual FLEX choices only', async () => {
  const rows = [
    [{ id: 101, item_type: 'WORKSHOP', attendee_id: 21, workshop_ids: [11], status: 'PENDING' }],
    [
      { id: 102, item_type: 'PACK', pack_id: 8, attendee_id: 22, workshop_ids: [13], status: 'VALIDATED' },
      { id: 103, item_type: 'WORKSHOP', attendee_id: 23, workshop_ids: [11], status: 'REJECTED' }
    ]
  ];
  const h = harness({ overrides: { 'GET /bookings': call => ({ data: { data: rows[Number(call.url.searchParams.get('page')) - 1], pagination: { total_pages: 2 } } }) } });
  try {
    await h.init(); await h.navigate('extras-workshops');
    const doc = h.w.document;
    const card = workshopId => doc.querySelector(`#extras-workshops [data-resource="workshops"][data-id="${workshopId}"]`).closest('article');
    assert.match(card(11).querySelector('.extras-workshop-reservations').textContent, /Ada Lovelace/);
    assert.match(card(11).querySelector('.extras-workshop-reservations').textContent, /Pend\. Validaci/);
    assert.doesNotMatch(card(11).textContent, /Grace Hopper|Katherine Johnson/);
    assert.match(card(13).querySelector('.extras-workshop-reservations').textContent, /Grace Hopper/);
    assert.match(card(13).querySelector('.extras-workshop-reservations').textContent, /Validada/);
    const pack = doc.querySelector('[data-resource="packs"][data-id="8"]').closest('article');
    assert.equal(pack.querySelector('details').open, false);
    assert.match(pack.querySelector('.extras-workshop-summary').textContent, /Ada Lovelace/);
    assert.match(pack.querySelector('.extras-workshop-summary').textContent, /Grace Hopper/);
    assert.ok(h.calls.some(call => call.path === '/bookings' && call.url.searchParams.get('page') === '2'));
  } finally { h.close(); }
});

test('workshop reservation markers show multiple participants and safely escape their names', async () => {
  const h = harness();
  h.data.participants[1].name = '<unsafe>Grace</unsafe>';
  h.data.bookings.push({ id: 104, item_type: 'WORKSHOP', attendee_id: 22, workshop_ids: [11], status: 'VALIDATED' });
  try {
    await h.init(); await h.navigate('extras-workshops');
    const card = h.w.document.querySelector('[data-resource="workshops"][data-id="11"]').closest('article');
    assert.equal(card.querySelectorAll('.extras-booking-marker').length, 2);
    assert.match(card.textContent, /Ada Lovelace/);
    assert.match(card.textContent, /<unsafe>Grace<\/unsafe>/);
    assert.equal(card.querySelector('unsafe'), null);
  } finally { h.close(); }
});

test('a sole participant workshop booking omits the name and separates reservation and status badges', async () => {
  for (const state of ['PENDING', 'VALIDATED']) {
    const h = harness();
    h.data.participants = [h.data.participants[0]];
    h.data.bookings[0].status = state;
    try {
      await h.init(); await h.navigate('extras-workshops');
      const card = h.w.document.querySelector('[data-resource="workshops"][data-id="11"]').closest('article');
      const marker = card.querySelector('.extras-booking-marker');
      assert.equal(marker.querySelectorAll(':scope > .lm-status').length, 2);
      assert.equal(marker.querySelector('.lm-status-info').textContent, 'Reservado');
      assert.equal(marker.lastElementChild.textContent, state === 'PENDING' ? languages.es.extras_pending_short : languages.es.extras_validated);
      assert.doesNotMatch(marker.textContent, /Ada Lovelace/);
      assert.equal(card.querySelector('[data-extras-action="book"]').disabled, true);
      assert.equal(card.querySelector('.extras-catalog-card-footer').firstElementChild, card.querySelector('.extras-workshop-reservations'));
    } finally { h.close(); }
  }
});

test('workshop booking is disabled only when every account participant has a pending or validated reservation', async () => {
  const h = harness();
  h.data.bookings = [
    { id: 301, item_type: 'WORKSHOP', attendee_id: 21, workshop_ids: [11], status: 'PENDING' },
    { id: 302, item_type: 'WORKSHOP', attendee_id: 21, workshop_ids: [11], status: 'VALIDATED' },
    { id: 303, item_type: 'PACK', pack_id: 8, attendee_id: 22, workshop_ids: [11], status: 'REJECTED' }
  ];
  try {
    await h.init(); await h.navigate('extras-workshops');
    const bookButton = () => h.w.document.querySelector('[data-resource="workshops"][data-id="11"]');
    assert.equal(bookButton().disabled, false);
    h.data.bookings[2].status = 'VALIDATED';
    await h.click('#extras-workshops [data-extras-action="catalog-refresh"]');
    assert.equal(bookButton().disabled, true);
    h.data.bookings = h.data.bookings.filter(booking => booking.attendee_id !== 21);
    await h.click('#extras-workshops [data-extras-action="catalog-refresh"]');
    assert.equal(bookButton().disabled, false);
  } finally { h.close(); }
});

test('pack cards show reservation and status badges for one or multiple participants and disable only fully booked packs', async () => {
  for (const single of [true, false]) {
    const h = harness();
    if (single) h.data.participants = [h.data.participants[0]];
    h.data.bookings = [
      { id: 401, item_type: 'PACK', pack_id: 8, attendee_id: 21, workshop_ids: [13], status: 'PENDING' },
      { id: 402, item_type: 'PACK', pack_id: 7, attendee_id: 21, workshop_ids: [11, 13], status: 'REJECTED' }
    ];
    try {
      await h.init(); await h.navigate('extras-workshops');
      await h.click('[data-extras-catalog-tab="packs"]');
      const button = packId => h.w.document.querySelector(`[data-resource="packs"][data-id="${packId}"]`);
      const footer = () => button(8).closest('article').querySelector('.extras-catalog-card-footer');
      assert.equal(footer().querySelector('.extras-booking-marker > .lm-status-info').textContent, single ? 'Reservado' : 'Reservado para Ada Lovelace');
      assert.equal(footer().querySelector('.lm-status-warning').textContent, languages.es.extras_pending_short);
      assert.equal(button(8).disabled, single);
      assert.equal(button(7).disabled, false);
      assert.equal(button(7).closest('article').querySelector('.extras-catalog-card-footer .extras-booking-marker'), null);
      if (!single) {
        h.data.bookings.push({ id: 403, item_type: 'PACK', pack_id: 8, attendee_id: 22, workshop_ids: [11], status: 'VALIDATED' });
        await h.click('#extras-workshops [data-extras-action="catalog-refresh"]');
        assert.equal(button(8).disabled, true);
        assert.match(footer().textContent, /Reservado para Grace Hopper/);
        assert.equal(footer().querySelectorAll('.extras-booking-marker').length, 2);
      }
    } finally { h.close(); }
  }
});

test('booking lookup failures keep the catalog available and disclose that reservations are unknown', async () => {
  const h = harness({ overrides: { 'GET /bookings': () => ({ status: 500, data: {} }) } });
  try {
    await h.init(); await h.navigate('extras-workshops');
    const catalog = h.w.document.querySelector('#extras-workshops');
    assert.ok(catalog.querySelector('[data-extras-action="book"]'));
    assert.match(catalog.querySelector('.alert-warning').textContent, /comprobar las reservas/);
    assert.equal(catalog.querySelector('.extras-booking-marker'), null);
  } finally { h.close(); }
});

test('pack reservations use booking detail snapshots when the list omits the selected sessions', async () => {
  const h = harness({ overrides: {
    'GET /bookings/105': () => ({ data: { id: 105, workshop_ids: [], workshops: [{ id: 13 }] } })
  } });
  h.data.bookings = [{ id: 105, item_type: 'PACK', pack_id: 8, attendee_id: 22, status: 'PENDING' }];
  try {
    await h.init(); await h.navigate('extras-workshops');
    const doc = h.w.document;
    const card = workshopId => doc.querySelector(`[data-resource="workshops"][data-id="${workshopId}"]`).closest('article');
    assert.equal(card(11).querySelector('.extras-booking-marker'), null);
    assert.match(card(13).querySelector('.extras-booking-marker').textContent, /Grace Hopper/);
    assert.ok(h.calls.some(call => call.path === '/bookings/105'));
  } finally { h.close(); }
});

test('service catalog totals booked quantities across pages and separates pending and validated bookings', async () => {
  const rows = [
    [
      { id: 201, item_type: 'SERVICE', service_id: 31, quantity: 2, status: 'PENDING' },
      { id: 202, item_type: 'SERVICE', service_id: 31, quantity: 3, status: 'VALIDATED' }
    ],
    [
      { id: 203, item_type: 'SERVICE', service_id: 31, quantity: 4, status: 'VALIDATED' },
      { id: 204, item_type: 'SERVICE', service_id: 31, quantity: 50, status: 'REJECTED' },
      { id: 205, item_type: 'SERVICE', service_id: 99, quantity: 10, status: 'PENDING' }
    ]
  ];
  const h = harness({ overrides: { 'GET /bookings': call => ({ data: { data: rows[Number(call.url.searchParams.get('page')) - 1], pagination: { total_pages: 2 } } }) } });
  h.data.services.push({ id: 32, name: 'Unbooked', price: 10 });
  try {
    await h.init(); await h.navigate('extras-services');
    const doc = h.w.document;
    const card = serviceId => doc.querySelector(`[data-resource="services"][data-id="${serviceId}"]`).closest('article');
    const reserved = card(31).querySelector('.extras-service-reservations');
    assert.equal(reserved.querySelector('strong').textContent, 'Cantidad reservada: 9');
    assert.equal(reserved.querySelector('.lm-status-success').textContent, 'Validada: 7');
    assert.match(reserved.querySelector('.lm-status-warning').textContent, /: 2$/);
    assert.equal(card(32).querySelector('.extras-service-reservations'), null);
    assert.equal(h.calls.some(call => call.path === '/api/participants'), false);
  } finally { h.close(); }
});

test('service catalog discloses reservation lookup failures without hiding bookable services', async () => {
  const h = harness({ overrides: { 'GET /bookings': () => ({ status: 500, data: {} }) } });
  try {
    await h.init(); await h.navigate('extras-services');
    const catalog = h.w.document.querySelector('#extras-services');
    assert.ok(catalog.querySelector('[data-extras-action="book"]'));
    assert.match(catalog.querySelector('.alert-warning').textContent, /comprobar las reservas/);
    assert.equal(catalog.querySelector('.extras-service-reservations'), null);
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
      assert.equal(h.w.getVisibleRegistrationNavItems().filter(item => item.extras).length, role === 'school' ? 3 : 6);
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

test('Payments applies every fee type for organizer and school, and hides only the fee metric for NON', async () => {
  const categories = [{ id: 1, apply_fee: 1 }, { id: 2, apply_fee: 0 }];
  const rows = [
    { id: 1, school_id: 4, category_id: 1, status: 'VAL', total_amount: 3000, members: [{ participant_id: 11 }, { participant_id: 12 }, { participant_id: 13 }] },
    { id: 2, school_id: 4, category_id: 1, status: 'VAL', total_amount: 2000, members: [{ participant_id: 11 }] },
    { id: 3, school_id: 5, category_id: 2, status: 'VAL', total_amount: 4000, members: [{ participant_id: 21 }] },
    { id: 4, school_id: 6, category_id: 1, status: 'PEN', total_amount: 9000, members: [{ participant_id: 31 }] },
    { id: 5, school_id: 4, category_id: 1, status: 'VAL', total_amount: 1000, members: [{ participant_id: 14 }] }
  ];
  for (const role of ['organizer', 'school']) {
    const h = harness({ role, flag: false });
    try {
      const state = h.w.eval('registrationState');
      state.registrationCategories = categories;
      state.schools = h.accounts;
      state.organizerRegistrations = rows;
      state.registrations = rows.filter(row => row.school_id === 4).map(row => ({ ...row, school_id: 2 }));
      h.event.registrationFeeType = 'NON';
      h.w.initPaymentsTab(role); await tick();
      const feeSummary = h.w.document.getElementById('registrationPaymentsFeeSummary');
      const card = feeSummary.closest('.registration-payments-summary-card');
      for (const [type, expectedFee] of [['NON', 0], ['PAR', role === 'school' ? 4000 : 5000], ['REG', role === 'school' ? 3000 : 4000], ['SCH', role === 'school' ? 1000 : 3000]]) {
        h.event.registrationFeeType = type;
        h.w.dispatchEvent(new h.w.Event('registration:config-updated')); await tick();
        const expectedRegistrations = role === 'school' ? 6000 : 19000;
        const breakdown = h.w.document.getElementById('registrationPaymentsAmountBreakdown');
        assert.equal(breakdown.querySelectorAll('dd')[0].textContent, h.w.formatRegistrationCurrency(role === 'school' ? 6000 : 10000));
        assert.equal(breakdown.querySelectorAll('dd')[1].textContent, h.w.formatRegistrationCurrency(role === 'school' ? 0 : 9000));
        assert.equal(h.w.document.getElementById('registrationPaymentsFeeValue').textContent, h.w.formatRegistrationCurrency(expectedFee));
        const validatedFee = { NON: 0, PAR: 4000, REG: 3000, SCH: role === 'school' ? 1000 : 2000 }[type];
        const feeBreakdown = h.w.document.getElementById('registrationPaymentsFeeBreakdown');
        assert.equal(feeBreakdown.querySelectorAll('dd')[0].textContent, h.w.formatRegistrationCurrency(validatedFee));
        assert.equal(feeBreakdown.querySelectorAll('dd')[1].textContent, h.w.formatRegistrationCurrency(expectedFee - validatedFee));
        assert.equal(h.w.document.getElementById('registrationPaymentsTotalValue').textContent, h.w.formatRegistrationCurrency(expectedRegistrations + expectedFee));
        assert.equal(h.w.document.getElementById('registrationPaymentsAmountValue').textContent, h.w.formatRegistrationCurrency(expectedRegistrations));
        assert.equal(feeSummary.classList.contains('d-none'), type === 'NON');
        assert.equal(card.classList.contains('registration-payments-summary-card--without-fee'), type === 'NON');
        assert.equal(card.classList.contains('d-none'), false);
        assert.equal(feeSummary.nextElementSibling.classList.contains('d-none'), false);
      }
      assert.equal(h.messages.length, 0);
    } finally { h.close(); }
  }
});

test('Payments school filter charges SCH for an exempt-only school and respects category exemptions for REG', async () => {
  const h = harness({ role: 'organizer', flag: false });
  try {
    const state = h.w.eval('registrationState');
    state.schools = h.accounts;
    state.registrationCategories = [{ id: 1, apply_fee: 1 }, { id: 2, apply_fee: 0 }];
    state.organizerRegistrations = [
      { id: 1, school_id: 4, category_id: 1, status: 'VAL', total_amount: 3000, members: [{ participant_id: 11 }] },
      { id: 2, school_id: 4, category_id: 1, status: 'VAL', total_amount: 2000, members: [{ participant_id: 11 }] },
      { id: 3, school_id: 5, category_id: 2, status: 'VAL', total_amount: 4000, members: [{ participant_id: 21 }] }
    ];
    h.event.registrationFeeType = 'SCH';
    h.w.initPaymentsTab('organizer'); await tick();
    const filter = h.w.document.getElementById('registrationPaymentsSharedSchoolFilter');
    const select = async value => { filter.value = value; filter.dispatchEvent(new h.w.Event('change')); await tick(); };
    await select('id:5');
    assert.equal(h.w.document.getElementById('registrationPaymentsFeeValue').textContent, h.w.formatRegistrationCurrency(1000));
    assert.match(h.w.document.getElementById('registrationPaymentsFeeMeta').textContent, /^1 /);
    assert.equal(h.w.document.getElementById('registrationPaymentsTotalValue').textContent, h.w.formatRegistrationCurrency(5000));
    h.event.registrationFeeType = 'REG';
    h.w.dispatchEvent(new h.w.Event('registration:config-updated')); await tick();
    assert.equal(h.w.document.getElementById('registrationPaymentsFeeValue').textContent, h.w.formatRegistrationCurrency(0));
    await select('id:4');
    assert.equal(h.w.document.getElementById('registrationPaymentsFeeValue').textContent, h.w.formatRegistrationCurrency(2000));
    assert.match(h.w.document.getElementById('registrationPaymentsFeeMeta').textContent, /^2 /);
    assert.equal(h.w.document.getElementById('registrationPaymentsTotalValue').textContent, h.w.formatRegistrationCurrency(7000));
    await select('');
    assert.equal(h.w.document.getElementById('registrationPaymentsTotalValue').textContent, h.w.formatRegistrationCurrency(11000));
    assert.equal(h.messages.length, 0);
  } finally { h.close(); }
});

test('Competitions shows the same school fee rules, including SCH with only exempt categories and NON visibility', async () => {
  const h = harness({ flag: false });
  try {
    let rows = [
      { id: 1, school_id: 2, category_id: 1, status: 'VAL', members: [{ participant_id: 11 }, { participant_id: 12 }, { participant_id: 13 }] },
      { id: 2, school_id: 2, category_id: 1, status: 'VAL', members: [{ participant_id: 11 }] },
      { id: 3, school_id: 2, category_id: 2, status: 'VAL', members: [{ participant_id: 21 }] }
    ];
    h.w.fetchRegistrationCategories = async () => [{ id: 1, apply_fee: 1 }, { id: 2, apply_fee: 0 }];
    h.w.fetchRegistrationStyles = async () => [];
    h.w.fetch = async () => ({ ok: true, json: async () => rows });
    h.w.bootstrap.Tooltip = class { dispose() {} setContent() {} update() {} static getOrCreateInstance() { return new this(); } };
    vm.runInContext(read('js/registration-competitions.js'), h.dom.getInternalVMContext(), { filename: 'js/registration-competitions.js' });
    h.event.registrationFeeType = 'NON';
    h.w.initCompetitionsTab(); await tick();
    const feeValue = h.w.document.getElementById('registrationsFeeTotal');
    const feeType = h.w.document.getElementById('registrationsFeeType');
    const typeLabels = { PAR: 'Por Participante', REG: 'Por Inscripción', SCH: 'Por Escuela/Particular' };
    const feeSummary = feeValue.closest('.school-registrations-fee');
    for (const [type, expectedFee] of [['NON', 0], ['PAR', 3000], ['REG', 2000], ['SCH', 1000]]) {
      h.event.registrationFeeType = type;
      h.w.dispatchEvent(new h.w.Event('registration:config-updated')); await tick();
      assert.equal(feeValue.textContent, h.w.formatRegistrationCurrency(expectedFee));
      assert.equal(feeSummary.classList.contains('d-none'), type === 'NON');
      if (type !== 'NON') assert.equal(feeType.textContent, typeLabels[type]);
    }
    assert.equal(feeType.nextElementSibling, feeValue);
    h.w.localStorage.setItem('lang', 'en');
    h.w.document.documentElement.lang = 'en'; await tick();
    assert.equal(feeType.textContent, 'Per school/individual');
    rows = rows.filter(row => row.category_id === 2);
    h.w.document.getElementById('registrationModal').dispatchEvent(new h.w.Event('hidden.bs.modal')); await tick();
    assert.equal(feeValue.textContent, h.w.formatRegistrationCurrency(1000));
    rows = [];
    h.w.document.getElementById('registrationModal').dispatchEvent(new h.w.Event('hidden.bs.modal')); await tick();
    assert.equal(feeValue.textContent, h.w.formatRegistrationCurrency(0));
    assert.equal(h.w.document.getElementById('registrationsCount').textContent, '0');
    assert.equal(h.messages.length, 0);
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

test('school bookings load all pages with compact filters and show product names immediately after type', async () => {
  const rows = [
    { id: 501, item_type: 'WORKSHOP', workshop_ids: [11], attendee_id: 21, status: 'PENDING' },
    { id: 502, item_type: 'PACK', pack_id: 7, attendee_id: 22, status: 'VALIDATED' },
    { id: 503, item_type: 'SERVICE', service_id: 31, quantity: 3, status: 'VALIDATED' }
  ];
  const h = harness({ overrides: { 'GET /bookings': call => {
    const row = rows[Number(call.url.searchParams.get('page')) - 1];
    const matches = row && ['status', 'item_type'].every(key => !call.url.searchParams.get(key) || call.url.searchParams.get(key) === row[key]);
    return { data: { data: matches ? [row] : [], pagination: { total_pages: 3 } } };
  } } });
  try {
    await h.init(); await h.navigate('extras-my-bookings');
    const pane = h.w.document.querySelector('#extras-my-bookings');
    const form = pane.querySelector('[data-extras-filters]');
    assert.equal(form.classList.contains('lm-card'), false);
    assert.equal(form.querySelectorAll('select').length, 2);
    assert.equal(form.querySelector('[name="page_size"]'), null);
    assert.equal(pane.querySelector('.extras-pagination'), null);
    assert.equal(pane.querySelectorAll('tbody tr').length, 3);
    assert.equal(pane.querySelectorAll('thead th')[1].textContent, 'Nombre');
    assert.deepEqual(Array.from(pane.querySelectorAll('tbody tr'), row => row.children[1].textContent), ['Workshop <unsafe>', 'Fixed', 'Dinner']);
    assert.equal(pane.querySelector('unsafe'), null);
    await h.submit({ status: 'VALIDATED', item_type: 'SERVICE' }, '#extras-my-bookings [data-extras-filters]');
    assert.equal(pane.querySelectorAll('tbody tr').length, 1);
    assert.equal(pane.querySelector('tbody tr').children[1].textContent, 'Dinner');
    assert.equal(pane.querySelector('.extras-pagination'), null);
    const lastPage = h.calls.filter(call => call.path === '/bookings').at(-1);
    assert.equal(lastPage.url.searchParams.get('page'), '3');
    assert.equal(lastPage.url.searchParams.get('status'), 'VALIDATED');
    assert.equal(lastPage.url.searchParams.get('item_type'), 'SERVICE');
  } finally { h.close(); }
});

test('organizer bookings show resolved product names after type using the admin catalogs', async () => {
  const h = harness({ role: 'organizer' });
  h.data.bookings = [
    { id: 601, item_type: 'WORKSHOP', workshop_ids: [11], attendee_id: 21, status: 'PENDING' },
    { id: 602, item_type: 'PACK', pack_id: 7, attendee_id: 22, status: 'VALIDATED' },
    { id: 603, item_type: 'SERVICE', service_id: 31, quantity: 2, status: 'VALIDATED' }
  ];
  try {
    await h.init(); await h.navigate('extras-bookings');
    const pane = h.w.document.querySelector('#extras-bookings');
    assert.equal(pane.querySelectorAll('thead th')[2].textContent, 'Nombre');
    assert.deepEqual(Array.from(pane.querySelectorAll('tbody tr'), row => row.children[2].textContent), ['Workshop <unsafe>', 'Fixed', 'Dinner']);
    assert.equal(pane.querySelector('unsafe'), null);
    for (const resource of ['workshops', 'packs', 'services']) assert.ok(h.calls.some(call => call.path === `/admin/${resource}`));
    assert.equal(h.calls.some(call => call.path.startsWith('/catalog/')), false);
    assert.equal(pane.querySelector('.extras-pagination'), null);
  } finally { h.close(); }
});

test('organizer booking filters are account, type, status and load every matching page without pagination controls', async () => {
  const h = harness({ role: 'organizer', overrides: { 'GET /admin/bookings': call => ({ data: {
    data: [{ id: 700 + Number(call.url.searchParams.get('page')), item_type: 'SERVICE', service_name: 'Dinner', status: 'VALIDATED', quantity: 1 }],
    pagination: { total_pages: 3 }
  } }) } });
  try {
    await h.init(); await h.navigate('extras-bookings');
    const pane = h.w.document.querySelector('#extras-bookings');
    const form = pane.querySelector('[data-extras-filters]');
    assert.equal(form.classList.contains('lm-card'), false);
    assert.deepEqual(Array.from(form.querySelectorAll('select'), field => field.name), ['registration_school_id', 'item_type', 'status']);
    assert.equal(form.querySelector('[name="page_size"]'), null);
    assert.equal(pane.querySelector('.extras-pagination'), null);
    assert.equal(pane.querySelectorAll('tbody tr').length, 3);
    await h.submit({ registration_school_id: '4', item_type: 'SERVICE', status: 'VALIDATED' }, '#extras-bookings [data-extras-filters]');
    const calls = h.calls.filter(call => call.path === '/admin/bookings').slice(-3);
    assert.deepEqual(calls.map(call => call.url.searchParams.get('page')), ['1', '2', '3']);
    for (const call of calls) {
      assert.equal(call.url.searchParams.get('registration_school_id'), '4');
      assert.equal(call.url.searchParams.get('item_type'), 'SERVICE');
      assert.equal(call.url.searchParams.get('status'), 'VALIDATED');
    }
    assert.equal(pane.querySelectorAll('tbody tr').length, 3);
    await h.click('#extras-bookings [data-extras-action="clear-filters"]');
    assert.ok(Array.from(pane.querySelectorAll('select')).every(field => field.value === ''));
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

test('organizer packs label available workshops and collapse only the complete event workshop set', async () => {
  const h = harness({ role: 'organizer' });
  h.data.packs[1].workshop_ids = [11];
  h.data.packs[1].workshops = [h.data.workshops[0]];
  try {
    await h.init(); await h.navigate('extras-packs');
    const pane = h.w.document.querySelector('#extras-packs');
    const cells = () => Array.from(pane.querySelectorAll('tbody tr'), row => row.children[3]);
    assert.equal(pane.querySelectorAll('thead th')[3].textContent, 'Workshops disponibles');
    assert.equal(cells()[0].textContent, 'TODOS LOS WORKSHOPS');
    assert.equal(cells()[0].querySelectorAll('.lm-status').length, 1);
    assert.equal(cells()[1].textContent, 'Workshop <unsafe>');
    assert.equal(cells()[1].querySelector('unsafe'), null);
    h.data.workshops = [...h.data.workshops, { id: 15, name: 'New workshop' }];
    await h.click('#extras-packs [data-extras-action="refresh"]');
    assert.doesNotMatch(cells()[0].textContent, /TODOS LOS WORKSHOPS/);
    assert.equal(cells()[0].querySelectorAll('.lm-status').length, 2);
  } finally { h.close(); }
});

test('organizer pack creation validates FIXED/FLEX and edits composition with PUT', async () => {
  const h = harness({ role: 'organizer' });
  try {
    await h.init(); await h.navigate('extras-packs');
    await h.click('#extras-packs [data-extras-action="create"]');
    await h.submit({ name: 'New pack', workshop_count: '1' });
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

function attendanceHarness(options = {}) {
  const h = harness({ role: 'organizer', ...options });
  const packBooking = { booking_id: 51, attendee: { id: 21, name: 'Ana García' }, account: { id: 4, name: 'Escuela Norte', user_type: 'SCH' }, quantity: 1, item_type: 'PACK', pack: { id: 7, name: 'Pack completo' } };
  const direct = { booking_id: 54, attendee: { id: 22, name: 'Grace Hopper' }, account: { id: 5, name: 'Alex', user_type: 'PAR' }, quantity: 1, item_type: 'WORKSHOP', pack: null };
  const service = { booking_id: 52, attendee: null, account: { id: 5, name: 'María López', user_type: 'PAR' }, quantity: 3, item_type: 'SERVICE', pack: null };
  h.validatedSummary = {
    event_id: 42,
    workshops: [
      { id: 11, name: 'Técnica <unsafe>', is_active: 1, teacher: 'Teacher', start_at: '2026-12-01T10:00:00.000Z', end_at: '2026-12-01T11:00:00.000Z', capacity: 30, validated_count: 2, total_quantity: 2, bookings: [packBooking, direct] },
      { id: 13, name: 'Inactive', is_active: 0, teacher: 'Teacher 2', start_at: null, end_at: null, capacity: 10, validated_count: 0, total_quantity: 0, bookings: [] },
      { id: 14, name: null, is_active: 1, teacher: null, start_at: null, end_at: null, capacity: 10, validated_count: 1, total_quantity: 1, bookings: [{ ...direct, booking_id: 55, attendee: { id: 99, name: null }, account: { id: 6, name: null, user_type: 'SCH' } }] }
    ],
    packs: [{ id: 7, name: 'Pack completo', is_active: 1, mode: 'FIXED', workshop_count: 2, validated_count: 1, total_quantity: 1, bookings: [packBooking] }, { id: 8, name: 'Pack flexible', is_active: 0, mode: 'FLEX', workshop_count: 1, validated_count: 0, total_quantity: 0, bookings: [] }],
    services: [{ id: 31, name: 'Comida', is_active: 1, validated_count: 2, total_quantity: 5, bookings: [service, { ...service, booking_id: 56, quantity: 2 }] }]
  };
  return h;
}

test('validated extras summary loads once with the current event policy for organizer and admin', async () => {
  for (const role of ['organizer', 'admin']) {
    const h = attendanceHarness({ role });
    try {
      await h.init();
      assert.ok(h.w.getVisibleRegistrationNavItems().some(item => item.key === 'extras-summary'));
      assert.equal(h.calls.filter(call => call.path === '/admin/summary').length, 0);
      await h.navigate('extras-summary');
      const calls = h.calls.filter(call => call.path === '/admin/summary');
      assert.equal(calls.length, 1);
      assert.equal(calls[0].method, 'GET');
      assert.equal(calls[0].url.search, '');
      assert.equal(calls[0].headers.authorization, 'Bearer test-token');
      assert.equal(calls[0].headers['x-event-id'], role === 'admin' ? '42' : undefined);
      const pane = h.w.document.querySelector('#extras-summary');
      assert.equal(pane.querySelector('[data-summary-kind="workshops"]').getAttribute('aria-pressed'), 'true');
      assert.equal(pane.querySelectorAll('[data-summary-product]').length, 3);
      assert.match(pane.textContent, /Capacidad: 30/);
      assert.match(pane.textContent, /Reservas validadas: 2/);
      assert.match(pane.textContent, /Teacher/);
      assert.match(pane.textContent, /2026/);
      assert.match(pane.textContent, /Inactiv/);
      assert.doesNotMatch(pane.textContent, /\bID\b|#51|#54|#55|Evento: 42/);
      assert.equal(pane.querySelector('[data-summary-booking="51"]').textContent.trim(), 'Ver reserva');
      assert.match(pane.textContent, /Sin nombre/);
      assert.equal(pane.querySelector('unsafe'), null);
      assert.match(pane.textContent, /Técnica <unsafe>/);
      assert.equal(pane.querySelectorAll('[data-summary-booking="51"]').length, 1);
      await h.click('[data-summary-kind="packs"]');
      assert.match(pane.textContent, /FIXED/);
      assert.match(pane.textContent, /FLEX/);
      assert.match(pane.textContent, /Número de workshops: 2/);
      assert.equal(h.calls.filter(call => call.path === '/admin/summary').length, 1);
    } finally { h.close(); }
  }
});

test('validated extras summary hides navigation and never loads for schools or disabled events', async () => {
  for (const options of [{ role: 'school' }, { role: 'organizer', flag: false }, { role: 'admin', flag: false }]) {
    const h = attendanceHarness(options);
    try {
      await h.init(); await h.navigate('extras-summary');
      assert.equal(h.w.getVisibleRegistrationNavItems().some(item => item.key === 'extras-summary'), false);
      assert.equal(h.calls.some(call => call.path === '/admin/summary'), false);
      assert.equal(h.w.document.querySelector('#extras-summary').textContent, '');
    } finally { h.close(); }
  }
});

test('validated extras summary searches people and packs locally and expands or collapses visible products', async () => {
  const h = attendanceHarness();
  try {
    await h.init(); await h.navigate('extras-summary');
    const pane = h.w.document.querySelector('#extras-summary');
    await h.click('[data-summary-expand="true"]');
    assert.ok([...pane.querySelectorAll('[data-summary-product]')].every(details => details.open));
    await h.click('[data-summary-expand="false"]');
    assert.ok([...pane.querySelectorAll('[data-summary-product]')].every(details => !details.open));
    const search = pane.querySelector('[data-summary-search]');
    search.value = 'grace'; search.dispatchEvent(new h.w.Event('input', { bubbles: true }));
    assert.equal(pane.querySelectorAll('[data-summary-product]').length, 1);
    assert.equal(pane.querySelectorAll('.extras-summary-booking').length, 1);
    assert.match(pane.querySelector('.extras-summary-bookings').textContent, /Grace Hopper/);
    assert.equal(pane.querySelector('[data-summary-product]').open, true);
    search.value = 'pack completo'; search.dispatchEvent(new h.w.Event('input', { bubbles: true }));
    assert.equal(pane.querySelectorAll('[data-summary-booking="51"]').length, 1);
    search.value = 'tecnica'; search.dispatchEvent(new h.w.Event('input', { bubbles: true }));
    assert.equal(pane.querySelectorAll('.extras-summary-booking').length, 2);
    search.value = ''; search.dispatchEvent(new h.w.Event('input', { bubbles: true }));
    await h.click('[data-summary-booked]');
    assert.equal(pane.querySelectorAll('[data-summary-product]').length, 2);
    assert.equal(h.calls.filter(call => call.path === '/admin/summary').length, 1);
  } finally { h.close(); }
});

test('validated extras summary preserves service rows and quantities and falls back to the buying account', async () => {
  const h = attendanceHarness();
  try {
    await h.init(); await h.navigate('extras-summary');
    await h.click('[data-summary-kind="services"]');
    const pane = h.w.document.querySelector('#extras-summary');
    assert.equal(pane.querySelectorAll('.extras-summary-booking').length, 2);
    assert.match(pane.querySelector('summary').textContent, /Cantidad: 5/);
    assert.match(pane.querySelector('summary').textContent, /Reservas validadas: 2/);
    assert.equal(pane.querySelectorAll('[data-summary-booking="52"]').length, 1);
    assert.equal(pane.querySelectorAll('[data-summary-booking="56"]').length, 1);
    assert.match(pane.querySelector('.extras-summary-booking').textContent, /María López/);
    assert.match(pane.querySelector('.extras-summary-booking').textContent, /Sin participante asignado/);
    assert.match(pane.querySelector('.extras-summary-booking').textContent, /Particular/);
  } finally { h.close(); }
});

test('validated extras summary booking IDs open the existing administrative booking detail', async () => {
  const h = attendanceHarness();
  try {
    await h.init(); await h.navigate('extras-summary');
    await h.click('[data-summary-expand="true"]');
    await h.click('[data-summary-booking="51"]');
    assert.ok(h.calls.some(call => call.path === '/admin/bookings/51'));
    assert.equal(h.w.document.querySelector('#registrationExtrasModal').classList.contains('show'), true);
    assert.match(h.w.document.querySelector('#registrationExtrasModal').textContent, /Ada Lovelace/);
  } finally { h.close(); }
});

test('validated extras summary handles load failures, empty collections and mismatched event responses', async () => {
  const h = attendanceHarness({ overrides: { 'GET /admin/summary': () => ({ status: 500, data: { error: 'Summary unavailable' } }) } });
  try {
    await h.init(); await h.navigate('extras-summary');
    const pane = h.w.document.querySelector('#extras-summary');
    assert.match(pane.textContent, /Summary unavailable/);
    delete h.overrides['GET /admin/summary'];
    h.validatedSummary = { event_id: 99, workshops: [], packs: [], services: [] };
    await h.click('#extras-summary .extras-heading [data-extras-action="refresh"]');
    assert.equal(pane.querySelectorAll('[data-summary-product]').length, 0);
    assert.match(pane.textContent, new RegExp(languages.es.extras_invalid_response));
    h.validatedSummary.event_id = 42;
    await h.click('#extras-summary .extras-heading [data-extras-action="refresh"]');
    assert.match(pane.textContent, new RegExp(languages.es.extras_empty));
    assert.equal(pane.querySelector('[data-summary-count="workshops"]').textContent, '0');
  } finally { h.close(); }
});

test('validated extras summary translates labels without fetching or losing the selected collection', async () => {
  const h = attendanceHarness();
  try {
    await h.init(); await h.navigate('extras-summary');
    await h.click('[data-summary-kind="services"]');
    h.w.localStorage.setItem('lang', 'en');
    h.w.document.documentElement.lang = 'en'; await tick();
    const pane = h.w.document.querySelector('#extras-summary');
    assert.match(pane.textContent, /Extras overview/);
    assert.equal(pane.querySelector('[data-summary-kind="services"]').getAttribute('aria-pressed'), 'true');
    assert.match(pane.textContent, /No participant assigned/);
    assert.equal(h.calls.filter(call => call.path === '/admin/summary').length, 1);
  } finally { h.close(); }
});

test('validated extras summary discards responses after switching events', async () => {
  let finish;
  const h = attendanceHarness({ overrides: { 'GET /admin/summary': () => new Promise(resolve => { finish = resolve; }) } });
  try {
    await h.init(); await h.navigate('extras-summary');
    assert.equal(typeof finish, 'function');
    h.event = { ...h.event, id: 99 };
    h.w.RegistrationExtras.init('organizer');
    finish({ data: h.validatedSummary }); await tick();
    assert.equal(h.w.document.querySelector('#extras-summary').textContent, '');
  } finally { h.close(); }
});

function fillBulkRange(h, index, inicio, fin, precio = '25.50') {
  const row = h.w.document.querySelectorAll('[data-bulk-price-range]')[index];
  for (const [key, value] of Object.entries({ inicio, fin, precio })) row.querySelector(`[data-range-field="${key}"]`).value = value;
}

test('bulk workshop prices add multiple ranges with the exact contract and refresh all tariffs', async () => {
  const h = harness({ role: 'organizer' });
  h.data.workshops[1].is_active = false;
  try {
    await h.init(); await h.navigate('extras-workshops');
    const actions = h.w.document.querySelector('#extras-workshops .extras-heading .extras-actions');
    assert.equal(actions.children[0].dataset.extrasAction, 'create');
    assert.equal(actions.children[1].dataset.extrasAction, 'bulk-prices');
    assert.equal(actions.children[1].textContent, 'Precios');
    await h.click('#extras-workshops [data-extras-action="bulk-prices"]');
    fillBulkRange(h, 0, '2026-11-01', '2026-11-30');
    await h.click('[data-bulk-price-action="add"]');
    fillBulkRange(h, 1, '2026-12-01', '2026-12-31', '30');
    await h.submit();
    assert.deepEqual(h.lastMutation().body, { event_id: 42, ranges: [
      { inicio: '2026-11-01', fin: '2026-11-30', precio: '25.50' },
      { inicio: '2026-12-01', fin: '2026-12-31', precio: '30' }
    ] });
    assert.equal(h.lastMutation().path, '/admin/workshops/prices');
    assert.equal(h.prices['workshops/13'].length, 2);
    assert.equal(h.w.document.querySelector('#registrationExtrasModal').classList.contains('show'), false);
    assert.match(h.w.document.querySelector('#extras-workshops tbody').textContent, /25,50/);
    assert.ok(h.calls.filter(call => call.method === 'GET' && call.path === '/admin/workshops/13/prices').length >= 4);
  } finally { h.close(); }
});

test('bulk workshop prices reject inclusive overlap between entered ranges before posting', async () => {
  const h = harness({ role: 'organizer' });
  try {
    await h.init(); await h.navigate('extras-workshops');
    await h.click('#extras-workshops [data-extras-action="bulk-prices"]');
    fillBulkRange(h, 0, '2026-11-01', '2026-11-30');
    await h.click('[data-bulk-price-action="add"]');
    fillBulkRange(h, 1, '2026-11-30', '2026-12-10');
    await h.submit();
    assert.equal(h.lastMutation(), undefined);
    assert.match(h.w.document.querySelector('[data-extras-dialog-feedback]').textContent, /solapan/);
    await h.click('[data-bulk-price-range]:last-child [data-bulk-price-action="remove"]');
    assert.equal(h.w.document.querySelectorAll('[data-bulk-price-range]').length, 1);
    assert.equal(h.w.document.querySelector('[data-bulk-price-action="remove"]').disabled, true);
  } finally { h.close(); }
});

test('bulk workshop prices recheck inactive and newly created workshops immediately before sending', async () => {
  const h = harness({ role: 'organizer' });
  try {
    await h.init(); await h.navigate('extras-workshops');
    await h.click('#extras-workshops [data-extras-action="bulk-prices"]');
    h.data.workshops.push({ ...h.data.workshops[0], id: 99, name: 'New inactive workshop', is_active: false });
    h.prices['workshops/99'] = [{ start_date: '2026-11-30', end_date: '2026-12-10', price: 10 }];
    fillBulkRange(h, 0, '2026-11-01', '2026-11-30');
    await h.submit();
    assert.equal(h.lastMutation(), undefined);
    assert.match(h.w.document.querySelector('[data-extras-dialog-feedback]').textContent, /New inactive workshop/);
    assert.equal(h.w.document.querySelector('[data-range-field="inicio"]').value, '2026-11-01');
    assert.equal(h.w.document.querySelector('#registrationExtrasModal [type="submit"]').disabled, false);
  } finally { h.close(); }
});

test('bulk workshop prices block writes on tariff load failure and recover with refresh', async () => {
  const h = harness({ role: 'organizer', overrides: { 'GET /admin/workshops/13/prices': () => ({ status: 500, data: { error: 'Cannot check prices' } }) } });
  try {
    await h.init(); await h.navigate('extras-workshops');
    await h.click('#extras-workshops [data-extras-action="bulk-prices"]');
    assert.equal(h.w.document.querySelector('#registrationExtrasModal [type="submit"]').disabled, true);
    assert.equal(h.w.document.querySelector('[data-bulk-price-fields]').disabled, true);
    assert.match(h.w.document.querySelector('[data-bulk-existing]').textContent, /Cannot check prices/);
    delete h.overrides['GET /admin/workshops/13/prices'];
    await h.click('[data-bulk-price-action="refresh"]');
    assert.equal(h.w.document.querySelector('#registrationExtrasModal [type="submit"]').disabled, false);
    fillBulkRange(h, 0, '2026-11-01', '2026-11-30');
    h.overrides['GET /admin/workshops/13/prices'] = () => ({ status: 500, data: { error: 'Check failed at save' } });
    await h.submit();
    assert.equal(h.lastMutation(), undefined);
    assert.equal(h.w.document.querySelector('#registrationExtrasModal [type="submit"]').disabled, true);
    assert.equal(h.w.document.querySelector('[data-bulk-price-action="refresh"]').disabled, false);
    delete h.overrides['GET /admin/workshops/13/prices'];
    await h.click('[data-bulk-price-action="refresh"]');
    assert.equal(h.w.document.querySelector('[data-range-field="inicio"]').value, '2026-11-01');
    assert.equal(h.w.document.querySelector('#registrationExtrasModal [type="submit"]').disabled, false);
  } finally { h.close(); }
});

test('bulk workshop price conflicts preserve inputs and refresh existing prices without retrying the POST', async () => {
  const h = harness({ role: 'organizer', overrides: { 'POST /admin/workshops/prices': (call, h) => {
    h.prices['workshops/11'] = [{ start_date: '2026-11-01', end_date: '2026-11-30', price: 15 }];
    return { status: 409, data: { code: 'extras_price_overlapping_range', error: 'Concurrent overlap' } };
  } } });
  try {
    await h.init(); await h.navigate('extras-workshops');
    await h.click('#extras-workshops [data-extras-action="bulk-prices"]');
    fillBulkRange(h, 0, '2026-11-01', '2026-11-30');
    await h.submit();
    assert.match(h.w.document.querySelector('[data-extras-dialog-feedback]').textContent, /Concurrent overlap/);
    assert.match(h.w.document.querySelector('[data-bulk-existing]').textContent, /15,00/);
    assert.equal(h.w.document.querySelector('[data-range-field="inicio"]').value, '2026-11-01');
    await h.submit();
    assert.equal(h.calls.filter(call => call.method === 'POST').length, 1);
  } finally { h.close(); }
});

test('bulk workshop prices validate dates, amounts and the registration period before posting', async () => {
  const h = harness({ role: 'organizer' });
  try {
    await h.init(); await h.navigate('extras-workshops');
    await h.click('#extras-workshops [data-extras-action="bulk-prices"]');
    for (const [inicio, fin, precio] of [['2026-11-30', '2026-11-01', '25'], ['2026-09-01', '2026-11-01', '25'], ['2026-11-01', '2026-11-30', '0'], ['2026-11-01', '2026-11-30', '25.555']]) {
      fillBulkRange(h, 0, inicio, fin, precio);
      await h.submit();
      assert.equal(h.lastMutation(), undefined);
    }
  } finally { h.close(); }
  const missing = harness({ role: 'organizer' });
  missing.event.registrationEnd = null;
  try {
    await missing.init(); await missing.navigate('extras-workshops');
    await missing.click('#extras-workshops [data-extras-action="bulk-prices"]');
    assert.equal(missing.w.document.querySelector('#registrationExtrasModal [type="submit"]').disabled, true);
  } finally { missing.close(); }
});

test('bulk workshop prices prevent duplicate submits while saving and close only after success', async () => {
  let resolvePost;
  const h = harness({ role: 'organizer', overrides: { 'POST /admin/workshops/prices': () => new Promise(resolve => { resolvePost = resolve; }) } });
  try {
    await h.init(); await h.navigate('extras-workshops');
    await h.click('#extras-workshops [data-extras-action="bulk-prices"]');
    fillBulkRange(h, 0, '2026-11-01', '2026-11-30');
    await h.submit();
    assert.equal(typeof resolvePost, 'function');
    assert.equal(h.w.document.querySelector('[data-bulk-price-fields]').disabled, true);
    assert.equal(h.w.document.querySelector('#registrationExtrasModal [data-bs-dismiss]').disabled, true);
    await h.submit();
    assert.equal(h.calls.filter(call => call.method === 'POST').length, 1);
    resolvePost({ status: 201, data: { event_id: 42, workshops_count: 2, prices_count: 2, prices: [] } });
    await tick();
    assert.equal(h.w.document.querySelector('#registrationExtrasModal').classList.contains('show'), false);
  } finally { h.close(); }
});

test('bulk workshop prices support an empty event and are absent for school', async () => {
  const h = harness({ role: 'organizer' });
  h.data.workshops = [];
  try {
    await h.init(); await h.navigate('extras-workshops');
    await h.click('#extras-workshops [data-extras-action="bulk-prices"]');
    fillBulkRange(h, 0, '2026-11-01', '2026-11-30');
    await h.submit();
    assert.equal(h.lastMutation().path, '/admin/workshops/prices');
    assert.equal(h.w.document.querySelector('#registrationExtrasModal').classList.contains('show'), false);
  } finally { h.close(); }
  const school = harness();
  try {
    await school.init(); await school.navigate('extras-workshops');
    assert.equal(school.w.document.querySelector('[data-extras-action="bulk-prices"]'), null);
  } finally { school.close(); }
});

test('organizer workshop table separates day and times without a redundant details action', async () => {
  const h = harness({ role: 'organizer' });
  try {
    await h.init(); await h.navigate('extras-workshops');
    const pane = h.w.document.querySelector('#extras-workshops');
    const headers = Array.from(pane.querySelectorAll('thead th'), th => th.textContent);
    assert.deepEqual(headers.slice(2, 4), ['Día', 'Horario']);
    const cells = pane.querySelector('tbody tr').children;
    assert.match(cells[2].textContent, /2026/);
    assert.doesNotMatch(cells[2].textContent, /10:00/);
    assert.equal(cells[3].textContent, '10:00 – 11:00');
    assert.equal(pane.querySelector('[data-extras-action="details"]'), null);
    assert.equal(h.w.document.querySelector('#registrationExtrasModal'), null);
    assert.equal(pane.querySelector('tbody tr').querySelectorAll('[role="progressbar"]').length, 0);
    assert.equal(headers.includes('Capacidad'), false);
    assert.equal(headers.includes('Precios'), true);
    assert.deepEqual(Array.from(cells[4].querySelectorAll('.lm-status'), badge => badge.textContent), ['Capacidad: 1', 'Validadas: 1', 'Pendientes: 3', 'Disponibles: 0']);
    assert.equal(pane.querySelector('tbody tr .extras-actions').children.length, 4);
  } finally { h.close(); }
});

for (const [resource, productId, priceColumn] of [['workshops', 11, 5], ['packs', 7, 4], ['services', 31, 2]]) {
test(`organizer ${resource} price column sorts ranges and marks the current price`, async () => {
  const h = harness({ role: 'organizer' });
  h.prices[`${resource}/${productId}`] = [
    { start_date: '2027-01-01', end_date: '2027-01-31', price: '30.00', is_current: false },
    { start_date: '2026-10-01', end_date: '2026-12-31', price: '20.50', is_current: true }
  ];
  try {
    await h.init(); await h.navigate(`extras-${resource}`);
    const cell = h.w.document.querySelector(`#extras-${resource} tbody tr`).children[priceColumn];
    const ranges = cell.querySelectorAll('.registration-category-price-range');
    assert.equal(ranges.length, 2);
    assert.match(ranges[0].textContent, /2026/);
    assert.match(ranges[0].textContent, /20,50/);
    assert.equal(ranges[0].getAttribute('aria-current'), 'true');
    assert.equal(ranges[1].hasAttribute('aria-current'), false);
    assert.match(ranges[1].textContent, /30,00/);
    assert.ok(h.calls.some(call => call.path === `/admin/${resource}/${productId}/prices`));
  } finally { h.close(); }
});
}

test('workshop price loading errors retain the workshop list and refresh can recover', async () => {
  const h = harness({ role: 'organizer', overrides: { 'GET /admin/workshops/11/prices': () => ({ status: 500, data: { error: 'Prices unavailable' } }) } });
  try {
    await h.init(); await h.navigate('extras-workshops');
    const pane = h.w.document.querySelector('#extras-workshops');
    assert.equal(pane.querySelectorAll('tbody tr').length, 2);
    assert.match(pane.querySelector('tbody tr').children[5].textContent, /Prices unavailable/);
    delete h.overrides['GET /admin/workshops/11/prices'];
    await h.click('#extras-workshops [data-extras-action="refresh"]');
    assert.match(pane.querySelector('tbody tr').children[5].textContent, /No hay precios configurados/);
  } finally { h.close(); }
});

test('organizer workshop editor offers five-minute choices and sends both times on the selected day', async () => {
  const h = harness({ role: 'organizer' });
  try {
    await h.init(); await h.navigate('extras-workshops');
    await h.click('#extras-workshops [data-extras-action="create"]');
    const form = h.w.document.querySelector('#registrationExtrasModal form');
    assert.equal(form.querySelectorAll('[type="date"]').length, 1);
    assert.equal(form.querySelector('[type="datetime-local"]'), null);
    assert.deepEqual(Array.from(form.elements.namedItem('start_minute').options, option => option.value), ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']);
    assert.equal(form.elements.namedItem('start_hour').options.length, 25);
    await h.submit({ name: 'New session', teacher: 'Teacher', capacity: '12', day: '2026-11-24', start_hour: '12', start_minute: '15', end_hour: '11', end_minute: '30' });
    assert.equal(h.lastMutation(), undefined);
    assert.match(form.querySelector('[data-extras-dialog-feedback]')?.textContent || h.w.document.querySelector('[data-extras-dialog-feedback]').textContent, /fecha|fin|inicio/i);
    await h.submit({ end_hour: '13', end_minute: '35' });
    assert.equal(h.lastMutation().body.start_at, '2026-11-24T12:15');
    assert.equal(h.lastMutation().body.end_at, '2026-11-24T13:35');
    assert.equal(h.lastMutation().body.day, undefined);
    assert.equal(h.lastMutation().body.start_hour, undefined);
    await h.click('#extras-workshops [data-extras-action="edit"][data-id="11"]');
    await h.submit({ day: '2026-11-25', start_minute: '05', end_minute: '55' });
    assert.deepEqual(h.lastMutation().body, { start_at: '2026-11-25T10:05', end_at: '2026-11-25T11:55' });
  } finally { h.close(); }
});

for (const resource of ['workshops', 'services', 'discount-codes']) {
  test(`organizer ${resource}: create, details, edit, toggle and delete use the CRUD contract`, async () => {
    const pane = { workshops: 'extras-workshops', services: 'extras-services', 'discount-codes': 'extras-discounts' }[resource];
    const h = harness({ role: 'organizer' });
    const item = h.data[resource][0];
    try {
      await h.init(); await h.navigate(pane);
      await h.click(`#${pane} [data-extras-action="create"]`);
      const values = resource === 'discount-codes' ? { code: 'TEST', amount: '5', audience: 'SCH' } : { name: 'New item' };
      if (resource === 'workshops') Object.assign(values, { teacher: 'Teacher', day: '2026-10-16', start_hour: '10', start_minute: '00', end_hour: '11', end_minute: '00', capacity: '15' });
      await h.submit(values);
      assert.equal(h.lastMutation().path, `/admin/${resource}`);
      assert.equal(h.lastMutation().method, 'POST');
      assert.equal(h.lastMutation().body.event_id, undefined);
      if (resource !== 'discount-codes') {
        assert.equal(h.w.document.querySelector('#registrationExtrasModal [name="price"]'), null);
        assert.equal(Object.hasOwn(h.lastMutation().body, 'price'), false);
      }
      if (resource === 'discount-codes') {
        await h.click(`#${pane} [data-extras-action="details"][data-id="${item.id}"]`);
        assert.ok(h.calls.some(call => call.path === `/admin/${resource}/${item.id}`));
        if (resource === 'discount-codes') {
          assert.ok(h.calls.some(call => call.path.endsWith('/usage')));
          assert.match(h.w.document.querySelector('#registrationExtrasModal').textContent, /Sin límite/);
        }
        await h.click('#registrationExtrasModal [data-bs-dismiss]');
      }
      await h.click(`#${pane} [data-extras-action="edit"][data-id="${item.id}"]`);
      await h.submit(resource === 'discount-codes' ? { amount: '7.25' } : { name: 'Updated item' });
      assert.equal(h.lastMutation().method, 'PATCH');
      assert.deepEqual(h.lastMutation().body, resource === 'discount-codes' ? { amount: 7.25 } : { name: 'Updated item' });
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

test('FLEX administrative composition requires at least the configured count; product edits omit prices', async () => {
  const h = harness({ role: 'organizer' });
  try {
    await h.init(); await h.navigate('extras-packs');
    await h.click('#extras-packs [data-extras-action="create"]');
    await h.submit({ name: 'Flexible', mode: 'FLEX', workshop_count: '2' });
    h.w.document.querySelector('#registrationExtrasModal [name="workshop_ids"][value="11"]').checked = true;
    await h.submit(); assert.equal(h.lastMutation(), undefined);
    h.w.document.querySelector('#registrationExtrasModal [name="workshop_ids"][value="13"]').checked = true;
    await h.submit(); assert.equal(h.lastMutation().body.workshop_ids.length, 2);
    await h.click('#extras-packs [data-extras-action="edit"][data-id="7"]');
    await h.submit({ name: 'Updated pack' });
    assert.deepEqual(h.lastMutation().body, { name: 'Updated pack' });
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

test('Payments and dashboard split every active status, exclude DEL, and preserve the extras base', async () => {
  for (const role of ['school', 'organizer']) {
    for (const extras of [false, true]) {
      const h = harness({ role, flag: extras });
      try {
        await h.init();
        h.event.registrationFeeType = 'NON';
        const state = h.w.eval('registrationState');
        const rows = ['VAL', 'CRE', 'PEN', 'REJ', 'DEL'].map((status, index) => ({
          id: index + 1, school_id: 4, status, total_amount: (index + 1) * 1000,
          members: [{ participant_id: index + 1 }]
        }));
        state.registrations = rows;
        state.organizerRegistrations = rows;
        h.w.initPaymentsTab(role); await tick();
        const apiBase = role === 'organizer' ? 25000 : 12500;
        const apiRegistrations = role === 'organizer' ? 20000 : 10000;
        const expectedTotal = extras ? apiBase + 9000 : 10000;
        assert.equal(h.w.document.getElementById('registrationPaymentsTotalValue').textContent, h.w.formatRegistrationCurrency(expectedTotal));
        assert.equal(h.w.document.getElementById('registrationPaymentsAmountValue').textContent, h.w.formatRegistrationCurrency(extras ? apiRegistrations + 9000 : 10000));
        const breakdown = h.w.document.getElementById('registrationPaymentsAmountBreakdown');
        assert.match(breakdown.querySelectorAll('dt')[0].textContent, /\(1\)/);
        assert.match(breakdown.querySelectorAll('dt')[1].textContent, /\(3\)/);
        assert.equal(breakdown.querySelectorAll('dd')[1].textContent, h.w.formatRegistrationCurrency(9000));
        const finance = h.w.buildRegistrationDashboardFinanceMetrics(rows, new h.w.Map());
        assert.equal(finance.totalAmount, expectedTotal);
        const target = role === 'organizer' ? 'organizerDashboardTotalBreakdown' : 'schoolDashboardTotalBreakdown';
        h.w.renderRegistrationFinanceBreakdown(target, finance);
        assert.equal(h.w.document.getElementById(target).querySelectorAll('dd')[0].textContent, h.w.formatRegistrationCurrency(extras ? apiBase : 1000));
        assert.equal(h.w.document.getElementById(target).querySelectorAll('dd')[1].textContent, h.w.formatRegistrationCurrency(9000));
      } finally { h.close(); }
    }
  }
});

test('Payments fee split only charges the increment for shared participants or schools and excludes DEL', async () => {
  const h = harness({ role: 'organizer', flag: false });
  try {
    const state = h.w.eval('registrationState');
    state.registrationCategories = [{ id: 1, apply_fee: 1 }];
    state.organizerRegistrations = [
      { id: 1, school_id: 4, category_id: 1, status: 'VAL', members: [{ participant_id: 11 }] },
      { id: 2, school_id: 4, category_id: 1, status: 'CRE', members: [{ participant_id: 11 }, { participant_id: 12 }] },
      { id: 3, school_id: 5, category_id: 1, status: 'REJ', members: [{ participant_id: 13 }] },
      { id: 4, school_id: 6, category_id: 1, status: 'DEL', members: [{ participant_id: 14 }] }
    ];
    h.w.initPaymentsTab('organizer'); await tick();
    for (const [type, unvalidatedUnits] of [['PAR', 2], ['REG', 2], ['SCH', 1]]) {
      h.event.registrationFeeType = type;
      h.w.dispatchEvent(new h.w.Event('registration:config-updated')); await tick();
      const breakdown = h.w.document.getElementById('registrationPaymentsFeeBreakdown');
      assert.equal(breakdown.querySelectorAll('dd')[0].textContent, h.w.formatRegistrationCurrency(1000));
      assert.equal(breakdown.querySelectorAll('dd')[1].textContent, h.w.formatRegistrationCurrency(unvalidatedUnits * 1000));
      assert.match(breakdown.querySelectorAll('dt')[0].textContent, /\(1\)/);
      assert.ok(breakdown.querySelectorAll('dt')[1].textContent.endsWith(`(${unvalidatedUnits})`));
    }
  } finally { h.close(); }
});
