// Spots a mistyped entry (wrong capital letters, a small spelling slip) and works out what the person most
// likely meant, from what is already in the sheet. Loaded by the page before app.js (as window.NiecSuggest)
// and by the tests.
(function (root) {
  const SMALL_WORDS = new Set(['of', 'and', 'the', 'in', 'for', 'at', 'on', 'to', 'with', 'a', 'an', 'de', 'la']);
  const clean = (v) => String(v ?? '').trim().replace(/\s+/g, ' ');

  function distance(a, b) {
    if (Math.abs(a.length - b.length) > 3) return 99;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i += 1) {
      const cur = [i];
      for (let j = 1; j <= b.length; j += 1) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  }

  // Capital letter on every word except the little ones in the middle ("University of West London").
  // Only the first letters are touched, so "MSc" and "UWL" stay as typed.
  function titleCase(text) {
    return clean(text).split(' ').map((w, i) => (i > 0 && SMALL_WORDS.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
  }

  // A word that starts with a small letter where a capital belongs, e.g. "university of west London".
  const looksMiscapitalised = (text) => clean(text).split(' ').some((w, i) => /^[a-z]/.test(w) && (i === 0 || !SMALL_WORDS.has(w)));

  // known: every value already in the column (repeats count, the most used spelling wins).
  // Returns { value, reason: 'capitals' | 'spelling' } or null when the entry is fine as it is.
  function suggest(typed, known) {
    const value = clean(typed);
    if (!value) return null;
    const counts = new Map();
    (known || []).forEach((k) => { const c = clean(k); if (c) counts.set(c, (counts.get(c) || 0) + 1); });
    if (counts.has(value)) return null; // exactly something that is already used
    const lower = value.toLowerCase();
    const best = (list) => list.sort((a, b) => counts.get(b) - counts.get(a) || a.localeCompare(b))[0];
    const sameLetters = [...counts.keys()].filter((k) => k.toLowerCase() === lower);
    if (sameLetters.length) return { value: best(sameLetters), reason: 'capitals' };
    if (value.length >= 4) {
      const allowed = value.length >= 8 ? 2 : 1;
      let close = [];
      let min = allowed + 1;
      counts.forEach((_, k) => {
        const d = distance(lower, k.toLowerCase());
        if (d < min) { min = d; close = [k]; } else if (d === min) close.push(k);
      });
      if (close.length) return { value: best(close), reason: 'spelling' };
    }
    if (looksMiscapitalised(value)) {
      const fixed = titleCase(value);
      if (fixed !== value) return { value: fixed, reason: 'capitals' };
    }
    return null;
  }

  const api = { suggest, titleCase };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NiecSuggest = api;
})(this);
