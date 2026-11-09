// Functional DOM checks only; no browser rendering or screenshots. Requires jsdom 26.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const tick = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };

async function harness(role) {
  const dom = new JSDOM(read('registration.html'), { runScripts: 'outside-only', url: 'https://example.test' });
  const w = dom.window;
  const calls = [], messages = [];
  const rows = [
    { id: 1, payment_type: 'PAY', school_id: 4, school_name: 'Academy', amount: 1200, status: 'VAL', by_organizer: 1 },
    { id: 2, payment_type: 'PAY', school_id: 4, school_name: 'Academy', amount: 500, status: 'PEN', by_organizer: '1' },
    { id: 3, payment_type: 'PAY', school_id: 4, school_name: 'Academy', amount: 300, status: 'PEN', by_organizer: 0 },
    { id: 4, payment_type: 'INV', school_id: 4, school_name: 'Academy', amount: 300, by_organizer: 1 }
  ];
  Object.assign(w, {
    API_BASE_URL: 'https://example.test',
    registrationState: { schools: [{ id: 4, name: 'Academy' }, { id: 5, name: 'Other' }], school: { id: 4, event_id: 42 } },
    getEvent: () => ({ id: 42 }), getUserFromToken: () => ({ id: 99, role }),
    getRegistrationLanguage: () => 'es', t: (key, fallback) => fallback,
    formatRegistrationCurrency: value => String(value), normalizeRegistrationNumber: Number,
    getPaymentStatusValue: payment => payment.status || '',
    getRegistrationCalendarDate: () => null,
    buildRegistrationFinanceMetrics: () => ({ totalAmount: 0, unvalidatedAmount: 0, totalRegistrationsCount: 0 }),
    buildRegistrationFeeMetrics: () => ({ totalFee: 0, units: 0, type: 'NON' }),
    renderRegistrationFinanceBreakdown: () => {},
    showMessageModal: message => messages.push(message),
    fetch: async (url, options = {}) => {
      calls.push({ url, ...options });
      return { ok: true, json: async () => options.method ? {} : rows };
    },
    bootstrap: { Modal: class {
      constructor(el) { this.el = el; }
      show() { this.el.classList.add('show'); }
      hide() { this.el.classList.remove('show'); }
    } }
  });
  const addListener = w.document.addEventListener.bind(w.document);
  w.document.addEventListener = (name, ...args) => { if (name !== 'DOMContentLoaded') addListener(name, ...args); };
  w.eval(read('js/registration-payments.js'));
  w.initPaymentsTab(role);
  await tick();
  w.dispatchEvent(new w.CustomEvent('registration:panel-changed', { detail: { key: 'payments' } }));
  await tick();
  assert.deepEqual(messages, [], 'payments load without errors');
  const el = id => w.document.getElementById(id);
  const submit = async () => {
    el('registrationPaymentsCreateForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    await tick();
  };
  const file = (name, type) => Object.defineProperty(el('registrationPaymentsCreateFile'), 'files', {
    configurable: true, value: [new w.File(['test'], name, { type })]
  });
  return { w, dom, calls, messages, el, submit, file, posts: () => calls.filter(call => call.method === 'POST') };
}

test('organizer creates a payment for the selected registration school without a document', async t => {
  const h = await harness('organizer'); t.after(() => h.dom.window.close());
  assert.equal(h.el('registrationPaymentsOrganizerAddBtn').classList.contains('d-none'), false);
  h.el('registrationPaymentsOrganizerAddBtn').click(); await tick();
  assert.ok(h.el('registrationPaymentsCreateModal').classList.contains('show'));
  assert.equal(h.el('registrationPaymentsCreateSchoolField').classList.contains('d-none'), false);
  assert.equal(h.el('registrationPaymentsCreateFile').required, false);
  h.el('registrationPaymentsCreateAmount').value = '12,34';
  await h.submit();
  assert.equal(h.posts().length, 0, 'school is mandatory');
  h.el('registrationPaymentsCreateSchoolSelect').value = '5';
  h.file('invalid.txt', 'text/plain'); await h.submit();
  assert.equal(h.posts().length, 0, 'optional file must still be PDF when supplied');
  Object.defineProperty(h.el('registrationPaymentsCreateFile'), 'files', { configurable: true, value: [] });
  await h.submit();
  assert.equal(h.posts().length, 1);
  const body = h.posts()[0].body;
  assert.equal(body.get('school_id'), '5');
  assert.equal(body.get('event_id'), '42');
  assert.equal(body.get('amount'), '1234');
  assert.equal(body.get('payment_type'), 'PAY');
  assert.equal(body.get('by_organizer'), '1');
  assert.equal(body.has('payment'), false);
  assert.deepEqual(h.messages, ['Payment uploaded successfully.']);
});

test('school sees organizer badges and has no actions on organizer payments in either list', async t => {
  const h = await harness('school'); t.after(() => h.dom.window.close());
  for (const id of ['registrationPaymentsTable', 'registrationPaymentsMobileCards']) {
    const list = h.el(id);
    for (const paymentId of [1, 2]) {
      const row = list.querySelector(`[data-id="${paymentId}"]`);
      assert.match(row.textContent, /ORGANIZADOR/);
      assert.equal(row.querySelectorAll('button').length, 0);
      for (const action of ['view', 'download', 'delete', 'validate', 'reject', 'edit-amount']) {
        const button = h.w.document.createElement('button');
        button.dataset.paymentAction = action; row.appendChild(button); button.click(); button.remove();
      }
    }
    assert.equal(list.querySelector('[data-id="3"]').querySelectorAll('button').length, 3);
  }
  await tick();
  assert.equal(h.calls.length, 2, 'blocked clicks do not request any API operation');
  assert.equal(h.el('registrationInvoicesTable').querySelectorAll('button').length, 1);
});

test('school still requires a PDF and submits its own school without the organizer flag', async t => {
  const h = await harness('school'); t.after(() => h.dom.window.close());
  h.el('registrationPaymentsAddBtn').click(); await tick();
  assert.equal(h.el('registrationPaymentsCreateFile').required, true);
  assert.ok(h.el('registrationPaymentsCreateSchoolField').classList.contains('d-none'));
  h.el('registrationPaymentsCreateAmount').value = '10'; await h.submit();
  assert.equal(h.posts().length, 0);
  h.file('receipt.pdf', 'application/pdf'); await h.submit();
  assert.equal(h.posts().length, 1);
  assert.equal(h.posts()[0].body.get('school_id'), '4');
  assert.equal(h.posts()[0].body.has('by_organizer'), false);
  assert.equal(h.posts()[0].body.get('payment').name, 'receipt.pdf');
});

test('organizer invoices still require documents and payments retain organizer actions', async t => {
  const h = await harness('organizer'); t.after(() => h.dom.window.close());
  assert.equal(h.el('registrationPaymentsTable').querySelector('[data-id="1"]').querySelectorAll('button').length, 6);
  h.el('registrationPaymentsOrganizerAddBtn').click(); await tick();
  h.el('registrationInvoicesAddBtn').click(); await tick();
  assert.equal(h.el('registrationPaymentsCreateFile').required, true);
  h.el('registrationPaymentsCreateSchoolSelect').value = '4';
  h.el('registrationPaymentsCreateAmount').value = '10'; await h.submit();
  assert.equal(h.posts().length, 0);
  h.file('invoice.pdf', 'application/pdf'); await h.submit();
  assert.equal(h.posts().length, 1);
  assert.equal(h.posts()[0].body.get('payment_type'), 'INV');
  assert.equal(h.posts()[0].body.has('by_organizer'), false);
});
