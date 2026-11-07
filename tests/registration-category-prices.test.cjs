// Functional DOM/data tests only; no rendering or screenshots.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync(path.join(__dirname, '../js/registration.js'), 'utf8');
const section = (start, end, from = 0) => {
  const index = source.indexOf(start, from);
  assert.ok(index >= 0);
  return source.slice(index, source.indexOf(end, index));
};

function harness(event = {}) {
  const dom = new JSDOM('', { runScripts: 'outside-only' });
  const w = dom.window;
  w.getEvent = () => event;
  w.getRegistrationLanguage = () => 'es';
  w.getLanguage = () => 'es';
  w.t = (_key, fallback) => fallback;
  const categoryStart = source.indexOf('function initRegistrationCategoriesTab(');
  w.eval([
    section('function getRegistrationCalendarDate(', 'function getRegistrationSidebarStatusInfo('),
    section('  const normalizeNumber =', '  const syncCategoryRequiredFields =', categoryStart),
    section('  const formatCurrencyDisplay =', '  const getCategoryPricesElements =', categoryStart),
    section('  const getCategoryPriceDate =', '  const getCategoryPriceApiError =', categoryStart),
    section('  const createCategoryPriceRanges =', '  const createCategoryYearsRange =', categoryStart),
    'window.createRanges = createCategoryPriceRanges;'
  ].join('\n'));
  return { dom, create: w.createRanges };
}

test('renders each API period chronologically, converts cents and highlights only is_current', () => {
  const h = harness();
  const prices = [
    { start_date: '2026-11-01T00:00:00.000Z', end_date: '2026-12-31T00:00:00.000Z', price: 3500, is_current: true },
    { start_date: '2026-09-01T00:00:00.000Z', end_date: '2026-10-31T00:00:00.000Z', price: 3000, is_current: false }
  ];
  const list = h.create({ registration_price: 1000, reg_price_by_date: 9900, prices });
  assert.equal(list.children.length, 2);
  assert.equal(list.children[0].querySelector('strong').textContent.replace(/\s/g, ''), '30,00€');
  assert.equal(list.children[1].querySelector('strong').textContent.replace(/\s/g, ''), '35,00€');
  assert.match(list.children[0].textContent, /01 sept 2026 - 31 oct 2026/);
  assert.match(list.children[1].textContent, /01 nov 2026 - 31 dic 2026/);
  assert.equal(list.querySelectorAll('[aria-current="true"]').length, 1);
  assert.ok(list.children[1].classList.contains('registration-category-price-range--current'));
  assert.equal(prices[0].price, 3500, 'does not reorder API data in place');
  h.dom.window.close();
});

test('empty prices use the category base price and API event registration dates', () => {
  const h = harness({ registrationStart: '2020-01-01', registrationEnd: '2020-02-01' });
  const list = h.create({ prices: [], event_reg_start: '2026-09-01T00:00:00.000Z', event_reg_end: '2026-12-31T00:00:00.000Z', registration_price: 2500, reg_price_by_date: 9900 });
  assert.equal(list.children.length, 1);
  assert.match(list.textContent, /01 sept 2026 - 31 dic 2026/);
  assert.equal(list.querySelector('strong').textContent.replace(/\s/g, ''), '25,00€');
  assert.equal(list.children[0].getAttribute('aria-current'), 'true');
  assert.ok(list.children[0].classList.contains('registration-category-price-range--current'));
  h.dom.window.close();
});

test('missing price ranges fall back to event session dates and distinguish free from unavailable', () => {
  const h = harness({ registrationStart: '2026-09-01', registrationEnd: '2026-12-31' });
  const free = h.create({ registration_price: 0 });
  assert.match(free.textContent, /01 sept 2026 - 31 dic 2026/);
  assert.equal(free.querySelector('strong').textContent, 'FREE');
  for (const value of [null, undefined, '', 'invalid']) {
    assert.equal(h.create({ registration_price: value }).querySelector('strong').textContent, '-');
  }
  h.dom.window.close();
});

test('does not infer current prices from the client date or truthy false strings', () => {
  const h = harness();
  const list = h.create({ prices: [
    { start_date: '2000-01-01', end_date: '2100-12-31', price: 0, is_current: false },
    { start_date: '2000-01-01', end_date: '2100-12-31', price: 1000, is_current: 'false' }
  ] });
  assert.equal(list.querySelector('[aria-current]'), null);
  assert.equal(list.children[0].querySelector('strong').textContent, 'FREE');
  h.dom.window.close();
});
