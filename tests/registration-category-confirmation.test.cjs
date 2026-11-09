// Functional tests with simulated API and modal events; no rendering.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/registration.js'), 'utf8');
const start = source.indexOf('function initRegistrationCategoriesTab(');
const section = (a, b) => {
  const i = source.indexOf(a, start);
  return source.slice(i, source.indexOf(b, i));
};

function harness(operation, { associated = false, accept = true, failure = false, moved = false } = {}) {
  const calls = [], errors = [];
  const node = () => {
    const el = new EventTarget();
    el.visible = true;
    el.classList = { contains: () => el.visible, add() {}, remove() {} };
    el.value = ''; el.textContent = 'Save';
    el.setCustomValidity = () => {};
    return el;
  };
  const modalEl = node(), deleteModalEl = node(), pricesModalEl = node();
  const warning = node(), confirm = node();
  let warnings = 0;
  const instances = new Map();
  for (const el of [modalEl, deleteModalEl, pricesModalEl, warning]) {
    instances.set(el, {
      show() {
        el.visible = true;
        el.dispatchEvent(new Event('shown.bs.modal'));
        if (el === warning) {
          warnings++;
          queueMicrotask(() => accept ? confirm.dispatchEvent(new Event('click')) : this.hide());
        }
      },
      hide() { el.visible = false; el.dispatchEvent(new Event('hidden.bs.modal')); }
    });
  }
  const elements = {};
  for (const name of ['id', 'name', 'minPar', 'maxPar', 'minYears', 'maxYears', 'maxOutOfRange', 'musicMinDuration', 'musicMaxDuration', 'price', 'saveBtn', 'confirmDeleteBtn']) elements[name] = node();
  elements.id.value = '20'; elements.price.value = '15.00';
  const priceElements = { id: node(), startDate: node(), endDate: node(), price: node(), saveBtn: node(), form: { checkValidity: () => true, classList: { add() {} } } };
  priceElements.id.value = operation === 'price-create' ? '' : '7';
  priceElements.startDate.value = '2026-01-01'; priceElements.endDate.value = '2026-12-31'; priceElements.price.value = '12.50';
  const context = {
    URLSearchParams, Event, API_BASE_URL: 'https://api.test',
    categoryOperationPending: false, categoryModalSuspended: false,
    categoryToDelete: { id: 20 }, categoryForPrices: { id: 20 },
    categoryPrices: [{ id: 7, reg_category_id: moved ? 30 : 20 }], categoryPricesChanged: false,
    modalEl, deleteModalEl, pricesModalEl, elements,
    categoryModal: instances.get(modalEl), deleteModal: instances.get(deleteModalEl),
    form: { dataset: { mode: operation === 'category-create' ? 'create' : 'edit' } },
    bootstrap: { Modal: { getInstance: el => instances.get(el), getOrCreateInstance: el => instances.get(el) } },
    document: { getElementById: id => id === 'registrationCategoryRecalculationModal' ? warning : confirm },
    window: { confirm: () => true }, t: (_, fallback) => fallback,
    getEvent: () => ({ id: 9 }), getCategoryPricesElements: () => priceElements,
    validateCategoryForm: () => true, syncAllDurationFieldValidity() {}, normalizeDurationFieldDisplay() {},
    normalizeNumber: Number, parseDurationValue: () => 0,
    parseCurrencyValueToCents: value => value === '' ? null : Math.round(Number(value) * 100),
    resetCategoryPriceForm() {}, loadCategoryPrices: async () => {},
    fetchRegistrationCategories: async () => {}, notifyRegistrationConfigUpdate() {}, renderCategories() {},
    showMessageModal: message => errors.push(message),
    fetch: async (url, options = {}) => {
      calls.push({ url, ...options });
      const check = url.includes('has-registrations');
      return { ok: !(check && failure), json: async () => check ? (failure ? { error: 'Check failed' } : { has_registrations: associated }) : {} };
    }
  };
  vm.createContext(context);
  vm.runInContext([
    section('  const getCategoryPriceApiError =', '  // Uses the authenticated'),
    section('  const hasCategoryRegistrations =', '  const resetCategoryPriceForm ='),
    section('  const saveCategoryPrice =', '  const formatMaxOutOfRange ='),
    section('  const saveCategory =', '  if (addBtn)'),
    'this.run = () => ' + (operation.startsWith('category-') ? (operation === 'category-delete' ? 'deleteCategory()' : 'saveCategory()') : (operation === 'price-delete' ? 'deleteCategoryPrice(7)' : 'saveCategoryPrice({ preventDefault() {} })'))
  ].join('\n'), context);
  return { context, calls, errors, run: context.run, warnings: () => warnings, priceElements };
}

