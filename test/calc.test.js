const test = require('node:test');
const assert = require('node:assert');
const tracker = require('../student-details/calc');
const incentive = require('../counselor-incentive/calc');

test('fee after scholarship takes a flat amount or a % of the gross fee', () => {
  assert.strictEqual(tracker.feeAfterScholarship({ 'GROSS FEE': '15,000', SCHOLARSHIP: '3,000' }), 12000);
  assert.strictEqual(tracker.feeAfterScholarship({ 'GROSS FEE': '15000', SCHOLARSHIP: '20%' }), 12000);
  assert.strictEqual(tracker.feeAfterScholarship({ 'GROSS FEE': '15000' }), 15000);
});

test('remaining tuition fee subtracts discounts and both deposits', () => {
  const row = {
    'FEE AFTER SCHOLARSHIP': '12,000.00',
    'EARLY BIRD DISCOUNT': '10%',
    'ADDITIONAL DISCOUNT': '500',
    'TUITION FEE DEPOSIT(1st Installment)': '£4,000',
    'TUITION FEE DEPOSIT(2nd Installment)': '',
  };
  assert.strictEqual(tracker.remainingTuitionFee(row), 12000 - 1200 - 500 - 4000);
});

test('parseNum ignores currency symbols and blanks', () => {
  assert.strictEqual(tracker.parseNum('£1,250.50'), 1250.5);
  assert.strictEqual(tracker.parseNum(''), 0);
  assert.strictEqual(tracker.parseNum('n/a'), 0);
});

test('flywire incentive is 0.2% of the GBP payment, converted to NPR and rounded', () => {
  assert.strictEqual(incentive.flywireIncentive(10000, 175.5), 3510);
  assert.strictEqual(incentive.flywireIncentive(1234.56, 176.123), 434.87);
});

test('summary nets loans, takes 15% TDS, then the previous advance', () => {
  const s = incentive.computeSummary([
    { enrollmentCommission: 10000, flywireCommission: 2000, loanCommission: 1000 },
    { enrollmentCommissionUni: 5000, newPartnershipCommission: 1000, selfStudentCommission: 3000 },
  ], '4000');
  assert.strictEqual(s.totalCommissions, 21000);
  assert.strictEqual(s.netCommissions, 20000);
  assert.strictEqual(s.tds, 3000);
  assert.strictEqual(s.netPayable, 13000);
});

test('no TDS is taken when nothing is owed', () => {
  const s = incentive.computeSummary([{ loanCommission: 500 }], 0);
  assert.strictEqual(s.tds, 0);
  assert.strictEqual(s.netPayable, -500);
});

test('duplicate WhatsApp numbers are found regardless of formatting or +977 prefix', () => {
  assert.strictEqual(tracker.normalizePhone('+977 981-2345678'), '9812345678');
  assert.strictEqual(tracker.normalizePhone('9812345678'), '9812345678');
  const rows = [
    { 'CONTACT NUMBER': '9812345678' },
    { 'CONTACT NUMBER': '+977-9812345678' },
    { 'CONTACT NUMBER': '9800000000' },
    { 'CONTACT NUMBER': '' },
    { 'CONTACT NUMBER': '' },
  ];
  assert.deepStrictEqual([...tracker.duplicatePhones(rows, 'CONTACT NUMBER')], ['9812345678']);
});
