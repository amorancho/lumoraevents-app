const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/registration.js'), 'utf8');
const context = vm.createContext({
  document: { documentElement: { lang: 'es' } },
  t: (_key, fallback) => fallback
});
vm.runInContext(source.slice(source.indexOf('function buildOrganizerRegistrationCategoryGroups('), source.indexOf('function initOrganizerRegistrationsTab(')), context);
const group = context.buildOrganizerRegistrationCategoryGroups;

test('groups category ID variants, sorts naturally and preserves registrations and source order', () => {
  const rows = [
    { id: 1, reg_category_id: 10, status: 'VAL', school_name: 'School A' },
    { id: 2, category_id: 2 },
    { id: 3, reg_category: { id: '10' }, notes: 'Keep notes', total_amount: 42 }
  ];
  const groups = group(rows, new Map([['10', { name: 'Category 10' }], ['2', { name: 'Category 2' }]]));
  assert.deepEqual(Array.from(groups, item => item.name), ['Category 2', 'Category 10']);
  assert.equal(groups[1].registrations.length, 2);
  assert.equal(groups[1].registrations[0], rows[0]);
  assert.equal(groups[1].registrations[1], rows[2]);
  assert.deepEqual(rows.map(row => row.id), [1, 2, 3]);
});

test('separates distinct IDs with identical names and handles named and missing categories', () => {
  const rows = [
    { category_id: 1, category_name: 'Same name' },
    { category_id: 2, category_name: 'Same name' },
    { category_name: 'Named' },
    { reg_category: { name: 'Named' } },
    {},
    {}
  ];
  const groups = group(rows, new Map());
  assert.equal(groups.length, 4);
  assert.equal(groups.find(item => item.name === 'Named').registrations.length, 2);
  assert.equal(groups.find(item => item.name === 'Sin categoría').registrations.length, 2);
});

test('counts only supplied filtered results and handles an empty result', () => {
  const rows = [{ category_id: 1, status: 'VAL' }, { category_id: 1, status: 'PEN' }];
  assert.equal(group(rows.filter(row => row.status === 'VAL'), new Map())[0].registrations.length, 1);
  assert.equal(group([], new Map()).length, 0);
});
