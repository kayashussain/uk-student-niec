// Costs typed in dollars or pounds are turned into rupees at the day's rate (shared/exchange-rates.js): asked of the rate site at most
// once an hour, kept beside the data, and an older answer is used when the site cannot be reached. A pretend rate site is used here.
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { createRates } = require('../shared/exchange-rates');

test('exchange rates: dollars and pounds to rupees, asked once an hour, an older answer when the site is down', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'niec-rates-'));
  let asked = 0;
  let down = false;
  let clock = Date.parse('2026-11-14T10:00:00Z');
  const fetchImpl = async () => {
    asked += 1;
    if (down) throw new Error('offline');
    return { ok: true, json: async () => ({ date: '2026-11-14', rates: { NPR: 180, USD: 1.25 } }) };
  };
  const rates = createRates(dir, { fetchImpl, now: () => clock });
  assert.deepStrictEqual(await rates.toNpr('NPR'), { ok: true, rate: 1, date: '' });
  const gbp = await rates.toNpr('GBP');
  assert.deepStrictEqual([gbp.ok, gbp.rate], [true, 180]);
  const usd = await rates.toNpr('USD');
  assert.deepStrictEqual([usd.ok, usd.rate], [true, 144], 'rupees for one dollar: 180 / 1.25');
  assert.strictEqual(asked, 1, 'asked once, then the kept answer is used');
  clock += 2 * 60 * 60 * 1000;
  down = true;
  const stale = await rates.toNpr('USD');
  assert.deepStrictEqual([stale.ok, stale.rate, stale.stale], [true, 144, true], 'the older answer when the site is down');
  const none = createRates(fs.mkdtempSync(path.join(os.tmpdir(), 'niec-rates-')), { fetchImpl });
  const failed = await none.toNpr('USD');
  assert.strictEqual(failed.ok, false);
  assert.match(failed.error, /Enter the cost in rupees/);
});
