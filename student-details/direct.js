// The University Partners list: the universities NIEC has a direct agreement with, each with its campuses,
// commission slabs and the other details a consultancy needs (agreement, contacts, payment terms, conditions).
// Admin only: the server refuses every other account (see server.js). Kept in direct-universities.json in the
// data folder, written whole and atomically. Nothing here is shared with the Advisor connector or the Fact File.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { writeFileAtomic } = require('../shared/server-utils');

const LIMITS = { name: 120, short: 300, text: 12000, campuses: 40, slabs: 60, contacts: 20, items: 300 };
const STATUSES = ['Active', 'Pending', 'On hold', 'Ended'];

const str = (v, max) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').slice(0, max) : '');
const newId = () => crypto.randomBytes(6).toString('hex');

// What is kept for a university, whatever was sent: only the known fields, as text, within limits.
function clean(input, old = {}) {
  const campuses = (Array.isArray(input.campuses) ? input.campuses : []).slice(0, LIMITS.campuses).map((c) => ({
    name: str(c && c.name, LIMITS.short).trim(),
    city: str(c && c.city, LIMITS.short).trim(),
    address: str(c && c.address, LIMITS.short).trim(),
    notes: str(c && c.notes, LIMITS.text),
  })).filter((c) => c.name || c.city);
  // The slabs: one row per band, e.g. level "UG", students "1 to 5", commission "15% of the first year fee".
  const slabs = (Array.isArray(input.slabs) ? input.slabs : []).slice(0, LIMITS.slabs).map((s) => ({
    level: str(s && s.level, LIMITS.short).trim(),
    students: str(s && s.students, LIMITS.short).trim(),
    commission: str(s && s.commission, LIMITS.short).trim(),
    note: str(s && s.note, LIMITS.text),
  })).filter((s) => s.level || s.students || s.commission || s.note);
  const contacts = (Array.isArray(input.contacts) ? input.contacts : []).slice(0, LIMITS.contacts).map((c) => ({
    name: str(c && c.name, LIMITS.short).trim(),
    role: str(c && c.role, LIMITS.short).trim(),
    email: str(c && c.email, LIMITS.short).trim(),
    phone: str(c && c.phone, LIMITS.short).trim(),
  })).filter((c) => c.name || c.email || c.phone);
  const status = STATUSES.includes(input.status) ? input.status : (STATUSES.includes(old.status) ? old.status : 'Active');
  return {
    id: old.id,
    name: str(input.name, LIMITS.name).trim() || old.name || '',
    country: str(input.country, LIMITS.short).trim(),
    website: str(input.website, LIMITS.short).trim(),
    status,
    campuses,
    // Commission
    commissionSummary: str(input.commissionSummary, LIMITS.text),
    slabs,
    commissionConditions: str(input.commissionConditions, LIMITS.text),
    paymentTerms: str(input.paymentTerms, LIMITS.text),
    bonus: str(input.bonus, LIMITS.text),
    // Agreement and working with the university
    agreementType: str(input.agreementType, LIMITS.short).trim(),
    agreementStart: str(input.agreementStart, 40).trim(),
    agreementEnd: str(input.agreementEnd, 40).trim(),
    territory: str(input.territory, LIMITS.text),
    intakes: str(input.intakes, LIMITS.text),
    portal: str(input.portal, LIMITS.short).trim(),
    applicationProcess: str(input.applicationProcess, LIMITS.text),
    scholarships: str(input.scholarships, LIMITS.text),
    marketing: str(input.marketing, LIMITS.text),
    contacts,
    notes: str(input.notes, LIMITS.text),
  };
}

