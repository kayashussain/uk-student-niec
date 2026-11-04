// The second lock on the Incentive page. Only Admin can open Incentive at all; on top of the login, Admin types one
// password (no username). The page is then open only while Admin is actually in it: going to any other page, closing
// or reloading the Incentive page, or leaving it idle for a while, locks it again, so the password is asked every time.
//
// The password is set on the server, never in the code (the code can be public): the environment variable
// INCENTIVE_PASSWORD. Without it the page stays locked and says so. Changing the password locks it again everywhere.
//
// The state is one small list in the server's memory: the login sessions that are unlocked right now, and when each
// would lapse. It is not a cookie and not a file, so there is nothing to get out of step with the rest of the app, and a
// restart of the server locks everything. The Claude connector does not use this at all: it reads the data folder
// directly, with its own secret address.
const crypto = require('crypto');

const IDLE_MS = 20 * 60 * 1000; // an open Incentive page that nobody touches for this long locks itself
const TRIES = 5; // wrong passwords allowed ...
const WINDOW_MS = 15 * 60 * 1000; // ... per person in this time, then wait for it to pass

const sha = (text) => crypto.createHash('sha256').update(text).digest();

function createIncentiveLock({ password = process.env.INCENTIVE_PASSWORD, now = Date.now } = {}) {
  const secret = String(password || '').trim(); // a stray space in the server setting must not make the real password impossible to type
  const configured = secret.length > 0;
  const open = new Map(); // login session id -> the time it lapses
  const fails = new Map(); // person -> times of recent wrong passwords

  // Forgets lapsed entries, so the list can never grow without end.
  function sweep() {
    const t = now();
    open.forEach((until, id) => { if (until <= t) open.delete(id); });
  }

  // Is this login session unlocked right now? Using the page keeps it open (the idle time starts again).
  function isUnlocked(req) {
    if (!configured || !req.sessionId) return false;
    const until = open.get(req.sessionId);
    if (!until || until <= now()) { open.delete(req.sessionId); return false; }
    open.set(req.sessionId, now() + IDLE_MS);
    return true;
  }

  // Checks the password typed. { ok: true } or { ok: false, status, error } (never 401: the pages treat a 401 as
  // "your login ran out" and send the person to the login page).
  function unlock(req, given) {
    if (!configured) return { ok: false, status: 503, error: 'The Incentive password has not been set on the server yet. Set INCENTIVE_PASSWORD and restart.' };
    if (!req.sessionId) return { ok: false, status: 403, error: 'Please log in again.' };
    const who = String((req.user && req.user.id) || req.sessionId);
    const recent = (fails.get(who) || []).filter((t) => now() - t < WINDOW_MS);
    if (recent.length >= TRIES) {
      const wait = Math.ceil((WINDOW_MS - (now() - recent[0])) / 60000);
      return { ok: false, status: 429, error: `Too many wrong passwords. Try again in ${wait} minute${wait === 1 ? '' : 's'}.` };
    }
    if (!crypto.timingSafeEqual(sha(String(given || '').trim()), sha(secret))) {
      recent.push(now());
      fails.set(who, recent);
      return { ok: false, status: 403, wrong: true, error: 'That password is not right.' };
    }
    fails.delete(who);
    sweep();
    open.set(req.sessionId, now() + IDLE_MS);
    return { ok: true };
  }

  // Locks one login session again (it went to another page, or left or reloaded Incentive).
  function lock(sessionId) {
    if (sessionId) open.delete(sessionId);
  }

  return { configured, isUnlocked, unlock, lock };
}

module.exports = { createIncentiveLock };
