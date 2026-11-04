const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/index.js'), 'utf8');
const context = vm.createContext({ document: { addEventListener() {} } });
vm.runInContext(source, context);
const isRegistrationOpen = vm.runInContext('isRegistrationOpen', context);

test('registration is open on both boundary dates and between them', () => {
  const event = { has_registrations: '1', registration_start: '2027-03-10', registration_end: '2027-03-12' };
  for (const day of [10, 11, 12]) assert.equal(isRegistrationOpen(event, new Date(2027, 2, day, 23, 59)), true);
  for (const day of [9, 13]) assert.equal(isRegistrationOpen(event, new Date(2027, 2, day)), false);
});

test('registration stays closed when disabled or dates are missing or invalid', () => {
  const now = new Date(2027, 2, 10);
  const event = { has_registrations: 1, registration_start: '2027-03-10', registration_end: '2027-03-12' };
  for (const overrides of [
    { has_registrations: 0 },
    { registration_start: null },
    { registration_end: '2027-02-30' },
    { registration_start: '2027-03-12', registration_end: '2027-03-10' }
  ]) assert.equal(isRegistrationOpen({ ...event, ...overrides }, now), false);
});
