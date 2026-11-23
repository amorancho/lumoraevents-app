// Functional DOM/API tests only; no rendering, previews or screenshots. Uses jsdom 26.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const languages = Object.fromEntries(['es', 'en', 'fr', 'it', 'pt'].map(lang => [lang, JSON.parse(read(`lang/tracking.${lang}.json`))]));
const tick = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };

function harness(role = 'organizer') {
  const dom = new JSDOM(read('tracking.html'), { url: 'http://localhost/tracking.html?eventId=demo', runScripts: 'outside-only' });
  const w = dom.window;
  const h = { dom, w, calls: [], overrides: {}, event: { id: 1, criteriaConfig: 'WITH_POR' } };
  h.categories = [{ id: 4, name: 'Solos' }, { id: 8, name: 'Grupos <unsafe>' }];
  h.rankings = {
    4: { event_id: 1, category_id: 4, is_provisional: true, pending_styles: [{ style_id: 6, style_name: 'Ballet' }], ranking: [
      { position: 1, competition_id: 10, dancer_id: 20, dancer_name: 'Ana <img src=x onerror=alert(1)>', style_id: 5, style_name: 'Jazz', total_score: 25.5 },
      { position: 1, competition_id: 11, dancer_id: 20, dancer_name: 'Ana <img src=x onerror=alert(1)>', style_id: 6, style_name: 'Ballet', total_score: 25.5 },
      { position: 3, competition_id: 10, dancer_id: 21, dancer_name: 'Bea', style_id: 5, style_name: 'Jazz', total_score: 20 }
    ] },
    8: { event_id: 1, category_id: 8, is_provisional: false, pending_styles: [], ranking: [
      { position: 1, competition_id: 12, dancer_id: 25, dancer_name: 'Grupo B', style_id: 7, style_name: 'Hip hop', total_score: 30.75 }
    ] }
  };
  w.Headers = Headers;
  w.matchMedia = () => ({ matches: false, addEventListener() {} });
  w.fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    const call = { url: parsed, ...options, headers: Object.fromEntries(new Headers(options.headers)) };
    h.calls.push(call);
    const override = h.overrides[parsed.pathname];
    const response = override ? await override(call) : { data: parsed.pathname === '/api/categories' ? h.categories : h.rankings[parsed.searchParams.get('category_id')] };
    return new Response(JSON.stringify(response.data), { status: response.status || 200 });
  };
  w.localStorage.setItem('token', 'test-token');
  w.localStorage.setItem('lang', 'es');
  w.jwt_decode = () => ({ role, id: 2, exp: Date.now() / 1000 + 3600 });
  const run = file => vm.runInContext(read(file), dom.getInternalVMContext(), { filename: file });
  run('js/utils.js');
  w.getEvent = () => h.event;
  w.getCurrentAppLanguage = () => w.localStorage.getItem('lang');
  w.t = (key, fallback) => languages[w.getCurrentAppLanguage()][key] ?? fallback ?? key;
  const modals = new Map(), dropdowns = new Map();
  w.bootstrap = {
    Modal: class {
      constructor(element) { this.element = element; modals.set(element, this); }
      static getOrCreateInstance(element) { return modals.get(element) || new this(element); }
      show() { this.element.classList.add('show'); this.element.dispatchEvent(new w.Event('shown.bs.modal')); }
      hide() {
        this.element.dispatchEvent(new w.Event('hide.bs.modal'));
        this.element.classList.remove('show');
        this.element.dispatchEvent(new w.Event('hidden.bs.modal'));
      }
    },
    Dropdown: class {
      constructor(element) { this.element = element; this.menu = w.document.getElementById(element.getAttribute('aria-controls')); dropdowns.set(element, this); }
      static getOrCreateInstance(element) { return dropdowns.get(element) || new this(element); }
      show() {
        this.element.dispatchEvent(new w.Event('show.bs.dropdown'));
        this.element.setAttribute('aria-expanded', 'true'); this.menu.classList.add('show');
      }
      hide() {
        this.menu.classList.remove('show'); this.element.setAttribute('aria-expanded', 'false');
        this.element.dispatchEvent(new w.Event('hidden.bs.dropdown'));
      }
      toggle() { this.menu.classList.contains('show') ? this.hide() : this.show(); }
    }
  };
  const listen = w.document.addEventListener.bind(w.document);
  w.document.addEventListener = (name, ...args) => { if (name !== 'DOMContentLoaded') listen(name, ...args); };
  run('js/tracking.js');
  w.initCategoryGeneralRanking();
  h.el = suffix => w.document.getElementById(`categoryGeneralRanking${suffix}`);
  h.el('Btn').addEventListener('click', () => w.bootstrap.Dropdown.getOrCreateInstance(h.el('Btn')).toggle());
  h.open = async () => { h.el('Btn').click(); await tick(); };
  h.choose = id => { h.el('Select').value = String(id); h.el('Select').dispatchEvent(new w.Event('change')); };
  h.view = async () => { h.el('ViewBtn').click(); await tick(); };
  h.dismiss = () => w.bootstrap.Modal.getOrCreateInstance(h.el('Modal')).hide();
  h.rankingCalls = () => h.calls.filter(call => call.url.pathname === '/api/competitions/general-ranking');
  h.close = () => dom.window.close();
  return h;
}

