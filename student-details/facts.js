// The Fact File: one page of facts per university (entry requirements, language test, courses, location,
// intakes and the application process) that every team can read and Admin edits. Kept in fact-file.json
// in the data folder, written whole and atomically (it is small), with a one-time starting list.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { writeFileAtomic } = require('../shared/server-utils');
const { UWL_DETAILS } = require('./fact-seed-uwl');
const { YSJU_DETAILS } = require('./fact-seed-ysju');
// The January 2027 intake sheet: each university's criteria, fees, courses and key dates (see fact-seed-sheet.json).
const SHEET = require('./fact-seed-sheet.json');

// The hand-written pages (from each university's own fact file or flyer). The January 2027 sheet adds an intake to them.
const HAND_DETAILS = { 'university of west london': UWL_DETAILS, 'york st john university': YSJU_DETAILS };

// Universities that start with their details filled in (matched by name, ignoring case). Where there is a hand-written
// page the sheet only adds its January 2027 intake; every other university takes the whole page from the sheet.
const STARTER_DETAILS = {};
Object.keys(SHEET).forEach((key) => {
  const entry = SHEET[key];
  const hand = HAND_DETAILS[key];
  STARTER_DETAILS[key] = hand ? { ...hand, intakes: [...hand.intakes, ...entry.intakes] } : entry;
});
Object.keys(HAND_DETAILS).forEach((key) => { if (!STARTER_DETAILS[key]) STARTER_DETAILS[key] = HAND_DETAILS[key]; });

// Names the list starts with: the first six were there before the sheet, the rest are added once to an existing list.
const ORIGINAL_STARTERS = ['University of West London', 'Bangor University', 'University of Roehampton', 'University of East London', 'University of York'];
const FIRST_ADDITION = 'York St John University';
const STARTER_UNIVERSITIES = [...ORIGINAL_STARTERS, FIRST_ADDITION];
Object.keys(SHEET).forEach((key) => { const n = SHEET[key].name; if (!STARTER_UNIVERSITIES.some((x) => x.toLowerCase() === key)) STARTER_UNIVERSITIES.push(n); });

// The usual steps for a student, as a starting point for each new university to adjust.
const STARTER_STEPS = [
  'Application submitted', 'Offer letter received', 'Pre-CAS interview', 'Tuition deposit paid', 'CAS issued', 'Visa application',
];

const LIMITS = { name: 120, short: 300, text: 12000, items: 300, intakes: 12, steps: 30, programs: 12 };

const str = (v, max) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').slice(0, max) : '');
const newId = () => crypto.randomBytes(6).toString('hex');

// What is kept for a university, whatever was sent: only the known fields, as text, within limits.
function clean(input, old = {}) {
  const intakes = (Array.isArray(input.intakes) ? input.intakes : []).slice(0, LIMITS.intakes).map((i) => ({
    id: /^[a-f0-9]{12}$/.test(i && i.id) ? i.id : newId(),
    name: str(i && i.name, LIMITS.short).trim(),
    deadline: str(i && i.deadline, LIMITS.short).trim(),
    requirements: str(i && i.requirements, LIMITS.text),
    courses: str(i && i.courses, LIMITS.text),
    notes: str(i && i.notes, LIMITS.text),
  })).filter((i) => i.name);
  const process = (Array.isArray(input.process) ? input.process : []).slice(0, LIMITS.steps).map((s) => ({
    title: str(s && s.title, LIMITS.short).trim(),
    detail: str(s && s.detail, LIMITS.text),
  })).filter((s) => s.title);
  // The fees table: one row per course level (UG, PG, ...), each cell plain text.
  const programs = (Array.isArray(input.programs) ? input.programs : []).slice(0, LIMITS.programs).map((p) => ({
    name: str(p && p.name, LIMITS.short).trim(),
    duration: str(p && p.duration, LIMITS.short).trim(),
    academic: str(p && p.academic, LIMITS.text),
    english: str(p && p.english, LIMITS.text),
    tuition: str(p && p.tuition, LIMITS.text),
    scholarship: str(p && p.scholarship, LIMITS.text),
    deposit: str(p && p.deposit, LIMITS.text),
  })).filter((p) => p.name);
  return {
    id: old.id,
    name: str(input.name, LIMITS.name).trim() || old.name || '',
    city: str(input.city, LIMITS.short).trim(),
    location: str(input.location, LIMITS.text),
    overview: str(input.overview, LIMITS.text),
    website: str(input.website, LIMITS.short).trim(),
    entryRequirements: str(input.entryRequirements, LIMITS.text),
    languageTests: str(input.languageTests, LIMITS.text),
    courses: str(input.courses, LIMITS.text),
    interview: str(input.interview, LIMITS.text),
    notes: str(input.notes, LIMITS.text),
    programs,
    intakes,
    process,
  };
}

