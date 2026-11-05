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
  // The old Direct Student Incentive column is gone: a value saved there earlier is kept in the file but is not part of the totals.
  assert.strictEqual(s.totalCommissions, 18000);
  assert.strictEqual(s.netCommissions, 17000);
  assert.strictEqual(s.tds, 2550);
  assert.strictEqual(s.netPayable, 10450);
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

test('net tuition fee takes scholarship, early bird and additional discount off the gross fee', () => {
  const row = {
    'GROSS FEE': '£15,000', SCHOLARSHIP: '20%', 'EARLY BIRD DISCOUNT': '10%', 'ADDITIONAL DISCOUNT': '500',
    'TUITION FEE DEPOSIT(1st Installment)': '4000', // payments don't change the fee itself
  };
  assert.strictEqual(tracker.netTuitionFee(row), 15000 - 3000 - 1200 - 500);
  assert.strictEqual(tracker.netTuitionFee({ 'GROSS FEE': '12000', SCHOLARSHIP: '3,000', 'EARLY BIRD DISCOUNT': '1000' }), 8000);
});

test('university commission is the given % of the tuition fee paid', () => {
  assert.strictEqual(incentive.universityCommission(7800, 15), 1170);
  assert.strictEqual(incentive.universityCommission(7800, ''), 0);
});

test('earnings compare salary + incentives with what the company earned in NPR', () => {
  const e = incentive.computeEarnings({
    commissionGbp: 10000, gbpToNpr: 180, basicSalary: 70000, salaryMonths: 4, myIncentives: 120000,
  });
  assert.strictEqual(e.companyNpr, 1800000);
  assert.strictEqual(e.salaryTotal, 280000);
  assert.strictEqual(e.myTotal, 400000);
  assert.strictEqual(Math.round(e.sharePercent * 100) / 100, 22.22);
  assert.strictEqual(incentive.computeEarnings({ commissionGbp: 0, gbpToNpr: 180, basicSalary: 70000, salaryMonths: 4 }).sharePercent, null);
});

test('students are grouped by university, in order of first appearance', () => {
  const list = [
    { name: 'A', university: 'University of Essex' },
    { name: 'B', university: 'University of Birmingham' },
    { name: 'C', university: 'university of essex ' },
    { name: 'D', university: 'University of East London' },
    { name: 'E', university: 'University of Essex' },
    { name: 'F', university: 'University of East London' },
  ];
  assert.deepStrictEqual(incentive.groupByUniversity(list).map((s) => s.name), ['A', 'C', 'E', 'B', 'D', 'F']);
});

test('visa dates show in one format whichever way they were stored', () => {
  assert.strictEqual(incentive.displayDate('2026-09-23'), '9/23/2026');
  assert.strictEqual(incentive.displayDate('7/15/2026'), '7/15/2026');
  assert.strictEqual(incentive.displayDate(''), '');
});

// ---- Incentives in rupees, pounds or percent ----
test('an incentive is typed in rupees, pounds or percent, and a plain number keeps the unit the cell had', () => {
  const U = incentive.UNIT;
  assert.deepStrictEqual(incentive.parseIncentiveInput('40000', U.NPR), { value: 40000, unit: U.NPR });
  assert.deepStrictEqual(incentive.parseIncentiveInput('Rs. 40,000', U.GBP), { value: 40000, unit: U.NPR }, 'Rs sets rupees');
  assert.deepStrictEqual(incentive.parseIncentiveInput('£500', U.NPR), { value: 500, unit: U.GBP });
  assert.deepStrictEqual(incentive.parseIncentiveInput('500 GBP', U.NPR), { value: 500, unit: U.GBP });
  assert.deepStrictEqual(incentive.parseIncentiveInput('15%', U.NPR), { value: 15, unit: U.PCT });
  assert.deepStrictEqual(incentive.parseIncentiveInput('600', U.GBP), { value: 600, unit: U.GBP }, 'a plain number keeps pounds');
  assert.deepStrictEqual(incentive.parseIncentiveInput('', U.PCT), { value: 0, unit: U.PCT });
  assert.strictEqual(incentive.parseIncentiveInput('lots', U.NPR), null, 'text is refused');
  assert.strictEqual(incentive.incentiveLabel(500, U.GBP), '£500.00');
  assert.strictEqual(incentive.incentiveLabel(15, U.PCT), '15%');
  assert.strictEqual(incentive.incentiveLabel(12.5, U.PCT), '12.50%');
  assert.strictEqual(incentive.incentiveLabel(40000, U.NPR), 'Rs 40,000.00');
  assert.strictEqual(incentive.incentiveLabel(0, U.GBP), '', 'zero shows as an empty cell');
  ['40000', '£500', '15%', '12.5%'].forEach((t) => {
    const p = incentive.parseIncentiveInput(t, 0);
    assert.strictEqual(incentive.incentiveTyped(p.value, p.unit), t, `${t} copies back out the way it was typed`);
  });
});

