// The intake targets on the Analysis page: how many visas each intake is aiming for, and the date they are needed by.
// Admin sets them; Admin and the Manager read them. Kept in targets.json in the data folder (never in git), written whole
// and atomically, with the version before each save beside it as targets.backup.json. No student data is stored here.

const fs = require('fs');
const path = require('path');
const { writeFileAtomic } = require('../shared/server-utils');
const { isoDate } = require('./dashboard-stats');

const MAX_TARGET = 100000;
const MAX_INTAKES = 500;

// What is kept, whatever was sent: { intake id: { visas, deadline } }. A target of 0 (or blank) removes the intake's target.
function cleanTargets(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'No targets were sent.' };
  const entries = Object.entries(input);
  if (entries.length > MAX_INTAKES) return { error: 'Too many intakes were sent.' };
  const targets = {};
  for (const [id, value] of entries) {
    const v = value && typeof value === 'object' ? value : {};
    const blank = v.visas === '' || v.visas === null || v.visas === undefined;
    const visas = blank ? 0 : Number(v.visas);
    if (!Number.isInteger(visas) || visas < 0 || visas > MAX_TARGET) return { error: 'A target must be a whole number of visas, 0 or more.' };
    const deadline = typeof v.deadline === 'string' && v.deadline.trim() ? v.deadline.trim() : '';
    if (deadline && isoDate(deadline) !== deadline) return { error: 'A target date must be a real date.' };
    if (visas > 0 && typeof id === 'string' && id && id.length <= 80 && id !== '__proto__') targets[id] = { visas, deadline };
  }
  return { targets };
}

function createTargets(dataDir) {
  const file = path.join(dataDir, 'targets.json');
  const backup = path.join(dataDir, 'targets.backup.json');
  let targets = {};
  let readable = true;
  try {
    targets = cleanTargets(JSON.parse(fs.readFileSync(file, 'utf8')).targets).targets || {};
  } catch (e) {
    if (e.code !== 'ENOENT') { readable = false; console.error('targets.json could not be read:', e.message); } // not saved yet is fine
  }
  return {
    all: () => JSON.parse(JSON.stringify(targets)),
    replaceAll(input, by) {
      if (!readable) return { error: 'The saved targets could not be read, so they were not replaced. Ask the developer to check targets.json.' };
      const cleaned = cleanTargets(input);
      if (cleaned.error) return cleaned;
      try { if (fs.existsSync(file)) fs.copyFileSync(file, backup); } catch (e) { /* the save still goes ahead */ }
      writeFileAtomic(file, JSON.stringify({ savedAt: new Date().toISOString(), savedBy: String(by || '').slice(0, 80), targets: cleaned.targets }, null, 1));
      targets = cleaned.targets;
      return { targets: this.all() };
    },
  };
}

module.exports = { createTargets, cleanTargets };
