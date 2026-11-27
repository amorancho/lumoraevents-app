// Functional DOM checks only: no rendering, previews or screenshots.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '../js/registration.js'), 'utf8');
const sidebarSource = source.slice(source.indexOf('function getRegistrationSidebarCopy()'), source.indexOf('function hideRegistrationSidebarOffcanvas()'));

function harness({ savedMode, blockedStorage = false, payment = true, open = true } = {}) {
  const dom = new JSDOM('<div class="registration-layout"><div id="registrationSidebarMount"></div></div><div id="registrationSidebarToggle"></div>', {
    url: 'https://lumora.test/registration.html', runScripts: 'outside-only'
  });
  const w = dom.window;
  if (savedMode) w.localStorage.setItem('registrationSidebarMode', savedMode);
  if (blockedStorage) Object.defineProperty(w, 'localStorage', { get() { throw new Error('Storage denied'); } });
  const tooltips = new Map();
  w.bootstrap = { Tooltip: {
    getInstance: element => tooltips.get(element),
    getOrCreateInstance(element) {
      if (!tooltips.has(element)) tooltips.set(element, {
        enabled: true, enable() { this.enabled = true; }, disable() { this.enabled = false; },
        setContent() {}, dispose() { tooltips.delete(element); }
      });
      return tooltips.get(element);
    }
  } };
  w.t = (_key, fallback) => fallback;
  w.getEvent = () => ({ start: '2026-11-07', end: '2026-11-08', registrationStart: '2026-10-01', registrationEnd: '2026-11-06' });
  w.getRegistrationSidebarStatusInfo = () => ({ label: open ? 'Registrations open' : 'Registrations closed', state: open ? 'open' : 'closed', icon: open ? 'bi-unlock-fill' : 'bi-lock-fill' });
  w.formatRegistrationSidebarRange = (start, end) => `${start} - ${end}`;
  w.hasRegistrationPaymentInstructions = () => payment;
  w.escapeRegistrationTooltipHtml = value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  w.disposeTooltipInstances = instances => { instances.forEach(instance => instance.dispose()); return []; };
  w.getVisibleRegistrationNavItems = () => [{ key: 'dashboard', icon: 'bi-house', labelKey: 'dashboard', fallbackLabel: 'Dashboard' }];
  w.registrationNavigationState = { activeKey: 'dashboard' };
  w.eval(sidebarSource);
  w.renderRegistrationSidebar('organizer');
  return { w, dom, tooltips, mount: w.document.getElementById('registrationSidebarMount'), layout: w.document.querySelector('.registration-layout') };
}

test('mode button cycles all three choices, persists them and restores the choice on reload', () => {
  const h = harness();
  const button = h.mount.querySelector('.registration-sidebar-mode');
  const nav = h.mount.querySelector('[data-registration-nav-key]');
  assert.equal(h.layout.dataset.sidebarMode, 'open');
  assert.equal(h.tooltips.get(nav).enabled, false);
  assert.match(button.getAttribute('aria-label'), /Always expanded.*Always collapsed/);
  assert.equal(button.textContent.trim(), '');
  const fullInfo = h.mount.querySelector('.registration-sidebar-full-info');
  assert.ok(fullInfo.querySelector('.registration-sidebar-status span').textContent.includes('Registrations open'));
  assert.ok(fullInfo.querySelector('.registration-sidebar-meta-value').textContent.includes('2026-11-07'));
  assert.ok(fullInfo.querySelector('.registration-bases-document-link span'));
  assert.ok(fullInfo.querySelector('[data-bs-target="#registrationPaymentInstructionsModal"] span'));
  button.click();
  assert.equal(h.layout.dataset.sidebarMode, 'closed');
  assert.equal(h.w.localStorage.getItem('registrationSidebarMode'), 'closed');
  assert.equal(h.tooltips.get(nav).enabled, true);
  button.click();
  assert.equal(h.layout.dataset.sidebarMode, 'hover');
  assert.equal(h.tooltips.get(nav).enabled, false);
  const reloaded = harness({ savedMode: h.w.localStorage.getItem('registrationSidebarMode') });
  assert.equal(reloaded.layout.dataset.sidebarMode, 'hover');
  reloaded.dom.window.close();
  button.click();
  assert.equal(h.layout.dataset.sidebarMode, 'open');
  h.dom.window.close();
});

