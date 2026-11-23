// Functional DOM/API tests only; no browser rendering, previews or screenshots.
// Uses the same external jsdom 26 dependency as the other Registration DOM tests.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const translations = Object.fromEntries(['es', 'en', 'fr', 'it', 'pt'].map(lang => [lang, JSON.parse(read(`lang/registration.${lang}.json`))]));
const tick = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };

function harness(role = 'organizer') {
  const dom = new JSDOM(read('registration.html'), { url: 'http://localhost/registration.html?eventId=demo', runScripts: 'outside-only' });
  const w = dom.window;
  const h = { dom, w, role, calls: [], overrides: {}, event: { id: 58 }, confirm: true };
  h.categories = [{ id: 8, name: 'Junior' }, { id: 9, name: 'Adult <img src=x onerror=alert(1)>' }];
  h.styles = [{ id: 12, name: 'Contemporary' }, { id: 13, name: '<img src=x onerror=alert(1)>' }, { id: 14, name: 'Hip hop' }];
  h.supplements = [{ id: 1, event_id: 58, category_id: 8, style_id: 12, price: 500 }];
  w.Headers = Headers;
  w.fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    const call = { path: parsed.pathname, query: parsed.search, method: options.method || 'GET', headers: Object.fromEntries(new Headers(options.headers)), body: options.body ? JSON.parse(options.body) : undefined };
    h.calls.push(call);
    const override = h.overrides[`${call.method} ${call.path}`];
    let result = override ? await override(call) : null;
    if (!result) {
      const itemId = Number(call.path.split('/').at(-1));
      if (call.method === 'GET') {
        const data = call.path.endsWith('/styles') ? h.styles : call.path.endsWith('/categories') ? h.categories
          : Number.isSafeInteger(itemId) && itemId > 0 ? h.supplements.find(item => item.id === itemId) : h.supplements;
        result = { data };
      }
      else if (call.method === 'POST') {
        const item = { id: Math.max(98, ...h.supplements.map(item => item.id)) + 1, ...call.body };
        h.supplements.push(item);
        result = { status: 201, data: item.id }; // The creation response is a number.
      } else if (call.method === 'PUT') {
        Object.assign(h.supplements.find(item => item.id === itemId), call.body);
        result = { data: { message: 'Updated' } };
      } else if (call.method === 'DELETE') {
        h.supplements = h.supplements.filter(item => item.id !== itemId);
        result = { data: { message: 'Deleted' } };
      } else throw new Error(`Unexpected method ${call.method}`);
    }
    return new Response(JSON.stringify(result.data), { status: result.status || 200 });
  };
  w.localStorage.setItem('token', 'test-token');
  w.localStorage.setItem('lang', 'es');
  w.jwt_decode = () => ({ role: h.role, id: 2, exp: Date.now() / 1000 + 3600 });
  const run = file => vm.runInContext(read(file), dom.getInternalVMContext(), { filename: file });
  run('js/utils.js');
  w.getEvent = () => h.event;
  w.getCurrentAppLanguage = () => w.localStorage.getItem('lang');
  w.t = (key, fallback) => translations[w.getCurrentAppLanguage()][key] ?? fallback ?? key;
  w.confirm = () => h.confirm;
  const instances = new Map();
  w.bootstrap = { Modal: class {
    constructor(element) { this.element = element; instances.set(element, this); }
    static getOrCreateInstance(element) { return instances.get(element) || new this(element); }
    show() {
      if (this.element.dispatchEvent(new w.Event('show.bs.modal', { cancelable: true }))) this.element.classList.add('show');
    }
    hide() {
      if (!this.element.dispatchEvent(new w.Event('hide.bs.modal', { cancelable: true }))) return;
      this.element.classList.remove('show');
      this.element.dispatchEvent(new w.Event('hidden.bs.modal'));
    }
  } };
  const listen = w.document.addEventListener.bind(w.document);
  w.document.addEventListener = (name, ...args) => { if (name !== 'DOMContentLoaded') listen(name, ...args); };
  run('js/registration.js');
  run('js/registration-supplements.js');
  w.initRegistrationSupplements();
  h.el = id => w.document.getElementById(`registrationSupplement${id}`);
  h.click = async selector => { w.document.querySelector(selector).click(); await tick(); };
  h.open = () => h.click('#registrationSupplementsBtn');
  h.selectCategory = category => {
    h.el('Category').value = String(category);
    h.el('Category').dispatchEvent(new w.Event('change', { bubbles: true }));
  };
  h.submit = async (style, price, category) => {
    if (category !== undefined || !h.el('Category').value) h.selectCategory(category ?? 8);
    if (style !== undefined) h.el('Style').value = String(style);
    if (price !== undefined) h.el('Price').value = String(price);
    h.el('Form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    await tick();
  };
  h.writes = () => h.calls.filter(call => call.method !== 'GET');
  h.modal = () => instances.get(h.el('sModal'));
  h.close = () => dom.window.close();
  return h;
}

