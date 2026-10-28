// Functional DOM/API tests only: no browser rendering, previews or screenshots.
// Requires jsdom 26; see tests/README.md for installing it outside the repository.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const tick = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
const rows = [
  { rowNumber: 2, first_name: 'Ana <unsafe>', last_name: 'Pérez', date_of_birth: '1984-05-15', identification_document: '00123456Z', valid: true, error: null },
  { rowNumber: 3, first_name: 'Bea', last_name: null, date_of_birth: 'invalid date', identification_document: '98765432X', valid: false, error: 'Fila 3: El apellido es obligatorio. <unsafe>' }
];
const analysis = { participants: rows, summary: { total: 2, valid: 1, invalid: 1 } };
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });

async function harness({ source = 'WOP', role = 'school' } = {}) {
  const dom = new JSDOM(read('registration.html'), { url: 'http://localhost/registration.html', runScripts: 'outside-only' });
  const w = dom.window;
  const event = { id: 34, registrationImportSource: source };
  const calls = [], messages = [];
  let analyze = async () => response(analysis);
  let confirm = async () => response({ inserted: 1, ids: [101] }, 201);
  w.API_BASE_URL = 'http://localhost:3000';
  w.getUserFromToken = () => ({ id: 12, role });
  w.getEvent = () => event;
  w.getCurrentAppLanguage = () => w.document.documentElement.lang || 'es';
  w.t = (key, fallback) => JSON.parse(read(`lang/registration.${w.getCurrentAppLanguage()}.json`))[key] ?? fallback ?? key;
  w.countries = [];
  w.bindTableTsvExportButton = () => {};
  w.showMessageModal = (message, title, type) => messages.push({ message, title, type });
  w.fetch = async (url, options = {}) => {
    const call = { url: new URL(url), options };
    calls.push(call);
    if (call.url.pathname.endsWith('/analize-participants-file')) return analyze(call);
    if (call.url.pathname.endsWith('/create-participants')) return confirm(call);
    if (call.url.pathname === '/api/participants' || call.url.pathname === '/api/schools') return response([]);
    throw new Error(`Unexpected API request: ${url}`);
  };
  const modals = new Map();
  w.bootstrap = { Modal: class {
    constructor(element) { this.element = element; modals.set(element.id, this); }
    show() {
      this.element.classList.add('show');
      this.element.dispatchEvent(new w.Event('shown.bs.modal'));
    }
    hide() {
      if (!this.element.dispatchEvent(new w.Event('hide.bs.modal', { cancelable: true }))) return;
      this.element.classList.remove('show');
      queueMicrotask(() => this.element.dispatchEvent(new w.Event('hidden.bs.modal')));
    }
  } };
  const addListener = w.document.addEventListener.bind(w.document);
  w.document.addEventListener = (name, ...args) => { if (name !== 'DOMContentLoaded') addListener(name, ...args); };
  vm.runInContext(read('js/registration.js'), dom.getInternalVMContext());
  w.initParticipantsTab(role);
  await tick();
  const el = id => w.document.getElementById(id);
  return {
    w, event, calls, messages, el, modals,
    setAnalyze: handler => { analyze = handler; },
    setConfirm: handler => { confirm = handler; },
    open: () => el('importParticipantsOpenBtn').click(),
    select(name = 'participants.xlsx', size = 16) {
      const file = new w.File(['excel'], name);
      Object.defineProperty(file, 'size', { value: size });
      Object.defineProperty(el('importWopParticipantsFile'), 'files', { configurable: true, value: [file] });
      el('importWopParticipantsFile').dispatchEvent(new w.Event('change'));
      return file;
    },
    waitAnalysis: tick,
    async confirm() { el('confirmImportWopParticipantsBtn').click(); await tick(); },
    close: () => w.close()
  };
}

test('import source selects WOP or the original modal, retaining school permissions', async () => {
  for (const source of ['GEN', null, 'WOP']) {
    const h = await harness({ source });
    try {
      h.open();
      assert.equal(h.el('importWopParticipantsModal').classList.contains('show'), source === 'WOP');
      assert.equal(h.el('importParticipantsModal').classList.contains('show'), source !== 'WOP');
    } finally { h.close(); }
  }
  const h = await harness({ role: 'organizer' });
  try {
    h.open();
    assert.ok(h.el('importParticipantsOpenBtn').classList.contains('d-none'));
    assert.equal(h.el('importWopParticipantsModal').classList.contains('show'), false);
  } finally { h.close(); }
});

