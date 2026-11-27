// Functional data binding and API checks; no rendering or screenshots.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const dates = { reg_ws_start: '2026-11-01', reg_ws_end: '2026-12-15' };
const run = (dom, file) => vm.runInContext(read(file), dom.getInternalVMContext());

test('Admin retains workshop dates through layout, GET binding, create/update and form reset', async () => {
  const dom = new JSDOM(read('admin.html'), { url: 'http://localhost/admin.html', runScripts: 'outside-only' });
  const w = dom.window;
  try {
    w.document.addEventListener = () => {};
    w.API_BASE_URL = 'http://localhost';
    run(dom, 'js/admin-panel.js');
    const config = w.document.createElement('div');
    const registrations = w.document.createElement('div');
    w.document.getElementById('eventForm').append(config, registrations);
    w.rebuildEventDetailTabLayouts(config, registrations);
    for (const name of ['populateClientSelect', 'updateLogoPreview', 'updateUrlPreview', 'setEventPanelState', 'setEventWelcomeInfo', 'setLoadingButtonState', 'loadClients', 'loadEvents']) w[name] = () => {};
    w.buildOrganizerInfo = () => '';
    w.populateEventForm({ id: 58, reg_ws_start: dates.reg_ws_start + 'T00:00:00', reg_ws_end: dates.reg_ws_end + 'T23:59:59' });
    const form = w.document.getElementById('eventForm');
    for (const [key, value] of Object.entries(dates)) {
      assert.equal(registrations.querySelector(`#${key}`).value, value);
      assert.equal(w.collectEventFormData()[key], value);
    }
    for (const action of ['create', 'update']) {
      form.dataset.action = action; form.dataset.id = '58';
      let request;
      w.fetch = async (url, options) => { request = { url, ...options }; return { ok: true, json: async () => ({ id: 58 }) }; };
      await w.saveEvent();
      assert.equal(request.method, action === 'create' ? 'POST' : 'PUT');
      for (const [key, value] of Object.entries(dates)) assert.equal(JSON.parse(request.body)[key], value);
    }
    w.resetEventForm();
    for (const key of Object.keys(dates)) assert.equal(w.collectEventFormData()[key], null);
  } finally { dom.window.close(); }
});

test('Adminevent reads workshop dates from GET and sends dates or null in updates', async () => {
  const dom = new JSDOM(read('adminevent.html'), { url: 'http://localhost/adminevent.html', runScripts: 'outside-only' });
  const w = dom.window;
  try {
    w.document.addEventListener = () => {};
    w.fetch = async () => { throw new Error('Unexpected request'); };
    run(dom, 'js/utils.js');
    w.getEvent = () => ({ id: 58 });
    w.t = key => key;
    run(dom, 'js/adminevent.js');
    for (const name of ['showAlert', 'updateEventStatusUI', 'updateLogoPreview', 'setButtonLoading']) w[name] = () => {};
    w.fetch = async () => ({ ok: true, json: async () => ({ ...dates, reg_ws_start: dates.reg_ws_start + 'T00:00:00', has_registrations: 1 }) });
    await w.loadEventData(58);
    for (const [key, value] of Object.entries(dates)) assert.equal(w.document.getElementById(key).value, value);
    for (const empty of [false, true]) {
      if (empty) for (const key of Object.keys(dates)) w.document.getElementById(key).value = '';
      let request;
      w.fetch = async (url, options) => { request = { url, ...options }; return { ok: true }; };
      await w.saveEventData(58);
      assert.equal(request.method, 'PUT');
      for (const [key, value] of Object.entries(dates)) assert.equal(JSON.parse(request.body)[key], empty ? null : value);
    }
  } finally { dom.window.close(); }
});

test('Common exposes workshop booking dates on eventObj', async () => {
  const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost/admin.html?eventId=demo', runScripts: 'outside-only' });
  const w = dom.window;
  try {
    w.Headers = Headers; w.AbortController = AbortController;
    w.document.addEventListener = () => {};
    w.fetch = async () => new Response(JSON.stringify({ id: 58, code: 'demo', ...dates }));
    run(dom, 'js/utils.js'); run(dom, 'js/common.js');
    await w.WaitEventLoaded();
    assert.equal(w.getEvent().regWsStart, dates.reg_ws_start);
    assert.equal(w.getEvent().regWsEnd, dates.reg_ws_end);
  } finally { dom.window.close(); }
});
