// "Just the changes" between two versions of the Student Details workbook, so a save sends the few
// rows someone edited instead of the whole workbook, and other screens download only those rows too.
// Used by the page (window.WorkbookPatch) and both servers (require).
//
// A patch: { sheetOrder: [sheet ids], activeSheetId, sheets: [{ id, meta?, rowOrder?, rows? }] }
//   - only sheets that changed are listed
//   - meta: the sheet without its rows (name, columns, hidden, …), when any of that changed
//   - rowOrder: every row id in order, when rows were added, removed or moved
//   - rows: the full rows that are new or changed
// Rows are matched by `_id`. A sheet whose rows lack ids or repeat one can't be patched safely, so
// makePatch returns null for it and the caller sends or fetches the whole workbook instead.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WorkbookPatch = factory();
})(typeof self !== 'undefined' ? self : this, () => {
  const metaOf = (sheet) => {
    const meta = {};
    Object.keys(sheet).forEach((k) => { if (k !== 'rows') meta[k] = sheet[k]; });
    return meta;
  };

  // A compact record of one version: per sheet, its meta and each row as JSON text. Comparing text is
  // what makes finding the changes quick. Returns null if some sheet can't be patched (see above).
  function snapshot(workbook) {
    const sheets = new Map();
    for (const sheet of workbook.sheets || []) {
      const rows = new Map();
      for (const row of sheet.rows || []) {
        if (!row || !row._id || rows.has(row._id)) return null;
        rows.set(row._id, JSON.stringify(row));
      }
      sheets.set(sheet.id, { meta: JSON.stringify(metaOf(sheet)), order: [...rows.keys()].join('\u0000'), rows });
    }
    return { order: (workbook.sheets || []).map((s) => s.id), sheets };
  }

  // The patch that turns the version `snap` was taken of into `workbook`, plus the snapshot of
  // `workbook` (to diff the next version against). { patch: null } when it can't be patched.
  function diff(snap, workbook) {
    const next = snapshot(workbook);
    if (!snap || !next) return { patch: null, snapshot: next };
    const sheets = [];
    for (const sheet of workbook.sheets) {
      const before = snap.sheets.get(sheet.id);
      const now = next.sheets.get(sheet.id);
      const entry = { id: sheet.id };
      if (!before || before.meta !== now.meta) entry.meta = metaOf(sheet);
      if (!before || before.order !== now.order) entry.rowOrder = [...now.rows.keys()];
      const changed = sheet.rows.filter((row) => !before || before.rows.get(row._id) !== now.rows.get(row._id));
      if (changed.length) entry.rows = changed;
      if (entry.meta || entry.rowOrder || entry.rows) sheets.push(entry);
    }
    return { patch: { sheetOrder: next.order, activeSheetId: workbook.activeSheetId, sheets }, snapshot: next };
  }

  const makePatch = (base, next) => diff(snapshot(base), next).patch;

  const isEmpty = (patch, base) => Boolean(patch) && !patch.sheets.length
    && patch.sheetOrder.join('\u0000') === (base.sheets || []).map((s) => s.id).join('\u0000');

  // `base` with the patch applied, as a new workbook (unchanged rows are shared with `base`, not
  // copied). Throws if the patch doesn't fit `base` (a row or sheet it relies on isn't there).
  function applyPatch(base, patch) {
    if (!patch || !Array.isArray(patch.sheetOrder) || !Array.isArray(patch.sheets)) throw new Error('bad patch');
    const baseSheets = new Map((base.sheets || []).map((s) => [s.id, s]));
    const changes = new Map(patch.sheets.map((p) => [p.id, p]));
    const sheets = patch.sheetOrder.map((id) => {
      const b = baseSheets.get(id);
      const p = changes.get(id);
      if (!p) {
        if (!b) throw new Error(`patch needs sheet ${id}`);
        return b;
      }
      if (!b && !p.meta) throw new Error(`patch needs sheet ${id}`);
      const meta = p.meta || metaOf(b);
      const baseRows = new Map(b ? b.rows.map((r) => [r._id, r]) : []);
      const changedRows = new Map((p.rows || []).map((r) => [r._id, r]));
      const order = p.rowOrder || (b ? b.rows.map((r) => r._id) : []);
      const rows = order.map((rowId) => {
        const row = changedRows.get(rowId) || baseRows.get(rowId);
        if (!row) throw new Error(`patch needs row ${rowId}`);
        return row;
      });
      return { ...meta, id, rows };
    });
    const out = {};
    Object.keys(base).forEach((k) => { if (k !== 'sheets') out[k] = base[k]; });
    out.sheets = sheets;
    if (typeof patch.activeSheetId === 'string') out.activeSheetId = patch.activeSheetId;
    return out;
  }

  // The snapshot after the server's patch is applied to the version `snap` was taken of (so it records
  // what the server has, even where this page's copy has since changed).
  function advance(snap, patch) {
    const sheets = new Map();
    const changes = new Map(patch.sheets.map((p) => [p.id, p]));
    for (const id of patch.sheetOrder) {
      const before = snap && snap.sheets.get(id);
      const p = changes.get(id);
      if (!p) {
        if (!before) return null;
        sheets.set(id, before);
        continue;
      }
      const rows = new Map();
      const order = p.rowOrder || (before ? [...before.rows.keys()] : []);
      const changed = new Map((p.rows || []).map((r) => [r._id, JSON.stringify(r)]));
      for (const rowId of order) {
        const json = changed.get(rowId) || (before && before.rows.get(rowId));
        if (!json) return null;
        rows.set(rowId, json);
      }
      if (!before && !p.meta) return null;
      sheets.set(id, { meta: p.meta ? JSON.stringify(p.meta) : before.meta, order: order.join('\u0000'), rows });
    }
    return { order: [...patch.sheetOrder], sheets };
  }

  return { snapshot, diff, makePatch, applyPatch, isEmpty, advance };
});
