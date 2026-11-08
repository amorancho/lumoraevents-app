// Financial calculations only: no rendering, previews or screenshots.
// Run: node --test tests/registration-fees.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness(type = 'PAR', cost = 1000) {
  const event = { registrationFeeType: type, registrationFeeCost: cost };
  const context = vm.createContext({
    getEvent: () => event,
    document: { addEventListener() {} },
    window: { addEventListener() {} },
    t: (key, fallback) => fallback ?? key
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/registration.js'), 'utf8'), context);
  return { context, event, state: vm.runInContext('registrationState', context) };
}

const categories = new Map([['1', { apply_fee: 1 }], ['2', { apply_fee: 0 }]]);
const registration = (id, schoolId, categoryId, members, totalAmount, status = 'VAL') => ({
  id, school_id: schoolId, category_id: categoryId, status, total_amount: totalAmount,
  member_count: members.length, members: members.map(participant_id => ({ participant_id }))
});
const registrations = [
  registration(1, 4, 1, [11, 12, 13], 3000),
  registration(2, 4, 1, [11], 2000),
  registration(3, 5, 2, [21], 4000),
  registration(4, 6, 1, [31], 9000, 'PEN'),
  registration(5, 4, 1, [14], 1000),
  registration(6, 7, 1, [41], 9000, 'REJ')
];

test('NON produces zero fee even with a positive configured cost', () => {
  const { context } = harness('NON');
  const fee = context.buildRegistrationFeeMetrics(registrations, categories);
  assert.equal(fee.units, 0);
  assert.equal(fee.totalFee, 0);
});

test('PAR preserves unique participants, validated status and category exemptions', () => {
  const { context } = harness('PAR');
  const fee = context.buildRegistrationFeeMetrics(registrations, categories);
  assert.equal(fee.units, 4);
  assert.equal(fee.totalFee, 4000);
});

test('PAR preserves the participant-count fallback when member details are incomplete', () => {
  const { context } = harness('PAR');
  const fee = context.buildRegistrationFeeMetrics([
    { status: 'VAL', category_id: 1, member_count: 2 },
    { status: 'VAL', category_id: 1, member_count: 3 },
    { status: 'VAL', category_id: 2, member_count: 10 }
  ], categories);
  assert.equal(fee.totalFee, 5000);
});

test('REG counts each eligible validated registration once, regardless of its participants', () => {
  const { context } = harness('REG');
  const fee = context.buildRegistrationFeeMetrics(registrations, categories);
  assert.equal(fee.units, 3);
  assert.equal(fee.totalFee, 3000);
  assert.equal(context.buildRegistrationFeeMetrics([
    { status: 'VAL', category: { apply_fee: 0 } },
    { status: ' val ', apply_fee: 1 },
    { status: 'PEN', apply_fee: 1 }
  ]).totalFee, 1000);
});

test('SCH charges each school once, including a school whose only validated category is exempt', () => {
  const { context } = harness('SCH');
  const fee = context.buildRegistrationFeeMetrics(registrations, categories);
  assert.equal(fee.units, 2);
  assert.equal(fee.totalFee, 2000);
  assert.equal(context.buildRegistrationFeeMetrics(registrations.filter(row => row.school_id === 5), categories).totalFee, 1000);
  assert.equal(context.buildRegistrationFeeMetrics(registrations.filter(row => row.school_id === 6), categories).totalFee, 0);
});

test('SCH handles one account per school view and normalizes numeric/string school identities', () => {
  const { context } = harness('SCH');
  assert.equal(context.buildRegistrationFeeMetrics([
    { status: 'VAL' }, { status: 'VAL', category_id: 2 }
  ], categories, { schoolId: 4 }).totalFee, 1000);
  assert.equal(context.buildRegistrationFeeMetrics([
    { status: 'VAL', school_id: 4 }, { status: 'VAL', school: { id: '4' } },
    { status: 'VAL', school: { id: 5 } }
  ], categories).units, 2);
});

test('empty, pending and rejected registrations do not generate any type of fee', () => {
  for (const type of ['NON', 'PAR', 'REG', 'SCH']) {
    const { context } = harness(type);
    assert.equal(context.buildRegistrationFeeMetrics([], categories).totalFee, 0);
    assert.equal(context.buildRegistrationFeeMetrics(registrations.filter(row => row.status !== 'VAL'), categories).totalFee, 0);
  }
});

test('legacy events keep PAR when the API omits the new type; explicit zero-cost types remain valid', () => {
  const { context, event } = harness(undefined);
  delete event.registrationFeeType;
  assert.equal(context.buildRegistrationFeeMetrics(registrations, categories).totalFee, 4000);
  event.registrationFeeType = 'SCH';
  event.registrationFeeCost = 0;
  assert.equal(context.buildRegistrationFeeMetrics(registrations, categories).type, 'SCH');
  assert.equal(context.buildRegistrationFeeMetrics(registrations, categories).totalFee, 0);
});

test('Dashboard totals and outstanding balance use the same fee rules without changing stored registration amounts', () => {
  for (const [type, fee] of [['NON', 0], ['PAR', 6000], ['REG', 5000], ['SCH', 4000]]) {
    const { context, state } = harness(type);
    state.paymentDocuments = [
      { payment_type: 'PAY', status: 'VAL', amount: 2500 },
      { payment_type: 'PAY', status: 'PEN', amount: 2000 },
      { payment_type: 'INV', status: 'VAL', amount: 9000 }
    ];
    const finance = context.buildRegistrationDashboardFinanceMetrics(registrations, categories);
    assert.equal(finance.totalAmount, 28000 + fee, type);
    assert.equal(finance.totalRegistrationsCount, 6, type);
    assert.equal(finance.paidAmount, 2500, type);
    assert.equal(finance.pendingAmount, 25500 + fee, type);
  }
});

test('extras API totals retain extras and discounts while adding unvalidated registrations and incremental fees', () => {
  for (const [type, increment] of [['NON', 18000], ['PAR', 20000], ['REG', 20000], ['SCH', 20000]]) {
    const { context } = harness(type);
    context.window.RegistrationExtras = { enabled: () => true, getFinanceSummary: () => ({ total_amount: 12345 }) };
    assert.equal(context.buildRegistrationDashboardFinanceMetrics(registrations, categories).totalAmount, 12345 + increment);
    context.window.RegistrationExtras.getFinanceSummary = () => null;
    assert.equal(context.buildRegistrationDashboardFinanceMetrics(registrations, categories).totalAmount, null);
  }
});

test('financial totals exclude DEL, normalize statuses and split VAL from CRE, PEN and REJ', () => {
  const { context } = harness('NON');
  const rows = [
    registration(1, 4, 1, [11], 1000, ' val '),
    registration(2, 4, 1, [12], 2000, 'CRE'),
    registration(3, 4, 1, [13], 3000, ' pen '),
    registration(4, 4, 1, [14], 4000, 'REJ'),
    registration(5, 4, 1, [15], 99000, ' del ')
  ];
  const metrics = context.buildRegistrationDashboardFinanceMetrics(rows, categories);
  assert.equal(metrics.totalAmount, 10000);
  assert.equal(metrics.validatedAmount, 1000);
  assert.equal(metrics.unvalidatedAmount, 9000);
  assert.equal(metrics.validatedRegistrationsCount, 1);
  assert.equal(metrics.unvalidatedRegistrationsCount, 3);
  assert.equal(metrics.totalRegistrationsCount, 4);
});

test('fees for all active statuses deduplicate shared participants and schools across the split', () => {
  const rows = [
    registration(1, 4, 1, [11], 1000),
    registration(2, 4, 1, [11, 12], 2000, 'CRE'),
    registration(3, 5, 2, [13], 3000, 'REJ'),
    registration(4, 6, 1, [14], 99000, 'DEL')
  ];
  for (const [type, totalFee, validatedFee] of [['NON', 0, 0], ['PAR', 2000, 1000], ['REG', 2000, 1000], ['SCH', 2000, 1000]]) {
    const { context } = harness(type);
    const metrics = context.buildRegistrationDashboardFinanceMetrics(rows, categories);
    assert.equal(metrics.totalAmount, 6000 + totalFee, type);
    assert.equal(metrics.validatedAmount, 1000 + validatedFee, type);
    assert.equal(metrics.unvalidatedAmount, 5000 + totalFee - validatedFee, type);
    assert.equal(metrics.validatedAmount + metrics.unvalidatedAmount, metrics.totalAmount, type);
  }
});
