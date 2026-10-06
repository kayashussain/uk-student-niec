// Workbook shape, migrations and merging for Student Details — kept apart from server.js so tests can load it.

// Column names that used to be misspelled. Older files and tabs opened before the fix still use the
// left-hand names; migrateWorkbook renames them (columns and every row's cell) to the right-hand ones.
const RENAMED_COLUMNS = {
  'RECEVING PARTNER': 'RECEIVING PARTNER',
  'REMANING TUITION FEE': 'REMAINING TUITION FEE',
};

const DEFAULT_COLUMNS = [
  'REMARKS', 'STUDENT SOURCE', 'APPLICATION STATUS', 'FIRST NAME', 'LAST NAME', 'EMAIL', 'CONTACT NUMBER',
  'UNIVERSITY NAME', 'COURSE NAME', 'RECEIVING PARTNER', 'UNIVERSITY PARTNER',
  'LANGUAGE TEST DATE', 'STUDENT ID', 'GROSS FEE', 'SCHOLARSHIP', 'FEE AFTER SCHOLARSHIP',
  'EARLY BIRD DISCOUNT', 'ADDITIONAL DISCOUNT', 'TUITION FEE DEPOSIT(1st Installment)',
  'TUITION FEE DEPOSIT(2nd Installment)', 'REMAINING TUITION FEE', 'PRE CAS INTERVIEW',
  'NOC', 'NOC NUMBER', 'MEDICAL REPORT', 'PAYMENT DATE', 'CAS REQUESTED DATE',
  'CAS RECEIVED DATE', 'VISA LODGE DATE', 'VFS ATTENDED DATE', 'VISA RECEIVED DATE',
  'E-VISA', 'UK CONTACT NUMBER',
];

function makeRowId() {
  return 'row-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function blankWorkbook() {
  return {
    revision: 0,
    sheets: [{ id: 'sheet-1', name: 'Sheet1', columns: [...DEFAULT_COLUMNS], rows: [] }],
    activeSheetId: 'sheet-1',
  };
}

// Every row needs a stable _id so other apps (e.g. Incentive) can link to a specific
// student across renames/edits. Assigns one to any row that lacks it.
function ensureRowIds(workbook) {
  (workbook.sheets || []).forEach((sheet) => {
    (sheet.rows || []).forEach((row) => {
      if (!row._id) row._id = makeRowId();
    });
  });
  return workbook;
}

function renameColumns(workbook) {
  (workbook.sheets || []).forEach((sheet) => {
    if (Array.isArray(sheet.columns)) {
      sheet.columns = sheet.columns.map((c) => RENAMED_COLUMNS[c] || c);
    }
    (sheet.rows || []).forEach((row) => {
      Object.keys(RENAMED_COLUMNS).forEach((oldName) => {
        if (!(oldName in row)) return;
        const newName = RENAMED_COLUMNS[oldName];
        if (!(newName in row) || row[newName] === '') row[newName] = row[oldName];
        delete row[oldName];
      });
    });
  });
  return workbook;
}

// The first three columns after the row number: Remarks, Student Source, Application Status. Sheets
// saved before this layout existed are rearranged once (marked with `leadColumnsApplied`, so a later
// manual reorder isn't undone); columns that are missing are created.
const LEAD_COLUMNS = ['REMARKS', 'STUDENT SOURCE', 'APPLICATION STATUS'];

function addMissingColumns(workbook) {
  (workbook.sheets || []).forEach((sheet) => {
    if (!Array.isArray(sheet.columns)) return;
    LEAD_COLUMNS.forEach((name) => {
      if (!sheet.columns.includes(name)) sheet.columns.push(name);
    });
    if (!sheet.leadColumnsApplied) {
      const rest = sheet.columns.filter((c) => !LEAD_COLUMNS.includes(c));
      sheet.columns.splice(0, sheet.columns.length, ...LEAD_COLUMNS, ...rest);
      sheet.leadColumnsApplied = true;
    }
  });
  return workbook;
}

// Upgrades the legacy single-sheet {columns, rows} shape into {sheets, activeSheetId}, fixes renamed
// columns, and makes sure there's a revision number and row ids. Already-migrated files come back unchanged.
function migrateWorkbook(parsed) {
  const workbook = parsed && Array.isArray(parsed.sheets)
    ? parsed
    : {
      sheets: [{ id: 'sheet-1', name: 'Sheet1', columns: (parsed && parsed.columns) || [], rows: (parsed && parsed.rows) || [] }],
      activeSheetId: 'sheet-1',
    };
  if (!Number.isInteger(workbook.revision)) workbook.revision = 0;
  return ensureRowIds(addMissingColumns(renameColumns(workbook)));
}

function isValidWorkbook(parsed) {
  return Boolean(parsed
    && Array.isArray(parsed.sheets)
    && parsed.sheets.length > 0
    && typeof parsed.activeSheetId === 'string'
    && parsed.sheets.every((s) => s && typeof s.id === 'string' && Array.isArray(s.columns) && Array.isArray(s.rows)));
}