test('file validation enforces Excel, nonempty content and the 5 MB boundary', async () => {
  const h = await harness();
  try {
    h.open();
    for (const [name, size] of [['file.csv', 10], ['file.xlsx', 0], ['file.xls', 5 * 1024 * 1024 + 1]]) {
      h.select(name, size);
      assert.equal(h.el('importWopParticipantsFile').getAttribute('aria-invalid'), 'true');
      await tick();
    }
    assert.equal(h.calls.filter(call => call.options.method === 'POST').length, 0);
    h.select('FILE.XLSX', 5 * 1024 * 1024);
    await h.waitAnalysis();
    assert.equal(h.calls.filter(call => call.options.method === 'POST').length, 1);
    assert.equal(h.el('importWopParticipantsFile').hasAttribute('aria-invalid'), false);
  } finally { h.close(); }
});

test('analysis uploads only the original file and renders server data safely with exact dates and documents', async () => {
  const h = await harness();
  try {
    h.open();
    h.w.document.documentElement.lang = 'fr';
    const file = h.select();
    await h.waitAnalysis();
    assert.equal(h.el('analyzeImportWopParticipantsBtn'), null);
    const call = h.calls.find(call => call.url.pathname.endsWith('/analize-participants-file'));
    assert.equal(call.url.searchParams.get('event_id'), '34');
    assert.equal(call.options.headers['Accept-Language'], 'fr');
    assert.equal(call.options.headers['Content-Type'], undefined);
    assert.deepEqual(Array.from(call.options.body.keys()), ['file']);
    assert.equal(call.options.body.get('file').name, file.name);
    const rendered = h.el('importWopParticipantsPreviewTableBody');
    assert.equal(rendered.rows.length, 2);
    assert.deepEqual(Array.from(rendered.rows[0].cells).slice(0, 4).map(cell => cell.textContent), ['Ana <unsafe>', 'Pérez', '1984-05-15', '00123456Z']);
    assert.match(rendered.rows[1].textContent, /invalid date/);
    assert.match(rendered.rows[1].textContent, /El apellido es obligatorio/);
    assert.equal(rendered.querySelector('unsafe'), null);
    assert.deepEqual(['Total', 'Valid', 'Invalid'].map(key => h.el(`importWopParticipantsPreview${key}`).textContent), ['2', '1', '1']);
    assert.equal(h.el('confirmImportWopParticipantsBtn').disabled, false);
  } finally { h.close(); }
});

test('empty analysis and analyses without valid rows cannot be confirmed', async () => {
  for (const participants of [[], [rows[1]]]) {
    const h = await harness();
    try {
      h.setAnalyze(async () => response({ participants }));
      h.open(); h.select(); await h.waitAnalysis(); await h.confirm();
      assert.equal(h.el('confirmImportWopParticipantsBtn').disabled, true);
      assert.equal(h.el('importWopParticipantsPreviewEmpty').classList.contains('d-none'), participants.length > 0);
      assert.equal(h.calls.some(call => call.url.pathname.endsWith('/create-participants')), false);
    } finally { h.close(); }
  }
});

test('confirmation submits valid rows only, closes on 201, reloads participants and uses the inserted count', async () => {
  const h = await harness();
  try {
    const secondValid = { ...rows[0], rowNumber: 4, identification_document: null };
    h.setAnalyze(async () => response({ participants: [...rows, secondValid] }));
    h.setConfirm(async () => response({ inserted: 2, ids: [101, 102] }, 201));
    h.open(); h.select(); await h.waitAnalysis();
    const readsBefore = h.calls.filter(call => call.url.pathname === '/api/participants').length;
    await h.confirm();
    const call = h.calls.find(call => call.url.pathname.endsWith('/create-participants'));
    assert.equal(call.options.headers['Content-Type'], 'application/json');
    assert.equal(call.options.headers['Accept-Language'], 'es');
    const body = JSON.parse(call.options.body);
    assert.equal(body.event_id, 34);
    assert.equal(body.school_id, 12);
    assert.deepEqual(body.participants, [rows[0], secondValid].map(({ valid, error, ...participant }) => participant));
    assert.equal(h.el('importWopParticipantsModal').classList.contains('show'), false);
    assert.equal(h.calls.filter(call => call.url.pathname === '/api/participants').length, readsBefore + 1);
    assert.equal(h.messages.at(-1).type, 'success');
    assert.match(h.messages.at(-1).message, /2/);
    h.open();
    assert.equal(h.el('confirmImportWopParticipantsBtn').disabled, true);
    assert.equal(h.el('importWopParticipantsFile').value, '');
  } finally { h.close(); }
});

