// The Fact File: one page of facts per university (entry requirements, language test, courses, location,
// intakes and the application process) that every team can read and Admin edits. Kept in fact-file.json
// in the data folder, written whole and atomically (it is small), with a one-time starting list.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { writeFileAtomic } = require('../shared/server-utils');
const { UWL_DETAILS } = require('./fact-seed-uwl');
const { YSJU_DETAILS } = require('./fact-seed-ysju');

// Universities the list starts with the first time it is opened. Only names: the details are for Admin to enter.
const STARTER_UNIVERSITIES = ['University of West London', 'Bangor University', 'University of Roehampton', 'University of East London', 'University of York', 'York St John University'];

// Universities that start with their details filled in (matched by name, ignoring case).
const STARTER_DETAILS = { 'university of west london': UWL_DETAILS, 'york st john university': YSJU_DETAILS };

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
const isBlank = (u) => !(u.overview || u.entryRequirements || u.languageTests || u.courses || u.interview || u.notes || u.location
  || (u.programs && u.programs.length) || (u.intakes && u.intakes.length)
  || (u.process || []).some((s, i) => s.detail || s.title !== STARTER_STEPS[i]) || (u.process || []).length > STARTER_STEPS.length);
const starterFields = (u) => JSON.stringify([u.city, u.location, u.overview, u.website, u.entryRequirements, u.languageTests, u.courses, u.interview, u.notes, u.programs || [], u.intakes || [], u.process || []]);
const withStarterDetails = (u) => (hasStarter(u.name) ? { ...u, ...clean({ ...STARTER_DETAILS[startKey(u.name)], name: u.name, website: u.website || STARTER_DETAILS[startKey(u.name)].website || '' }, u) } : u);

function createFacts(dir, { now = () => new Date() } = {}) {
  const file = path.join(dir, 'fact-file.json');

  function read() {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Array.isArray(data.universities)) return data;
    } catch (e) { /* first time, or unreadable: start the list */ }
    return null;
  }
  function write(data) {
    fs.mkdirSync(dir, { recursive: true });
    writeFileAtomic(file, JSON.stringify(data, null, 2));
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
      const seen = new Set(data.starterAdded || STARTER_UNIVERSITIES.filter((n) => n !== 'York St John University'));
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

  return {
    list: () => load().universities.map(summary).sort((a, b) => a.name.localeCompare(b.name)),
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