// ---------------------------------------------------------------------------------------------
// Three-way merge. When a save is based on an older revision than the file (someone else saved in
// the meantime), it's merged cell by cell against the version both sides started from: whatever this
// save changed wins, and everything else keeps the other person's version. Only when both changed
// the very same cell does this save's value win.
// ---------------------------------------------------------------------------------------------

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Merges two orderings of ids that both started from `base`. Keeps `keep` ids only. Whichever side
// reordered wins the order (mine if both did); ids only the other side has are slotted in after the
// id that precedes them on that side (and after anything new the winning side put there too).
function mergeOrder(base, theirs, mine, keep) {
  const common = (list, other) => list.filter((id) => other.includes(id));
  const mineReordered = !same(common(mine, base), common(base, mine));
  const [primary, secondary] = mineReordered ? [mine, theirs] : [theirs, mine];
  const result = primary.filter((id) => keep.has(id));
  secondary.forEach((id, i) => {
    if (!keep.has(id) || result.includes(id)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j -= 1) {
      const k = result.indexOf(secondary[j]);
      if (k !== -1) { at = k + 1; break; }
    }
    while (at < result.length && !base.includes(result[at])) at += 1;
    result.splice(at, 0, id);
  });
  return result;
}

// Keys present on any side; a key missing from a side counts as "no value" there.
function mergeFields(base, theirs, mine, skip = []) {
  const out = {};
  const keys = new Set([...Object.keys(base), ...Object.keys(theirs), ...Object.keys(mine)]);
  keys.forEach((k) => {
    if (skip.includes(k)) return;
    const v = same(mine[k], base[k]) ? theirs[k] : mine[k];
    if (v !== undefined) out[k] = v;
  });
  return out;
}

// Merges two lists of records keyed by `key`. A record deleted on one side stays deleted unless the
// other side edited it (then the edit is kept, so no one's typing is lost).
function mergeRecords(base, theirs, mine, key, mergeOne) {
  const index = (list) => new Map(list.map((r) => [r[key], r]));
  const B = index(base);
  const T = index(theirs);
  const M = index(mine);
  const keep = new Set();
  const merged = new Map();
  new Set([...T.keys(), ...M.keys()]).forEach((id) => {
    const b = B.get(id);
    const t = T.get(id);
    const m = M.get(id);
    if (!b) {
      keep.add(id);
      merged.set(id, m || t);
    } else if (t && m) {
      keep.add(id);
      merged.set(id, mergeOne(b, t, m));
    } else if (t && !same(t, b)) {
      keep.add(id); // I deleted it, they edited it
      merged.set(id, t);
    } else if (m && !same(m, b)) {
      keep.add(id); // they deleted it, I edited it
      merged.set(id, m);
    }
  });
  const order = mergeOrder(base.map((r) => r[key]), theirs.map((r) => r[key]), mine.map((r) => r[key]), keep);
  return order.map((id) => merged.get(id));
}

function mergeSheet(base, theirs, mine) {
  const sheet = mergeFields(base, theirs, mine, ['columns', 'rows']);
  const columnKeep = new Set([...theirs.columns, ...mine.columns]
    .filter((c) => !base.columns.includes(c) || (theirs.columns.includes(c) && mine.columns.includes(c))));
  sheet.columns = mergeOrder(base.columns, theirs.columns, mine.columns, columnKeep);
  sheet.rows = mergeRecords(base.rows, theirs.rows, mine.rows, '_id', (b, t, m) => mergeFields(b, t, m));
  return sheet;
}

function mergeWorkbooks(base, theirs, mine) {
  let sheets = mergeRecords(base.sheets, theirs.sheets, mine.sheets, 'id', mergeSheet);
  if (!sheets.length) sheets = theirs.sheets; // each side deleted the other's last sheet: keep theirs
  const activeSheetId = sheets.some((s) => s.id === mine.activeSheetId) ? mine.activeSheetId : sheets[0].id;
  return { sheets, activeSheetId };
}

// Recent revisions, kept in memory so a save based on one of them can be merged.
function createHistory(limit = 30) {
  const versions = new Map(); // revision -> JSON text
  return {
    remember(workbook) {
      versions.set(workbook.revision, JSON.stringify(workbook));
      while (versions.size > limit) versions.delete(versions.keys().next().value);
    },
    get(revision) {
      const text = versions.get(revision);
      return text ? JSON.parse(text) : null;
    },
  };
}

module.exports = {
  RENAMED_COLUMNS,
  DEFAULT_COLUMNS,
  blankWorkbook,
  ensureRowIds,
  migrateWorkbook,
  isValidWorkbook,
  mergeOrder,
  mergeWorkbooks,
  createHistory,
};
