// The student cards: everything NIEC knows about a student that is not a column of the sheet. Where the student
// came from exactly, what the student has studied (for the Fact File assistant), notes, the university options prepared
// for them and the record of the messages sent to them.
//
// A card belongs to one student and is found by the student's row id (the `_id` every row of the sheet has, which
// stays the same when the student is edited, moved to another stage or deferred to the next intake). The sheet itself
// is not touched: it keeps exactly the columns it has.
//
// Kept in cards.json in the data folder (never in git, never served), written whole and atomically. The first save
// of each day first copies the file as it was into backups/cards-YYYY-MM-DD.json (the latest 60 are kept), and the
// 6 p.m. backup holds the cards too. The words of each sent message are kept apart in message-log.jsonl, so the cards
// file stays small.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { writeFileAtomic, snapshotDaily, localDate } = require('../shared/server-utils');
const Fields = require('./card-fields');

const LIMITS = { tasks: 200, comments: 200, notes: 500, noteText: 4000, options: 40, messages: 400, short: 300, text: 2000, cards: 50000 };
const ROW_ID = /^[\w-]{1,64}$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const newId = () => crypto.randomBytes(6).toString('hex');
const str = (v, max) => (typeof v === 'string' || typeof v === 'number' ? String(v).replace(/\r\n?/g, '\n').slice(0, max).trim() : '');
// A real calendar day as YYYY-MM-DD, else ''.
function isoDay(v) {
  const s = str(v, 10);
  if (!ISO_DAY.test(s)) return '';
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? s : '';
}

const LISTS = {
  STUDY_LEVELS: Fields.STUDY_LEVELS, QUALIFICATIONS: Fields.QUALIFICATIONS,
  ENGLISH_TESTS: Fields.ENGLISH_TESTS, LOST_REASONS: Fields.LOST_REASONS,
};

// The details of a card as they are kept, whatever was sent: only the known ones, as text, within limits, and a
// dropdown only ever holds one of its choices. `old` keeps what is not being changed.
function cleanProfile(input, old = {}) {
  const out = {};
  Fields.PROFILE_FIELDS.forEach((f) => {
    const given = input && Object.prototype.hasOwnProperty.call(input, f.key);
    let v = given ? input[f.key] : old[f.key];
    if (f.type === 'date') v = isoDay(v);
    else if (f.list) { v = str(v, 80); if (!LISTS[f.list].includes(v)) v = ''; } else v = str(v, f.max || LIMITS.short);
    if (v) out[f.key] = v;
  });
  return out;
}