const startKey = (name) => String(name || '').trim().toLowerCase();
const hasStarter = (name) => Object.prototype.hasOwnProperty.call(STARTER_DETAILS, startKey(name));
// A page nobody has filled in yet (only its name and the starter steps).
const isBlank = (u) => !(u.city || u.website || u.overview || u.entryRequirements || u.languageTests || u.courses || u.interview || u.notes || u.location
  || (u.programs && u.programs.length) || (u.intakes && u.intakes.length)
  || (u.process || []).some((s, i) => s.detail || s.title !== STARTER_STEPS[i]) || (u.process || []).length > STARTER_STEPS.length);
const starterFields = (u) => JSON.stringify([u.city, u.location, u.overview, u.website, u.entryRequirements, u.languageTests, u.courses, u.interview, u.notes, u.programs || [], u.intakes || [], u.process || []]);
const withStarterDetails = (u) => (hasStarter(u.name) ? { ...u, ...clean({ ...STARTER_DETAILS[startKey(u.name)], name: u.name, website: u.website || STARTER_DETAILS[startKey(u.name)].website || '' }, u) } : u);

function createFacts(dir, { now = () => new Date() } = {}) {
  const file = path.join(dir, 'fact-file.json');

  // The list is kept in memory and only re-read if the file changed on disk, so opening a page doesn't
  // parse (and check) the whole Fact File every time.
  let cache = null; // { mtimeMs, size, data }
  function read() {
    let stat;
    try { stat = fs.statSync(file); } catch (e) { return null; } // first time: start the list
    if (cache && cache.mtimeMs === stat.mtimeMs && cache.size === stat.size) return cache.data;
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Array.isArray(data.universities)) {
        cache = { mtimeMs: stat.mtimeMs, size: stat.size, data };
        return data;
      }
    } catch (e) { /* unreadable: set aside below */ }
    // A damaged file is kept next to the data (not overwritten), then the list starts again.
    try { fs.renameSync(file, path.join(dir, `fact-file.damaged-${now().toISOString().replace(/[:.]/g, '-')}.json`)); } catch (e) { /* ignore */ }
    return null;
  }
  function write(data) {
    fs.mkdirSync(dir, { recursive: true });
    writeFileAtomic(file, JSON.stringify(data, null, 2));
    const stat = fs.statSync(file);
    cache = { mtimeMs: stat.mtimeMs, size: stat.size, data };
  }
  function load() {
    let data = read();
    if (!data) {
      data = {
        universities: STARTER_UNIVERSITIES.map((name) => ({
          ...withStarterDetails(clean({ name, process: STARTER_STEPS.map((title) => ({ title })) })), id: newId(), updatedAt: now().toISOString(), updatedBy: '',
        })),
        starterAdded: [...STARTER_UNIVERSITIES],
      };
      write(data);
    } else {
      // A university with starter details is refreshed from them only while nobody has edited its page (still
      // empty, or still exactly as it was seeded). Once Admin saves it, their version is kept.
      let changed = false;
      // Universities added to the starter list after this file was created are added once (not again if Admin deletes them).
      const seen = new Set(data.starterAdded || ORIGINAL_STARTERS);
      STARTER_UNIVERSITIES.filter((n) => !seen.has(n)).forEach((name) => {
        if (!data.universities.some((u) => startKey(u.name) === startKey(name))) {
          data.universities.push({ ...withStarterDetails(clean({ name, process: STARTER_STEPS.map((title) => ({ title })) })), id: newId(), updatedAt: now().toISOString(), updatedBy: '' });
        }
        seen.add(name);
        changed = true;
      });
      data.starterAdded = [...seen];
      data.universities = data.universities.map((u) => {
        if (!hasStarter(u.name) || !(isBlank(u) || !u.updatedBy)) return u;
        const fresh = { ...withStarterDetails(u), id: u.id, updatedAt: u.updatedAt, updatedBy: u.updatedBy || '' };
        if (starterFields(fresh) === starterFields(u)) return u;
        changed = true;
        return { ...fresh, updatedAt: now().toISOString() };
      });
      if (changed) write(data);
    }
    return data;
  }

  const summary = (u) => ({ id: u.id, name: u.name, city: u.city, intakes: u.intakes.map((i) => i.name), updatedAt: u.updatedAt });

  // Course lines of a page: the course list and each intake's, without the "## " sub-headings.
  const courseLines = (u) => [u.courses, ...u.intakes.map((i) => i.courses)]
    .join('\n').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('##') && !/^The course list is under/.test(l));

  // Universities matching every word typed, by name, city or any course, so "cyber security" finds who
  // teaches it. `matches` holds up to four of the courses that matched; `matchCount` is how many.
  function search(q) {
    const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
    if (!words.length) return load().universities.map(summary);
    const hits = [];
    load().universities.forEach((u) => {
      const head = `${u.name} ${u.city}`.toLowerCase();
      const nameHit = words.every((w) => head.includes(w));
      const lines = courseLines(u).filter((l) => { const t = l.toLowerCase(); return words.every((w) => t.includes(w)); });
      if (nameHit || lines.length) hits.push({ ...summary(u), matches: [...new Set(lines)].slice(0, 4), matchCount: new Set(lines).size, nameHit });
    });
    return hits.sort((a, b) => (b.nameHit - a.nameHit) || (b.matchCount - a.matchCount) || a.name.localeCompare(b.name));
  }

  return {
    list: (q = '') => (String(q).trim() ? search(q) : load().universities.map(summary).sort((a, b) => a.name.localeCompare(b.name))),
    // Pages saved before the overview and fees table existed come back with those empty.
    get: (id) => { const u = load().universities.find((x) => x.id === id); return u ? { overview: '', programs: [], ...u } : null; },
    // Adds a university (just its name; the rest is filled in on its page).
    create(name, by) {
      const data = load();
      const cleaned = clean({ name, process: STARTER_STEPS.map((title) => ({ title })) });
      if (!cleaned.name) return { error: 'Please enter the university name.' };
      if (data.universities.some((u) => u.name.toLowerCase() === cleaned.name.toLowerCase())) return { error: 'That university is already in the list.' };
      const uni = { ...cleaned, id: newId(), updatedAt: now().toISOString(), updatedBy: by };
      data.universities.push(uni);
      write(data);
      return { university: uni };
    },
    update(id, input, by) {
      const data = load();
      const i = data.universities.findIndex((u) => u.id === id);
      if (i === -1) return { error: 'No such university.' };
      const cleaned = clean(input, data.universities[i]);
      if (data.universities.some((u, k) => k !== i && u.name.toLowerCase() === cleaned.name.toLowerCase())) return { error: 'Another university already has that name.' };
      data.universities[i] = { ...cleaned, id, updatedAt: now().toISOString(), updatedBy: by };
      write(data);
      return { university: data.universities[i] };
    },
    remove(id) {
      const data = load();
      const uni = data.universities.find((u) => u.id === id);
      if (!uni) return { error: 'No such university.' };
      write({ ...data, universities: data.universities.filter((u) => u.id !== id) });
      return { removed: uni };
    },
  };
}

module.exports = { createFacts, clean, STARTER_UNIVERSITIES, STARTER_STEPS };
