// Incentive money math. Loaded by the page (as window.IncentiveCalc) and by the tests.
(function (root) {
  const TDS_RATE = 0.15;
  // Flywire Incentive = 0.2% of the Flywire Fee Payment (in GBP), converted to NPR at today's rate.
  const FLYWIRE_INCENTIVE_RATE = 0.002;

  function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function round2(n) { return Math.round(n * 100) / 100; }

  // Student Details amounts are free text ("£4,000", "4000.50", ""), so strip everything but the number.
  function parseAmount(v) {
    const n = parseFloat(String(v || '').replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? 0 : n;
  }

  // Total tuition fee the student has paid so far: 1st + 2nd installment from Student Details.
  function tuitionPaid(row) {
    return round2(parseAmount(row['TUITION FEE DEPOSIT(1st Installment)'])
      + parseAmount(row['TUITION FEE DEPOSIT(2nd Installment)']));
  }

  function flywireIncentive(feePaymentGbp, gbpToNpr) {
    return round2(feePaymentGbp * FLYWIRE_INCENTIVE_RATE * gbpToNpr);
  }

  // records: each student's saved incentive values; previousAdvance: the intake's advance already paid.
  function computeSummary(records, previousAdvance) {
    const sum = (key) => records.reduce((a, r) => a + num((r || {})[key]), 0);
    const totalCommissions = sum('enrollmentCommission') + sum('enrollmentCommissionUni')
      + sum('newPartnershipCommission') + sum('selfStudentCommission') + sum('flywireCommission');
    const loanPayable = sum('loanCommission');
    const netCommissions = totalCommissions - loanPayable;
    const tds = Math.max(0, netCommissions) * TDS_RATE; // no TDS (and no negative TDS) when nothing is owed
    const advance = num(previousAdvance);
    const netPayable = netCommissions - tds - advance;
    return { totalCommissions, loanPayable, netCommissions, tds, previousAdvance: advance, netPayable };
  }

  // Commission the company gets from the university: the given % of the tuition fee the student has paid (GBP).
  function universityCommission(tuitionPaidGbp, ratePercent) {
    return round2(num(tuitionPaidGbp) * num(ratePercent) / 100);
  }

  // What the company earned on an intake against what the counselor took home for it.
  // commissionGbp: total university commission; salary is per month, paid for `months` months.
  // sharePercent is null when there's nothing earned yet to compare with.
  const DEFAULT_BASIC_SALARY = 70000;
  const DEFAULT_SALARY_MONTHS = 4; // three intakes a year (January, April/May, September)
  function computeEarnings({ commissionGbp, gbpToNpr, basicSalary, salaryMonths, myIncentives }) {
    const companyNpr = gbpToNpr ? round2(num(commissionGbp) * gbpToNpr) : null;
    const salaryTotal = num(basicSalary) * num(salaryMonths);
    const myTotal = salaryTotal + num(myIncentives);
    const sharePercent = companyNpr > 0 ? (myTotal / companyNpr) * 100 : null;
    return { commissionGbp: num(commissionGbp), companyNpr, salaryTotal, myTotal, sharePercent };
  }

  const api = { TDS_RATE, FLYWIRE_INCENTIVE_RATE, num, round2, parseAmount, tuitionPaid, flywireIncentive, computeSummary,
    universityCommission, DEFAULT_BASIC_SALARY, DEFAULT_SALARY_MONTHS, computeEarnings };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.IncentiveCalc = api;
})(this);
