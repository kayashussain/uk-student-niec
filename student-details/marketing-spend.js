// The Marketing spend table on the Analysis page: what NIEC paid for each channel, advert and event, so the Analysis can
// say what a student, an application and a visa from each channel cost. Admin enters it; Admin and the Manager read it.
// Kept in marketing-spend.json in the data folder (never in git), written whole and atomically. The version before each
// save is kept beside it as marketing-spend.backup.json. No student or personal data is stored here.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { writeFileAtomic } = require('../shared/server-utils');

const MAX_ROWS = 2000;
const MAX_AMOUNT = 1e9; // NPR
const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '');

// What is kept for one line, whatever was sent: only the known fields, within limits. A line needs a source and an amount.
function cleanRow(input) {
  const r = input && typeof input === 'object' ? input : {};
  const amount = Math.round(Number(r.amount));
  const source = str(r.source, 60);
  if (!source) return { error: 'Every line needs a source (for example Social Media or Events).' };
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) return { error: `The amount for ${source} must be a number of rupees above 0.` };
  const month = str(r.month, 7);
  if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { error: `The month for ${source} is not a month.` };
  return {
    row: {
      id: /^[a-f0-9]{12}$/.test(r.id) ? r.id : crypto.randomBytes(6).toString('hex'),
      month, intake: str(r.intake, 80), source, detail: str(r.detail, 60), campaign: str(r.campaign, 120), amount, note: str(r.note, 300),
    },
  };
}

function createSpend(dataDir) {
  const file = path.join(dataDir, 'marketing-spend.json');
  const backup = path.join(dataDir, 'marketing-spend.backup.json');
  let rows = [];
  let readable = true;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    rows = (Array.isArray(parsed.rows) ? parsed.rows : []).map((r) => cleanRow(r).row).filter(Boolean);
  } catch (e) {
    if (e.code !== 'ENOENT') { readable = false; console.error('marketing-spend.json could not be read:', e.message); } // not saved yet is fine
  }

  return {
    list: () => rows.map((r) => ({ ...r })),
    // Replaces the whole table with what the page sent. Nothing is saved when any line is wrong.
    replaceAll(input, by) {
      if (!readable) return { error: 'The saved spend could not be read, so it was not replaced. Ask the developer to check marketing-spend.json.' };
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

module.exports = { createSpend, cleanRow };