// One university option prepared for a student: what the email shows for it.
function cleanOption(input, old = {}) {
  const pick = (k, max) => (input && Object.prototype.hasOwnProperty.call(input, k) ? str(input[k], max) : (old[k] || ''));
  const link = pick('link', 500);
  return {
    id: old.id || newId(),
    universityId: /^[a-f0-9]{12}$/.test(input && input.universityId) ? input.universityId : (old.universityId || ''),
    university: pick('university', 160),
    course: pick('course', 240),
    level: pick('level', 80),
    intake: pick('intake', 80),
    fee: pick('fee', 400),
    deposit: pick('deposit', 400),
    scholarship: pick('scholarship', 400),
    // Only a real web address is kept as the link (never "javascript:" or anything else a page could run).
    link: /^https?:\/\/[^\s<>"']+$/i.test(link) ? link : '',
    note: pick('note', 400),
    addedAt: old.addedAt, addedBy: old.addedBy,
  };
}

const emptyCard = () => ({ profile: {}, notes: [], options: [], messages: [], tasks: [] });

// A card read from the file, made whole: an older or hand-edited file never breaks a page.
function normalize(raw) {
  const c = raw && typeof raw === 'object' ? raw : {};
  return {
    profile: cleanProfile(c.profile, {}),
    notes: (Array.isArray(c.notes) ? c.notes : []).filter((n) => n && n.id && n.text).slice(-LIMITS.notes),
    options: (Array.isArray(c.options) ? c.options : []).filter((o) => o && o.id && (o.university || o.course)).slice(0, LIMITS.options),
    messages: (Array.isArray(c.messages) ? c.messages : []).filter((m) => m && m.id).slice(-LIMITS.messages),
    // Tasks given to a team about this student: { id, team, text, by, at, done, doneBy, doneAt, comments: [{ id, by, at, text }] }
    // (older tasks may also have `due`, the date they were once given with, no longer shown).
    tasks: (Array.isArray(c.tasks) ? c.tasks : []).filter((t) => t && t.id && t.team && t.text).slice(-LIMITS.tasks),
    createdAt: str(c.createdAt, 40), createdBy: str(c.createdBy, 80), updatedAt: str(c.updatedAt, 40), updatedBy: str(c.updatedBy, 80),
  };
}

function createCards(dir, { now = () => new Date() } = {}) {
  const file = path.join(dir, 'cards.json');
  const logFile = path.join(dir, 'message-log.jsonl');
  let cache = null; // { mtimeMs, size, data }

  // The newest daily copy that still reads, when cards.json itself is damaged.
  function recover() {
    let copies = [];
    try {
      copies = fs.readdirSync(path.join(dir, 'backups')).filter((f) => /^cards-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse();
    } catch (e) { /* none */ }
    for (const name of copies) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, 'backups', name), 'utf8'));
        if (data && data.cards && typeof data.cards === 'object') return data;
      } catch (e) { /* try the one before */ }
    }
    return null;
  }

  function load() {
    let stat;
    try { stat = fs.statSync(file); } catch (e) { return { cards: {} }; } // no card saved yet
    if (cache && cache.mtimeMs === stat.mtimeMs && cache.size === stat.size) return cache.data;
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (data && data.cards && typeof data.cards === 'object' && !Array.isArray(data.cards)) {
        // Every card is made whole once, when the file is read, so nothing that reads a card has to guard against an older shape.
        const cards = {};
        Object.keys(data.cards).forEach((id) => { if (ROW_ID.test(id)) cards[id] = normalize(data.cards[id]); });
        cache = { mtimeMs: stat.mtimeMs, size: stat.size, data: { ...data, cards } };
        return cache.data;
      }
    } catch (e) { /* unreadable: set aside below */ }
    // A damaged file is kept next to the data (never overwritten), and the cards carry on from the newest daily copy.
    try { fs.renameSync(file, path.join(dir, `cards.damaged-${now().toISOString().replace(/[:.]/g, '-')}.json`)); } catch (e) { /* ignore */ }
    const recovered = recover() || { cards: {} };
    console.error('[cards] cards.json could not be read; carried on from', recovered.cards && Object.keys(recovered.cards).length ? 'the newest daily copy' : 'an empty list');
    try { if (recovered.cards && Object.keys(recovered.cards).length) { write(recovered); return cache.data; } } catch (e) { /* kept in memory below */ }
    return recovered;
  }

  function write(data) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    snapshotDaily(file, dir, 'cards');
    writeFileAtomic(file, JSON.stringify(data));
    const stat = fs.statSync(file);
    cache = { mtimeMs: stat.mtimeMs, size: stat.size, data };
  }

  // Changes one card and saves. `change(card)` returns what to answer, or { error }.
  function update(rowId, by, change) {
    if (!ROW_ID.test(String(rowId || ''))) return { error: 'No such student.' };
    const data = load();
    const existing = Object.prototype.hasOwnProperty.call(data.cards, rowId);
    if (!existing && Object.keys(data.cards).length >= LIMITS.cards) return { error: 'The card list is full.' };
    const card = normalize(existing ? data.cards[rowId] : emptyCard());
    const stamp = now().toISOString();
    if (!existing) { card.createdAt = stamp; card.createdBy = by || ''; }
    const result = change(card, stamp) || {};
    if (result.error) return result;
    card.updatedAt = stamp;
    card.updatedBy = by || '';
    write({ ...data, cards: { ...data.cards, [rowId]: card } }); // a copy: a failed write must not leave the change in memory
    return { ...result, card };
  }

  // When each person last read each task (its comments), for the red dots: { "<username>": { "<task id>": "<ISO time>" } }. Kept in
  // task-seen.json beside the cards, apart from them, so reading a task never changes a student's card.
  const seenFile = path.join(dir, 'task-seen.json');
  let seenCache = null;
  const seenAll = () => {
    if (seenCache) return seenCache;
    try { const d = JSON.parse(fs.readFileSync(seenFile, 'utf8')); seenCache = d && typeof d === 'object' && !Array.isArray(d) ? d : {}; } catch (e) { seenCache = {}; }
    return seenCache;
  };

  return {
    hasSeen(username) { return Object.prototype.hasOwnProperty.call(seenAll(), String(username || '')); },
    // When `username` last read each task: { taskId: ISO time }.
    seenBy(username) { return { ...(seenAll()[String(username || '')] || {}) }; },
    // `username` has read these tasks now.
    markSeen(username, taskIds) {
      const key = String(username || '');
      if (!key) return;
      const all = { ...seenAll() };
      const mine = { ...(all[key] || {}) };
      const stamp = now().toISOString();
      [].concat(taskIds).filter((t) => /^[a-f0-9]{12}$/.test(String(t))).forEach((t) => { mine[t] = stamp; });
      // Only the newest 2,000 reads a person made are kept.
      all[key] = Object.fromEntries(Object.entries(mine).sort((a, b) => b[1].localeCompare(a[1])).slice(0, 2000));
      seenCache = all;
      try { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); writeFileAtomic(seenFile, JSON.stringify(all)); } catch (e) { /* kept in memory until the next save */ }
    },
    // The card of a student (an empty one when nothing has been saved for them yet).
    get(rowId) {
      const data = load();
      return Object.prototype.hasOwnProperty.call(data.cards, rowId) ? data.cards[rowId] : normalize(emptyCard());
    },
    has(rowId) { return Object.prototype.hasOwnProperty.call(load().cards, rowId); },
    // Every card, keyed by row id (for the Dashboard and the backup). Not a copy: do not change it.
    all() { return load().cards; },

    setProfile(rowId, input, by) {
      return update(rowId, by, (card) => { card.profile = cleanProfile(input, card.profile); });
    },

    // A task for a team about this student (Admin and the Manager give them; the team marks it complete or not complete).
    addTask(rowId, input, by) {
      const text = str(input && input.text, LIMITS.text);
      const team = str(input && input.team, 40);
      if (!team) return { error: 'Choose the team.' };
      if (!text) return { error: 'Write what the team should do.' };
      // No date to do it by (the owner, 14 Nov 2026): a task says which team and what to do; the team and whoever gave it talk it
      // through in the task's comments. Older tasks keep the date they were given with; it is simply not shown.
      let task;
      const out = update(rowId, by, (card, stamp) => {
        task = { id: newId(), team, text, by: by || '', at: stamp, done: false, doneBy: '', doneAt: '', comments: [] };
        card.tasks = [...card.tasks, task].slice(-LIMITS.tasks);
      });
      return out.error ? out : { ...out, task };
    },
    setTask(rowId, taskId, done, by) {
      let task;
      const out = update(rowId, by, (card, stamp) => {
        task = card.tasks.find((t) => t.id === taskId);
        if (!task) return { error: 'No such task.' };
        Object.assign(task, done ? { done: true, doneBy: by || '', doneAt: stamp } : { done: false, doneBy: '', doneAt: '' });
        return null;
      });
      return out.error ? out : { ...out, task };
    },
    // A comment on a task: the team writes how it went, what it needs or what is in the way, and whoever gave the task answers.
    commentTask(rowId, taskId, input, by) {
      const text = str(input, LIMITS.text);
      if (!text) return { error: 'Write the comment first.' };
      let comment;
      const out = update(rowId, by, (card, stamp) => {
        const task = card.tasks.find((t) => t.id === taskId);
        if (!task) return { error: 'No such task.' };
        comment = { id: newId(), by: by || '', at: stamp, text };
        task.comments = [...(Array.isArray(task.comments) ? task.comments : []), comment].slice(-LIMITS.comments);
        return null;
      });
      return out.error ? out : { ...out, comment };
    },
    removeTask(rowId, taskId, by) {
      const out = update(rowId, by, (card) => {
        if (!card.tasks.some((t) => t.id === taskId)) return { error: 'No such task.' };
        card.tasks = card.tasks.filter((t) => t.id !== taskId);
        return null;
      });
      return out;
    },

    addNote(rowId, input, by) {
      const text = str(input && input.text, LIMITS.noteText);
      if (!text) return { error: 'Please write the note first.' };
      const kind = Fields.NOTE_KINDS.some((k) => k.key === (input && input.kind)) ? input.kind : 'note';
      let note;
      const out = update(rowId, by, (card, stamp) => {
        note = { id: newId(), at: stamp, by: by || '', kind, text };
        card.notes.push(note);
        card.notes = card.notes.slice(-LIMITS.notes);
      });
      return out.error ? out : { ...out, note };
    },

    // A note can be removed by the person who wrote it, or by Admin (`force`).
    removeNote(rowId, noteId, by, force = false) {
      return update(rowId, by, (card) => {
        const note = card.notes.find((n) => n.id === noteId);
        if (!note) return { error: 'No such note.' };
        if (!force && note.by !== by) return { error: 'Only the person who wrote a note, or Admin, can remove it.' };
        card.notes = card.notes.filter((n) => n.id !== noteId);
        return { removed: note };
      });
    },

    addOption(rowId, input, by) {
      let option;
      const out = update(rowId, by, (card, stamp) => {
        if (card.options.length >= LIMITS.options) return { error: `A student can have up to ${LIMITS.options} options.` };
        option = { ...cleanOption(input), addedAt: stamp, addedBy: by || '' };
        if (!option.university && !option.course) return { error: 'Choose a university or a course first.' };
        // The same course at the same university is listed once.
        const same = (o) => o.university.toLowerCase() === option.university.toLowerCase() && o.course.toLowerCase() === option.course.toLowerCase() && o.intake.toLowerCase() === option.intake.toLowerCase();
        if (card.options.some(same)) return { error: 'That course is already in the list for this student.', duplicate: true };
        card.options.push(option);
        return {};
      });
      return out.error ? out : { ...out, option };
    },
    updateOption(rowId, optionId, input, by) {
      return update(rowId, by, (card) => {
        const i = card.options.findIndex((o) => o.id === optionId);
        if (i === -1) return { error: 'No such option.' };
        card.options[i] = cleanOption(input, card.options[i]);
        return {};
      });
    },
    removeOption(rowId, optionId, by) {
      return update(rowId, by, (card) => {
        if (!card.options.some((o) => o.id === optionId)) return { error: 'No such option.' };
        card.options = card.options.filter((o) => o.id !== optionId);
        return {};
      });
    },

    // The record of a message: who sent what, when, how and whether it went. The words are kept in the log file.
    logMessage(rowId, entry, by) {
      let message;
      const out = update(rowId, by, (card, stamp) => {
        message = {
          id: newId(), at: stamp, by: by || '', channel: entry.channel === 'whatsapp' ? 'whatsapp' : 'email',
          template: str(entry.template, 80), subject: str(entry.subject, 300), to: str(entry.to, 254),
          status: ['sent', 'failed', 'preview', 'opened'].includes(entry.status) ? entry.status : 'sent',
          ...(Array.isArray(entry.attachments) && entry.attachments.length ? { attachments: entry.attachments.slice(0, 10).map((n) => str(n, 120)) } : {}),
          ...(entry.error ? { error: str(entry.error, 300) } : {}),
          ...(entry.options ? { options: Math.max(0, Math.min(LIMITS.options, Number(entry.options) || 0)) } : {}),
        };
        card.messages.push(message);
        card.messages = card.messages.slice(-LIMITS.messages);
      });
      if (out.error) return out;
      try {
        fs.appendFileSync(logFile, JSON.stringify({ id: message.id, rowId, at: message.at, text: String(entry.text || '').slice(0, 20000) }) + '\n', { mode: 0o600 });
      } catch (e) { console.error('[cards] message log:', e.message); }
      return { ...out, message };
    },
    // The words of one sent message, or null.
    messageText(rowId, messageId) {
      let text;
      try { text = fs.readFileSync(logFile, 'utf8'); } catch (e) { return null; }
      const needle = `"id":"${messageId}"`;
      const line = text.split('\n').find((l) => l.includes(needle));
      if (!line) return null;
      try { const e = JSON.parse(line); return e.rowId === rowId ? e.text : null; } catch (e) { return null; }
    },

    // Puts back every card from a backup (each one checked like any save).
    restoreAll(cards) {
      if (!cards || typeof cards !== 'object' || Array.isArray(cards)) return { error: 'The backup has no student cards in it.' };
      const restored = {};
      Object.keys(cards).filter((id) => ROW_ID.test(id)).slice(0, LIMITS.cards).forEach((id) => { restored[id] = normalize(cards[id]); });
      write({ ...load(), cards: restored });
      return { count: Object.keys(restored).length };
    },
    today: () => localDate(now()),
  };
}

module.exports = { createCards, cleanProfile, cleanOption, normalize, isoDay, LIMITS, ROW_ID };
