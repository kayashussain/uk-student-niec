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

  const api = { parseNum, resolveDiscount, feeAfterScholarship, remainingTuitionFee };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NiecCalc = api;
})(this);