for (const role of ['organizer', 'admin']) {
  test(`${role}: lazily loads event-scoped categories, styles and supplements and authenticates CRUD`, async () => {
    const h = harness(role);
    try {
      assert.equal(h.calls.length, 0);
      assert.equal(h.el('sBtn').classList.contains('d-none'), false);
      await h.open();
      assert.deepEqual(h.calls.map(call => call.path), ['/api/registrations/supplements', '/api/registrations/styles', '/api/registrations/categories']);
      assert.ok(h.calls.every(call => call.query === '?event_id=58'));
      assert.match(h.el('sTable').textContent, /Junior.*Contemporary.*5,00/s);
      assert.equal(h.el('sTable').rows[0].cells.length, 4);
      assert.equal(h.el('sTable').querySelector('img'), null);
      const registrations = [{ registration_price: 1000, total_amount: 1000 }];
      h.w.eval('registrationState').registrations = registrations;
      await h.submit(13, '5.29');
      assert.deepEqual(h.writes()[0].body, { event_id: 58, category_id: 8, style_id: 13, price: 529 });
      assert.equal(h.writes()[0].method, 'POST');
      assert.equal(h.el('sTable').rows.length, 2);
      assert.equal(h.el('sTable').querySelector('img'), null, 'style names are rendered as text');
      await h.click('[data-supplement-action="edit"][data-id="99"]');
      assert.equal(h.el('Price').value, '5.29');
      assert.equal(h.el('Category').value, '8');
      assert.equal(h.el('Save').dataset.i18n, 'save', 'language changes preserve the editing label');
      assert.equal(h.el('Style').querySelector('[value="13"]').disabled, false);
      await h.submit(14, '0', 9);
      assert.deepEqual(h.writes()[1].body, { event_id: 58, category_id: 9, style_id: 14, price: 0 });
      assert.equal(h.writes()[1].method, 'PUT');
      assert.equal(h.writes()[1].path, '/api/registrations/supplements/99');
      assert.equal(h.el('Save').dataset.i18n, 'registration_supplements_add');
      assert.equal(h.el('sTable').querySelector('img'), null, 'category names are rendered as text');
      await h.click('[data-supplement-action="delete"][data-id="99"]');
      assert.equal(h.writes()[2].method, 'DELETE');
      assert.equal(h.writes()[2].path, '/api/registrations/supplements/99');
      assert.equal(h.el('sTable').rows.length, 1);
      assert.deepEqual(registrations, [{ registration_price: 1000, total_amount: 1000 }], 'configuration never adds supplements to registration prices');
      for (const call of h.calls) {
        assert.equal(call.headers.authorization, 'Bearer test-token');
        assert.equal(call.headers['accept-language'], 'es');
        assert.equal(call.headers['x-event-id'], role === 'admin' ? '58' : undefined);
      }
    } finally { h.close(); }
  });
}

test('school and guest accounts cannot open or load supplements', async () => {
  for (const role of ['school', 'guest']) {
    const h = harness(role);
    try {
      await h.open();
      assert.equal(h.el('sBtn').classList.contains('d-none'), true);
      assert.equal(h.calls.length, 0);
    } finally { h.close(); }
  }
});

test('prevents duplicates, validates money and allows zero and exact cent values', async () => {
  const h = harness();
  try {
    await h.open();
    h.selectCategory(8);
    assert.equal(h.el('Style').querySelector('[value="12"]').disabled, true);
    await h.submit(12, '5');
    assert.equal(h.writes().length, 0);
    assert.match(h.el('sFeedback').textContent, /ya tiene un suplemento/);
    for (const price of ['', '-1', '1.001', '1e2', '90071992547410']) {
      await h.submit(13, price);
      assert.equal(h.writes().length, 0, `rejects ${price}`);
    }
    await h.submit('', '5');
    assert.equal(h.writes().length, 0);
    await h.submit(13, '0.29');
    assert.equal(h.writes()[0].body.price, 29);
    await h.submit(14, '0');
    assert.equal(h.writes()[1].body.price, 0);
    h.selectCategory(8);
    assert.equal(h.el('Save').disabled, true, 'all styles in the selected category already have supplements');
    await h.click('[data-supplement-action="edit"][data-id="1"]');
    assert.equal(h.el('Save').disabled, false, 'existing supplements remain editable');
    await h.click('#registrationSupplementCancel');
    assert.equal(h.el('Price').value, '');
  } finally { h.close(); }
});

