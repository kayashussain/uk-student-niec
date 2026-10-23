// Incentive money math. Loaded by the page (as window.IncentiveCalc) and by the tests.
(function (root) {
  const TDS_RATE = 0.15;
  // Flywire Incentive = 0.2% of the Flywire Fee Payment (in GBP), converted to NPR at today's rate.
  const FLYWIRE_INCENTIVE_RATE = 0.002;

  function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function round2(n) { return Math.round(n * 100) / 100; }

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

  // Commission the company gets from the university: the given % of the student's tuition fee (GBP).
  function universityCommission(tuitionFeeGbp, ratePercent) {
    return round2(num(tuitionFeeGbp) * num(ratePercent) / 100);
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

  // Puts each university's students together, universities in the order they first appear and
  // students in their original order within each. Names are matched ignoring case and extra spaces.
  function groupByUniversity(students) {
    const key = (st) => String(st.university || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const groups = new Map();
    students.forEach((st) => {
      const k = key(st);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(st);
    });
    return [...groups.values()].flat();
  }

  // Student Details holds dates as either 2026-09-23 (picked in the app) or 9/23/2026 (imported);
  // both are shown as 9/23/2026 here so the column reads the same all the way down.
  function displayDate(v) {
    const s = String(v || '').trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${Number(m[2])}/${Number(m[3])}/${m[1]}` : s;
  }

  const api = { TDS_RATE, FLYWIRE_INCENTIVE_RATE, num, round2, flywireIncentive, computeSummary,
    universityCommission, groupByUniversity, displayDate, DEFAULT_BASIC_SALARY, DEFAULT_SALARY_MONTHS, computeEarnings };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.IncentiveCalc = api;
})(this);
