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

  const api = { parseNum, resolveDiscount, feeAfterScholarship, remainingTuitionFee, normalizePhone, duplicatePhones };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NiecCalc = api;
})(this);
