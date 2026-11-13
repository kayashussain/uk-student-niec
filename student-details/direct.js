// The Partner Universities list: the universities NIEC has a direct agreement with, each with its campuses,
// commission slabs and the other details a consultancy needs (agreement, contacts, payment terms, conditions).
// Admin only: the server refuses every other account (see server.js). Kept in direct-universities.json in the
// data folder, written whole and atomically. Nothing here is shared with the Advisor connector or the Fact File.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { writeFileAtomic } = require('../shared/server-utils');

const fileName = (v) => String(v || '').replace(/[\\/\u0000-\u001f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/^\.+/, '').trim().slice(0, 120);

const LIMITS = { name: 120, short: 300, text: 12000, campuses: 40, slabs: 60, contacts: 20, items: 300 };
const STATUSES = ['Active', 'Pending', 'On hold', 'Ended'];
const TYPES = ['Direct', 'Through a B2B partner'];
// Agreement files: a few kinds of document, kept outside the code folder next to the list (see createDirect).
const FILE_TYPES = {
  '.pdf': 'application/pdf', '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
};
// What a file must start with to be what its name says (a renamed program or script is refused).
const MAGIC = {
  '.pdf': [Buffer.from('%PDF-')],
  '.doc': [Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])],
  '.docx': [Buffer.from([0x50, 0x4b, 0x03, 0x04])],
  '.png': [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  '.jpg': [Buffer.from([0xff, 0xd8, 0xff])],
  '.jpeg': [Buffer.from([0xff, 0xd8, 0xff])],
};
const looksLike = (ext, bytes) => (MAGIC[ext] || []).some((m) => bytes.length >= m.length && bytes.subarray(0, m.length).equals(m));
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 20;

