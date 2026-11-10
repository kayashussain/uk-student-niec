// The Decision log on the Analysis page: each management decision with the problem, what was expected, when to look
// again, what really happened and the lesson. It is how a decision is judged later instead of forgotten. Admin writes it;
// Admin and the Manager read it, and so does the Advisor. Kept in decisions.json in the data folder (never in git),
// written whole and atomically, with the version before each save beside it as decisions.backup.json.
// It is about the business, not about students: lines that hold an email address or a phone number are refused.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { writeFileAtomic } = require('../shared/server-utils');
const { isoDate } = require('./dashboard-stats');

const MAX_ROWS = 1000;
const OUTCOMES = ['', 'Continue', 'Change', 'Stop'];
const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '');
const PERSONAL = /[^\s@]+@[^\s@]+\.[a-z]{2,}|(?:\+?\d[\s-]?){9,}/i;

function cleanRow(input) {
  const r = input && typeof input === 'object' ? input : {};
  const row = {
    id: /^[a-f0-9]{12}$/.test(r.id) ? r.id : crypto.randomBytes(6).toString('hex'),
    date: str(r.date, 10), problem: str(r.problem, 500), decision: str(r.decision, 500), expected: str(r.expected, 500),
    reviewDate: str(r.reviewDate, 10), actual: str(r.actual, 500), lesson: str(r.lesson, 500), outcome: OUTCOMES.includes(r.outcome) ? r.outcome : '',
  };
  if (!row.decision) return { error: 'Every line needs the decision that was taken.' };
  for (const key of ['date', 'reviewDate']) if (row[key] && isoDate(row[key]) !== row[key]) return { error: 'A date in the decision log is not a real date.' };
  if (PERSONAL.test([row.problem, row.decision, row.expected, row.actual, row.lesson].join(' '))) return { error: 'The decision log is about the business: leave out email addresses and phone numbers.' };
  return { row };
}

function createDecisions(dataDir) {
  const file = path.join(dataDir, 'decisions.json');
  const backup = path.join(dataDir, 'decisions.backup.json');
  let rows = [];
  let readable = true;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    rows = (Array.isArray(parsed.rows) ? parsed.rows : []).map((r) => cleanRow(r).row).filter(Boolean);
  } catch (e) {
    if (e.code !== 'ENOENT') { readable = false; console.error('decisions.json could not be read:', e.message); } // not saved yet is fine
  }
  return {
    list: () => rows.map((r) => ({ ...r })),
    replaceAll(input, by) {
      if (!readable) return { error: 'The saved decision log could not be read, so it was not replaced. Ask the developer to check decisions.json.' };
      if (!Array.isArray(input)) return { error: 'No lines were sent.' };
      if (input.length > MAX_ROWS) return { error: `At most ${MAX_ROWS} lines can be kept.` };
      const next = [];
      for (const item of input) {
        const cleaned = cleanRow(item);
        if (cleaned.error) return { error: cleaned.error };
        next.push(cleaned.row);
      }
      try { if (fs.existsSync(file)) fs.copyFileSync(file, backup); } catch (e) { /* the save still goes ahead */ }
      writeFileAtomic(file, JSON.stringify({ savedAt: new Date().toISOString(), savedBy: str(by, 80), rows: next }, null, 1));
      rows = next;
      return { rows: this.list() };
    },
  };
}

module.exports = { createDecisions, cleanRow, OUTCOMES };