for (const operation of ['category-update', 'category-delete', 'price-create', 'price-update', 'price-delete']) {
  test(`${operation}: checks the category before writing, with the expected query and payload`, async () => {
    const h = harness(operation);
    await h.run();
    assert.equal(h.errors.length, 0);
    assert.equal(h.calls.length, 2);
    assert.equal(h.calls[0].url, `https://api.test/api/registrations/categories/20/has-registrations${operation === 'category-update' ? '?registration_price=1500' : ''}`);
    assert.equal(h.calls[0].cache, 'no-store');
    assert.equal(h.calls[1].method, operation.endsWith('delete') ? 'DELETE' : operation === 'price-create' ? 'POST' : 'PUT');
    if (operation === 'category-update') assert.equal(JSON.parse(h.calls[1].body).registration_price, 1500);
    if (operation === 'price-update' || operation === 'price-create') assert.equal(JSON.parse(h.calls[1].body).price, 1250);
    assert.equal(h.warnings(), 0);
  });
  test(`${operation}: associated registrations require confirmation and cancellation preserves retry`, async () => {
    const h = harness(operation, { associated: true, accept: false });
    await h.run();
    assert.equal(h.calls.length, 1);
    assert.equal(h.warnings(), 1);
    assert.equal(h.context.categoryOperationPending, false);
    await h.run();
    assert.equal(h.calls.length, 2);
  });
  test(`${operation}: confirmation resumes the write once and blocks concurrent submissions`, async () => {
    const h = harness(operation, { associated: true });
    await Promise.all([h.run(), h.run()]);
    assert.equal(h.calls.length, 2);
    assert.equal(h.warnings(), 1);
    assert.equal(h.errors.length, 0);
  });
  test(`${operation}: lookup failure prevents writing and allows retry`, async () => {
    const h = harness(operation, { failure: true });
    await h.run();
    assert.deepEqual(h.errors, ['Check failed']);
    assert.equal(h.calls.length, 1);
    assert.equal(h.context.categoryOperationPending, false);
    await h.run();
    assert.equal(h.calls.length, 2);
  });
}

test('moving a price checks both source and destination categories without base-price parameters', async () => {
  const h = harness('price-update', { moved: true, associated: true });
  await h.run();
  assert.deepEqual(h.calls.slice(0, 2).map(call => call.url), [20, 30].map(id => `https://api.test/api/registrations/categories/${id}/has-registrations`));
  assert.equal(h.warnings(), 1);
  assert.equal(h.calls[2].method, 'PUT');
});

test('creating a category does not check registrations; a zero base price is sent when editing', async () => {
  const create = harness('category-create');
  await create.run();
  assert.equal(create.calls.length, 1);
  assert.equal(create.calls[0].method, 'POST');
  const edit = harness('category-update');
  edit.context.elements.price.value = '0';
  await edit.run();
  assert.match(edit.calls[0].url, /registration_price=0$/);
});

test('an empty optional base price uses the general check and preserves the original null payload', async () => {
  const h = harness('category-update', { associated: true });
  h.context.elements.price.value = '';
  await h.run();
  assert.equal(h.calls[0].url, 'https://api.test/api/registrations/categories/20/has-registrations');
  assert.equal(JSON.parse(h.calls[1].body).registration_price, null);
  assert.equal(h.warnings(), 1);
});