test('pounds and percent are converted to rupees at the rate; with no rate they are not guessed', () => {
  const rec = { enrollmentCommission: 500, enrollmentCommissionUnit: 1, enrollmentCommissionUni: 15, enrollmentCommissionUniUnit: 2, newPartnershipCommission: 1000 };
  assert.strictEqual(incentive.flexNpr(rec, 'enrollmentCommission', 2000, 200), 100000, '£500 at 200');
  assert.strictEqual(incentive.flexNpr(rec, 'enrollmentCommissionUni', 2000, 200), 60000, '15% of £2,000 = £300, at 200');
  assert.strictEqual(incentive.flexNpr(rec, 'newPartnershipCommission', 2000, 200), 1000, 'no unit saved means rupees, as before');
  assert.strictEqual(incentive.flexNpr(rec, 'enrollmentCommission', 2000, null), null, 'pounds need a rate');
  assert.strictEqual(incentive.flexNpr(rec, 'newPartnershipCommission', 2000, null), 1000, 'rupees never need one');
  const s = incentive.computeSummary([rec], 0, { gbpToNpr: 200, commissionsGbp: [2000] });
  assert.strictEqual(s.totalCommissions, 100000 + 60000 + 1000);
  assert.strictEqual(s.needsRate, false);
  const noRate = incentive.computeSummary([rec], 0, { gbpToNpr: null, commissionsGbp: [2000] });
  assert.strictEqual(noRate.totalCommissions, 1000, 'only the rupee amount is counted without a rate');
  assert.strictEqual(noRate.needsRate, true, 'and the page is told something could not be counted');
  // Incentives saved before units existed give the same totals as always.
  const old = incentive.computeSummary([{ enrollmentCommission: 10000, flywireCommission: 500 }], 0);
  assert.strictEqual(old.totalCommissions, 10500);
});

test('a student from a branch earns the head office only 30% of the university commission', () => {
  // The owner's example: a university commission of £2,000 on a branch student. 70% goes to the branch.
  const e = incentive.computeEarnings({ commissionGbp: 2000, branchCommissionGbp: 2000, gbpToNpr: 200, basicSalary: 0, salaryMonths: 0, myIncentives: 0 });
  assert.strictEqual(e.branchShareGbp, 1400);
  assert.strictEqual(e.headOfficeGbp, 600);
  assert.strictEqual(e.companyNpr, 120000, 'Company Earnings are worked out from the 30% only');
  assert.strictEqual(e.commissionGbp, 2000, 'the total commission is still shown as it was');
  // Branch and other students together: only the branch student's commission is shared.
  const mixed = incentive.computeEarnings({ commissionGbp: 5000, branchCommissionGbp: 2000, gbpToNpr: 200, basicSalary: 0, salaryMonths: 0, myIncentives: 0 });
  assert.strictEqual(mixed.headOfficeGbp, 3600, '£3,000 from the others plus 30% of £2,000');
  // No branch students: nothing changes from before.
  const none = incentive.computeEarnings({ commissionGbp: 5000, gbpToNpr: 200, basicSalary: 0, salaryMonths: 0, myIncentives: 0 });
  assert.strictEqual(none.headOfficeGbp, 5000);
  assert.strictEqual(none.companyNpr, 1000000);
});

