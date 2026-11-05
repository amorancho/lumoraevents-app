// Logic only: no rendering, previews or screenshots.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({
  getEvent: () => ({ start: '2026-06-15' }),
  document: { addEventListener() {} },
  window: { addEventListener() {} }
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/registration.js'), 'utf8'), context);
const status = (date_of_birth, category) => context.getRegistrationMemberAgeRangeStatus({ date_of_birth }, category);

test('BY_AGE keeps the age comparison and inclusive limits at the event date', () => {
  const category = { years_validation: 'BY_AGE', min_years: 10, max_years: 18 };
  assert.equal(status('2007-06-15', category), 'above');
  assert.equal(status('2008-06-15', category), 'in-range');
  assert.equal(status('2016-06-15', category), 'in-range');
  assert.equal(status('2016-06-16', category), 'below');
});

test('BY_YEAR counts earlier births as above and later births as below', () => {
  const category = { years_validation: 'BY_YEAR', min_years: 2008, max_years: 2016 };
  assert.equal(status('2007-12-31', category), 'above');
  assert.equal(status('2008-01-01', category), 'in-range');
  assert.equal(status('2016-12-31', category), 'in-range');
  assert.equal(status('2017-01-01', category), 'below');
  assert.equal(status('2007-12-31T00:00:00.000Z', category), 'above');
});

test('only older members count towards the out-of-range allowance in both modes', () => {
  for (const category of [
    { years_validation: 'BY_AGE', min_years: 10, max_years: 18 },
    { years_validation: 'BY_YEAR', min_years: 2008, max_years: 2016 }
  ]) {
    const results = ['2000-01-01', '2010-01-01', '2020-01-01'].map(dob => status(dob, category));
    assert.deepEqual(results, ['above', 'in-range', 'below']);
    assert.equal(results.filter(value => value === 'above').length, 1);
  }
});

test('BY_YEAR supports a single bound and does not invent a bound from null', () => {
  assert.equal(status('2017-01-01', { years_validation: 'BY_YEAR', min_years: 2008, max_years: null }), 'in-range');
  assert.equal(status('2007-01-01', { years_validation: 'BY_YEAR', min_years: null, max_years: 2016 }), 'in-range');
  assert.equal(status('2017-01-01', { years_validation: 'BY_YEAR', min_years: null, max_years: 2016 }), 'below');
});

test('missing dates are unknown and missing configuration defaults to age', () => {
  assert.equal(status(null, { years_validation: 'BY_YEAR', min_years: 2008 }), 'unknown');
  assert.equal(status('', { years_validation: 'BY_AGE', max_years: 18 }), 'unknown');
  assert.equal(status('2000-01-01', { min_years: '10', max_years: '18' }), 'above');
  assert.equal(status(null, { min_years: null, max_years: '' }), 'in-range');
});
