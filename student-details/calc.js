// Fee calculations for the tracker. Loaded by the page before app.js (as window.NiecCalc) and by the tests.
(function (root) {
  // The first number in a cell: "£12,500" is 12500, "Rs. 1250" is 1250, "approx. 500" is 500 (a full stop
  // that is not part of the number no longer turns it into a fraction).
  function parseNum(v) {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    const m = String(v).replace(/(\d),(?=\d)/g, '$1').match(/-?(?:\d+(?:\.\d+)?|\.\d+)/);
    return m ? parseFloat(m[0]) : 0;
  }

  // Resolves a discount entered either as a percentage ("5%") or a flat amount ("500")
  // into an amount against the given base.
  function resolveDiscount(raw, base) {
    const s = String(raw || '').trim();
    if (!s) return 0;
    // Only the number in front of the % sign counts, so "50% (£5,000)" is 50%, not 505000%.
    const pct = s.replace(/(\d),(?=\d)/g, '$1').match(/(-?\d+(?:\.\d+)?)\s*%/);
    if (pct) return base * (parseFloat(pct[1]) / 100);
    if (s.includes('%')) return 0;
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
    // Never below nothing: a commission is never worked out on a negative fee.
    return Math.max(0, base - resolveDiscount(row['EARLY BIRD DISCOUNT'], base) - resolveDiscount(row['ADDITIONAL DISCOUNT'], base));
  }

  function remainingTuitionFee(row) {
    const base = parseNum(row['FEE AFTER SCHOLARSHIP']);
    const earlyBird = resolveDiscount(row['EARLY BIRD DISCOUNT'], base);
    const additional = resolveDiscount(row['ADDITIONAL DISCOUNT'], base);
    const dep1 = parseNum(row['TUITION FEE DEPOSIT(1st Installment)']);
    const dep2 = parseNum(row['TUITION FEE DEPOSIT(2nd Installment)']);
    const dep3 = parseNum(row['TUITION FEE DEPOSIT(3rd Installment)']);
    return base - earlyBird - additional - dep1 - dep2 - dep3;
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

  const api = { parseNum, resolveDiscount, feeAfterScholarship, netTuitionFee, remainingTuitionFee, normalizePhone, duplicatePhones };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NiecCalc = api;
})(this);
