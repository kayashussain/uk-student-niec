// Incentive money math. Loaded by the page (as window.IncentiveCalc) and by the tests.
(function (root) {
  const TDS_RATE = 0.15;
  // Flywire Incentive = 0.2% of the Flywire Fee Payment (in GBP), converted to NPR at today's rate.
  const FLYWIRE_INCENTIVE_RATE = 0.002;

  // Three incentives can be agreed in rupees, in pounds, or as a percentage of that student's university commission
  // (the Commission Amount in pounds). The unit is saved next to the number (0 rupees, 1 pounds, 2 percent), and a
  // student with no unit saved is in rupees, as every incentive was before units existed.
  const UNIT = { NPR: 0, GBP: 1, PCT: 2 };
  const FLEX_FIELDS = ['enrollmentCommission', 'enrollmentCommissionUni', 'newPartnershipCommission'];
  const unitField = (field) => field + 'Unit';

  // A number, also from text such as "1,500", "£12,500" or "Rs. 1,250" (the first number in it; a plain parseFloat read "1,500" as 1).
  function num(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    const m = String(v ?? '').replace(/(\d),(?=\d{3}(?:\D|$)|\d{2},)/g, '$1').match(/-?(?:\d+(?:\.\d+)?|\.\d+)/);
    return m ? parseFloat(m[0]) : 0;
  }
  // To two decimals, the way a person rounds: half a paisa goes up (floats store 27910.695 as 27910.69499..., so the
  // number is first cleaned to 12 significant digits).
  function round2(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return 0;
    const paisa = Number((Math.abs(x) * 100).toPrecision(12)); // 100.49999999999999 is really 100.5
    return Math.sign(x) * Math.round(paisa) / 100 || 0;
  }

  // What one flexible incentive is worth in rupees. commissionGbp is the student's Commission Amount (for percentages),
  // gbpToNpr today's rate. Pounds and percentages cannot be worked out without a rate: they give null, never a wrong number.
  function flexNpr(record, field, commissionGbp, gbpToNpr) {
    const r = record || {};
    const value = num(r[field]);
    if (!value) return 0;
    const unit = num(r[unitField(field)]);
    if (unit === UNIT.GBP) return gbpToNpr ? round2(value * gbpToNpr) : null;
    if (unit === UNIT.PCT) return gbpToNpr ? round2(num(commissionGbp) * value / 100 * gbpToNpr) : null;
    return value;
  }

  // What a person types in one of those cells: "40000" or "Rs 40000" (rupees), "£500" or "500 gbp" (pounds), "15%" (percent).
  // A plain number keeps the unit the cell already had. null when it is not a number at all.
  function parseIncentiveInput(text, currentUnit) {
    let s = String(text === undefined || text === null ? '' : text).trim();
    let unit = num(currentUnit);
    if (!s) return { value: 0, unit };
    if (/%\s*$/.test(s)) { unit = UNIT.PCT; s = s.replace(/\s*%\s*$/, ''); }
    else if (/^(£|gbp|pounds?)\s*/i.test(s)) { unit = UNIT.GBP; s = s.replace(/^(£|gbp|pounds?)\s*/i, ''); }
    else if (/\s*(gbp|pounds?)$/i.test(s)) { unit = UNIT.GBP; s = s.replace(/\s*(gbp|pounds?)$/i, ''); }
    else if (/^(rs\.?|nrs\.?|npr|रु\.?)\s*/i.test(s)) { unit = UNIT.NPR; s = s.replace(/^(rs\.?|nrs\.?|npr|रु\.?)\s*/i, ''); }
    else if (/\s*(npr|rs\.?)$/i.test(s)) { unit = UNIT.NPR; s = s.replace(/\s*(npr|rs\.?)$/i, ''); }
    // A comma only separates thousands (1,500 or 12,50,000 is not read, 1,5 is not 15): any other comma, or a letter, makes it text.
    s = s.replace(/,(?=\d{3}(?:\D|$)|\d{2},)/g, '').trim();
    if (!s) return { value: 0, unit };
    if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(s)) return null; // no 1e3 or 0x10
    return { value: Number(s), unit };
  }

  const grouped = (n, max) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: max === 0 ? 0 : 2, maximumFractionDigits: max === undefined ? 2 : max });
  // How the cell shows it (the unit is always visible), and how it reads while being typed or copied.
  function incentiveLabel(value, unit) {
    const v = num(value);
    if (!v) return '';
    const u = num(unit);
    return u === UNIT.GBP ? '£' + grouped(v) : u === UNIT.PCT ? grouped(v, 2).replace(/\.00$/, '') + '%' : 'Rs ' + grouped(v);
  }
  function incentiveTyped(value, unit) {
    const v = num(value);
    if (!v) return '';
    const u = num(unit);
    return u === UNIT.GBP ? '£' + v : u === UNIT.PCT ? v + '%' : String(v);
  }

  function flywireIncentive(feePaymentGbp, gbpToNpr) {
    return round2(feePaymentGbp * FLYWIRE_INCENTIVE_RATE * gbpToNpr);
  }

  // The part payments received so far in an intake: [{ date, amount }]. Anything that is not a positive number is ignored.
  function paymentsTotal(payments) {
    return round2((Array.isArray(payments) ? payments : []).reduce((a, p) => a + Math.max(0, num((p || {}).amount)), 0));
  }

  // records: each student's saved incentive values; previousAdvance: the intake's advance already paid.
  // context (only needed once a pound or percent incentive exists): gbpToNpr is today's rate, commissionsGbp[i] is the
  // Commission Amount of records[i]'s student, payments are the part payments received (each { date, amount }, in rupees).
  // needsRate says some incentive could not be counted for want of a rate.
  //
  // The working is kept in plain sight so it can be checked by hand:
  //   nprEntered   incentives typed in rupees (plus Flywire incentives, which are rupees)
  //   gbpEntered   incentives typed in pounds, plus the percentage ones (a percentage is of a pound amount)
  //   gbpConverted gbpEntered x the rate, in rupees
  //   totalCommissions = nprEntered + gbpConverted
  function computeSummary(records, previousAdvance, context) {
    const ctx = context || {};
    const rate = ctx.gbpToNpr || null;
    let needsRate = false;
    const sum = (key) => records.reduce((a, r) => a + num((r || {})[key]), 0);
    let nprEntered = sum('flywireCommission'); // every figure below is kept to 2 decimals, so the rows add up exactly as shown
    let gbpEntered = 0;
    records.forEach((r, i) => {
      const commissionGbp = ctx.commissionsGbp ? ctx.commissionsGbp[i] : 0;
      FLEX_FIELDS.forEach((field) => {
        const value = num((r || {})[field]);
        if (!value) return;
        const unit = num((r || {})[unitField(field)]);
        if (unit === UNIT.GBP) gbpEntered += value;
        else if (unit === UNIT.PCT) gbpEntered += num(commissionGbp) * value / 100;
        else nprEntered += value;
      });
    });
    nprEntered = round2(nprEntered);
    gbpEntered = round2(gbpEntered);
    if (gbpEntered && !rate) needsRate = true;
    const gbpConverted = rate ? round2(gbpEntered * rate) : 0;
    const totalCommissions = round2(nprEntered + gbpConverted);
    const loanPayable = round2(sum('loanCommission'));
    const netCommissions = round2(totalCommissions - loanPayable);
    const tds = round2(Math.max(0, netCommissions) * TDS_RATE); // no TDS (and no negative TDS) when nothing is owed
    const advance = round2(num(previousAdvance));
    const received = paymentsTotal(ctx.payments);
    const netPayable = round2(netCommissions - tds - advance - received);
    return { nprEntered, gbpEntered, gbpConverted, gbpToNpr: rate, totalCommissions, loanPayable, netCommissions, tds,
      previousAdvance: advance, paymentsReceived: received, netPayable, needsRate };
  }

  // Commission the company gets from the university: the given % of the student's tuition fee (GBP).
  function universityCommission(tuitionFeeGbp, ratePercent) {
    return round2(num(tuitionFeeGbp) * num(ratePercent) / 100);
  }

  // A student who came through a branch (the Student Source is "Chitwan Branch", "Pokhara Branch", "Butwal Branch" and so
  // on, anything ending in Branch): the branch keeps 70% of the university commission and the head office 30%.
  const BRANCH_SHARE_PERCENT = 70;
  function isBranchSource(source) { return /\bbranch\s*$/i.test(String(source || '').trim()); }

  // What the company earned on an intake against what the counselor took home for it.
  // commissionGbp: total university commission; branchCommissionGbp: the part of it that came from branch students (the
  // branch keeps 70% of that, so only the rest is the head office's). Salary is per month, paid for `months` months.
  // sharePercent is null when there's nothing earned yet to compare with.
  const DEFAULT_BASIC_SALARY = 70000;
  const DEFAULT_SALARY_MONTHS = 4; // three intakes a year (January, April/May, September)
  function computeEarnings({ commissionGbp, branchCommissionGbp, gbpToNpr, basicSalary, salaryMonths, myIncentives }) {
    const branchShareGbp = round2(num(branchCommissionGbp) * BRANCH_SHARE_PERCENT / 100);
    const headOfficeGbp = round2(num(commissionGbp) - branchShareGbp);
    const companyNpr = gbpToNpr ? round2(headOfficeGbp * gbpToNpr) : null;
    const salaryTotal = num(basicSalary) * num(salaryMonths);
    const myTotal = salaryTotal + num(myIncentives);
    const sharePercent = companyNpr > 0 ? (myTotal / companyNpr) * 100 : null;
    return { commissionGbp: num(commissionGbp), branchShareGbp, headOfficeGbp, companyNpr, salaryTotal, myTotal, sharePercent };
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
    const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    return m ? `${Number(m[2])}/${Number(m[3])}/${m[1]}` : s;
  }

  const api = { TDS_RATE, FLYWIRE_INCENTIVE_RATE, UNIT, FLEX_FIELDS, unitField, flexNpr, parseIncentiveInput, incentiveLabel, incentiveTyped,
    BRANCH_SHARE_PERCENT, isBranchSource, num, round2, flywireIncentive, computeSummary, paymentsTotal,
    universityCommission, groupByUniversity, displayDate, DEFAULT_BASIC_SALARY, DEFAULT_SALARY_MONTHS, computeEarnings };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.IncentiveCalc = api;
})(this);
