// Functional DOM and interaction checks only; no rendering or screenshots.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const shared = read('js/registration.js');
const source = read('js/registration-competitions.js');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));

function harness({ status = 'CRE', max = 2, members = [], event = {} } = {}) {
  const dom = new JSDOM(read('registration.html'), { runScripts: 'outside-only' });
  const w = dom.window;
  const document = w.document;
  const people = [
    { id: 1, name: 'Ana Pérez', date_of_birth: '2012-01-02', gender: 'F', has_authorization: true, price: 15 },
    { id: 2, name: 'Adult Person', date_of_birth: '2000-02-03', gender: 'M', price: 20 },
    { id: 3, name: '<Missing date>', date_of_birth: null }
  ];
  const ids = {
    participantSelect: 'registrationParticipantSelect', addMemberBtn: 'addRegistrationMemberBtn',
    membersTable: 'registrationMembersTable', membersMobileCards: 'registrationMembersMobileCards',
    memberPicker: 'registrationMemberPicker', memberSearch: 'registrationMemberSearch',
    availableMembers: 'registrationAvailableMembers', availableMembersEmpty: 'registrationAvailableMembersEmpty',
    membersCount: 'registrationMembersCount', membersEmpty: 'registrationMembersEmpty',
    membersSaveBtn: 'registrationMembersSaveBtn'
  };
  w.elements = Object.fromEntries(Object.entries(ids).map(([key, id]) => [key, document.getElementById(id)]));
  w.membersModalEl = document.getElementById('registrationMembersModal');
  w.registrationState = { participants: people };
  w.people = people;
  w.initialMembers = members.map(index => people[index]);
  w.initialStatus = status;
  w.category = { min_par: 1, max_par: max };
  w.getMembersCategory = () => w.category;
  w.getEvent = () => ({ start: '2026-11-18', ...event });
  w.getRegistrationAgeReferenceDate = () => '2026-11-18';
  w.getRegistrationAgeTooltipText = () => 'Event date: 2026-11-18';
  w.getDateOnlyValue = date => date || '';
  w.calculateAge = date => date ? 2026 - Number(date.slice(0, 4)) : '-';
  w.getMemberAgeValue = member => w.calculateAge(member.date_of_birth);
  w.getMemberAgeRangeStatus = member => member.id === 1 ? 'below' : 'above';
  w.isRegistrationMinorAge = age => age !== '-' && Number(age) < 18;
  w.formatRegistrationBirthDate = date => date || '-';
  w.registrationParticipantHasAuthorization = person => person.has_authorization === true;
  w.formatCurrencyDisplay = amount => `${amount} EUR`;
  w.normalizeNumber = value => value == null || value === '' ? null : Number(value);
  w.t = (_key, fallback) => fallback;
  w.errors = [];
  w.showMessageModal = message => w.errors.push(message);
  w.formatTemplate = (value, params) => value.replace(/\{(\w+)\}/g, (_, key) => params[key]);
  w.eval(shared.slice(shared.indexOf('function appendRegistrationAuthorizationStatus('), shared.indexOf('function getRegistrationAgeReferenceDate(')));
  w.eval(`
    const isSchoolUser = true;
    let membersRegistration = { status: initialStatus };
    let membersCategoryId = null;
    let selectedMembers = initialMembers.map(member => ({ ...member }));
    const participantsById = new Map(people.map(person => [String(person.id), person]));
    let participantSelect = null;
    ${section('  const areMembersReadOnly =', '  const ensureParticipantsLoaded =')}
    ${section('  const addMember =', '  const validateRegistration =')}
    ${section('  const openMembersModal =', '  const updateMembersChoreoInfo =')}
    window.openMembersForTest = openMembersModal;
    ${section('  if (elements.addMemberBtn) {', '  if (elements.membersTable)')}
    window.membersTest = {
      render() { renderMembersTable(); refreshParticipantSelect(); },
      get selected() { return selectedMembers; },
      add: addMember,
      setStatus(status) { membersRegistration.status = status; this.render(); }
    };
    membersTest.render();
  `);
  return { w, document, elements: w.elements, dom };
}

test('available cards show names, birth dates and minors, and search ignores accents', () => {
  const h = harness();
  const cards = h.elements.availableMembers.children;
  assert.equal(cards.length, 3);
  assert.match(cards[0].textContent, /Ana Pérez.*2012-01-02.*MINOR/);
  assert.equal(cards[1].querySelector('.badge'), null);
  assert.equal(cards[2].querySelector('.badge'), null);
  assert.equal(cards[2].querySelector('Missing'), null);
  h.elements.memberSearch.value = 'ANA PEREZ';
  h.elements.memberSearch.dispatchEvent(new h.w.Event('input'));
  assert.equal(h.elements.availableMembers.children.length, 1);
  h.elements.memberSearch.value = 'no match';
  h.elements.memberSearch.dispatchEvent(new h.w.Event('input'));
  assert.equal(h.elements.availableMembers.children.length, 0);
  assert.equal(h.elements.availableMembersEmpty.classList.contains('d-none'), false);
  h.dom.window.close();
});