test('canceling deletion preserves the entry; successful deletion restores its style', async () => {
  const h = harness();
  try {
    await h.open();
    h.confirm = false;
    await h.click('[data-supplement-action="delete"][data-id="1"]');
    assert.equal(h.writes().length, 0);
    h.confirm = true;
    await h.click('[data-supplement-action="delete"][data-id="1"]');
    assert.equal(h.el('sEmpty').classList.contains('d-none'), false);
    assert.equal(h.el('Style').querySelector('[value="12"]').disabled, false);
  } finally { h.close(); }
});

test('requires an event category and rejects missing or unknown categories', async () => {
  const h = harness();
  try {
    await h.open();
    assert.equal(h.el('Category').required, true);
    for (const category of ['', 999, -1]) {
      await h.submit(13, '5', category);
      assert.equal(h.writes().length, 0);
      assert.equal(h.el('Category').validity.valid, false);
    }
    await h.submit(13, '5', 8);
    assert.equal(h.writes()[0].body.category_id, 8);
  } finally { h.close(); }
});

test('a style can be reused across categories; changing category recalculates duplicates', async () => {
  const h = harness();
  try {
    await h.open();
    h.selectCategory(8);
    assert.equal(h.el('Style').querySelector('[value="12"]').disabled, true);
    h.selectCategory(9);
    assert.equal(h.el('Style').querySelector('[value="12"]').disabled, false);
    await h.submit(12, '7', 9);
    assert.deepEqual(h.writes()[0].body, { event_id: 58, category_id: 9, style_id: 12, price: 700 });
    assert.equal(h.el('sTable').rows.length, 2);
    assert.equal(h.el('sTable').rows[0].cells[0].textContent, 'Junior');
    assert.match(h.el('sTable').rows[1].cells[0].textContent, /Adult/);
    assert.equal(h.el('sTable').rows[0].cells[1].textContent, 'Contemporary');
    assert.equal(h.el('sTable').rows[1].cells[1].textContent, 'Contemporary');
    await h.click('[data-supplement-action="edit"][data-id="99"]');
    assert.equal(h.el('Category').value, '9');
    assert.equal(h.el('Style').value, '12');
    assert.equal(h.el('Style').querySelector('[value="12"]').disabled, false);
    h.selectCategory(8);
    assert.equal(h.el('Style').value, '', 'an occupied combination clears the style selection');
    assert.equal(h.el('Style').querySelector('[value="12"]').disabled, true);
    await h.submit(12, '7');
    assert.equal(h.writes().length, 1, 'cannot move onto an existing combination');
    await h.submit(13, '7');
    assert.equal(h.writes()[1].method, 'PUT');
    assert.deepEqual(h.writes()[1].body, { event_id: 58, category_id: 8, style_id: 13, price: 700 });
    assert.ok(h.calls.slice(-1)[0].path.endsWith('/supplements'), 'reloads the list after editing');
  } finally { h.close(); }
});

test('a server-side duplicate on creation displays its 409 error without losing the combination', async () => {
  const h = harness();
  try {
    await h.open();
    h.overrides['POST /api/registrations/supplements'] = () => ({ status: 409, data: { error: 'La combinación ya existe' } });
    await h.submit(12, '5', 9);
    assert.equal(h.el('sFeedback').textContent, 'La combinación ya existe');
    assert.equal(h.el('Category').value, '9');
    assert.equal(h.el('Style').value, '12');
    assert.equal(h.el('Price').value, '5');
    assert.equal(h.el('sTable').rows.length, 1);
  } finally { h.close(); }
});

test('a category load failure disables writes and supports retry', async () => {
  const h = harness();
  try {
    h.overrides['GET /api/registrations/categories'] = () => ({ status: 403, data: { error: 'No se pueden cargar categorías' } });
    await h.open();
    assert.equal(h.el('Category').disabled, true);
    assert.equal(h.el('Save').disabled, true);
    assert.equal(h.el('sFeedback').textContent, 'No se pueden cargar categorías');
    await h.submit(13, '5', 8);
    assert.equal(h.writes().length, 0);
    delete h.overrides['GET /api/registrations/categories'];
    await h.click('#registrationSupplementsRetry');
    assert.equal(h.el('Category').disabled, false);
    await h.submit(13, '5', 8);
    assert.equal(h.writes()[0].body.category_id, 8);
  } finally { h.close(); }
});