const str = (v, max) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').slice(0, max) : '');
const newId = () => crypto.randomBytes(6).toString('hex');
// Where applications to the university are sent: a web portal (only a real http or https address is kept, so a link can
// never run a script; "apply.uni.ac.uk" gets https:// in front) and an email address. Anything else is not kept.
function cleanPortal(v) {
  let s = str(v, 600).trim();
  if (!s) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s) && /^[\w-]+(\.[\w-]+)+(:\d+)?([/?#].*)?$/.test(s)) s = 'https://' + s;
  try { const u = new URL(s); return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname.includes('.') ? u.href : ''; } catch (e) { return ''; }
}
// The one "Application" box: an email goes to applyEmail, anything else is tried as a portal link. Without the box
// (a stored record, a backup) the two stored fields are read as they are. The login is kept only with a portal.
function applyRoute(input) {
  let applyPortal; let applyEmail;
  if (typeof input.apply === 'string') {
    const v = input.apply.trim();
    applyEmail = cleanApplyEmail(v);
    applyPortal = applyEmail ? '' : cleanPortal(v);
  } else {
    applyPortal = cleanPortal(input.applyPortal);
    applyEmail = applyPortal ? '' : cleanApplyEmail(input.applyEmail);
  }
  return {
    applyPortal,
    applyEmail,
    applyUser: applyPortal ? str(input.applyUser, 200).trim() : '',
    applyPassword: applyPortal ? str(input.applyPassword, 200).replace(/\n/g, '').trim() : '',
  };
}
function cleanApplyEmail(v) {
  const s = str(v, 254).trim();
  return /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(s) ? s : '';
}

// What is kept for a university, whatever was sent: only the known fields, as text, within limits.
// Only what a consultancy needs day to day: campuses, commission slabs and payment terms, when the agreement ends,
// who to contact, and a notes box for anything else.
function clean(input, old = {}) {
  const campuses = (Array.isArray(input.campuses) ? input.campuses : []).slice(0, LIMITS.campuses).map((c) => ({
    name: str(c && c.name, LIMITS.short).trim(),
    city: str(c && c.city, LIMITS.short).trim(),
  })).filter((c) => c.name || c.city);
  // The slabs: one row per band, e.g. level "UG", students "1 to 5", commission "15% of the first year fee".
  const slabs = (Array.isArray(input.slabs) ? input.slabs : []).slice(0, LIMITS.slabs).map((s) => ({
    level: str(s && s.level, LIMITS.short).trim(),
    students: str(s && s.students, LIMITS.short).trim(),
    commission: str(s && s.commission, LIMITS.short).trim(),
  })).filter((s) => s.level || s.students || s.commission);
  const contacts = (Array.isArray(input.contacts) ? input.contacts : []).slice(0, LIMITS.contacts).map((c) => ({
    name: str(c && c.name, LIMITS.short).trim(),
    email: str(c && c.email, LIMITS.short).trim(),
    phone: str(c && c.phone, LIMITS.short).trim(),
  })).filter((c) => c.name || c.email || c.phone);
  const status = STATUSES.includes(input.status) ? input.status : (STATUSES.includes(old.status) ? old.status : 'Active');
  return {
    id: old.id,
    name: str(input.name, LIMITS.name).trim() || old.name || '',
    status,
    // How you hold the partnership: its own agreement with the university, or through a B2B partner (named in `via`).
    type: TYPES.includes(input.type) ? input.type : (TYPES.includes(old.type) ? old.type : 'Direct'),
    via: str(input.via, LIMITS.name).trim(),
    agreementStart: str(input.agreementStart, 40).trim(),
    campuses,
    slabs,
    paymentTerms: str(input.paymentTerms, LIMITS.text),
    agreementEnd: str(input.agreementEnd, 40).trim(),
    contacts,
    // How the team sends an application to this university: one box, a portal link OR an email (`apply`), kept as
    // applyPortal or applyEmail. A portal can have the login the team uses on it. All optional; older records have none.
    ...applyRoute(input),
    notes: str(input.notes, LIMITS.text),
  };
}

// The list starts with NIEC's direct universities (names and campuses only; Admin fills in the commission). They are
// added once, when the list is first created: a university Admin later removes is not added back.
const STARTERS = [
  { name: 'Ulster University (QA)', campuses: [{ name: 'London', city: 'London' }, { name: 'Birmingham', city: 'Birmingham' }, { name: 'Manchester', city: 'Manchester' }], notes: 'Delivered with QA.' },
  { name: 'Northumbria University London (QA)', campuses: [{ name: 'London Campus', city: 'London' }], notes: 'Delivered with QA.' },
  { name: 'University of West London', campuses: [{ name: 'Ealing', city: 'London' }, { name: 'Brentford', city: 'London' }, { name: 'Reading', city: 'Reading' }] },
  {
    name: 'Bangor University', campuses: [{ name: 'Main Campus', city: 'Bangor, Wales' }],
    // The regional team named on Bangor's flyer (also in its Fact File page).
    contacts: [
      { name: 'Braj Jha (Regional Manager)', email: 'b.jha@bangor.ac.uk', phone: '+44 7833769210' },
      { name: 'Rajinder Kaur (Senior Regional Officer)', email: 'r.kaur@bangor.ac.uk', phone: '+91 98770 80865' },
      { name: 'Swathy Nair (Regional Officer)', email: 's.nair@bangor.ac.uk', phone: '+91 98714 92221' },
    ],
  },
  { name: 'Middlesex University', campuses: [{ name: 'London Campus', city: 'London' }] },
];

const agreementsOf = (u) => (Array.isArray(u.agreements) ? u.agreements : []).filter((a) => a && /^[a-f0-9]{12}$/.test(a.id)).map((a) => ({
  id: a.id, name: fileName(a.name), size: Number(a.size) || 0, uploadedAt: a.uploadedAt || '', uploadedBy: a.uploadedBy || '', ext: Object.prototype.hasOwnProperty.call(FILE_TYPES, a.ext) ? a.ext : '',
}));
const full = (u) => ({ ...clean(u, u), agreements: agreementsOf(u), id: u.id, updatedAt: u.updatedAt, updatedBy: u.updatedBy || '' });
const summary = (u) => ({
  id: u.id, name: u.name, status: u.status, type: u.type, via: u.via,
  campuses: u.campuses.map((c) => [...new Set([c.name, c.city].filter(Boolean))].join(', ')),
  slabCount: u.slabs.length,
  slabs: u.slabs.map((x) => [x.level, x.students, x.commission].filter(Boolean).join(' ')),
  agreementEnd: u.agreementEnd, agreementCount: u.agreements.length, updatedAt: u.updatedAt,
  // The first contact person is shown in the list; the rest are on the university's page.
  contact: u.contacts[0] || { name: '', email: '', phone: '' }, contactCount: u.contacts.length,
  applyPortal: u.applyPortal || '', applyEmail: u.applyEmail || '', applyLogin: Boolean(u.applyUser || u.applyPassword),
});


// Read only list and pages of a given set of partner universities (a backup), shaped like the live ones.
const viewDirect = (universities) => ({
  list: () => universities.map(full).map(summary).sort((a, b) => a.name.localeCompare(b.name)),
  get: (id) => { const u = universities.find((x) => x.id === id); return u ? full(u) : null; },
});

// The same store also keeps the B2B partners (b2b.js): another file, another folder for its agreement files, and its
// own list of details (`clean` and `summary`). Everything else (agreement files, the damaged file set aside) is shared.
function createDirect(dir, {
  now = () => new Date(), starters = STARTERS, file: storeFile = 'direct-universities.json', filesFolder = 'direct-files',
  clean: cleanOne = clean, summary: summaryOf = summary, what = 'university',
} = {}) {
  const file = path.join(dir, storeFile);
  const full = (u) => ({ ...cleanOne(u, u), agreements: agreementsOf(u), id: u.id, updatedAt: u.updatedAt, updatedBy: u.updatedBy || '' });
  let cache = null; // { mtimeMs, size, data }

  function start() {
    const universities = starters.map((u) => ({ ...cleanOne(u), id: newId(), updatedAt: now().toISOString(), updatedBy: '' }));
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
    try { fs.renameSync(file, path.join(dir, `${storeFile.replace(/\.json$/, '')}.damaged-${now().toISOString().replace(/[:.]/g, '-')}.json`)); } catch (e) { /* ignore */ }
    return { universities: [] };
  }
  function write(data) {
    fs.mkdirSync(dir, { recursive: true });
    writeFileAtomic(file, JSON.stringify(data, null, 2));
    const stat = fs.statSync(file);
    cache = { mtimeMs: stat.mtimeMs, size: stat.size, data };
  }

  const filesDir = (id) => path.join(dir, filesFolder, id);

  return {
    list() { return load().universities.map(full).map(summaryOf).sort((a, b) => a.name.localeCompare(b.name)); },
    all() { return load().universities.map(full); },
    get(id) { const u = load().universities.find((x) => x.id === id); return u ? full(u) : null; },
    create(name, by) {
      const data = load();
      const cleaned = cleanOne({ name });
      if (!cleaned.name) return { error: `Please enter the ${what} name.` };
      if (data.universities.some((u) => u.name.toLowerCase() === cleaned.name.toLowerCase())) return { error: `That ${what} is already in the list.` };
      if (data.universities.length >= LIMITS.items) return { error: 'The list is full.' };
      const uni = { ...cleaned, id: newId(), updatedAt: now().toISOString(), updatedBy: by };
      write({ ...data, universities: [...data.universities, uni] });
      return { university: full(uni) };
    },
    update(id, input, by) {
      const data = load();
      const i = data.universities.findIndex((u) => u.id === id);
      if (i === -1) return { error: `No such ${what}.` };
      const cleaned = cleanOne(input, data.universities[i]);
      if (data.universities.some((u, k) => k !== i && u.name.toLowerCase() === cleaned.name.toLowerCase())) return { error: `Another ${what} already has that name.` };
      const universities = [...data.universities];
      universities[i] = { ...cleaned, agreements: agreementsOf(data.universities[i]), id, updatedAt: now().toISOString(), updatedBy: by };
      write({ ...data, universities });
      return { university: full(universities[i]) };
    },
    remove(id) {
      const data = load();
      const uni = data.universities.find((u) => u.id === id);
      if (!uni) return { error: `No such ${what}.` };
      write({ ...data, universities: data.universities.filter((u) => u.id !== id) });
      try { fs.rmSync(filesDir(id), { recursive: true, force: true }); } catch (e) { /* nothing to remove */ }
      return { removed: uni };
    },
    // Puts back the whole list from a backup. An agreement whose file is no longer on disk is dropped from the page.
    restoreAll(universities) {
      if (!Array.isArray(universities)) return { error: 'The backup has no Partner Universities in it.' };
      const restored = universities.filter((u) => u && /^[a-f0-9]{12}$/.test(u.id) && u.name).map((u) => {
        const kept = full(u);
        return { ...kept, agreements: kept.agreements.filter((a) => a.ext && fs.existsSync(path.join(filesDir(kept.id), a.id + a.ext))) };
      });
      write({ ...load(), universities: restored });
      return { count: restored.length };
    },
    // Agreement files. The file is stored under its own id (never under the name typed), the name is only kept to show.
    addAgreement(id, name, bytes, by) {
      const data = load();
      const i = data.universities.findIndex((u) => u.id === id);
      if (i === -1) return { error: `No such ${what}.` };
      const shown = fileName(name);
      const ext = path.extname(shown).toLowerCase();
      if (!shown || !Object.prototype.hasOwnProperty.call(FILE_TYPES, ext)) return { error: 'Please upload a PDF, Word document (.doc, .docx) or an image (.png, .jpg).' };
      if (!bytes || !bytes.length) return { error: 'That file is empty.' };
      if (bytes.length > MAX_FILE_BYTES) return { error: 'That file is too large (the limit is 10 MB).' };
      if (!looksLike(ext, bytes)) return { error: 'That file is not really a ' + ext.slice(1).toUpperCase() + ' document. Please upload the original PDF, Word document or image.' };
      const current = agreementsOf(data.universities[i]);
      if (current.length >= MAX_FILES) return { error: `This ${what} already has the most files allowed.` };
      const fid = newId();
      fs.mkdirSync(filesDir(id), { recursive: true });
      writeFileAtomic(path.join(filesDir(id), fid + ext), bytes);
      const entry = { id: fid, name: shown, size: bytes.length, uploadedAt: now().toISOString(), uploadedBy: by || '', ext };
      const universities = [...data.universities];
      universities[i] = { ...data.universities[i], agreements: [...current, entry], updatedAt: now().toISOString(), updatedBy: by };
      write({ ...data, universities });
      return { university: full(universities[i]), agreement: entry };
    },
    // Where an agreement file is on disk, and how to send it. null if there is no such file.
    agreementFile(id, fid) {
      const u = load().universities.find((x) => x.id === id);
      const entry = u && agreementsOf(u).find((a) => a.id === fid);
      if (!entry || !entry.ext) return null;
      const file = path.join(filesDir(id), fid + entry.ext);
      return fs.existsSync(file) ? { path: file, name: entry.name, type: FILE_TYPES[entry.ext] } : null;
    },
    removeAgreement(id, fid, by) {
      const data = load();
      const i = data.universities.findIndex((u) => u.id === id);
      const entry = i !== -1 && agreementsOf(data.universities[i]).find((a) => a.id === fid);
      if (!entry) return { error: 'No such file.' };
      try { fs.rmSync(path.join(filesDir(id), fid + entry.ext), { force: true }); } catch (e) { /* already gone */ }
      const universities = [...data.universities];
      universities[i] = { ...data.universities[i], agreements: agreementsOf(data.universities[i]).filter((a) => a.id !== fid), updatedAt: now().toISOString(), updatedBy: by };
      write({ ...data, universities });
      return { university: full(universities[i]), removed: entry };
    },
  };
}

module.exports = { createDirect, viewDirect, clean, cleanPortal, cleanApplyEmail, STATUSES, TYPES, STARTERS, FILE_TYPES, MAX_FILE_BYTES, LIMITS };