test('any Student Source that ends in Branch counts as a branch', () => {
  ['Chitwan Branch', 'Pokhara Branch', 'Butwal Branch', 'Palpa branch', 'BRANCH'].forEach((n) => assert.ok(incentive.isBranchSource(n), n));
  ['Visitor', 'Reference', 'Agent', 'Events', 'Social Media', 'Language Classes', '', undefined].forEach((n) => assert.ok(!incentive.isBranchSource(n), String(n)));
});

test('the payment summary shows its working: rupees, pounds, the pounds changed to rupees, and part payments', () => {
  const recs = [
    { enrollmentCommission: 40000 },                                                         // Rs 40,000
    { enrollmentCommission: 200, enrollmentCommissionUnit: 1, enrollmentCommissionUni: 10, enrollmentCommissionUniUnit: 2, flywireCommission: 1000 }, // £200 and 10% of £2,000 (= £200), Flywire Rs 1,000
    { newPartnershipCommission: 100, newPartnershipCommissionUnit: 1, loanCommission: 5000 }, // £100, loan Rs 5,000
  ];
  const s = incentive.computeSummary(recs, 2000, { gbpToNpr: 200, commissionsGbp: [0, 2000, 0], payments: [{ amount: 10000 }, { amount: 500.5 }, { amount: -3 }, {}] });
  assert.strictEqual(s.nprEntered, 41000, 'rupees typed, plus Flywire');
  assert.strictEqual(s.gbpEntered, 500, 'pounds typed plus the percentage (in pounds)');
  assert.strictEqual(s.gbpConverted, 100000, '£500 at Rs 200');
  assert.strictEqual(s.totalCommissions, s.nprEntered + s.gbpConverted, 'the total is exactly the two parts added');
  assert.strictEqual(s.netCommissions, 141000 - 5000);
  assert.strictEqual(s.tds, 136000 * 0.15);
  assert.strictEqual(s.paymentsReceived, 10500.5, 'zero, negative and empty payments count for nothing');
  assert.strictEqual(s.netPayable, 136000 - 20400 - 2000 - 10500.5);
  // Everything paid: the net payable reaches zero.
  const paid = incentive.computeSummary(recs, 0, { gbpToNpr: 200, commissionsGbp: [0, 2000, 0], payments: [{ amount: 115600 }] });
  assert.strictEqual(paid.netPayable, 0);
  // No rate: the pound part is reported but not counted.
  const none = incentive.computeSummary(recs, 0, { gbpToNpr: null, commissionsGbp: [0, 2000, 0] });
  assert.strictEqual(none.gbpEntered, 500);
  assert.strictEqual(none.gbpConverted, 0);
  assert.strictEqual(none.needsRate, true);
  assert.strictEqual(incentive.paymentsTotal(undefined), 0);
});

test('amounts are kept to two decimals so the rows of the summary add up exactly as shown', () => {
  // TDS of 15% on 186,071.30 is 27,910.695: it is rounded once, and the net payable is worked from the rounded figures.
  const s = incentive.computeSummary([{ enrollmentCommission: 186071.3 }], 0, {});
  assert.strictEqual(s.tds, 27910.7);
  assert.strictEqual(s.netPayable, 158160.6);
  // Nonsense numbers count as nothing, never as Infinity.
  assert.strictEqual(incentive.num('Infinity'), 0);
  assert.strictEqual(incentive.computeSummary([{ enrollmentCommission: Infinity }], 0, {}).totalCommissions, 0);
  assert.strictEqual(incentive.round2(1.005), 1.01);
  assert.strictEqual(incentive.round2(-1.005), -1.01);
});
