// Functional DOM and price regression tests only; no rendering or screenshots.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const source = read('js/registration-competitions.js');
const shared = read('js/registration.js');
const translations = JSON.parse(read('lang/registration.es.json'));
const section = (start, end, script = source) => {
  const from = script.indexOf(start);
  const to = script.indexOf(end, from);
  assert.ok(from >= 0 && to > from);
  return script.slice(from, to);
};

function harness(categories) {
  const dom = new JSDOM(read('registration.html'), { runScripts: 'outside-only' });
  const w = dom.window;
  w.categories = categories;
  w.elements = {
    category: w.document.getElementById('registrationCategory'),
    style: w.document.getElementById('registrationStyle'),
    categoryInfo: w.document.getElementById('categoryRuleInfo')
  };
  categories.forEach(category => w.elements.category.add(new w.Option(category.name, String(category.id))));
  [12, 13, 14].forEach(id => w.elements.style.add(new w.Option(`Style ${id}`, String(id))));
  w.getCurrentAppLanguage = () => 'es';
  w.getRegistrationLanguage = () => 'es';
  w.getEvent = () => ({ id: 75, registrationStart: '2026-11-18', registrationEnd: '2027-04-30' });
  w.t = (key, fallback) => translations[key] ?? fallback;
  w.eval([
    'const categoryById = new Map(categories.map(category => [String(category.id), category]));',
    section('function getRegistrationCalendarDate(', 'function getRegistrationSidebarStatusInfo(', shared),
    section('function normalizeRegistrationNumber(', 'function getRegistrationFeeTypeInfo(', shared),
    section('function createRegistrationCategoryPriceRanges(', 'function initRegistrationCategoriesTab(', shared),
    section('  const normalizeNumber =', '  const getRegistrationCategoryId ='),
    section('  const categoryHasAgeRange =', '  const updateMembersAgeHeaderTooltip ='),
    section('  const updateCategoryInfo =', '  const formatBytes ='),
    section('  if (elements.category) {', '  if (elements.addMemberBtn) {')
  ].join('\n'));
  return {
    get rows() { return [...w.elements.categoryInfo.querySelectorAll('.registration-category-price-range')]; },
    get economics() { return w.elements.categoryInfo.querySelector('.registration-category-info-card--economics')?.textContent || ''; },
    selectStyle(id) {
      w.elements.style.value = String(id);
      w.elements.style.dispatchEvent(new w.Event('change'));
    },
    select(id) {
      w.elements.category.value = String(id);
      w.elements.category.dispatchEvent(new w.Event('change'));
      return w.elements.categoryInfo.querySelector('.registration-category-info-card--economics')?.textContent.replace(/\s+/g, ' ').trim() || '';
    },
    close: () => dom.window.close()
  };
}

const category = overrides => ({ id: 513, name: 'Amateur', min_par: 1, max_par: 1, min_years: 1, max_years: 99, music_max_duration: 300, registration_price: 0, apply_fee: 1, ...overrides });

test('creation modal shows the supplied event tariffs instead of the zero base prices', () => {
  const categories = [[513, 'Amateur', 2000], [514, 'Avanzado', 2500], [516, 'Master', 3500], [515, 'Profesional', 3000]].map(([id, name, price]) => category({
    id, name, event_id: 75, reg_price_by_date: price,
    prices: [{ id: id + 100, reg_category_id: id, start_date: '2026-11-18T00:00:00.000Z', end_date: '2027-04-30T00:00:00.000Z', price, is_current: true }]
  }));
  const h = harness(categories);
  try {
    for (const item of categories) {
      const economics = h.select(item.id);
      assert.ok(economics.includes(`${item.reg_price_by_date / 100},00 €`), economics);
      assert.equal(economics.includes('Inscripción gratuita'), false);
      assert.equal(item.registration_price, 0, 'does not change API category prices');
    }
  } finally { h.close(); }
});

