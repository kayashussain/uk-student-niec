// The choices of "Where exactly" for each Student Source, kept consistent. The starting choices are in card-fields.js; anyone who
// adds students can add a missing one (a new platform, a new event with its date) and it is then offered to everyone, so students
// of the same platform or event are always tagged with the very same words and the Dashboard can count them.
//
// An event is stored with its date and shown as "UK Study Abroad, 21 Nov 2026". Kept in source-options.json in the data folder
// (never in git), written whole and atomically.

const fs = require('fs');
const path = require('path');
const { writeFileAtomic } = require('../shared/server-utils');
const Fields = require('./card-fields');
const { isoDay } = require('./cards');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const tidy = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const eventLabel = (name, date) => {
  const iso = isoDay(date);
  return iso ? `${name}, ${Number(iso.slice(8))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : name;
};

function createSourceOptions(dir) {
  const file = path.join(dir, 'source-options.json');
  let cache = null;
  function load() {
    let stat;
    try { stat = fs.statSync(file); } catch (e) { return { added: {} }; }
    if (cache && cache.mtimeMs === stat.mtimeMs && cache.size === stat.size) return cache.data;
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (raw && raw.added && typeof raw.added === 'object') {
        const added = {};
        Fields.SOURCE_CAN_ADD.forEach((src) => { added[src] = (Array.isArray(raw.added[src]) ? raw.added[src] : []).map((x) => tidy(x, 140)).filter(Boolean).slice(0, 300); });
        cache = { mtimeMs: stat.mtimeMs, size: stat.size, data: { added } };
        return cache.data;
      }
    } catch (e) { /* unreadable: started again below */ }
    return { added: {} };
  }
  return {
    // The choices of every source: the starting ones, then what was added (events newest first), without repeats.
    all(extraEvents = []) {
      const { added } = load();
      const out = {};
      Object.keys(Fields.SOURCE_DETAILS).forEach((src) => {
        const list = [...Fields.SOURCE_DETAILS[src], ...((added[src] || []))];
        if (src === 'Events') list.unshift(...extraEvents);
        const seen = new Set();
        out[src] = list.filter((x) => { const k = x.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
      });
      return out;
    },
    // Adds a choice. { value } is the text students are tagged with, or { error }.
    add(source, name, date) {
      if (!Fields.SOURCE_CAN_ADD.includes(source)) return { error: 'New choices cannot be added to that source.' };
      const clean = tidy(name, 100);
      if (!clean) return { error: source === 'Events' ? 'Please enter the name of the event.' : 'Please type the new choice.' };
      let value = clean;
      if (source === 'Events') {
        if (!isoDay(date)) return { error: 'Please choose the day of the event.' };
        value = eventLabel(clean, date);
      }
      const data = load();
      const list = data.added[source] || [];
      const known = [...(Fields.SOURCE_DETAILS[source] || []), ...list].find((x) => x.toLowerCase() === value.toLowerCase());
      if (known) return { value: known, existed: true };
      if (list.length >= 300) return { error: 'The list is full.' };
      const next = { added: { ...data.added, [source]: [...list, value] } };
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      writeFileAtomic(file, JSON.stringify(next, null, 1));
      const stat = fs.statSync(file);
      cache = { mtimeMs: stat.mtimeMs, size: stat.size, data: next };
      return { value };
    },
    stored: () => load(),
    restoreAll(data) {
      if (!data || typeof data !== 'object' || !data.added) return { error: 'The backup has no source choices in it.' };
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      writeFileAtomic(file, JSON.stringify({ added: data.added }, null, 1));
      cache = null;
      return { ok: true };
    },
  };
}

// The event a student's "where exactly" tag names. The full label (name and date) picks the exact event, so two events with the
// same name on different days are not mixed up; a tag with the bare name (or an unknown date) falls to the first event of that name.
function eventFor(events, detail) {
  const d = String(detail || '').trim().toLowerCase();
  if (!d) return null;
  const exact = events.find((e) => eventLabel(e.name, e.date).toLowerCase() === d);
  if (exact) return exact;
  return events.find((e) => { const n = String(e.name).toLowerCase(); return d === n || d.startsWith(n + ','); }) || null;
}

module.exports = { createSourceOptions, eventLabel, eventFor };