test('API errors remain in the modal and restore controls without refreshing participants', async () => {
  for (const stage of ['analysis', 'confirm']) {
    for (const status of [400, 404, 500]) {
      const h = await harness();
      try {
        h.open();
        const message = `Fila 3: Error ${status} <unsafe>`;
        if (stage === 'analysis') h.setAnalyze(async () => response({ error: message }, status));
        else h.setConfirm(async () => response({ error: message }, status));
        h.select(); await h.waitAnalysis();
        const readsBefore = h.calls.filter(call => call.url.pathname === '/api/participants').length;
        if (stage === 'confirm') await h.confirm();
        assert.equal(h.el('importWopParticipantsFeedback').textContent, message);
        assert.equal(h.el('importWopParticipantsFeedback').querySelector('unsafe'), null);
        assert.equal(h.el('importWopParticipantsModal').classList.contains('show'), true);
        assert.equal(h.el('importWopParticipantsFile').disabled, false);
        assert.equal(h.el('confirmImportWopParticipantsBtn').disabled, stage === 'analysis');
        assert.equal(h.calls.filter(call => call.url.pathname === '/api/participants').length, readsBefore);
        assert.equal(h.messages.length, 0);
        if (stage === 'analysis') {
          assert.equal(h.el('importWopParticipantsFile').value, '');
          h.setAnalyze(async () => response(analysis));
          h.select(); await h.waitAnalysis();
          assert.equal(h.el('confirmImportWopParticipantsBtn').disabled, false);
        }
      } finally { h.close(); }
    }
  }
});

test('in-flight requests prevent duplicate submissions, file changes and dismissing the modal', async () => {
  const h = await harness();
  try {
    h.open();
    for (const stage of ['analysis', 'confirm']) {
      let resolve;
      const pending = new Promise(done => { resolve = done; });
      if (stage === 'analysis') h.setAnalyze(() => pending);
      else h.setConfirm(() => pending);
      if (stage === 'analysis') {
        h.select();
        h.el('importWopParticipantsFile').dispatchEvent(new h.w.Event('change'));
        assert.equal(h.el('importWopParticipantsAnalyzing').classList.contains('d-none'), false);
      } else {
        const button = h.el('confirmImportWopParticipantsBtn');
        button.click();
        button.dispatchEvent(new h.w.Event('click'));
      }
      h.modals.get('importWopParticipantsModal').hide();
      assert.equal(h.el('importWopParticipantsModal').classList.contains('show'), true);
      assert.equal(h.el('importWopParticipantsFile').disabled, true);
      assert.equal(h.el('confirmImportWopParticipantsBtn').disabled, true);
      const endpoint = stage === 'analysis' ? '/analize-participants-file' : '/create-participants';
      assert.equal(h.calls.filter(call => call.url.pathname.endsWith(endpoint)).length, 1);
      resolve(stage === 'analysis' ? response(analysis) : response({ inserted: 1, ids: [101] }, 201));
      await tick();
    }
  } finally { h.close(); }
});

test('replacing a file invalidates its prior analysis, and closing clears the selection and feedback', async () => {
  const h = await harness();
  try {
    h.open(); h.select(); await h.waitAnalysis();
    h.select('replacement.xls');
    assert.equal(h.el('confirmImportWopParticipantsBtn').disabled, true);
    assert.equal(h.el('importWopParticipantsPreviewWrap').classList.contains('d-none'), true);
    await h.waitAnalysis();
    h.select('wrong.csv');
    h.modals.get('importWopParticipantsModal').hide(); await tick(); h.open();
    assert.equal(h.el('importWopParticipantsFileError').textContent, '');
    assert.equal(h.el('importWopParticipantsFile').value, '');
  } finally { h.close(); }
});
