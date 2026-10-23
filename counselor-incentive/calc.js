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

  const api = { TDS_RATE, FLYWIRE_INCENTIVE_RATE, num, round2, parseAmount, tuitionPaid, flywireIncentive, computeSummary };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.IncentiveCalc = api;
})(this);
