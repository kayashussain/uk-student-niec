// The weekly check of the course pages. About a seventh of the courses is looked at every day, so each course is visited about once a
// week, always on the university's own website (university-websites.js) and nowhere else:
//   - a course with no page written down is searched for (course-finder.js), and the page found is remembered;
//   - a course with a page is opened: if the page is gone (404 or 410), or no longer says anything about the course, or the fees or intake
//     months written on it are not the ones seen last week, the course gets a WARNING for a person to confirm;
//   - a page that moved to a new address on the same website is followed, and the new address is remembered.
// Nothing in the Fact File is changed by the check itself: the warning says what was found, and a person confirms it (Confirm), or
// corrects the Fact File. The results are kept in course-watch.json in the data folder (never in git).

const fs = require('fs');
const path = require('path');
const { writeFileAtomic } = require('../shared/server-utils');
const { linkKey } = require('./course-index');
const { hostsOf, onHosts } = require('./university-websites');

const DAY = 24 * 60 * 60 * 1000;
const STOP = new Set(['the', 'of', 'and', 'in', 'for', 'with', 'a', 'an', 'at', 'university', 'hons', 'msc', 'ma', 'ba', 'bsc', 'mba', 'top', 'up', 'placement', 'year', 'full', 'time', 'part', 'london', 'campus']);
const words = (t) => String(t || '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));

// What is read from a course page: the title, the fees (pounds, 1,000 or more) and the intake months.
function readPage(html) {
  const raw = String(html || '');
  const title = ((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(raw) || [])[1] || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  const body = raw.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&pound;/g, '£').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ');
  const fees = [...new Set((body.match(/£\s?\d{1,3}(?:,\d{3})+|£\s?\d{4,6}/g) || []).map((m) => Number(m.replace(/[^\d]/g, ''))).filter((n) => n >= 1000 && n < 100000))].sort((a, b) => a - b).slice(0, 8);
  const intakes = [...new Set((body.match(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d\d\b/g) || []))].slice(0, 8);
  return { title, text: body.toLowerCase().slice(0, 200000), fees, intakes };
}
const sameList = (a, b) => JSON.stringify(a || []) === JSON.stringify(b || []);

function createCourseWatch({ dir, getIndex, facts, finder, courseLinks, fetchFn = (typeof fetch === 'function' ? fetch : null), now = () => Date.now(), pauseMs = 1500, perRun = 320, everyDays = 7 }) {
  const file = path.join(dir, 'course-watch.json');
  const read = () => { try { const d = JSON.parse(fs.readFileSync(file, 'utf8')); return d && typeof d === 'object' && d.checks ? d : { checks: {}, lastRun: '' }; } catch (e) { return { checks: {}, lastRun: '' }; } };
  const write = (d) => { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); writeFileAtomic(file, JSON.stringify(d, null, 1)); };
  let running = false;

  async function openPage(url) {
    const res = await fetchFn(url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Fly-portal)' }, signal: AbortSignal.timeout(20000) });
    const html = res.ok ? (await res.text()).slice(0, 600000) : '';
    return { status: res.status, ok: res.ok, finalUrl: res.url || url, html };
  }

  // Checks one course; returns its new record.
  async function checkOne(entry, old, hosts) {
    const key = linkKey(entry.universityId, entry.course);
    const at = new Date(now()).toISOString();
    const rec = { ...(old || {}), checkedAt: at, university: entry.university, course: entry.course };
    let link = entry.linkIsCourse ? entry.link : '';
    if (!link) {
      const found = await finder.lookup({ university: entry.university, course: entry.course, hosts });
      if (!found.link) return { ...rec, status: 'nolink', link: '', note: found.error || 'No course page found.' };
      link = found.link;
      courseLinks.remember(entry.universityId, entry.course, link);
    }
    rec.link = link;
    let page;
    try { page = await openPage(link); } catch (e) { return { ...rec, status: 'unreachable', note: `The page could not be opened (${e.message}).` }; }
    if (page.status === 404 || page.status === 410) return { ...rec, status: 'inactive', confirmed: false, note: `The page is gone (the website answered ${page.status}).` };
    if (!page.ok) return { ...rec, status: 'unreachable', note: `The website answered ${page.status}.` };
    if (page.finalUrl && page.finalUrl !== link && onHosts(page.finalUrl, hosts) && new URL(page.finalUrl).pathname.length > 1) { link = page.finalUrl; rec.link = link; courseLinks.remember(entry.universityId, entry.course, link); rec.movedTo = link; }
    const read1 = readPage(page.html);
    const need = words(entry.course);
    const hits = need.filter((w) => read1.text.includes(w)).length;
    if (need.length && hits < Math.max(1, Math.ceil(need.length / 2))) return { ...rec, status: 'unclear', confirmed: false, facts: { fees: read1.fees, intakes: read1.intakes, title: read1.title }, note: 'The page no longer seems to be about this course (its words are not on the page). The course may have been renamed, archived or replaced.' };
    const before = rec.facts;
    rec.facts = { fees: read1.fees, intakes: read1.intakes, title: read1.title };
    const changes = [];
    if (before && !sameList(before.fees, read1.fees)) changes.push(`Fees written on the page were ${before.fees.map((n) => '£' + n.toLocaleString('en-GB')).join(', ') || 'none'} and are now ${read1.fees.map((n) => '£' + n.toLocaleString('en-GB')).join(', ') || 'none'}.`);
    if (before && !sameList(before.intakes, read1.intakes)) changes.push(`Intakes written on the page were ${before.intakes.join(', ') || 'none'} and are now ${read1.intakes.join(', ') || 'none'}.`);
    if (changes.length) return { ...rec, status: 'changed', confirmed: false, changedAt: at, note: changes.join(' ') };
    return { ...rec, status: 'active', confirmed: false, note: '' };
  }

  // One round: the courses that are due (never looked at, or looked at more than `everyDays` ago), oldest first, up to `perRun`.
  async function run({ limit = perRun } = {}) {
    if (running || !fetchFn) return { skipped: true };
    running = true;
    try {
      const data = read();
      const universities = new Map(facts.all().map((u) => [u.id, u]));
      const due = getIndex().filter((e) => hostsOf(universities.get(e.universityId) || {}).length)
        .map((e) => ({ e, key: linkKey(e.universityId, e.course) }))
        .filter(({ key }) => !data.checks[key] || now() - Date.parse(data.checks[key].checkedAt) >= everyDays * DAY)
        .sort((a, b) => Date.parse((data.checks[a.key] || {}).checkedAt || 0) - Date.parse((data.checks[b.key] || {}).checkedAt || 0))
        .slice(0, limit);
      let n = 0;
      for (const { e, key } of due) {
        const hosts = hostsOf(universities.get(e.universityId));
        const prev = data.checks[key];
        const result = await checkOne(e, prev, hosts).catch((err) => ({ ...(prev || {}), checkedAt: new Date(now()).toISOString(), status: 'unreachable', note: err.message }));
        // A warning a person has confirmed stays quiet until the page changes again.
        if (prev && prev.confirmed && (result.status === prev.status) && result.note === prev.note) result.confirmed = true;
        data.checks[key] = result;
        n += 1;
        if (n % 20 === 0) write({ ...data, lastRun: new Date(now()).toISOString() });
        await new Promise((r) => setTimeout(r, pauseMs));
      }
      write({ ...data, lastRun: new Date(now()).toISOString() });
      return { checked: n, left: Math.max(0, getIndex().length - n) };
    } finally { running = false; }
  }

  const WARN = new Set(['inactive', 'unclear', 'changed']);
  return {
    run,
    isRunning: () => running,
    // The warnings: each with what was found, for a person to confirm. `universityId` narrows them to one university.
    warnings(universityId = '') {
      const d = read();
      return Object.entries(d.checks).filter(([key, c]) => WARN.has(c.status) && !c.confirmed && (!universityId || key.startsWith(universityId))).map(([key, c]) => ({ key, university: c.university, course: c.course, link: c.link, status: c.status, note: c.note, checkedAt: c.checkedAt }));
    },
    summary() {
      const d = read();
      const all = Object.values(d.checks);
      return { lastRun: d.lastRun, checked: all.length, active: all.filter((c) => c.status === 'active').length, noLink: all.filter((c) => c.status === 'nolink').length, warnings: all.filter((c) => WARN.has(c.status) && !c.confirmed).length };
    },
    // A person has looked at the warning and accepted what the page says now.
    confirm(key) {
      const d = read();
      if (!d.checks[key]) return false;
      d.checks[key] = { ...d.checks[key], confirmed: true };
      write(d);
      return true;
    },
  };
}

module.exports = { createCourseWatch, readPage };
