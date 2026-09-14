(() => {
  const NUM_COLS = new Set([
    'GROSS FEE', 'SCHOLARSHIP', 'FEE AFTER SCHOLARSHIP', 'EARLY BIRD DISCOUNT',
    'ADDITIONAL DISCOUNT', 'TUITION FEE DEPOSIT(1st Installment)',
    'TUITION FEE DEPOSIT(2nd Installment)', 'REMANING TUITION FEE',
  ]);
  const DATE_COLS = new Set([
    'LANGUAGE TEST DATE', 'PAYMENT DATE', 'CAS REQUESTED DATE', 'CAS RECEIVED DATE',
    'VISA LODGE DATE', 'VFS ATTENDED DATE', 'VISA RECEIVED DATE',
  ]);
  const BADGE_COLS = new Set([
    'APPLICATION STATUS', 'PRE CAS INTERVIEW', 'NOC', 'MEDICAL REPORT', 'E-VISA',
  ]);
  const SELECT_COLS = {
    'APPLICATION STATUS': [
      'Inquiry', 'Application Stage', 'Mock Stage', 'Payment Stage',
      'CAS Stage', 'CAS Issued', 'Visa Lodge', 'Visa Issued', 'Visa Rejected', 'Defer', 'Withdrawn',
    ],
  };
  const SUMMARY_STATUSES = ['Payment Stage', 'CAS Issued', 'Visa Issued'];
  // Language test results (IELTS/PTE/etc.) are valid for 2 years. Flag as "expiring soon"
  // once within 3 months of that expiry (21 months elapsed), matching the source sheet's rule.
  const LANGUAGE_TEST_VALID_MONTHS = 24;
  const LANGUAGE_TEST_WARN_MONTHS = 21;
  const CALC_COLS = {
    'FEE AFTER SCHOLARSHIP': (row) => parseNum(row['GROSS FEE']) - parseNum(row['SCHOLARSHIP']),
    'REMANING TUITION FEE': (row) => {
      const base = parseNum(row['FEE AFTER SCHOLARSHIP']);
      const earlyBird = resolveDiscount(row['EARLY BIRD DISCOUNT'], base);
      const additional = parseNum(row['ADDITIONAL DISCOUNT']);
      const dep1 = parseNum(row['TUITION FEE DEPOSIT(1st Installment)']);
      const dep2 = parseNum(row['TUITION FEE DEPOSIT(2nd Installment)']);
      return base - earlyBird - additional - dep1 - dep2;
    },
  };
  const CALC_TRIGGER_COLS = new Set([
    'GROSS FEE', 'SCHOLARSHIP', 'EARLY BIRD DISCOUNT', 'ADDITIONAL DISCOUNT',
    'TUITION FEE DEPOSIT(1st Installment)', 'TUITION FEE DEPOSIT(2nd Installment)',
  ]);

  let sheets = [];
  let activeSheetId = null;
  let columns = []; // reference to the active sheet's columns array
  let rows = [];    // reference to the active sheet's rows array
  let sortCol = null;
  let sortDir = 1;
  let selectedRows = new Set();
  let dirty = false;
  let saveTimer = null;
  // Saves carry the revision they were based on. If the file moved on in the meantime (another tab or
  // device saved first), the server refuses with 409 instead of silently overwriting that work.
  let revision = 0;
  let saving = false;
  let saveQueued = false;
  let changeCount = 0;
  let conflicted = false;
  let columnFilters = {}; // col -> Set of allowed values (absent = no filter); per-sheet, reset on switch
  let openFilterMenu = null;

  // Google Sheets-style cell cursor. activeCell is where the arrow keys move from; editing is set only
  // while a text cell is being typed into. rowSelectMode means rows were picked from their S.N (row
  // number), so Delete clears those whole rows instead of just the one cell.
  let activeCell = null; // { rowIdx, col }
  let editing = null;    // { td, rowIdx, col, original, typed }
  let rowSelectMode = false;
  let skipRefocus = false;

  // Multi-cell selection, like Sheets: one or more rectangles, each running from where it started
  // (anchor) to where it was dragged/extended to (focus). Ends are stored by row id index + column
  // name, and turned into on-screen rectangles against the current search/filter/sort order.
  let selRanges = []; // [{ anchor: { rowIdx, col }, focus: { rowIdx, col } }]
  let dragMode = null; // 'cells' | 'rows' while the mouse button is held

  // Undo/redo: whole-workbook snapshots (like Google Sheets, one step = one committed
  // action — a cell edit, a row add/delete, a sheet rename, etc.), not per-keystroke.
  let undoStack = [];
  let redoStack = [];
  const MAX_UNDO_STEPS = 100;

  const $ = (sel) => document.querySelector(sel);
  const headerRow = $('#headerRow');
  const body = $('#body');
  const statusEl = $('#status');
  const rowCountEl = $('#rowCount');
  const searchEl = $('#search');
  const sheetTabsList = $('#sheetTabsList');
  const statusSummaryEl = $('#statusSummary');
  const undoBtn = $('#undoBtn');
  const redoBtn = $('#redoBtn');
  const conflictBanner = $('#conflictBanner');
  const tableWrap = $('.table-wrap');

  function getActiveSheet() {
    return sheets.find((s) => s.id === activeSheetId);
  }

  function makeSheetId() {
    return 'sheet-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // Stable per-row id so other apps (Counselor Commission) can link to a specific
  // student across edits/renames instead of by row position.
  function makeRowId() {
    return 'row-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function snapshotWorkbook() {
    return { sheets: JSON.parse(JSON.stringify(sheets)), activeSheetId };
  }

  // Call BEFORE mutating `sheets`/`rows`, while the old values are still in place.
  // Starting a new action always clears the redo stack (same as Sheets/most editors).
  function pushUndo() {
    undoStack.push(snapshotWorkbook());
    if (undoStack.length > MAX_UNDO_STEPS) undoStack.shift();
    redoStack = [];
    updateUndoRedoButtons();
  }

  function updateUndoRedoButtons() {
    if (undoBtn) undoBtn.disabled = undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = redoStack.length === 0;
  }

  function applySnapshot(snap) {
    // Keep the cell cursor on the same student after Ctrl+Z (row positions can shift, ids don't).
    const keep = activeCell && rows[activeCell.rowIdx] ? { id: rows[activeCell.rowIdx]._id, col: activeCell.col } : null;
    sheets = snap.sheets;
    activeSheetId = snap.activeSheetId;
    syncActiveSheet();
    if (keep) {
      const idx = rows.findIndex((r) => r._id === keep.id);
      if (idx !== -1 && columns.includes(keep.col)) activeCell = { rowIdx: idx, col: keep.col };
    }
    selRanges = activeCell ? [singleRange(activeCell.rowIdx, activeCell.col)] : [];
    renderSheetTabs();
    renderHeader();
    renderBody();
    updateUndoRedoButtons();
    markDirtyAndSaveNow();
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(snapshotWorkbook());
    applySnapshot(undoStack.pop());
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push(snapshotWorkbook());
    applySnapshot(redoStack.pop());
  }

  function badgeClass(value) {
    const v = (value || '').toLowerCase();
    if (!v) return 'badge-gray';
    if (/(issued|passed|received|done|submitted)/.test(v)) return 'badge-green';
    if (/(lodge|requested|pending|waiting|inquiry|stage)/.test(v)) return 'badge-blue';
    if (/(not|no|fail|reject|hold|defer|withdrawn)/.test(v)) return 'badge-amber';
    return 'badge-gray';
  }

  function parseNum(v) {
    if (!v) return 0;
    const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? 0 : n;
  }

  function formatNum(n) {
    if (n === 0) return '0.00';
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Resolves a discount entered either as a percentage ("5%") or a flat amount ("500")
  // into a dollar amount against the given base.
  function resolveDiscount(raw, base) {
    const s = String(raw || '').trim();
    if (!s) return 0;
    if (s.includes('%')) return base * (parseNum(s) / 100);
    return parseNum(s);
  }

  function toISODate(v) {
    if (!v) return '';
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    return '';
  }

  // Calendar months elapsed from `fromISO` (YYYY-MM-DD) to today, mirroring how
  // Google Sheets' EDATE counts whole months (matches the sheet's expiry rule).
  function monthsElapsedSince(fromISO) {
    const from = new Date(fromISO + 'T00:00:00');
    if (isNaN(from)) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let months = (today.getFullYear() - from.getFullYear()) * 12 + (today.getMonth() - from.getMonth());
    if (today.getDate() < from.getDate()) months -= 1;
    return months;
  }

  // Language test results are valid for 2 years. Returns 'expired', 'expiring' (within
  // 3 months of expiry), or null (still comfortably valid / not a real date).
  function languageTestStatus(isoDate) {
    if (!isoDate) return null;
    const months = monthsElapsedSince(isoDate);
    if (months === null) return null;
    if (months >= LANGUAGE_TEST_VALID_MONTHS) return 'expired';
    if (months >= LANGUAGE_TEST_WARN_MONTHS) return 'expiring';
    return null;
  }

  function applyLanguageTestFlag(td, isoDate) {
    const existingFlag = td.querySelector('.lang-test-flag');
    if (existingFlag) existingFlag.remove();

    const status = languageTestStatus(isoDate);
    if (!status) { td.title = ''; return; }

    const flag = document.createElement('span');
    flag.className = 'lang-test-flag ' + status;
    flag.textContent = status === 'expired' ? '⚠ Expired' : '⚠ Expiring';
    td.appendChild(flag);
    td.title = status === 'expired'
      ? 'Language test result has expired (valid for 2 years) — a new test is needed'
      : 'Language test result expires within 3 months (valid for 2 years) — consider retaking soon';
  }

  // The sheet deferred students get moved into — whichever sheet sits immediately
  // after the currently open one in the tab order (Sheet1 → Sheet2, Sheet2 → Sheet3, …).
  function getDeferTargetSheet() {
    const idx = sheets.findIndex((s) => s.id === activeSheetId);
    if (idx === -1) return undefined;
    return sheets[idx + 1]; // undefined if this is the last tab
  }

  // Moves a row into the defer-target sheet when one exists. Returns true if moved.
  function tryMoveRowToDeferSheet(rowIdx) {
    const target = getDeferTargetSheet();
    if (!target) return false;
    const [row] = rows.splice(rowIdx, 1);
    const movedRow = { _id: row._id || makeRowId() };
    target.columns.forEach((c) => { movedRow[c] = row[c] !== undefined ? row[c] : ''; });
    target.rows.push(movedRow);
    return true;
  }

  // Standing rule: any row on this sheet marked "Defer" gets moved into the next
  // sheet (by tab order) as soon as one exists. Runs on every render so it stays
  // true whether a row was just set to Defer, or the next sheet was only just added.
  function autoMoveDeferredRows() {
    if (!columns.includes('APPLICATION STATUS') || !getDeferTargetSheet()) return;
    let moved = false;
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (rows[i]['APPLICATION STATUS'] === 'Defer' && tryMoveRowToDeferSheet(i)) moved = true;
    }
    if (moved) {
      selectedRows = new Set(); // indices shifted; drop any stale selection
      selRanges = [];
      activeCell = null;
      markDirty();
    }
  }

  async function loadData() {
    let json;
    try {
      const res = await fetch('/api/data', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      json = await res.json();
      if (!Array.isArray(json.sheets) || !json.sheets.length) throw new Error('no sheets');
    } catch (e) {
      statusEl.textContent = 'Could not load data — retrying…';
      statusEl.className = 'save-status error';
      setTimeout(loadData, 3000);
      return;
    }
    sheets = json.sheets;
    revision = json.revision || 0;
    activeSheetId = sheets.some((s) => s.id === json.activeSheetId) ? json.activeSheetId : sheets[0].id;
    statusEl.textContent = 'All changes saved';
    statusEl.className = 'save-status';
    syncActiveSheet();
    renderSheetTabs();
    renderHeader();
    renderBody();
    undoStack = [];
    redoStack = [];
    updateUndoRedoButtons();
  }

  function syncActiveSheet() {
    const sheet = getActiveSheet();
    columns = sheet.columns;
    rows = sheet.rows;
    selectedRows = new Set();
    selRanges = [];
    dragMode = null;
    activeCell = null;
    editing = null;
    rowSelectMode = false;
    sortCol = null;
    sortDir = 1;
    columnFilters = {};
    searchEl.value = '';
  }

  function switchSheet(id) {
    if (id === activeSheetId) return;
    activeSheetId = id;
    syncActiveSheet();
    renderSheetTabs();
    renderHeader();
    renderBody();
  }

  function uniqueSheetName(base) {
    const existingNames = new Set(sheets.map((s) => s.name));
    if (!existingNames.has(base)) return base;
    let n = 2;
    while (existingNames.has(`${base} (${n})`)) n += 1;
    return `${base} (${n})`;
  }

  function addSheet() {
    pushUndo();
    const template = getActiveSheet();
    const sheet = {
      id: makeSheetId(),
      name: uniqueSheetName(`Sheet${sheets.length + 1}`),
      columns: [...template.columns],
      rows: [],
    };
    sheets.push(sheet);
    activeSheetId = sheet.id;
    syncActiveSheet();
    markDirtyAndSaveNow();
    renderSheetTabs();
    renderHeader();
    renderBody();
  }

  function duplicateSheet(id) {
    const source = sheets.find((s) => s.id === id);
    if (!source) return;
    pushUndo();
    const sheet = {
      id: makeSheetId(),
      name: uniqueSheetName(`${source.name} (Copy)`),
      columns: [...source.columns],
      rows: source.rows.map((r) => ({ ...r, _id: makeRowId() })),
    };
    const idx = sheets.findIndex((s) => s.id === id);
    sheets.splice(idx + 1, 0, sheet);
    activeSheetId = sheet.id;
    syncActiveSheet();
    markDirtyAndSaveNow();
    renderSheetTabs();
    renderHeader();
    renderBody();
  }

  function sheetToTsv(sheet) {
    const esc = (v) => String(v ?? '').replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
    const lines = [sheet.columns.map(esc).join('\t')];
    sheet.rows.forEach((r) => lines.push(sheet.columns.map((c) => esc(r[c])).join('\t')));
    return lines.join('\n');
  }

  async function copySheetToClipboard(id) {
    const sheet = sheets.find((s) => s.id === id);
    if (!sheet) return;
    const tsv = sheetToTsv(sheet);
    try {
      await navigator.clipboard.writeText(tsv);
      flashStatus(`Copied "${sheet.name}" to clipboard`);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = tsv;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        flashStatus(`Copied "${sheet.name}" to clipboard`);
      } catch (e2) {
        alert('Could not copy to clipboard. Your browser may be blocking clipboard access.');
      }
      document.body.removeChild(ta);
    }
  }

  function renameSheet(id, newName) {
    const sheet = sheets.find((s) => s.id === id);
    const trimmed = newName.trim();
    if (!sheet || !trimmed || trimmed === sheet.name) { renderSheetTabs(); return; }
    pushUndo();
    sheet.name = trimmed;
    markDirtyAndSaveNow();
    renderSheetTabs();
  }

  function deleteSheet(id) {
    if (sheets.length <= 1) { alert('A workbook needs at least one sheet.'); return; }
    const sheet = sheets.find((s) => s.id === id);
    if (!sheet) return;
    if (!confirm(`Delete sheet "${sheet.name}"? You can undo this with Ctrl+Z right after.`)) return;
    pushUndo();
    const idx = sheets.findIndex((s) => s.id === id);
    sheets.splice(idx, 1);
    if (activeSheetId === id) {
      activeSheetId = sheets[Math.max(0, idx - 1)].id;
      syncActiveSheet();
    }
    markDirtyAndSaveNow();
    renderSheetTabs();
    renderHeader();
    renderBody();
  }

  function renderSheetTabs() {
    sheetTabsList.innerHTML = '';
    sheets.forEach((sheet) => {
      const tab = document.createElement('div');
      tab.className = 'sheet-tab' + (sheet.id === activeSheetId ? ' active' : '');

      const label = document.createElement('span');
      label.className = 'sheet-tab-label';
      label.textContent = sheet.name;
      tab.appendChild(label);

      const menuBtn = document.createElement('span');
      menuBtn.className = 'sheet-tab-menu-btn';
      menuBtn.textContent = '⋮';
      menuBtn.title = 'Sheet options';
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openSheetMenuFor(sheet, menuBtn, tab);
      });
      tab.appendChild(menuBtn);

      tab.addEventListener('click', () => switchSheet(sheet.id));
      tab.addEventListener('dblclick', () => startInlineRename(sheet, tab));

      sheetTabsList.appendChild(tab);
    });
  }

  function startInlineRename(sheet, tab) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'sheet-tab-input';
    input.value = sheet.name;
    tab.innerHTML = '';
    tab.appendChild(input);
    input.focus();
    input.select();
    const commit = () => renameSheet(sheet.id, input.value);
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { e.preventDefault(); renderSheetTabs(); }
    });
  }

  let openSheetMenu = null;

  function closeSheetMenu() {
    if (openSheetMenu) {
      openSheetMenu.remove();
      openSheetMenu = null;
      document.removeEventListener('mousedown', onSheetMenuDocClick, true);
    }
  }

  function onSheetMenuDocClick(e) {
    if (openSheetMenu && !openSheetMenu.contains(e.target)) closeSheetMenu();
  }

  function openSheetMenuFor(sheet, btn, tab) {
    if (openSheetMenu && openSheetMenu.dataset.sheetId === sheet.id) { closeSheetMenu(); return; }
    closeSheetMenu();

    const menu = document.createElement('div');
    menu.className = 'sheet-menu';
    menu.dataset.sheetId = sheet.id;

    const items = [
      { label: 'Rename', action: () => startInlineRename(sheet, tab) },
      { label: 'Duplicate', action: () => duplicateSheet(sheet.id) },
      { label: 'Copy to clipboard', action: () => copySheetToClipboard(sheet.id) },
      { label: 'Delete', action: () => deleteSheet(sheet.id), danger: true },
    ];
    items.forEach(({ label, action, danger }) => {
      const item = document.createElement('div');
      item.className = 'sheet-menu-item' + (danger ? ' danger' : '');
      item.textContent = label;
      item.addEventListener('click', () => { closeSheetMenu(); action(); });
      menu.appendChild(item);
    });

    document.body.appendChild(menu);
    const rect = btn.getBoundingClientRect();
    menu.style.left = Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8) + 'px';
    menu.style.top = (rect.top - menu.offsetHeight - 4) + 'px';
    openSheetMenu = menu;
    setTimeout(() => document.addEventListener('mousedown', onSheetMenuDocClick, true), 0);
  }

  function renderHeader() {
    headerRow.innerHTML = '';
    const idxTh = document.createElement('th');
    idxTh.className = 'col-idx';
    idxTh.textContent = 'S.N';
    headerRow.appendChild(idxTh);
    columns.forEach((col) => {
      const th = document.createElement('th');
      th.dataset.col = col;
      if (col === sortCol) th.classList.add(sortDir === 1 ? 'sorted' : 'sorted-desc');

      const label = document.createElement('span');
      label.className = 'th-label';
      label.textContent = col;
      label.addEventListener('click', () => {
        if (sortCol === col) sortDir = -sortDir;
        else { sortCol = col; sortDir = 1; }
        renderHeader();
        renderBody();
      });
      th.appendChild(label);

      const filterBtn = document.createElement('span');
      filterBtn.className = 'filter-btn';
      filterBtn.textContent = '▾';
      filterBtn.title = 'Filter';
      if (columnFilters[col]) filterBtn.classList.add('active');
      filterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openFilterMenuFor(col, th);
      });
      th.appendChild(filterBtn);

      headerRow.appendChild(th);
    });
  }

  function closeFilterMenu() {
    if (openFilterMenu) {
      openFilterMenu.remove();
      openFilterMenu = null;
      document.removeEventListener('mousedown', onDocMouseDown, true);
    }
  }

  function onDocMouseDown(e) {
    if (openFilterMenu && !openFilterMenu.contains(e.target)) closeFilterMenu();
  }

  function openFilterMenuFor(col, th) {
    if (openFilterMenu && openFilterMenu.dataset.col === col) { closeFilterMenu(); return; }
    closeFilterMenu();

    const uniqueValues = Array.from(new Set(rows.map((r) => (r[col] || '').trim())))
      .sort((a, b) => a.localeCompare(b));
    const currentAllowed = columnFilters[col] || new Set(uniqueValues);

    const menu = document.createElement('div');
    menu.className = 'filter-menu';
    menu.dataset.col = col;

    const searchWrap = document.createElement('div');
    searchWrap.className = 'filter-menu-search';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search values';
    searchWrap.appendChild(searchInput);
    menu.appendChild(searchWrap);

    const actions = document.createElement('div');
    actions.className = 'filter-menu-actions';
    const selectAllBtn = document.createElement('button');
    selectAllBtn.textContent = 'Select all';
    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear';
    actions.appendChild(selectAllBtn);
    actions.appendChild(clearBtn);
    menu.appendChild(actions);

    const list = document.createElement('div');
    list.className = 'filter-menu-list';
    const checkboxes = [];
    uniqueValues.forEach((val) => {
      const item = document.createElement('label');
      item.className = 'filter-menu-item';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = currentAllowed.has(val);
      cb.dataset.val = val;
      const text = document.createElement('span');
      text.textContent = val === '' ? '(Blanks)' : val;
      item.appendChild(cb);
      item.appendChild(text);
      list.appendChild(item);
      checkboxes.push({ val, cb, item });
    });
    menu.appendChild(list);

    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      checkboxes.forEach(({ val, item }) => {
        item.style.display = val.toLowerCase().includes(q) ? '' : 'none';
      });
    });
    selectAllBtn.addEventListener('click', () => checkboxes.forEach(({ cb, item }) => {
      if (item.style.display !== 'none') cb.checked = true;
    }));
    clearBtn.addEventListener('click', () => checkboxes.forEach(({ cb, item }) => {
      if (item.style.display !== 'none') cb.checked = false;
    }));

    const footer = document.createElement('div');
    footer.className = 'filter-menu-footer';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', closeFilterMenu);
    const okBtn = document.createElement('button');
    okBtn.className = 'btn btn-primary';
    okBtn.textContent = 'OK';
    okBtn.addEventListener('click', () => {
      const allowed = new Set(checkboxes.filter(({ cb }) => cb.checked).map(({ val }) => val));
      if (allowed.size === uniqueValues.length) delete columnFilters[col];
      else columnFilters[col] = allowed;
      closeFilterMenu();
      renderHeader();
      renderBody();
    });
    footer.appendChild(cancelBtn);
    footer.appendChild(okBtn);
    menu.appendChild(footer);

    document.body.appendChild(menu);
    const rect = th.getBoundingClientRect();
    menu.style.left = Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8) + 'px';
    menu.style.top = rect.bottom + 'px';
    openFilterMenu = menu;
    setTimeout(() => document.addEventListener('mousedown', onDocMouseDown, true), 0);
  }

  function getFilteredSortedIndices() {
    const q = searchEl.value.trim().toLowerCase();
    let indices = rows.map((_, i) => i);
    if (q) {
      indices = indices.filter((i) => columns.some((c) => (rows[i][c] || '').toLowerCase().includes(q)));
    }
    Object.keys(columnFilters).forEach((col) => {
      const allowed = columnFilters[col];
      indices = indices.filter((i) => allowed.has((rows[i][col] || '').trim()));
    });
    if (sortCol) {
      const isNum = NUM_COLS.has(sortCol);
      indices.sort((a, b) => {
        const va = rows[a][sortCol] || '';
        const vb = rows[b][sortCol] || '';
        const cmp = isNum ? parseNum(va) - parseNum(vb) : va.localeCompare(vb);
        return cmp * sortDir;
      });
    }
    return indices;
  }

  function renderBody() {
    autoMoveDeferredRows();
    // Rebuilding the table drops focus. Put it back on the cell cursor afterwards, but only if focus
    // was in the table (or nowhere): a search-box keystroke also re-renders and must keep the box.
    const ae = document.activeElement;
    const hadGridFocus = !ae || ae === document.body || body.contains(ae);
    body.innerHTML = '';
    const indices = getFilteredSortedIndices();
    indices.forEach((rowIdx, displayIdx) => {
      const tr = document.createElement('tr');
      tr.dataset.rowIdx = rowIdx;

      // Clicks on rows and cells are handled once, on the table body (see the grid section below).
      const idxTd = document.createElement('td');
      idxTd.className = 'col-idx';
      idxTd.textContent = displayIdx + 1;
      idxTd.title = 'Select this row (drag or Shift+Click for a range, Ctrl+Click for more). Delete clears it.';
      tr.appendChild(idxTd);

      columns.forEach((col, colIndex) => {
        const td = document.createElement('td');
        td.dataset.colIndex = colIndex;
        td.tabIndex = -1;
        const val = rows[rowIdx][col] || '';
        if (CALC_COLS[col]) {
          const computed = CALC_COLS[col](rows[rowIdx]);
          const formatted = formatNum(computed);
          rows[rowIdx][col] = formatted;
          td.textContent = formatted;
          td.className = 'num calculated';
          td.title = col === 'REMANING TUITION FEE'
            ? 'Auto-calculated: Fee After Scholarship − Early Bird Discount − Additional Discount − 1st Installment − 2nd Installment'
            : 'Auto-calculated: Gross Fee − Scholarship';
        } else if (SELECT_COLS[col]) {
          const select = document.createElement('select');
          select.className = 'status-select ' + badgeClass(val);
          const blankOpt = document.createElement('option');
          blankOpt.value = '';
          blankOpt.textContent = '— Select —';
          select.appendChild(blankOpt);
          SELECT_COLS[col].forEach((opt) => {
            const o = document.createElement('option');
            o.value = opt;
            o.textContent = opt;
            if (opt === val) o.selected = true;
            select.appendChild(o);
          });
          select.addEventListener('click', (e) => e.stopPropagation());
          select.addEventListener('change', () => {
            const newVal = select.value;
            pushUndo();
            rows[rowIdx][col] = newVal;
            select.className = 'status-select ' + badgeClass(newVal);
            markDirty();
            if (col === 'APPLICATION STATUS') renderBody(); // re-run the defer-move check, refresh the warning
          });
          td.appendChild(select);
          if (col === 'APPLICATION STATUS' && val === 'Defer' && !getDeferTargetSheet()) {
            tr.classList.add('defer-warning-row');
            const warn = document.createElement('span');
            warn.className = 'defer-warning-flag';
            warn.textContent = '⚠ No next sheet';
            warn.title = 'There\'s no sheet after this one to move this deferred student to. Add another sheet (it will become the target) to enable auto-move.';
            td.appendChild(warn);
          }
        } else if (BADGE_COLS.has(col) && val) {
          const span = document.createElement('span');
          span.className = 'badge ' + badgeClass(val);
          span.textContent = val;
          td.appendChild(span);
        } else if (DATE_COLS.has(col)) {
          td.classList.add('date');
          const input = document.createElement('input');
          input.type = 'date';
          input.className = 'date-input';
          input.value = toISODate(val);
          input.addEventListener('click', (e) => {
            e.stopPropagation();
            if (input.showPicker) { try { input.showPicker(); } catch (err) { /* unsupported */ } }
          });
          input.addEventListener('change', () => {
            pushUndo();
            rows[rowIdx][col] = input.value;
            markDirty();
            if (col === 'LANGUAGE TEST DATE') applyLanguageTestFlag(td, input.value);
          });
          td.appendChild(input);
          if (col === 'LANGUAGE TEST DATE') applyLanguageTestFlag(td, input.value);
        } else {
          td.textContent = val;
          if (NUM_COLS.has(col)) td.classList.add('num');
        }
        // Added last: the calculated-cell branch above replaces className wholesale.
        if (activeCell && activeCell.rowIdx === rowIdx && activeCell.col === col) td.classList.add('active-cell');
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    applySelectionClasses(indices);
    renderStatusSummary();
    if (hadGridFocus && !editing && !skipRefocus) focusActiveCell({ scroll: false });
  }

  function singleRange(rowIdx, col) {
    return { anchor: { rowIdx, col }, focus: { rowIdx, col } };
  }

  function fullRowRange(fromRowIdx, toRowIdx = fromRowIdx) {
    return {
      anchor: { rowIdx: fromRowIdx, col: columns[0] },
      focus: { rowIdx: toRowIdx, col: columns[columns.length - 1] },
    };
  }

  // Each range as a rectangle of on-screen positions (top/bottom index into `indices`, left/right
  // column index). A range whose end has been hidden by a search or filter is skipped.
  function rangeRects(indices = getFilteredSortedIndices()) {
    const pos = new Map(indices.map((rowIdx, p) => [rowIdx, p]));
    return selRanges.map(({ anchor, focus }) => {
      const pa = pos.get(anchor.rowIdx);
      const pf = pos.get(focus.rowIdx);
      const ca = columns.indexOf(anchor.col);
      const cf = columns.indexOf(focus.col);
      if (pa === undefined || pf === undefined || ca === -1 || cf === -1) return null;
      return { top: Math.min(pa, pf), bottom: Math.max(pa, pf), left: Math.min(ca, cf), right: Math.max(ca, cf) };
    }).filter(Boolean);
  }

  function selectedCells(indices = getFilteredSortedIndices()) {
    const seen = new Set();
    const cells = [];
    rangeRects(indices).forEach((r) => {
      for (let p = r.top; p <= r.bottom; p += 1) {
        for (let c = r.left; c <= r.right; c += 1) {
          const key = indices[p] + '|' + c;
          if (seen.has(key)) continue;
          seen.add(key);
          cells.push({ rowIdx: indices[p], col: columns[c] });
        }
      }
    });
    return cells;
  }

  // Redraws the selection highlight without rebuilding the table, and keeps `selectedRows` (used by
  // "Delete rows") in step with it: every row the selection touches counts as selected.
  function applySelectionClasses(indices = getFilteredSortedIndices()) {
    const pos = new Map(indices.map((rowIdx, p) => [rowIdx, p]));
    const rects = rangeRects(indices);
    const multi = rects.length > 1 || rects.some((r) => r.top !== r.bottom || r.left !== r.right);
    selectedRows = new Set();
    rects.forEach((r) => { for (let p = r.top; p <= r.bottom; p += 1) selectedRows.add(indices[p]); });

    body.querySelectorAll('tr').forEach((tr) => {
      const rowIdx = Number(tr.dataset.rowIdx);
      const p = pos.get(rowIdx);
      const picked = selectedRows.has(rowIdx);
      tr.classList.toggle('selected', picked);
      tr.classList.toggle('row-picked', rowSelectMode && picked);
      const rowRects = multi ? rects.filter((r) => p >= r.top && p <= r.bottom) : [];
      for (const td of tr.children) {
        if (td.classList.contains('col-idx')) continue;
        const c = Number(td.dataset.colIndex);
        td.classList.toggle('in-range', rowRects.some((r) => c >= r.left && c <= r.right));
      }
    });

    let text = `${indices.length} of ${rows.length} rows`;
    if (selectedRows.size) text += ` · ${selectedRows.size} selected`;
    if (multi) {
      const cells = selectedCells(indices);
      text += ` · ${cells.length} cells`;
      const numeric = cells.filter(({ rowIdx, col }) => NUM_COLS.has(col) && String(rows[rowIdx][col] || '').trim() !== '');
      if (numeric.length) {
        text += ` · Sum: ${formatNum(numeric.reduce((sum, { rowIdx, col }) => sum + parseNum(rows[rowIdx][col]), 0))}`;
      }
    }
    rowCountEl.textContent = text;
  }

  function hasMultiSelection() {
    const rects = rangeRects();
    return rects.length > 1 || rects.some((r) => r.top !== r.bottom || r.left !== r.right);
  }

  // Collapse back to just the cell cursor.
  function selectOnlyActiveCell() {
    if (!activeCell) return;
    rowSelectMode = false;
    selRanges = [singleRange(activeCell.rowIdx, activeCell.col)];
    applySelectionClasses();
  }

  // Shift+Arrow: grows/shrinks the latest range from its far end; the cell cursor stays put.
  function extendSelection(dRow, dCol) {
    if (!activeCell) return;
    const indices = getFilteredSortedIndices();
    if (!selRanges.length) selRanges = [singleRange(activeCell.rowIdx, activeCell.col)];
    const last = selRanges[selRanges.length - 1];
    let p = indices.indexOf(last.focus.rowIdx);
    let c = columns.indexOf(last.focus.col);
    if (p === -1 || c === -1) return;
    p = Math.max(0, Math.min(indices.length - 1, p + dRow));
    c = rowSelectMode ? columns.length - 1 : Math.max(0, Math.min(columns.length - 1, c + dCol));
    last.focus = { rowIdx: indices[p], col: columns[c] };
    applySelectionClasses(indices);
    const td = cellTd(last.focus.rowIdx, last.focus.col);
    if (td) td.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function selectAllCells() {
    const indices = getFilteredSortedIndices();
    if (!indices.length || !columns.length) return;
    rowSelectMode = false;
    selRanges = [{
      anchor: { rowIdx: indices[0], col: columns[0] },
      focus: { rowIdx: indices[indices.length - 1], col: columns[columns.length - 1] },
    }];
    if (!activeCell || !indices.includes(activeCell.rowIdx)) setActiveCell(indices[0], columns[0], { scroll: false });
    applySelectionClasses(indices);
  }

  function renderRowCell(td, rowIdx, col) {
    const val = rows[rowIdx][col] || '';
    td.innerHTML = '';
    const span = document.createElement('span');
    span.className = 'badge ' + badgeClass(val);
    span.textContent = val;
    td.appendChild(span);
  }

  // ---------------------------------------------------------------------------------------------
  // Keyboard grid, like Google Sheets: click selects a cell, arrow keys/Tab move, typing replaces the
  // cell, Enter/F2/double-click edits it, Escape cancels, Delete clears the cell, or the whole rows
  // when rows were picked from their S.N.
  // ---------------------------------------------------------------------------------------------

  function cellTd(rowIdx, col) {
    const ci = columns.indexOf(col);
    if (ci === -1) return null;
    return body.querySelector(`tr[data-row-idx="${rowIdx}"] > td[data-col-index="${ci}"]`);
  }

  function isTextCell(col) {
    return !CALC_COLS[col] && !SELECT_COLS[col] && !DATE_COLS.has(col);
  }

  function focusActiveCell({ scroll = true } = {}) {
    if (!activeCell) return;
    const td = cellTd(activeCell.rowIdx, activeCell.col);
    if (!td) return;
    td.focus({ preventScroll: true });
    if (scroll) td.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  // focus: false when the click landed on a dropdown or date box, which needs the focus to open.
  function setActiveCell(rowIdx, col, { focus = true, scroll = true } = {}) {
    activeCell = { rowIdx, col };
    body.querySelectorAll('td.active-cell').forEach((el) => el.classList.remove('active-cell'));
    const td = cellTd(rowIdx, col);
    if (td) td.classList.add('active-cell');
    if (focus) focusActiveCell({ scroll });
  }

  // Moves through rows in the order they're shown (after search, filters and sorting).
  function moveActiveCell(dRow, dCol) {
    const indices = getFilteredSortedIndices();
    if (!indices.length || !columns.length) return;
    let pos = activeCell ? indices.indexOf(activeCell.rowIdx) : -1;
    let ci = activeCell ? columns.indexOf(activeCell.col) : -1;
    if (pos === -1 || ci === -1) {
      pos = 0; // the cursor's row was hidden by a search or filter: start from the top
      ci = Math.max(ci, 0);
    } else {
      pos = Math.max(0, Math.min(indices.length - 1, pos + dRow));
      ci = Math.max(0, Math.min(columns.length - 1, ci + dCol));
    }
    rowSelectMode = false;
    selRanges = [singleRange(indices[pos], columns[ci])];
    setActiveCell(indices[pos], columns[ci]);
    applySelectionClasses(indices);
  }

  // replaceWith: the first character typed (typing over a cell replaces it, like Sheets).
  function startEdit({ replaceWith = null } = {}) {
    if (!activeCell || editing) return;
    const { rowIdx, col } = activeCell;
    const td = cellTd(rowIdx, col);
    if (!td || !rows[rowIdx] || CALC_COLS[col]) return;
    if (!isTextCell(col)) {
      const control = td.querySelector('select, input');
      if (!control) return;
      control.focus();
      if (control.showPicker) { try { control.showPicker(); } catch (err) { /* some browsers need a click */ } }
      return;
    }
    const original = rows[rowIdx][col] || '';
    editing = { td, rowIdx, col, original, typed: replaceWith !== null };
    td.contentEditable = 'true';
    td.classList.add('editing');
    td.textContent = replaceWith !== null ? replaceWith : original;
    td.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(td);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function commitEdit({ move = null, refocus = true } = {}) {
    if (!editing) return;
    const { td, rowIdx, col, original } = editing;
    editing = null;
    td.removeAttribute('contenteditable');
    td.classList.remove('editing');
    const newVal = td.textContent.trim();
    if (rows[rowIdx] && newVal !== original) {
      pushUndo();
      rows[rowIdx][col] = newVal;
      markDirty();
      skipRefocus = true; // the caller decides where focus goes next
      renderBody(); // recalculates the fee columns and redraws status badges
      skipRefocus = false;
    } else if (BADGE_COLS.has(col) && original) {
      renderRowCell(td, rowIdx, col);
    } else {
      td.textContent = original;
    }
    if (move) moveActiveCell(move[0], move[1]);
    else if (refocus) focusActiveCell({ scroll: false });
  }

  function cancelEdit() {
    if (!editing) return;
    const { td, rowIdx, col, original } = editing;
    editing = null;
    td.removeAttribute('contenteditable');
    td.classList.remove('editing');
    if (BADGE_COLS.has(col) && original) renderRowCell(td, rowIdx, col);
    else td.textContent = original;
    focusActiveCell({ scroll: false });
  }

  // Delete empties every selected cell (one cell, a dragged range, or whole rows picked from their S.N),
  // as one undo step. The rows themselves stay: the "Delete rows" button removes rows. Calculated fee
  // cells can't be cleared: they're worked out from the others.
  function clearSelectedCells() {
    const cells = selectedCells().filter(({ rowIdx, col }) => rows[rowIdx] && !CALC_COLS[col] && (rows[rowIdx][col] || ''));
    if (!cells.length) return;
    pushUndo();
    cells.forEach(({ rowIdx, col }) => { rows[rowIdx][col] = ''; });
    markDirty();
    renderBody();
  }

  // Copy/paste as tab-separated text, so ranges move to and from Excel and Google Sheets.
  function selectionToTsv() {
    const indices = getFilteredSortedIndices();
    const rects = rangeRects(indices);
    if (!rects.length) return null;
    const r = rects[rects.length - 1]; // several separate ranges: copy the latest, as Sheets does
    const lines = [];
    for (let p = r.top; p <= r.bottom; p += 1) {
      const cells = [];
      for (let c = r.left; c <= r.right; c += 1) {
        cells.push(String(rows[indices[p]][columns[c]] || '').replace(/[\t\r\n]+/g, ' '));
      }
      lines.push(cells.join('\t'));
    }
    return { tsv: lines.join('\n'), count: (r.bottom - r.top + 1) * (r.right - r.left + 1) };
  }

  // Pastes from the top-left of the selection. A single copied value fills the whole selection.
  function pasteIntoSelection(text) {
    const data = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').map((line) => line.split('\t'));
    const indices = getFilteredSortedIndices();
    const rects = rangeRects(indices);
    const r = rects[rects.length - 1];
    if (!r) return;
    const fill = data.length === 1 && data[0].length === 1;
    const height = fill ? r.bottom - r.top + 1 : data.length;
    const width = fill ? r.right - r.left + 1 : Math.max(...data.map((line) => line.length));

    const changes = [];
    for (let dr = 0; dr < height && r.top + dr < indices.length; dr += 1) {
      for (let dc = 0; dc < width && r.left + dc < columns.length; dc += 1) {
        const raw = fill ? data[0][0] : data[dr][dc];
        const col = columns[r.left + dc];
        if (raw === undefined || CALC_COLS[col]) continue;
        let val = raw.trim();
        if (DATE_COLS.has(col) && val) val = toISODate(val) || val;
        if (SELECT_COLS[col] && val) {
          const match = SELECT_COLS[col].find((opt) => opt.toLowerCase() === val.toLowerCase());
          if (!match) continue; // not one of the dropdown's choices
          val = match;
        }
        const rowIdx = indices[r.top + dr];
        if ((rows[rowIdx][col] || '') !== val) changes.push({ rowIdx, col, val });
      }
    }
    if (!changes.length) return;
    pushUndo();
    changes.forEach(({ rowIdx, col, val }) => { rows[rowIdx][col] = val; });
    const bottom = Math.min(indices.length - 1, r.top + height - 1);
    const right = Math.min(columns.length - 1, r.left + width - 1);
    rowSelectMode = false;
    activeCell = { rowIdx: indices[r.top], col: columns[r.left] };
    selRanges = [{ anchor: { ...activeCell }, focus: { rowIdx: indices[bottom], col: columns[right] } }];
    markDirty();
    renderBody();
  }

  function flashStatus(text) {
    statusEl.textContent = text;
    statusEl.className = 'save-status';
    setTimeout(() => { if (!dirty) statusEl.textContent = 'All changes saved'; }, 2000);
  }

  function renderStatusSummary() {
    const statusOptions = SELECT_COLS['APPLICATION STATUS'];
    if (!statusOptions || !columns.includes('APPLICATION STATUS')) {
      statusSummaryEl.innerHTML = '';
      statusSummaryEl.hidden = true;
      return;
    }
    statusSummaryEl.hidden = false;
    const indices = getFilteredSortedIndices();
    statusSummaryEl.innerHTML = '';

    const totalCard = document.createElement('div');
    totalCard.className = 'stat-card';
    totalCard.innerHTML = `<span class="stat-value">${indices.length}</span><span class="stat-label">Total Students</span>`;
    statusSummaryEl.appendChild(totalCard);

    let visaIssuedCount = 0;
    SUMMARY_STATUSES.forEach((status) => {
      const count = indices.reduce((acc, i) => acc + (rows[i]['APPLICATION STATUS'] === status ? 1 : 0), 0);
      if (status === 'Visa Issued') visaIssuedCount = count;
      const card = document.createElement('div');
      card.className = 'stat-card';
      card.innerHTML = `<span class="stat-value">${count}</span><span class="stat-label">${status}</span>`;
      statusSummaryEl.appendChild(card);
    });
    if (!SUMMARY_STATUSES.includes('Visa Issued')) {
      visaIssuedCount = indices.reduce((acc, i) => acc + (rows[i]['APPLICATION STATUS'] === 'Visa Issued' ? 1 : 0), 0);
    }

    const conversionRate = indices.length ? (visaIssuedCount / indices.length) * 100 : 0;
    const conversionCard = document.createElement('div');
    conversionCard.className = 'stat-card';
    conversionCard.title = `${visaIssuedCount} Visa Issued out of ${indices.length} total students`;
    conversionCard.innerHTML = `<span class="stat-value">${conversionRate.toFixed(1)}%</span><span class="stat-label">Conversion Rate</span>`;
    statusSummaryEl.appendChild(conversionCard);
  }

  function markDirty() {
    dirty = true;
    changeCount += 1;
    renderStatusSummary();
    if (conflicted) return;
    statusEl.textContent = 'Unsaved changes…';
    statusEl.className = 'save-status dirty';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveData, 600);
  }

  // For deliberate, infrequent actions (rename/add/delete/duplicate a sheet) — save
  // right away instead of waiting out the debounce, so a quick refresh can't lose it.
  function markDirtyAndSaveNow() {
    dirty = true;
    changeCount += 1;
    renderStatusSummary();
    if (conflicted) return;
    statusEl.textContent = 'Unsaved changes…';
    statusEl.className = 'save-status dirty';
    saveData();
  }

  // One save at a time, so an older copy of the workbook can never land after a newer one.
  async function saveData() {
    clearTimeout(saveTimer);
    if (conflicted) return;
    if (saving) { saveQueued = true; return; }
    saving = true;
    const savedChange = changeCount;
    try {
      const res = await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheets, activeSheetId, baseRevision: revision }),
      });
      if (res.status === 409) { showConflict(); return; }
      if (!res.ok) throw new Error('save failed');
      revision = (await res.json()).revision;
      if (changeCount === savedChange) {
        dirty = false;
        statusEl.textContent = 'All changes saved';
        statusEl.className = 'save-status';
      }
    } catch (e) {
      statusEl.textContent = 'Save failed — retrying…';
      statusEl.className = 'save-status error';
      saveTimer = setTimeout(saveData, 3000);
    } finally {
      saving = false;
      if (saveQueued) { saveQueued = false; saveData(); }
    }
  }

  function showConflict() {
    conflicted = true;
    clearTimeout(saveTimer);
    statusEl.textContent = 'Not saved';
    statusEl.className = 'save-status error';
    conflictBanner.hidden = false;
  }

  // Another tab or device saved: take its version, keeping this tab's sheet, search, filters, sort,
  // cursor and scroll position. Undo history is dropped, since undoing now would overwrite their work.
  function applyRemoteWorkbook(json) {
    const rowId = (idx) => (rows[idx] ? rows[idx]._id : null);
    const keep = {
      sheetId: activeSheetId,
      sortCol,
      sortDir,
      filters: columnFilters,
      search: searchEl.value,
      rowSelectMode,
      active: activeCell ? { id: rowId(activeCell.rowIdx), col: activeCell.col } : null,
      ranges: selRanges.map((r) => ({
        anchor: { id: rowId(r.anchor.rowIdx), col: r.anchor.col },
        focus: { id: rowId(r.focus.rowIdx), col: r.focus.col },
      })),
      scrollTop: tableWrap.scrollTop,
      scrollLeft: tableWrap.scrollLeft,
    };

    sheets = json.sheets;
    revision = json.revision || 0;
    const sameSheet = sheets.some((s) => s.id === keep.sheetId);
    activeSheetId = sameSheet ? keep.sheetId : sheets[0].id;
    syncActiveSheet();

    if (sameSheet) {
      sortCol = columns.includes(keep.sortCol) ? keep.sortCol : null;
      sortDir = keep.sortDir;
      columnFilters = keep.filters;
      searchEl.value = keep.search;
      const toCell = (c) => {
        const idx = rows.findIndex((r) => r._id === c.id);
        return idx !== -1 && columns.includes(c.col) ? { rowIdx: idx, col: c.col } : null;
      };
      if (keep.active) activeCell = toCell(keep.active);
      selRanges = keep.ranges
        .map((r) => ({ anchor: toCell(r.anchor), focus: toCell(r.focus) }))
        .filter((r) => r.anchor && r.focus);
      rowSelectMode = keep.rowSelectMode && selRanges.length > 0;
    }

    undoStack = [];
    redoStack = [];
    updateUndoRedoButtons();
    renderSheetTabs();
    renderHeader();
    renderBody();
    if (sameSheet) {
      tableWrap.scrollTop = keep.scrollTop;
      tableWrap.scrollLeft = keep.scrollLeft;
    }
    flashStatus('Updated with the latest changes');
  }

  // Keeps an open tab current when someone else saves. Never runs over unsaved or in-progress work.
  async function checkForRemoteChanges() {
    const busy = () => dirty || saving || editing || conflicted || dragMode || openFilterMenu || openSheetMenu;
    if (busy() || document.hidden) return;
    try {
      const res = await fetch('/api/revision', { cache: 'no-store' });
      if (!res.ok) return;
      const latest = (await res.json()).revision;
      if (latest === revision) return;
      const dataRes = await fetch('/api/data', { cache: 'no-store' });
      if (!dataRes.ok) return;
      const json = await dataRes.json();
      if (busy() || !Array.isArray(json.sheets) || !json.sheets.length) return; // the user started something meanwhile
      applyRemoteWorkbook(json);
    } catch (e) { /* offline for a moment: try again next time */ }
  }

  function addRow() {
    pushUndo();
    const blank = { _id: makeRowId() };
    columns.forEach((c) => (blank[c] = ''));
    rows.push(blank);
    const startCol = columns.find(isTextCell) || columns[0];
    selRanges = [singleRange(rows.length - 1, startCol)];
    rowSelectMode = false;
    markDirty();
    renderBody();
    document.querySelector('.table-wrap').scrollTop = 1e9;
    // Ready to type straight into the new row.
    setActiveCell(rows.length - 1, startCol, { scroll: false });
  }

  function describeRow(row) {
    return [row['FIRST NAME'], row['LAST NAME']].filter(Boolean).join(' ') || 'this row';
  }

  function deleteRow() {
    if (selectedRows.size === 0) {
      alert('Click a row first (Ctrl+Click to select multiple), then Delete rows.');
      return;
    }
    const indicesToDelete = Array.from(selectedRows).sort((a, b) => b - a); // descending, so splice indices stay valid
    const label = indicesToDelete.length === 1
      ? describeRow(rows[indicesToDelete[0]])
      : `${indicesToDelete.length} rows`;
    if (!confirm(`Delete ${label}?`)) return;
    pushUndo();
    indicesToDelete.forEach((i) => rows.splice(i, 1));
    selectedRows = new Set();
    selRanges = [];
    rowSelectMode = false;
    activeCell = null;
    markDirty();
    renderBody();
  }

  async function exportExcel() {
    if (typeof ExcelJS === 'undefined') {
      alert('The Excel export library failed to load (check your internet connection) — try again.');
      return;
    }
    const sheetName = (getActiveSheet() || {}).name || 'Export';
    const safeSheetName = sheetName.replace(/[\\/*?:[\]]/g, ' ').slice(0, 31) || 'Export';

    const wb = new ExcelJS.Workbook();
    wb.creator = 'UK Student NIEC';
    wb.created = new Date();

    const ws = wb.addWorksheet(safeSheetName, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = columns.map((c) => {
      const maxLen = rows.reduce((m, r) => Math.max(m, String(r[c] || '').length), c.length);
      return { header: c, width: Math.min(40, Math.max(10, maxLen + 2)) };
    });

    const headerRow = ws.getRow(1);
    headerRow.height = 28;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFC6E1F' } };
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    });

    rows.forEach((r) => {
      const row = ws.addRow(columns.map((c) => r[c] || ''));
      row.height = 20;
      row.eachCell((cell) => { cell.alignment = { vertical: 'middle' }; });
    });

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `uk-student-niec-${sheetName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  $('#addRow').addEventListener('click', addRow);
  $('#delRow').addEventListener('click', deleteRow);
  $('#exportExcel').addEventListener('click', exportExcel);
  $('#addSheet').addEventListener('click', addSheet);
  if (undoBtn) undoBtn.addEventListener('click', undo);
  if (redoBtn) redoBtn.addEventListener('click', redo);
  searchEl.addEventListener('input', renderBody);

  // Google Sheets-style undo/redo hotkeys. Skipped while typing in the search box or
  // renaming a sheet tab, so ordinary text-field undo still works there.
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key !== 'z' && key !== 'y') return;
    const active = document.activeElement;
    if (active === searchEl || (active && active.classList && active.classList.contains('sheet-tab-input'))) return;
    if (editing) return; // inside a cell being typed in, Ctrl+Z undoes the typing, like Sheets
    e.preventDefault();
    if (key === 'y' || (key === 'z' && e.shiftKey)) redo();
    else undo();
  });

  // Mouse: one listener on the table body. It works from row/column positions rather than the clicked
  // element, because finishing an edit can redraw the table in the middle of the click.
  body.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const td = e.target.closest('td');
    if (!td || !body.contains(td)) return;
    if (editing && editing.td === td) return; // clicking inside the cell being typed in moves the caret
    const rowIdx = Number(td.parentElement.dataset.rowIdx);
    const onControl = Boolean(e.target.closest('select, input'));
    if (editing) commitEdit({ refocus: false });
    const additive = e.ctrlKey || e.metaKey;

    // S.N column: pick whole rows. Drag or Shift+Click for a run of rows, Ctrl+Click to add/remove one.
    if (td.classList.contains('col-idx')) {
      e.preventDefault();
      if (e.shiftKey && rowSelectMode && selRanges.length) {
        selRanges[selRanges.length - 1].focus = { rowIdx, col: columns[columns.length - 1] };
        focusActiveCell({ scroll: false });
      } else if (additive && rowSelectMode) {
        const before = selRanges.length;
        selRanges = selRanges.filter((r) => !(r.anchor.rowIdx === rowIdx && r.focus.rowIdx === rowIdx));
        if (selRanges.length === before) selRanges.push(fullRowRange(rowIdx));
        setActiveCell(rowIdx, columns[0], { scroll: false });
      } else {
        rowSelectMode = true;
        selRanges = [fullRowRange(rowIdx)];
        setActiveCell(rowIdx, columns[0], { scroll: false });
      }
      dragMode = 'rows';
      applySelectionClasses();
      return;
    }

    const col = columns[Number(td.dataset.colIndex)];
    if (col === undefined) return;
    if (onControl) {
      // Dropdowns and date boxes need the click to open, so they only move the cursor.
      rowSelectMode = false;
      selRanges = [singleRange(rowIdx, col)];
      setActiveCell(rowIdx, col, { focus: false, scroll: false });
      applySelectionClasses();
      return;
    }
    e.preventDefault(); // select the cell; don't drop a text caret into it
    if (e.shiftKey && activeCell && selRanges.length) {
      rowSelectMode = false;
      selRanges[selRanges.length - 1].focus = { rowIdx, col };
      focusActiveCell({ scroll: false });
    } else if (additive) {
      rowSelectMode = false;
      selRanges.push(singleRange(rowIdx, col));
      setActiveCell(rowIdx, col, { scroll: false });
    } else {
      rowSelectMode = false;
      selRanges = [singleRange(rowIdx, col)];
      setActiveCell(rowIdx, col, { scroll: false });
    }
    dragMode = 'cells';
    applySelectionClasses();
  });

  // Dragging with the button held stretches the latest range to the cell under the pointer.
  body.addEventListener('mouseover', (e) => {
    if (!dragMode) return;
    if (!(e.buttons & 1)) { dragMode = null; return; }
    const td = e.target.closest('td');
    if (!td || !body.contains(td) || !selRanges.length) return;
    const rowIdx = Number(td.parentElement.dataset.rowIdx);
    const last = selRanges[selRanges.length - 1];
    const col = dragMode === 'rows'
      ? columns[columns.length - 1]
      : (columns[Number(td.dataset.colIndex)] ?? last.focus.col);
    if (last.focus.rowIdx === rowIdx && last.focus.col === col) return;
    last.focus = { rowIdx, col };
    applySelectionClasses();
  });

  document.addEventListener('mouseup', () => { dragMode = null; });

  // True when the grid (not the search box, a dropdown, or a cell being typed in) should get clipboard keys.
  function gridHasFocus() {
    if (editing || !activeCell || openFilterMenu || openSheetMenu) return false;
    const ae = document.activeElement;
    return ae === document.body || (body.contains(ae) && !ae.matches('select, input'));
  }

  document.addEventListener('copy', (e) => {
    if (!gridHasFocus()) return;
    const out = selectionToTsv();
    if (!out) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', out.tsv);
    flashStatus(out.count === 1 ? 'Copied 1 cell' : `Copied ${out.count} cells`);
  });

  document.addEventListener('cut', (e) => {
    if (!gridHasFocus()) return;
    const out = selectionToTsv();
    if (!out) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', out.tsv);
    clearSelectedCells();
  });

  document.addEventListener('paste', (e) => {
    if (!gridHasFocus()) return;
    const text = e.clipboardData && e.clipboardData.getData('text/plain');
    if (!text) return;
    e.preventDefault();
    pasteIntoSelection(text);
  });

  body.addEventListener('dblclick', (e) => {
    const td = e.target.closest('td');
    if (!td || !body.contains(td) || td.classList.contains('col-idx') || e.target.closest('select, input')) return;
    const rowIdx = Number(td.parentElement.dataset.rowIdx);
    const col = columns[Number(td.dataset.colIndex)];
    if (col === undefined || !isTextCell(col)) return;
    if (!activeCell || activeCell.rowIdx !== rowIdx || activeCell.col !== col) setActiveCell(rowIdx, col, { scroll: false });
    startEdit();
  });

  // Clicking anywhere outside the cell being typed in (search box, a button, another tab) saves it.
  body.addEventListener('focusout', (e) => {
    if (editing && e.target === editing.td) commitEdit({ refocus: false });
  });

  const ARROWS = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

  document.addEventListener('keydown', (e) => {
    if (!activeCell || openFilterMenu || openSheetMenu || e.defaultPrevented) return;
    const ae = document.activeElement;
    if (!(ae === document.body || body.contains(ae))) return; // search box, rename box, buttons: not ours

    if (editing) {
      if (e.key === 'Enter') { e.preventDefault(); commitEdit({ move: [e.shiftKey ? -1 : 1, 0] }); }
      else if (e.key === 'Tab') { e.preventDefault(); commitEdit({ move: [0, e.shiftKey ? -1 : 1] }); }
      else if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
      // Up/Down always leave the cell. Left/Right move the caret, except right after typing over a
      // cell, where (as in Sheets) they move to the next cell.
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || (editing.typed && ARROWS[e.key])) {
        e.preventDefault();
        commitEdit({ move: ARROWS[e.key] });
      }
      return; // letters, Backspace, caret keys and Ctrl+Z are ordinary typing
    }

    // A status dropdown or date box has the focus: Escape/Tab get back to the grid.
    if (ae && ae.matches && ae.matches('select, input')) {
      if (e.key === 'Escape' || (e.key === 'Enter' && ae.tagName === 'INPUT')) { e.preventDefault(); focusActiveCell({ scroll: false }); }
      else if (e.key === 'Tab') { e.preventDefault(); moveActiveCell(0, e.shiftKey ? -1 : 1); }
      else if (ae.tagName === 'SELECT' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); moveActiveCell(...ARROWS[e.key]); }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      selectAllCells();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return; // shortcuts (Ctrl+Z, Ctrl+C, ...) aren't grid keys
    if (ARROWS[e.key] && e.shiftKey) { e.preventDefault(); extendSelection(...ARROWS[e.key]); return; }
    if (ARROWS[e.key]) { e.preventDefault(); moveActiveCell(...ARROWS[e.key]); return; }
    if (e.key === 'Tab') { e.preventDefault(); moveActiveCell(0, e.shiftKey ? -1 : 1); return; }
    if (e.key === ' ' && e.shiftKey) {
      e.preventDefault();
      rowSelectMode = true;
      selRanges = [fullRowRange(activeCell.rowIdx)];
      applySelectionClasses();
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); clearSelectedCells(); return; }
    if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); startEdit(); return; }
    if (e.key === 'Escape' && (rowSelectMode || hasMultiSelection())) { e.preventDefault(); selectOnlyActiveCell(); return; }
    if (!isTextCell(activeCell.col)) return;
    if (e.key.length === 1) { e.preventDefault(); startEdit({ replaceWith: e.key }); return; }
    if (e.isComposing || e.key === 'Process') startEdit({ replaceWith: '' }); // IME input (e.g. Nepali) types into it
  });

  $('#reloadBtn').addEventListener('click', () => {
    dirty = false; // skip the "leave site?" prompt: reloading to get the latest version is the point
    location.reload();
  });

  window.addEventListener('beforeunload', (e) => {
    if (!dirty) return;
    // A regular fetch can be cancelled mid-flight when the page unloads; sendBeacon
    // is designed to survive that, so use it to flush any pending debounced save.
    if (!conflicted) {
      try {
        const blob = new Blob([JSON.stringify({ sheets, activeSheetId, baseRevision: revision })], { type: 'application/json' });
        navigator.sendBeacon('/api/data', blob);
      } catch (err) { /* best effort */ }
    }
    e.preventDefault();
    e.returnValue = '';
  });

  setInterval(checkForRemoteChanges, 10000);
  loadData();
})();
