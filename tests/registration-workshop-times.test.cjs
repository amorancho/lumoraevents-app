const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/registration-extras.js'), 'utf8');
const context = vm.createContext({
  Date: class { constructor() { throw new Error('Workshop schedules must not use Date'); } },
  Intl: {},
  html: String,
  text: key => key
});
vm.runInContext(source.slice(source.indexOf('  function workshopDateTime('), source.indexOf('  function input(')), context);

test('workshop displays and time pickers preserve database clock values regardless of timezone suffix', () => {
  for (const value of ['2026-12-01T23:07:00.000Z', '2026-12-01T23:07:00+09:00', '2026-12-01T23:07:00-05:00', '2026-12-01 23:07:00']) {
    assert.equal(context.workshopDateTime(value), '2026-12-01T23:07');
    assert.equal(context.workshopDatePart(value, false), '2026-12-01');
    assert.equal(context.workshopDatePart(value, true), '23:07');
    assert.equal(context.workshopTimestamp(value), '2026-12-01 23:07');
    const picker = context.workshopTimePicker('start', value);
    assert.match(picker, /value="23" selected/);
    assert.match(picker, /value="07" selected/);
  }
});

test('missing workshop schedules keep empty inputs and display placeholders', () => {
  assert.equal(context.workshopDateTime(null), '');
  assert.equal(context.workshopTimestamp(null), '—');
  assert.equal(context.workshopDatePart(null, true), '—');
});
