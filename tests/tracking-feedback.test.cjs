// DOM and mocked API checks only; no rendering or screenshots.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

function harness({ hasFeedback = true, download, competitionId = 42 } = {}) {
  const dom = new JSDOM(`<div id="detailsModal"><h5 id="detailsModalLabel"></h5>
    <div id="criteriaContainer"></div><div class="modal-footer"></div></div>`);
  const document = dom.window.document;
  let initialize;
  document.addEventListener = (name, callback) => { if (name === 'DOMContentLoaded') initialize = callback; };
  let pauses = 0;
  dom.window.HTMLMediaElement.prototype.pause = () => { pauses++; };
  dom.window.HTMLMediaElement.prototype.load = () => {};
  const requests = [], revoked = [], errors = [];
  const context = vm.createContext({
    document, window: { matchMedia: () => ({}) },
    criteriaContainer: document.getElementById('criteriaContainer'),
    API_BASE_URL: 'https://api.example.test', URLSearchParams,
    URL: { createObjectURL: () => 'blob:feedback', revokeObjectURL: url => revoked.push(url) },
    getEvent: () => ({ id: 7 }), t: (key, fallback) => fallback ?? key,
    validateRoles() {}, WaitEventLoaded: () => new Promise(() => {}),
    getCriteriaDisplayParts: () => ({ caption: 'Technique' }),
    console: { error() {} }, showMessageModal: (...args) => errors.push(args),
    bootstrap: { Modal: { getOrCreateInstance: el => ({ _element: el, show() {} }) } },
    fetch: async url => {
      requests.push(url);
      if (url.includes('/api/voting?')) return { ok: true, json: async () => ({
        competition: { id: competitionId }, criteria: [{ name: 'Technique' }],
        dancers: [{ id: 9, has_feedback: hasFeedback, scores: { Technique: 8 }, totalScore: 8, comments: 'Well done' }]
      }) };
      return download ? download() : { ok: true, blob: async () => ({}) };
    }
  });
  vm.runInContext(fs.readFileSync(require.resolve('../js/tracking.js'), 'utf8'), context);
  initialize(); // Registers modal cleanup, then waits for the event session.
  const show = () => context.showVoteDetails(1, 2, 17, 9, 'row', 'Dancer', 'Judge');
  const settle = () => new Promise(resolve => setImmediate(resolve));
  const close = () => document.getElementById('detailsModal').dispatchEvent(new dom.window.Event('hide.bs.modal'));
  return { context, document, requests, revoked, errors, show, settle, close, pauses: () => pauses };
}

test('downloads the selected judge audio and appends the player after written feedback', async () => {
  const h = harness();
  await h.show();
  await h.settle();
  const url = new URL(h.requests[1]);
  assert.equal(url.pathname, '/api/competitions/42/feedback/download');
  assert.equal(url.searchParams.get('event_id'), '7');
  assert.equal(url.searchParams.get('judge_id'), '17');
  assert.equal(url.searchParams.get('dancer_id'), '9');
  const lastSection = h.document.getElementById('criteriaContainer').lastElementChild;
  const player = lastSection.querySelector('audio');
  assert.equal(player.src, 'blob:feedback');
  assert.equal(player.controls, true);
  assert.equal(lastSection.previousElementSibling.querySelector('textarea').value, 'Well done');
  h.close();
  assert.equal(h.pauses(), 1);
  assert.equal(player.hasAttribute('src'), false);
  assert.deepEqual(h.revoked, ['blob:feedback']);
});

test('does not request audio when the vote has no feedback', async () => {
  const h = harness({ hasFeedback: false });
  await h.show();
  await h.settle();
  assert.equal(h.requests.length, 1);
  assert.equal(h.document.querySelector('audio'), null);
});

test('a missing audio hides the section and preserves scores and comments', async () => {
  const h = harness({ download: () => ({ ok: false, status: 404 }) });
  await h.show();
  await h.settle();
  assert.equal(h.document.querySelector('[role="status"]'), null);
  assert.equal(h.document.querySelector('audio'), null);
  assert.equal(h.document.querySelector('textarea').value, 'Well done');
  assert.deepEqual(h.errors, []);
});

test('a download failure stays inside the modal without hiding vote details', async () => {
  const h = harness({ download: () => ({ ok: false, status: 403 }) });
  await h.show();
  await h.settle();
  assert.match(h.document.querySelector('[role="alert"]').textContent, /Error loading audio/);
  assert.equal(h.document.getElementById('totalScore').textContent, '8');
  assert.deepEqual(h.errors, []);
});

test('closing the modal discards a pending audio response', async () => {
  let finish;
  const h = harness({ download: () => new Promise(resolve => { finish = resolve; }) });
  await h.show();
  h.close();
  finish({ ok: true, blob: async () => ({}) });
  await h.settle();
  assert.equal(h.document.querySelector('audio'), null);
  assert.equal(vm.runInContext('trackingFeedbackAudioUrl', h.context), '');
});

test('reopening vote details releases the previous audio before loading another', async () => {
  const h = harness();
  await h.show();
  await h.settle();
  const previousPlayer = h.document.querySelector('audio');
  await h.show();
  await h.settle();
  assert.equal(previousPlayer.hasAttribute('src'), false);
  assert.deepEqual(h.revoked, ['blob:feedback']);
  assert.equal(h.document.querySelectorAll('audio').length, 1);
});
