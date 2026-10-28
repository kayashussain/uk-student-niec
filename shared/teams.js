// What each account sees and may change on Student Details.
//
//   Admin  sees and changes everything (the owner; nobody else can be given this).
//   CEO    sees every student on the visible sheets, and can change nothing.
//   Staff  work in one or more departments (Application, Mock, Follow-up, any mix). A person gets the
//          students, the editable columns and the stage moves of every department they hold.
//
// The page uses these rules to show the right students and lock the other cells; the server uses the
// same rules to send each account only its students and to refuse any other change. Used by the page
// (window.TeamRules) and the Student Details server (require).
//
// "who" is { role, departments } (the shape /api/me returns). A plain department name such as
// 'application' is accepted too and means a staff member in that one department.
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

  // The basics of a new student. A person can fill these in on the students their department added
  // (the server marks those rows with `_addedByTeam`), on top of the department's usual columns.
  const NEW_STUDENT_COLUMNS = ['FIRST NAME', 'LAST NAME', 'EMAIL', 'CONTACT NUMBER', 'STUDENT SOURCE', 'REMARKS'];

  const DEPARTMENTS = {
    application: {
      label: 'Application Team',
      start: 'Application Stage', // the stage a student this department adds starts at
      statuses: ['Application Stage'],
      editable: new Set(APPLICATION_COLUMNS),
    },
    mock: {
      label: 'Mock Team',
      start: 'Mock Stage',
      statuses: ['Mock Stage'],
      editable: new Set(['REMARKS', ...MOCK_COLUMNS]),
    },
    followup: {
      label: 'Follow-up Team',
      start: 'Inquiry',
      statuses: ['Inquiry', 'Defer', 'Withdrawn'],
      editable: new Set(['REMARKS']),
    },
  };

  // The stage moves a department may make. Follow-up can't move students on.
  const MOVES = [
    // Moving on with any of these blank asks "are you sure?" first.
    { dept: 'application', from: 'Application Stage', to: 'Mock Stage', warnIfBlank: APPLICATION_COLUMNS.filter((c) => c !== 'REMARKS') },
    // Moving on is refused until all of these are filled.
    { dept: 'mock', from: 'Mock Stage', to: 'Payment Stage', mustFill: MOCK_COLUMNS },
  ];

  const isBlank = (v) => String(v ?? '').trim() === '';
  const label = (col) => col.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

  // Normalises "who" into { role: 'admin' | 'ceo' | 'staff', departments: [known department names] }.
  function who(x) {
    if (!x) return { role: 'staff', departments: [] };
    const role = typeof x === 'string' ? x : x.role;
    if (role === 'admin' || role === 'ceo') return { role, departments: [] };
    const listed = typeof x === 'object' && Array.isArray(x.departments) ? x.departments : (DEPARTMENTS[role] ? [role] : []);
    return { role: 'staff', departments: [...new Set(listed.filter((d) => DEPARTMENTS[d]))] };
  }

  const isAdmin = (x) => who(x).role === 'admin';
  const isReadOnly = (x) => who(x).role === 'ceo';

  // null for Admin (no limits); otherwise what this account may see and do.
  function teamOf(x) {
    const w = who(x);
    if (w.role === 'admin') return null;
    if (w.role === 'ceo') return { role: 'ceo', readOnly: true, departments: [], statuses: null, editable: new Set() };
    const depts = w.departments.map((d) => DEPARTMENTS[d]);
    return {
      role: 'staff',
      readOnly: false,
      departments: w.departments,
      statuses: new Set(depts.flatMap((d) => d.statuses)),
      editable: new Set(depts.flatMap((d) => [...d.editable])),
    };
  }

  // A short key for "the same view": accounts with the same key are sent the same data.
  function viewKey(x) {
    const w = who(x);
    return w.role === 'staff' ? 'staff:' + [...w.departments].sort().join('+') : w.role;
  }

  function seesRow(x, row) {
    const team = teamOf(x);
    if (!team || !team.statuses) return true; // Admin and CEO see every student
    return team.statuses.has(String((row && row[STATUS]) || '').trim());
  }

  // `row` (optional): the student, so someone can also edit the basics of students their department added.
  function canEdit(x, col, row = null) {
    const team = teamOf(x);
    if (!team) return true;
    if (team.readOnly) return false;
    if (team.editable.has(col)) return true;
    return Boolean(row && team.departments.includes(row._addedByTeam) && NEW_STUDENT_COLUMNS.includes(col));
  }

  // The departments a person can add a new student for (Admin adds without a department).
  const addableDepartments = (x) => who(x).departments;

  // The status a new student starts with when this department adds one (the person's only department
  // unless one is named).
  function newStudentStatus(x, dept = null) {
    const team = teamOf(x);
    if (!team || team.readOnly) return '';
    const d = dept || team.departments[0];
    return d && DEPARTMENTS[d] ? DEPARTMENTS[d].start : '';
  }

  // The statuses this account may pick for a student currently at `status` (including staying put).
  function statusChoices(x, status, all) {
    const team = teamOf(x);
    if (!team) return all;
    const to = MOVES.filter((m) => team.departments.includes(m.dept) && m.from === status).map((m) => m.to);
    return [...new Set([status, ...to])].filter(Boolean);
  }

  // Checks moving `row` from status `from` (its current one unless given) to `to`, with the row's
  // details as they'll be saved. { ok: false, message } refuses it; { ok: true, confirm } asks first.
  function checkMove(x, row, to, from = String((row && row[STATUS]) || '').trim()) {
    const team = teamOf(x);
    if (!team) return { ok: true };
    if (team.readOnly) return { ok: false, message: 'Your account can only view students.' };
    const move = MOVES.find((m) => team.departments.includes(m.dept) && m.from === from && m.to === to);
    if (!move) {
      return { ok: false, message: `Your team can't move a student from ${from || 'no status'} to ${to || 'no status'}.` };
    }
    const missing = (move.mustFill || []).filter((c) => isBlank(row[c]));
    if (missing.length) {
      return {
        ok: false,
        message: `This student can't go to ${to} yet. Please fill these first:\n\n• ${missing.map(label).join('\n• ')}`,
      };
    }
    const blanks = (move.warnIfBlank || []).filter((c) => isBlank(row[c]));
    if (blanks.length) {
      return {
        ok: true,
        confirm: `These details are still empty:\n\n• ${blanks.map(label).join('\n• ')}\n\nAre you sure this student should go to ${to}?`,
      };
    }
    return { ok: true };
  }

  // The part of a workbook an account gets: Admin everything; the CEO every student on the visible
  // sheets; staff their departments' students on the visible sheets.
  function viewFor(x, workbook) {
    if (!teamOf(x)) return workbook;
    return {
      ...workbook,
      sheets: workbook.sheets
        .filter((s) => !s.hidden)
        .map((s) => ({ ...s, rows: s.rows.filter((r) => seesRow(x, r)) })),
    };
  }

  // The cell changes someone made between their view of the base version and their edited copy,
  // checked against the rules. Order changes and the auto-calculated columns are ignored (the page
  // reorders and recalculates on its own). New students come back in `adds`, holding only what the
  // person may fill in (anything else in them is dropped) and marked with the department that added them.
  // { changes: [{ sheetId, rowId, col, value }], adds: [{ sheetId, row }], errors: [text] }
  function teamChanges(x, baseView, mineView, calculated = []) {
    const team = teamOf(x);
    if (team && team.readOnly) return { changes: [], adds: [], errors: ['Your account can only view students.'] };
    const changes = [];
    const adds = [];
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
        if (!before) {
          // A new student belongs to one of the person's departments (named on the row, or their only one).
          const dept = !team ? null
            : team.departments.includes(row._addedByTeam) ? row._addedByTeam
              : (team.departments.length === 1 ? team.departments[0] : null);
          if (!dept) { errors.push('Choose which team the new student is for.'); return; }
          const start = DEPARTMENTS[dept].start;
          const status = String(row[STATUS] ?? '').trim() || start;
          if (status !== start) { errors.push(`A student your team adds starts at ${start}.`); return; }
          const added = { _id: row._id, [STATUS]: status, _addedByTeam: dept };
          Object.keys(row).forEach((col) => {
            if (col.startsWith('_') || col === STATUS || skip.has(col) || isBlank(row[col])) return;
            if (canEdit(x, col, added)) added[col] = row[col];
            else errors.push(`Your team can't fill in ${label(col)}.`);
          });
          adds.push({ sheetId: sheet.id, row: added });
          return;
        }
        new Set([...Object.keys(before), ...Object.keys(row)]).forEach((col) => {
          if (col.startsWith('_') || skip.has(col)) return;
          if (String(before[col] ?? '') === String(row[col] ?? '')) return;
          if (col === STATUS) {
            const check = checkMove(x, row, String(row[col] ?? '').trim(), String(before[col] ?? '').trim());
            if (!check.ok) { errors.push(check.message.split('\n')[0]); return; }
          } else if (!canEdit(x, col, before)) { // `before`: what the server has, not what was sent
            errors.push(`Your team can't change ${label(col)}.`);
            return;
          }
          changes.push({ sheetId: sheet.id, rowId: row._id, col, value: row[col] ?? '' });
        });
      });
      base.rows.forEach((r) => { if (!mineRowIds.has(r._id)) errors.push('Only Admin can delete students.'); });
    });
    return { changes, adds, errors: [...new Set(errors)] };
  }

  return {
    DEPARTMENTS, MOVES, STATUS, NEW_STUDENT_COLUMNS,
    who, isAdmin, isReadOnly, teamOf, viewKey, seesRow, canEdit, addableDepartments, newStudentStatus,
    statusChoices, checkMove, viewFor, teamChanges,
  };
});
