// Fee calculations for the tracker. Loaded by the page before app.js (as window.NiecCalc) and by the tests.
(function (root) {
  function parseNum(v) {
    if (!v) return 0;
    const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? 0 : n;
  }

  // Resolves a discount entered either as a percentage ("5%") or a flat amount ("500")
  // into an amount against the given base.
  function resolveDiscount(raw, base) {
    const s = String(raw || '').trim();
    if (!s) return 0;
    if (s.includes('%')) return base * (parseNum(s) / 100);
    return parseNum(s);
  }

  // Scholarship may be an amount ("3,000") or a share of the gross fee ("15%").
  function feeAfterScholarship(row) {
    const gross = parseNum(row['GROSS FEE']);
    return gross - resolveDiscount(row['SCHOLARSHIP'], gross);
  }

  // The tuition fee the student has to pay: Gross Fee − Scholarship − Early Bird Discount − Additional
  // Discount (before any installments). Worked out from the Gross Fee, so it never depends on a stale
  // Fee After Scholarship cell. Used by the Incentive app.
  function netTuitionFee(row) {
    const base = feeAfterScholarship(row);
    return base - resolveDiscount(row['EARLY BIRD DISCOUNT'], base) - parseNum(row['ADDITIONAL DISCOUNT']);
  }

  function remainingTuitionFee(row) {
    const base = parseNum(row['FEE AFTER SCHOLARSHIP']);
    const earlyBird = resolveDiscount(row['EARLY BIRD DISCOUNT'], base);
    const additional = parseNum(row['ADDITIONAL DISCOUNT']);
    const dep1 = parseNum(row['TUITION FEE DEPOSIT(1st Installment)']);
    const dep2 = parseNum(row['TUITION FEE DEPOSIT(2nd Installment)']);
    return base - earlyBird - additional - dep1 - dep2;
  }

  // Reduces a phone number to its digits so "+977 981-2345678" and "9812345678" count as the same
  // number. Nepal's 977 country code is dropped when what's left is a full 10-digit mobile.
  function normalizePhone(v) {
    const digits = String(v || '').replace(/\D/g, '');
    return digits.length === 13 && digits.startsWith('977') ? digits.slice(3) : digits;
  }

  // The normalized numbers that appear on more than one of the given rows.
  function duplicatePhones(rows, col) {
    const counts = new Map();
    rows.forEach((row) => {
      const n = normalizePhone(row[col]);
      if (n) counts.set(n, (counts.get(n) || 0) + 1);
    });
    return new Set([...counts].filter(([, c]) => c > 1).map(([n]) => n));
  }

  // A student who got an offer a week or more ago but is still at Mock Stage or earlier (not yet at
  // Payment Stage) is stuck and gets highlighted. The offer date is YYYY-MM-DD or M/D/YYYY.
  const OFFER_STUCK_DAYS = 7;
  const PRE_PAYMENT_STATUSES = new Set(['Inquiry', 'Application Stage', 'Mock Stage']);
  function offerStuck(row, today = new Date()) {
    if (!PRE_PAYMENT_STATUSES.has(row['APPLICATION STATUS'])) return false;
    const s = String(row['OFFER RECEIVED DATE'] || '').trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/) || s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return false;
    const [y, mo, d] = m[1].length === 4 ? [m[1], m[2], m[3]] : [m[3], m[1], m[2]];
    const offer = Date.UTC(Number(y), Number(mo) - 1, Number(d));
    const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    return (now - offer) / 86400000 >= OFFER_STUCK_DAYS;
  }

  const api = { parseNum, resolveDiscount, feeAfterScholarship, netTuitionFee, remainingTuitionFee, normalizePhone, duplicatePhones, offerStuck };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NiecCalc = api;
})(this);