for (const role of ['organizer', 'admin']) {
  test(`${role}: dropdown follows Export, loads event categories and fetches the selected overall ranking`, async () => {
    const h = harness(role);
    try {
      assert.equal(h.w.document.getElementById('exportBtn').nextElementSibling.querySelector('button'), h.el('Btn'));
      assert.equal(h.calls.length, 0);
      await h.open();
      assert.equal(h.calls[0].url.pathname, '/api/categories');
      assert.equal(h.calls[0].url.search, '?event_id=1');
      assert.equal(h.rankingCalls().length, 0);
      assert.equal(h.el('Select').options[1].textContent, 'Solos');
      assert.equal(h.el('Select').options[2].value, '8');
      h.choose(4); await h.view();
      assert.equal(h.rankingCalls().length, 1);
      assert.equal(h.rankingCalls()[0].url.search, '?event_id=1&category_id=4');
      assert.equal(h.el('CategoryName').textContent, 'Solos');
      assert.equal(h.el('Rows').rows.length, 3, 'a participant in two styles retains both entries');
      assert.deepEqual([...h.el('Rows').rows].map(row => row.cells[0].textContent), ['1', '1', '3']);
      assert.deepEqual([...h.el('Rows').rows].map(row => row.cells[2].textContent), ['Jazz', 'Ballet', 'Jazz']);
      assert.equal(h.el('Rows').rows[0].cells[3].textContent, '25.50');
      assert.equal(h.el('Rows').querySelector('img'), null);
      assert.equal(h.el('Notice').textContent, 'Clasificación provisional. Pendientes de finalizar: Ballet.');
      assert.equal(h.el('Btn').getAttribute('aria-expanded'), 'false');
      assert.equal(h.el('Body').getAttribute('aria-busy'), 'false');
      for (const call of h.calls) {
        assert.equal(call.headers.authorization, 'Bearer test-token');
        assert.equal(call.headers['accept-language'], 'es');
        assert.equal(call.headers['x-event-id'], role === 'admin' ? '1' : undefined);
      }
    } finally { h.close(); }
  });
}

test('finished categories replace the provisional notice and old rows with final results', async () => {
  const h = harness();
  try {
    await h.open(); h.choose(4); await h.view(); h.dismiss();
    assert.equal(h.w.document.activeElement, h.el('Btn'));
    await h.open(); h.choose(8); await h.view();
    assert.equal(h.el('Rows').rows.length, 1);
    assert.equal(h.el('CategoryName').textContent, 'Grupos <unsafe>');
    assert.equal(h.el('Notice').textContent, 'Clasificación definitiva');
    assert.equal(h.el('Notice').classList.contains('alert-warning'), false);
    assert.equal(h.el('Rows').rows[0].cells[1].textContent, 'Grupo B');
  } finally { h.close(); }
});

test('pending styles with no votes are disclosed even when the ranking is empty', async () => {
  const h = harness();
  try {
    h.rankings[4].ranking = [];
    h.rankings[4].pending_styles.push({ style_id: 9, style_name: '<Contemporáneo>' });
    await h.open(); h.choose(4); await h.view();
    assert.match(h.el('Notice').textContent, /Ballet, <Contemporáneo>/);
    assert.equal(h.el('Notice').querySelector('contemporáneo'), null);
    assert.equal(h.el('Empty').classList.contains('d-none'), false);
    assert.equal(h.el('TableWrap').classList.contains('d-none'), true);
    assert.equal(h.el('Notice').classList.contains('d-none'), false);
  } finally { h.close(); }
});

