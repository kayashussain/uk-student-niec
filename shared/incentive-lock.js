// The second lock on the Incentive page. Only Admin can open Incentive at all; on top of the login, Admin types one
// password (no username) the first time, and the page then stays open for a few hours on that login.
//
// The password is set on the server, never in the code (the code can be public): the environment variable
// INCENTIVE_PASSWORD. Without it the page stays locked and says so. Changing the password locks it again everywhere.
//
// The unlock is a cookie that only this login session can have made: it carries an expiry and a signature over the
// session id and that expiry, keyed from the password. Logging out, or another login, does not inherit it. The Claude
// connector does not use this at all: it reads the data folder directly, with its own secret address.
const crypto = require('crypto');

const OPEN_MS = 4 * 60 * 60 * 1000; // stays unlocked this long
const COOKIE = 'niec_incentive';
const TRIES = 5; // wrong passwords allowed ...
const WINDOW_MS = 15 * 60 * 1000; // ... per person in this time, then wait for it to pass

const sha = (text) => crypto.createHash('sha256').update(text).digest();

function readCookie(req, name) {
  const found = String(req.headers.cookie || '').split(';').map((p) => p.trim()).find((p) => p.startsWith(name + '='));
  return found ? found.slice(name.length + 1) : '';
}

function createIncentiveLock({ password = process.env.INCENTIVE_PASSWORD, now = Date.now } = {}) {
  const secret = String(password || '');
  const configured = secret.length > 0;
  const key = sha('niec-incentive-lock\0' + secret);
  const sign = (sessionId, expires) => crypto.createHmac('sha256', key).update(`${sessionId}.${expires}`).digest('base64url');
  const fails = new Map(); // person -> times of recent wrong passwords

  function isUnlocked(req) {
    if (!configured || !req.sessionId) return false;
    const [expires, sig] = readCookie(req, COOKIE).split('.');
    if (!sig || !(Number(expires) > now())) return false;
    const want = Buffer.from(sign(req.sessionId, expires));
    const got = Buffer.from(sig);
    return want.length === got.length && crypto.timingSafeEqual(want, got);
  }

  // Checks the password typed, and on success sets the cookie. { ok: true } or { ok: false, status, error }.
  function unlock(req, res, given, { secure = false } = {}) {
    if (!configured) return { ok: false, status: 503, error: 'The Incentive password has not been set on the server yet. Set INCENTIVE_PASSWORD and restart.' };
    const who = String(req.user && req.user.id || req.sessionId || 'unknown');
    const recent = (fails.get(who) || []).filter((t) => now() - t < WINDOW_MS);
    if (recent.length >= TRIES) {
      const wait = Math.ceil((WINDOW_MS - (now() - recent[0])) / 60000);
      return { ok: false, status: 429, error: `Too many wrong passwords. Try again in ${wait} minute${wait === 1 ? '' : 's'}.` };
    }
    const right = crypto.timingSafeEqual(sha(String(given || '').trim()), sha(secret));
    if (!right) {
      recent.push(now());
      fails.set(who, recent);
      // 403, never 401: the pages treat a 401 as "your login ran out" and send the person to the login page.
      return { ok: false, status: 403, wrong: true, error: 'That password is not right.' };
    }
    fails.delete(who);
    const expires = now() + OPEN_MS;
    res.setHeader('Set-Cookie', `${COOKIE}=${expires}.${sign(req.sessionId, expires)}; Path=/incentive; Max-Age=${OPEN_MS / 1000}; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`);
    return { ok: true };
  }

  return { configured, isUnlocked, unlock };
}

module.exports = { createIncentiveLock };
