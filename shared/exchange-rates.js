// Today's exchange rates to Nepalese rupees, for amounts the owner enters in another currency (the cost of a campaign paid in US
// dollars, for example). The same rate site as the Incentive page (counselor-incentive/incentive.js), asked at most once an hour; the
// answer is kept in exchange-rates.json in the data folder (never in git), and an older answer is used when the site cannot be reached.
//
//   const rates = createRates(dataDir);
//   await rates.toNpr('USD')  ->  { ok: true, rate: 135.2, date: '2026-11-14' }  (rupees for one dollar)  or  { ok: false, error }

const fs = require('fs');
const path = require('path');
const { writeFileAtomic } = require('./server-utils');

const URL_GBP = 'https://api.exchangerate-api.com/v4/latest/GBP';
const MAX_AGE_MS = 60 * 60 * 1000;
const CURRENCIES = ['NPR', 'USD', 'GBP'];

function createRates(dir, { fetchImpl = (...a) => fetch(...a), now = () => Date.now() } = {}) {
  const file = path.join(dir, 'exchange-rates.json');
  const read = () => { try { const d = JSON.parse(fs.readFileSync(file, 'utf8')); return d && d.rates && typeof d.rates.NPR === 'number' ? d : null; } catch (e) { return null; } };
  let asking = null;
  async function latest() {
    const kept = read();
    if (kept && now() - Date.parse(kept.fetchedAt) < MAX_AGE_MS) return kept;
    if (!asking) {
      asking = (async () => {
        try {
          const res = await fetchImpl(URL_GBP, { signal: AbortSignal.timeout(8000) });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const data = await res.json();
          const r = data && data.rates;
          const ok = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 100000;
          if (!r || !ok(r.NPR) || !ok(r.USD)) throw new Error('The rate site answered without the rupee or dollar rate.');
          const fresh = { rates: { NPR: r.NPR, USD: r.USD }, date: data.date || new Date(now()).toISOString().slice(0, 10), fetchedAt: new Date(now()).toISOString() };
          try { fs.mkdirSync(dir, { recursive: true }); writeFileAtomic(file, JSON.stringify(fresh)); } catch (e) { /* used this time all the same */ }
          return fresh;
        } catch (e) {
          if (kept) return { ...kept, stale: true };
          throw e;
        } finally { asking = null; }
      })();
    }
    return asking;
  }
  return {
    CURRENCIES,
    // Rupees for one unit of `currency` (rounded to 4 places).
    async toNpr(currency) {
      if (currency === 'NPR') return { ok: true, rate: 1, date: '' };
      if (!CURRENCIES.includes(currency)) return { ok: false, error: 'Unknown currency.' };
      try {
        const d = await latest();
        const rate = currency === 'GBP' ? d.rates.NPR : d.rates.NPR / d.rates.USD;
        return { ok: true, rate: Math.round(rate * 10000) / 10000, date: d.date, stale: Boolean(d.stale) };
      } catch (e) {
        return { ok: false, error: `Today's ${currency === 'USD' ? 'dollar' : 'pound'} rate could not be found (${e.message}). Enter the cost in rupees, or try again in a minute.` };
      }
    },
  };
}

module.exports = { createRates, CURRENCIES };