test('card clicks add members once, respect capacity and allow removing from mobile cards', () => {
  const h = harness({ max: 1 });
  h.elements.availableMembers.querySelector('[data-id="1"] .registration-member-option-name').click();
  assert.equal(h.w.membersTest.selected.length, 1);
  assert.equal(h.elements.availableMembers.querySelector('[data-id="1"]'), null);
  assert.equal(h.elements.membersTable.rows.length, 1);
  assert.equal(h.elements.membersMobileCards.children.length, 1);
  assert.equal(h.elements.membersMobileCards.firstChild.dataset.ageRange, 'below');
  assert.equal(h.elements.membersCount.textContent, '1');
  assert.ok([...h.elements.availableMembers.querySelectorAll('button')].every(button => button.disabled));
  h.w.membersTest.add('2');
  assert.equal(h.w.membersTest.selected.length, 1);
  assert.equal(h.w.errors.length, 1);
  h.elements.membersMobileCards.querySelector('.btn-remove-member').click();
  assert.equal(h.w.membersTest.selected.length, 0);
  assert.equal(h.elements.membersMobileCards.children.length, 0);
  assert.equal(h.elements.membersEmpty.classList.contains('d-none'), false);
  assert.equal(h.elements.availableMembers.querySelectorAll('button').length, 3);
  assert.ok([...h.elements.availableMembers.querySelectorAll('button')].every(button => !button.disabled));
  h.dom.window.close();
});

test('validated inscriptions hide selection and removal, and reject direct additions', () => {
  const h = harness({ status: 'VAL', members: [0] });
  assert.ok(h.elements.memberPicker.classList.contains('d-none'));
  assert.ok(h.elements.membersSaveBtn.disabled);
  assert.equal(h.elements.membersMobileCards.querySelector('button'), null);
  h.w.membersTest.add('2');
  assert.equal(h.w.membersTest.selected.length, 1);
  h.dom.window.close();
});

test('the mobile dropdown still adds a participant with the existing Add button', () => {
  const h = harness();
  h.elements.participantSelect.value = '2';
  h.elements.addMemberBtn.click();
  assert.equal(h.w.membersTest.selected.length, 1);
  assert.equal(h.w.membersTest.selected[0].id, 2);
  assert.equal(h.elements.membersMobileCards.children.length, 1);
  h.dom.window.close();
});

test('organizer consultation also builds mobile cards and clears them for empty results', () => {
  const h = harness();
  h.w.getRegistrationMemberAgeRangeStatus = h.w.getMemberAgeRangeStatus;
  const start = shared.indexOf('  const renderMembersTable =', shared.indexOf('function initOrganizerRegistrationsTab('));
  const render = shared.slice(start, shared.indexOf('  const updateMembersRuleInfo =', start));
  h.w.eval(`(() => {
    const membersElements = { table: elements.membersTable, count: elements.membersCount, empty: elements.membersEmpty };
    ${render}
    window.renderOrganizerMembers = renderMembersTable;
  })()`);
  h.w.renderOrganizerMembers(h.w.people);
  assert.equal(h.elements.membersMobileCards.children.length, 3);
  assert.equal(h.elements.membersMobileCards.querySelector('button'), null);
  h.w.renderOrganizerMembers([]);
  assert.equal(h.elements.membersMobileCards.children.length, 0);
  assert.equal(h.elements.membersCount.textContent, '0');
  h.dom.window.close();
});

test('mobile cards preserve conditional gender, authorization and pending prices', () => {
  const h = harness({ event: { showGender: true, hasAuthorizations: true, registrationPricePerPax: true } });
  h.w.membersTest.add('1');
  const card = h.elements.membersMobileCards.firstChild;
  assert.match(card.textContent, /GenderF/);
  assert.match(card.textContent, /AuthorizationDocument attached/);
  assert.match(card.textContent, /AmountPend. Calcular/);
  assert.match(card.textContent, /MINOR/);
  h.dom.window.close();
});

test('opening the modal collapses the desktop picker in every status and preserves manual toggles while editing', async () => {
  const h = harness();
  h.w.loadRegistrationConfig = async () => {};
  h.w.ensureParticipantsLoaded = async () => {};
  h.w.resetMembersState = () => {};
  h.w.updateMembersRuleInfo = () => {};
  h.w.updateMembersChoreoInfo = () => {};
  h.w.resolveRegistrationMembers = async () => [];
  h.w.registrationMembersModal = { show() {} };
  assert.equal(h.elements.memberPicker.tagName, 'DETAILS');
  assert.ok(h.elements.memberPicker.querySelector('summary'));
  assert.ok(h.elements.memberPicker.contains(h.elements.memberSearch));
  assert.ok(h.elements.memberPicker.contains(h.elements.availableMembers));
  await h.w.openMembersForTest({ status: 'CRE', reg_category_id: 1 });
  assert.deepEqual(h.w.errors, []);
  assert.equal(h.elements.memberPicker.open, false);
  h.elements.memberPicker.open = true;
  h.w.membersTest.render();
  assert.equal(h.elements.memberPicker.open, true);
  for (const status of ['CRE', 'PEN', 'REJ', 'VAL', 'DEL']) {
    h.elements.memberPicker.open = true;
    await h.w.openMembersForTest({ status, reg_category_id: 1 });
    assert.equal(h.elements.memberPicker.open, false, status);
  }
  await h.w.openMembersForTest({ status: 'CRE', reg_category_id: 1 });
  assert.equal(h.elements.memberPicker.open, false);
  assert.equal(h.elements.memberPicker.classList.contains('d-none'), false);
  h.dom.window.close();
});