test('an event without categories cannot create supplements', async () => {
  const h = harness();
  try {
    h.categories = [];
    await h.open();
    assert.equal(h.el('Save').disabled, true);
    assert.match(h.el('sStatus').textContent, /Añade categorías/);
    await h.submit(13, '5', 8);
    assert.equal(h.writes().length, 0);
  } finally { h.close(); }
});

for (const status of [400, 401, 403, 404, 409]) {
  test(`HTTP ${status}: displays the backend error and preserves edits for retry`, async () => {
    const h = harness();
    try {
      await h.open();
      await h.click('[data-supplement-action="edit"][data-id="1"]');
      h.overrides['PUT /api/registrations/supplements/1'] = () => ({ status, data: { error: `Error traducido ${status}` } });
      await h.submit(12, '7.50');
      assert.equal(h.el('sFeedback').textContent, `Error traducido ${status}`);
      assert.equal(h.el('Price').value, '7.50');
      assert.equal(h.el('Save').disabled, false);
      delete h.overrides['PUT /api/registrations/supplements/1'];
      await h.submit();
      assert.equal(h.supplements[0].price, 750);
    } finally { h.close(); }
  });
}

test('failed initial loads disable writes and can be retried', async () => {
  const h = harness();
  try {
    h.overrides['GET /api/registrations/styles'] = () => ({ status: 403, data: { error: 'Sin acceso' } });
    await h.open();
    assert.equal(h.el('Save').disabled, true);
    assert.equal(h.el('sFeedback').textContent, 'Sin acceso');
    await h.submit(13, '5');
    assert.equal(h.writes().length, 0);
    delete h.overrides['GET /api/registrations/styles'];
    await h.click('#registrationSupplementsRetry');
    assert.equal(h.el('Save').disabled, false);
  } finally { h.close(); }
});

test('failed refresh after creation requires reloading instead of repeating the POST', async () => {
  const h = harness();
  try {
    await h.open();
    h.overrides['GET /api/registrations/supplements'] = () => ({ status: 400, data: { error: 'No se pudo recargar' } });
    await h.submit(13, '5');
    assert.equal(h.writes().length, 1);
    assert.equal(h.el('Save').disabled, true);
    await h.submit(13, '5');
    assert.equal(h.writes().length, 1);
    delete h.overrides['GET /api/registrations/supplements'];
    await h.click('#registrationSupplementsRetry');
    assert.equal(h.el('sTable').rows.length, 2);
    h.selectCategory(8);
    assert.equal(h.el('Style').querySelector('[value="13"]').disabled, true);
  } finally { h.close(); }
});

test('concurrent submissions and modal dismissal cannot interrupt an active save', async () => {
  const h = harness();
  try {
    await h.open();
    let release;
    h.overrides['POST /api/registrations/supplements'] = () => new Promise(resolve => { release = resolve; });
    await h.submit(13, '5');
    await h.submit(13, '5');
    assert.equal(h.writes().length, 1);
    assert.equal(h.el('Price').disabled, true);
    h.modal().hide();
    assert.equal(h.el('sModal').classList.contains('show'), true);
    release(null);
    await tick();
    assert.equal(h.el('Price').disabled, false);
    h.modal().hide();
    assert.equal(h.el('sModal').classList.contains('show'), false);
    assert.equal(h.w.document.activeElement, h.el('sBtn'));
  } finally { h.close(); }
});

test('event changes and expired sessions prevent mutations', async () => {
  const h = harness();
  try {
    await h.open();
    h.event.id = 59;
    await h.submit(13, '5');
    assert.equal(h.writes().length, 0);
    assert.equal(h.el('Save').disabled, true);
    h.event.id = 58;
    h.role = 'guest';
    await h.submit(13, '5');
    assert.equal(h.writes().length, 0);
  } finally { h.close(); }
});

test('all supplement translations are available in every supported language', () => {
  const keys = Object.keys(translations.es).filter(key => key.startsWith('registration_supplements_'));
  for (const language of Object.keys(translations)) {
    assert.deepEqual(Object.keys(translations[language]).filter(key => key.startsWith('registration_supplements_')), keys);
    keys.forEach(key => assert.ok(translations[language][key].length));
  }
});