// The list starts with NIEC's direct universities (names and campuses only; Admin fills in the commission). They are
// added once, when the list is first created: a university Admin later removes is not added back.
const STARTERS = [
  { name: 'Ulster University (QA)', campuses: [{ name: 'London', city: 'London' }, { name: 'Birmingham', city: 'Birmingham' }, { name: 'Manchester', city: 'Manchester' }], notes: 'Delivered with QA.' },
  { name: 'Northumbria University London (QA)', campuses: [{ name: 'London Campus', city: 'London' }], notes: 'Delivered with QA.' },
  { name: 'University of West London', campuses: [{ name: 'Ealing', city: 'London' }, { name: 'Brentford', city: 'London' }, { name: 'Reading', city: 'Reading' }] },
  { name: 'Bangor University', campuses: [{ name: 'Main Campus', city: 'Bangor, Wales' }] },
  { name: 'Middlesex University', campuses: [{ name: 'London Campus', city: 'London' }] },
];

function createDirect(dir, { now = () => new Date(), starters = STARTERS } = {}) {
  const file = path.join(dir, 'direct-universities.json');
  let cache = null; // { mtimeMs, size, data }

  function start() {
    const universities = starters.map((u) => ({ ...clean({ country: 'United Kingdom', ...u }), id: newId(), updatedAt: now().toISOString(), updatedBy: '' }));
    const data = { universities };
    if (universities.length) write(data);
    return data;
  }

  function load() {
    let stat;
    try { stat = fs.statSync(file); } catch (e) { return start(); } // first time: the starting list
    if (cache && cache.mtimeMs === stat.mtimeMs && cache.size === stat.size) return cache.data;
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Array.isArray(data.universities)) { cache = { mtimeMs: stat.mtimeMs, size: stat.size, data }; return data; }
    } catch (e) { /* unreadable: set aside below */ }
    // A damaged file is kept next to the data (never overwritten), then the list starts again.
    try { fs.renameSync(file, path.join(dir, `direct-universities.damaged-${now().toISOString().replace(/[:.]/g, '-')}.json`)); } catch (e) { /* ignore */ }
    return { universities: [] };
  }
  function write(data) {
    fs.mkdirSync(dir, { recursive: true });
    writeFileAtomic(file, JSON.stringify(data, null, 2));
    const stat = fs.statSync(file);
    cache = { mtimeMs: stat.mtimeMs, size: stat.size, data };
  }

  const full = (u) => ({ ...clean(u, u), id: u.id, updatedAt: u.updatedAt, updatedBy: u.updatedBy || '' });
  const summary = (u) => ({
    id: u.id, name: u.name, country: u.country, status: u.status,
    campuses: u.campuses.map((c) => [c.name, c.city].filter(Boolean).join(', ')),
    slabCount: u.slabs.length, commissionSummary: u.commissionSummary,
    agreementEnd: u.agreementEnd, updatedAt: u.updatedAt,
  });

  return {
    list() { return load().universities.map(full).map(summary).sort((a, b) => a.name.localeCompare(b.name)); },
    all() { return load().universities.map(full); },
    get(id) { const u = load().universities.find((x) => x.id === id); return u ? full(u) : null; },
    create(name, by) {
      const data = load();
      const cleaned = clean({ name });
      if (!cleaned.name) return { error: 'Please enter the university name.' };
      if (data.universities.some((u) => u.name.toLowerCase() === cleaned.name.toLowerCase())) return { error: 'That university is already in the list.' };
      if (data.universities.length >= LIMITS.items) return { error: 'The list is full.' };
      const uni = { ...cleaned, id: newId(), updatedAt: now().toISOString(), updatedBy: by };
      write({ ...data, universities: [...data.universities, uni] });
      return { university: full(uni) };
    },
    update(id, input, by) {
      const data = load();
      const i = data.universities.findIndex((u) => u.id === id);
      if (i === -1) return { error: 'No such university.' };
      const cleaned = clean(input, data.universities[i]);
      if (data.universities.some((u, k) => k !== i && u.name.toLowerCase() === cleaned.name.toLowerCase())) return { error: 'Another university already has that name.' };
      const universities = [...data.universities];
      universities[i] = { ...cleaned, id, updatedAt: now().toISOString(), updatedBy: by };
      write({ ...data, universities });
      return { university: full(universities[i]) };
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

module.exports = { createDirect, clean, STATUSES, STARTERS };