for (const status of [400, 404]) {
  test(`HTTP ${status}: shows the API error and retries the same category`, async () => {
    const h = harness();
    try {
      h.overrides['/api/competitions/general-ranking'] = () => ({ status, data: { error: `Error traducido ${status}` } });
      await h.open(); h.choose(4); await h.view();
      assert.equal(h.el('Error').textContent, `Error traducido ${status}`);
      assert.equal(h.el('Rows').rows.length, 0);
      assert.equal(h.el('Retry').classList.contains('d-none'), false);
      delete h.overrides['/api/competitions/general-ranking'];
      h.el('Retry').click(); await tick();
      assert.equal(h.rankingCalls().length, 2);
      assert.equal(h.rankingCalls()[1].url.searchParams.get('category_id'), '4');
      assert.equal(h.el('Rows').rows.length, 3);
      assert.equal(h.el('Error').classList.contains('d-none'), true);
    } finally { h.close(); }
  });
}

test('category loading failures stay in the dropdown and support retry', async () => {
  const h = harness();
  try {
    h.overrides['/api/categories'] = () => ({ status: 403, data: { error: 'Sin acceso a categorías' } });
    await h.open();
    assert.equal(h.el('MenuError').textContent, 'Sin acceso a categorías');
    assert.equal(h.el('Select').disabled, true);
    assert.equal(h.el('ViewBtn').disabled, true);
    delete h.overrides['/api/categories'];
    h.el('CategoriesRetry').click(); await tick();
    assert.equal(h.el('Select').disabled, false);
    h.choose(4); await h.view();
    assert.equal(h.rankingCalls().length, 1);
  } finally { h.close(); }
});

test('empty event categories and invalid selections cannot request a ranking', async () => {
  const h = harness();
  try {
    h.categories = [];
    await h.open();
    assert.match(h.el('MenuStatus').textContent, /No hay categorías/);
    assert.equal(h.el('ViewBtn').disabled, true);
    h.el('Form').dispatchEvent(new h.w.Event('submit', { cancelable: true })); await tick();
    assert.equal(h.rankingCalls().length, 0);
    h.w.bootstrap.Dropdown.getOrCreateInstance(h.el('Btn')).hide();
    h.categories = [{ id: 4, name: 'Solos' }];
    await h.open();
    h.el('Form').dispatchEvent(new h.w.Event('submit', { cancelable: true })); await tick();
    assert.equal(h.rankingCalls().length, 0);
    h.el('Select').add(new h.w.Option('Invalid category', '999'));
    h.choose(999);
    h.el('Form').dispatchEvent(new h.w.Event('submit', { cancelable: true })); await tick();
    assert.equal(h.rankingCalls().length, 0);
    h.choose(4); h.event.id = 0;
    await h.view();
    assert.equal(h.rankingCalls().length, 0);
  } finally { h.close(); }
});

test('duplicate submits are blocked and closing discards an older response before opening another category', async () => {
  const h = harness();
  try {
    let release;
    h.overrides['/api/competitions/general-ranking'] = () => new Promise(resolve => { release = resolve; });
    await h.open(); h.choose(4); await h.view();
    h.el('Form').dispatchEvent(new h.w.Event('submit', { cancelable: true })); await tick();
    assert.equal(h.rankingCalls().length, 1);
    h.dismiss();
    assert.equal(h.rankingCalls()[0].signal.aborted, true);
    delete h.overrides['/api/competitions/general-ranking'];
    await h.open(); h.choose(8); await h.view();
    release({ data: h.rankings[4] }); await tick();
    assert.equal(h.el('Rows').rows.length, 1);
    assert.equal(h.el('Rows').rows[0].cells[1].textContent, 'Grupo B');
    assert.equal(h.el('CategoryName').textContent, 'Grupos <unsafe>');
  } finally { h.close(); }
});

test('an event change rejects an in-flight result instead of displaying a foreign ranking', async () => {
  const h = harness();
  try {
    let release;
    h.overrides['/api/competitions/general-ranking'] = () => new Promise(resolve => { release = resolve; });
    await h.open(); h.choose(4); await h.view();
    h.event.id = 2;
    release({ data: h.rankings[4] }); await tick();
    assert.equal(h.el('Rows').rows.length, 0);
    assert.match(h.el('Error').textContent, /evento no está disponible/);
  } finally { h.close(); }
});

test('the ranking translations exist in every supported language', () => {
  const keys = Object.keys(languages.es).filter(key => key.startsWith('tracking_general_ranking_'));
  for (const language of Object.values(languages)) {
    assert.deepEqual(Object.keys(language).filter(key => key.startsWith('tracking_general_ranking_')), keys);
    assert.ok(language.tracking_general_ranking_provisional.includes('{styles}'));
    keys.forEach(key => assert.ok(language[key].length));
  }
});