test('shows the price records themselves and only calls a zero-price period free', () => {
  const h = harness([
    category({ id: 1, registration_price: 5000, reg_price_by_date: 2500, prices: [{ price: 2000, is_current: true }] }),
    category({ id: 2, registration_price: 5000, reg_price_by_date: 0, prices: [{ price: 0, is_current: true }] })
  ]);
  try {
    assert.match(h.select(1), /20,00 €/);
    assert.match(h.select(2), /Inscripción gratuita/);
  } finally { h.close(); }
});

test('current API ranges are used when effective price is absent, without inferring dates', () => {
  const h = harness([
    category({ id: 1, reg_price_by_date: null, prices: [{ price: 9000, is_current: false }, { price: 2000, is_current: true, start_date: '2000-01-01', end_date: '2000-01-02' }] }),
    category({ id: 2, reg_price_by_date: '', prices: [{ price: 3500, is_current: 1 }] }),
    category({ id: 3, registration_price: 1500, prices: [{ price: 9000, is_current: 'false' }] }),
    category({ id: 4, prices: [{ price: 0, is_current: true }] })
  ]);
  try {
    assert.match(h.select(1), /20,00 €/);
    assert.match(h.select(2), /35,00 €/);
    assert.match(h.select(3), /90,00 €/);
    assert.equal(h.rows[0].hasAttribute('aria-current'), false);
    assert.match(h.select(4), /Inscripción gratuita/);
  } finally { h.close(); }
});

test('legacy categories retain their base prices and unknown prices are not advertised as free', () => {
  const h = harness([
    category({ id: 1, registration_price: 1750 }),
    category({ id: 2, registration_price: 0 }),
    ...[null, undefined, '', 'invalid'].map((registration_price, index) => category({ id: index + 3, registration_price }))
  ]);
  try {
    assert.match(h.select(1), /17,50 €/);
    assert.match(h.select(2), /Inscripción gratuita/);
    for (const id of [3, 4, 5, 6]) {
      const economics = h.select(id);
      assert.equal(economics.includes('Inscripción gratuita'), false);
      assert.equal(h.rows[0].querySelector('.registration-category-price-range__amount').textContent, '-');
    }
    assert.equal(h.select(''), '', 'clearing the category removes its economic information');
  } finally { h.close(); }
});

test('lists every price period in chronological order and visibly marks the one applying today', () => {
  const prices = [
    { id: 3, start_date: '2027-01-01T00:00:00.000Z', end_date: '2027-04-30T00:00:00.000Z', price: 3000, is_current: false },
    { id: 1, start_date: '2026-09-01T00:00:00.000Z', end_date: '2026-10-31T00:00:00.000Z', price: 1500, is_current: false },
    { id: 2, start_date: '2026-11-01T00:00:00.000Z', end_date: '2026-12-31T00:00:00.000Z', price: 2000, is_current: true }
  ];
  const h = harness([category({ reg_price_by_date: 2000, prices })]);
  try {
    h.select(513);
    assert.equal(h.rows.length, 3);
    assert.deepEqual(h.rows.map(row => row.querySelector('strong').textContent.replace(/\s/g, '')), ['15,00€', '20,00€', '30,00€']);
    assert.match(h.rows[0].textContent, /01 sept 2026 - 31 oct 2026/);
    assert.match(h.rows[1].textContent, /01 nov 2026 - 31 dic 2026/);
    assert.match(h.rows[2].textContent, /01 ene 2027 - 30 abr 2027/);
    assert.equal(h.rows.filter(row => row.getAttribute('aria-current') === 'true').length, 1);
    assert.equal(h.rows[1].classList.contains('registration-category-price-range--current'), true);
    const label = h.rows[1].querySelector('.registration-category-price-range__current');
    assert.equal(label.textContent, 'Precio vigente');
    assert.equal(label.classList.contains('visually-hidden'), false);
    assert.deepEqual(prices.map(price => price.id), [3, 1, 2], 'does not mutate API ordering');
  } finally { h.close(); }
});

