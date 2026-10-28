// What each team sees and may change on Student Details. Admin sees and changes everything; each team
// works only on the students at its stage. The page uses these rules to show the right students and
// lock the other cells; the server uses the same rules to send each team only its students and to
// refuse any other change. Used by the page (window.TeamRules) and the Student Details server (require).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TeamRules = factory();
})(typeof self !== 'undefined' ? self : this, () => {
  const STATUS = 'APPLICATION STATUS';

  // Everything up to NOC Number (the Application Team's part of the sheet).
  const APPLICATION_COLUMNS = [
    'REMARKS', 'STUDENT SOURCE', 'APPLICATION SUBMISSION DATE', 'OFFER RECEIVED DATE',
    'FIRST NAME', 'LAST NAME', 'EMAIL', 'CONTACT NUMBER',
    'UNIVERSITY NAME', 'COURSE NAME', 'RECEIVING PARTNER', 'UNIVERSITY PARTNER',
    'LANGUAGE TEST DATE', 'STUDENT ID', 'NOC', 'NOC NUMBER',
  ];
  // The mock interviews up to Pre-CAS Interview (the Mock Team's part).
  const MOCK_COLUMNS = [
    'MOCK SCHEDULE 1', 'FEEDBACK 1', 'MOCK SCHEDULE 2', 'FEEDBACK 2',
    'MOCK SCHEDULE 3', 'FEEDBACK 3', 'MOCK SCHEDULE 4', 'FEEDBACK 4', 'PRE CAS INTERVIEW',
  ];

  const TEAMS = {
    application: {
      statuses: ['Application Stage'],
      editable: new Set(APPLICATION_COLUMNS),
      moves: { 'Application Stage': ['Mock Stage'] },
      // Moving on with any of these blank asks "are you sure?" first.
      warnIfBlank: APPLICATION_COLUMNS.filter((c) => c !== 'REMARKS'),
    },
    mock: {
      statuses: ['Mock Stage'],
      editable: new Set(['REMARKS', ...MOCK_COLUMNS]),
      moves: { 'Mock Stage': ['Payment Stage'] },
      // Moving on is refused until all of these are filled.
      mustFill: MOCK_COLUMNS,
    },
    followup: {
      statuses: ['Inquiry', 'Defer', 'Withdrawn'],
      editable: new Set(['REMARKS']),
      moves: {},
    },
  };

  const teamOf = (role) => TEAMS[role] || null; // null: Admin (no limits)
  const isBlank = (v) => String(v ?? '').trim() === '';

  function seesRow(role, row) {
    const team = teamOf(role);
    return !team || team.statuses.includes(String((row && row[STATUS]) || '').trim());
  }

  function canEdit(role, col) {
    const team = teamOf(role);
    return !team || team.editable.has(col);
  }

  // The statuses this account may pick for a student currently at `status` (including staying put).
  function statusChoices(role, status, all) {
    const team = teamOf(role);
    if (!team) return all;
    return [status, ...(team.moves[status] || [])].filter(Boolean);
  }

  const label = (col) => col.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

  // Checks moving `row` from status `from` (its current one unless given) to `to`, with the row's
  // details as they'll be saved. { ok: false, message } refuses it; { ok: true, confirm } asks first.
  function checkMove(role, row, to, from = String((row && row[STATUS]) || '').trim()) {
    const team = teamOf(role);
    if (!team) return { ok: true };
    if (!(team.moves[from] || []).includes(to)) {
      return { ok: false, message: `Your team can't move a student from ${from || 'no status'} to ${to || 'no status'}.` };
    }
    const missing = (team.mustFill || []).filter((c) => isBlank(row[c]));
    if (missing.length) {
      return {
        ok: false,
        message: `This student can't go to ${to} yet. Please fill these first:\n\n• ${missing.map(label).join('\n• ')}`,
      };
    }
    const blanks = (team.warnIfBlank || []).filter((c) => isBlank(row[c]));
    if (blanks.length) {
      return {
        ok: true,
        confirm: `These details are still empty:\n\n• ${blanks.map(label).join('\n• ')}\n\nAre you sure this student should go to ${to}?`,
      };
    }
    return { ok: true };
  }

  // The part of a workbook a team gets: its students only, and no hidden sheets.
  function viewFor(role, workbook) {
    if (!teamOf(role)) return workbook;
    return {
      ...workbook,
      sheets: workbook.sheets
        .filter((s) => !s.hidden)
        .map((s) => ({ ...s, rows: s.rows.filter((r) => seesRow(role, r)) })),
    };
  }

  // The cell changes a team made between its view of the base version and its edited copy, checked
  // against the rules. Order changes and the auto-calculated columns are ignored (the page reorders
  // and recalculates on its own). { changes: [{ sheetId, rowId, col, value }], errors: [text] }
  function teamChanges(role, baseView, mineView, calculated = []) {
    const changes = [];
    const errors = [];
    const skip = new Set(calculated);
    const baseSheets = new Map(baseView.sheets.map((s) => [s.id, s]));
    const mineIds = new Set(mineView.sheets.map((s) => s.id));
    baseView.sheets.forEach((s) => { if (!mineIds.has(s.id)) errors.push(`Only Admin can delete sheets ("${s.name}").`); });
    mineView.sheets.forEach((sheet) => {
      const base = baseSheets.get(sheet.id);
      if (!base) { errors.push(`Only Admin can add sheets ("${sheet.name}").`); return; }
      const baseRows = new Map(base.rows.map((r) => [r._id, r]));
      const mineRowIds = new Set();
      sheet.rows.forEach((row) => {
        mineRowIds.add(row._id);
        const before = baseRows.get(row._id);
        if (!before) { errors.push('Only Admin can add students.'); return; }
        new Set([...Object.keys(before), ...Object.keys(row)]).forEach((col) => {
          if (col.startsWith('_') || skip.has(col)) return;
          if (String(before[col] ?? '') === String(row[col] ?? '')) return;
          if (col === STATUS) {
            const check = checkMove(role, row, String(row[col] ?? '').trim(), String(before[col] ?? '').trim());
            if (!check.ok) { errors.push(check.message.split('\n')[0]); return; }
          } else if (!canEdit(role, col)) {
            errors.push(`Your team can't change ${label(col)}.`);
            return;
          }
          changes.push({ sheetId: sheet.id, rowId: row._id, col, value: row[col] ?? '' });
        });
      });
      base.rows.forEach((r) => { if (!mineRowIds.has(r._id)) errors.push('Only Admin can delete students.'); });
    });
    return { changes, errors: [...new Set(errors)] };
  }

  return { TEAMS, STATUS, teamOf, seesRow, canEdit, statusChoices, checkMove, viewFor, teamChanges };
});