test('invalid or unavailable storage does not prevent changing modes', () => {
  for (const options of [{ savedMode: 'invalid' }, { blockedStorage: true }]) {
    const h = harness(options);
    assert.equal(h.layout.dataset.sidebarMode, 'open');
    h.mount.querySelector('.registration-sidebar-mode').click();
    assert.equal(h.layout.dataset.sidebarMode, 'closed');
    h.dom.window.close();
  }
});

test('desktop icon header exposes status and dates and retains rules and payment actions', () => {
  const h = harness({ open: false });
  const indicator = h.mount.querySelector('.registration-sidebar-indicator');
  assert.equal(indicator.dataset.state, 'closed');
  assert.equal(indicator.getAttribute('aria-label'), 'Registrations closed');
  assert.equal(indicator.tabIndex, 0);
  assert.ok([...h.mount.querySelectorAll('[data-bs-title]')].some(el => el.dataset.bsTitle.includes('2026-11-07 - 2026-11-08')));
  assert.ok(h.mount.querySelector('.registration-bases-document-link'));
  assert.ok(h.mount.querySelector('[data-bs-toggle="modal"][data-bs-target="#registrationPaymentInstructionsModal"]'));
  assert.equal(h.mount.querySelector('[data-registration-nav-key]').getAttribute('aria-current'), 'page');
  assert.equal(h.mount.querySelector('[data-registration-nav-key]').getAttribute('aria-label'), 'Dashboard');
  h.dom.window.close();
  const noPayment = harness({ payment: false });
  assert.equal(noPayment.mount.querySelector('[data-bs-target="#registrationPaymentInstructionsModal"]'), null);
  noPayment.dom.window.close();
});

test('mobile retains the original expanded header without desktop mode controls or nav tooltips', () => {
  const h = harness({ savedMode: 'closed' });
  const mobile = h.w.document.getElementById('registrationSidebarToggle');
  assert.equal(mobile.querySelector('.registration-sidebar-mode'), null);
  assert.equal(mobile.querySelector('[data-sidebar-nav-tooltip]'), null);
  assert.ok(mobile.querySelector('.registration-sidebar-meta-value').textContent.includes('2026-11-07'));
  assert.equal(mobile.querySelector('.registration-sidebar-status span').textContent, 'Registrations open');
  assert.ok(mobile.querySelector('[data-bs-toggle="offcanvas"]'));
  const before = mobile.innerHTML;
  h.mount.querySelector('.registration-sidebar-mode').click();
  assert.equal(mobile.innerHTML, before);
  h.dom.window.close();
});

test('workshop status uses its own inclusive dates, falls back per missing date and appears only when enabled', () => {
  const h = harness();
  const w = h.w;
  try {
    w.eval(source.slice(source.indexOf('function getRegistrationSidebarStatusInfo('), source.indexOf('function getRegistrationSidebarCopy()')));
    w.getRegistrationDayDate = value => {
      if (!value) return null;
      const [year, month, day] = value.slice(0, 10).split('-').map(Number);
      return new w.Date(year, month - 1, day);
    };
    const now = new w.Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const event = { hasWorkshopsServices: true, registrationStart: '2000-01-01', registrationEnd: '2099-12-31' };
    w.getEvent = () => event;
    for (const [start, end, state] of [
      ['2000-01-01', '2001-01-01', 'closed'],
      ['2098-01-01', '2099-01-01', 'closed'],
      [today, today, 'open'],
      ['', '', 'open'],
      [null, '2001-01-01', 'closed'],
      ['2098-01-01', undefined, 'closed']
    ]) {
      event.regWsStart = start; event.regWsEnd = end;
      w.renderRegistrationSidebar('school');
      for (const parent of [h.mount, w.document.getElementById('registrationSidebarToggle')]) {
        const badges = parent.querySelectorAll('.registration-sidebar-status');
        assert.equal(badges.length, 2);
        assert.equal(badges[0].dataset.state, 'open');
        assert.equal(badges[1].dataset.state, state);
        assert.equal(badges[1].textContent.trim(), state === 'open' ? 'Insc. workshops abierta' : 'Insc. workshops cerrada');
      }
    }
    event.hasWorkshopsServices = false;
    w.renderRegistrationSidebar('school');
    assert.equal(h.mount.querySelectorAll('.registration-sidebar-status').length, 1);
  } finally { h.dom.window.close(); }
});