test('keeps past and future periods when no tariff applies today', () => {
  const h = harness([category({ reg_price_by_date: 0, prices: [
    { start_date: '2000-01-01', end_date: '2000-12-31', price: 1000, is_current: false },
    { start_date: '2099-01-01', end_date: '2099-12-31', price: 3000, is_current: false }
  ] })]);
  try {
    const economics = h.select(513);
    assert.equal(h.rows.length, 2);
    assert.equal(h.rows.some(row => row.hasAttribute('aria-current')), false);
    assert.equal(economics.includes('Inscripción gratuita'), false);
    assert.equal(economics.includes('Precio vigente'), false);
  } finally { h.close(); }
});

const supplement = overrides => ({ id: 1, event_id: 75, category_id: 513, style_id: 12, price: 500, ...overrides });
const amount = row => row.querySelector('.registration-category-price-range__amount').textContent.replace(/\s/g, '');

test('selecting a style adds its category supplement to every displayed period, keeping today marked', () => {
  const item = category({ prices: [
    { start_date: '2026-09-01', end_date: '2026-10-31', price: 1500, is_current: false },
    { start_date: '2026-11-01', end_date: '2026-12-31', price: 2000, is_current: true },
    { start_date: '2027-01-01', end_date: '2027-04-30', price: 3000, is_current: false }
  ], supplements: [supplement()] });
  const original = JSON.stringify(item);
  const h = harness([item]);
  try {
    h.select(513);
    assert.deepEqual(h.rows.map(amount), ['15,00€', '20,00€', '30,00€']);
    h.selectStyle(12);
    assert.deepEqual(h.rows.map(amount), ['20,00€', '25,00€', '35,00€']);
    assert.equal(h.rows[1].getAttribute('aria-current'), 'true');
    assert.match(h.economics.replace(/\s/g, ''), /Suplemento:\+5,00€/);
    assert.equal(JSON.stringify(item), original, 'never changes API category prices or supplements');
  } finally { h.close(); }
});

test('changing or clearing the style recalculates the supplement once from the original tariff', () => {
  const h = harness([category({ registration_price: 2000, supplements: [
    supplement(), supplement({ id: 2, style_id: 13, price: 750 })
  ] })]);
  try {
    h.select(513);
    for (const [styleId, expected] of [[12, '25,00€'], [12, '25,00€'], [13, '27,50€'], [14, '20,00€'], ['', '20,00€'], [12, '25,00€']]) {
      h.selectStyle(styleId);
      assert.equal(amount(h.rows[0]), expected);
    }
    h.select(513);
    assert.equal(amount(h.rows[0]), '25,00€', 'category refresh does not add the supplement again');
  } finally { h.close(); }
});

test('matches event, category and style and updates when changing categories with the same style selected', () => {
  const h = harness([
    category({ registration_price: 2000, supplements: [
      supplement({ event_id: 58, price: 9900 }),
      supplement({ category_id: 514, price: 8800 }),
      supplement({ style_id: 13, price: 7700 }),
      supplement()
    ] }),
    category({ id: 514, registration_price: 3000, supplements: [supplement({ category_id: 514, price: 250 })] }),
    category({ id: 515, registration_price: 1500, supplements: [] }),
    category({ id: 516, registration_price: 1000 })
  ]);
  try {
    h.selectStyle(12);
    for (const [categoryId, expected] of [[513, '25,00€'], [514, '32,50€'], [515, '15,00€'], [516, '10,00€'], [513, '25,00€']]) {
      h.select(categoryId);
      assert.equal(amount(h.rows[0]), expected);
    }
  } finally { h.close(); }
});

test('zero-price categories become paid when supplemented, while missing prices remain unavailable', () => {
  const h = harness([
    category({ supplements: [supplement()] }),
    category({ id: 514, supplements: [supplement({ category_id: 514, price: 0 })] }),
    category({ id: 515, registration_price: null, supplements: [supplement({ category_id: 515 })] })
  ]);
  try {
    h.select(513);
    assert.match(h.economics, /Inscripción gratuita/);
    h.selectStyle(12);
    assert.equal(amount(h.rows[0]), '5,00€');
    assert.equal(h.economics.includes('Inscripción gratuita'), false);
    h.select(514);
    assert.match(h.economics, /Inscripción gratuita/);
    h.select(515);
    assert.equal(amount(h.rows[0]), '-');
  } finally { h.close(); }
});
