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
      'Inquiry', 'Decision Stage', 'Application Stage', 'Mock Stage', 'Payment Stage',
      'CAS Stage', 'CAS Issued', 'Visa Lodge', 'Visa Issued', 'Defer', 'Withdrawn',
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
  let columnFilters = {}; // col -> Set of allowed values (absent = no filter); per-sheet, reset on switch
  let openFilterMenu = null;

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
    sheets = snap.sheets;
    activeSheetId = snap.activeSheetId;
    syncActiveSheet();
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
      markDirty();
    }
  }

  async function loadData() {
    const res = await fetch('/api/data');
    const json = await res.json();
    sheets = json.sheets;
    activeSheetId = json.activeSheetId;
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
    const flashStatus = (text) => {
      statusEl.textContent = text;
      statusEl.className = 'save-status';
      setTimeout(() => { if (!dirty) statusEl.textContent = 'All changes saved'; }, 2000);
    };
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
    idxTh.textContent = '#';
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
    body.innerHTML = '';
    const indices = getFilteredSortedIndices();
    indices.forEach((rowIdx, displayIdx) => {
      const tr = document.createElement('tr');
      tr.dataset.rowIdx = rowIdx;
      if (selectedRows.has(rowIdx)) tr.classList.add('selected');
      tr.addEventListener('click', (e) => {
        if (e.target.classList.contains('col-idx')) return; // handled by idxTd's own listener
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          toggleRowSelection(rowIdx);
          return;
        }
        if (e.target.tagName !== 'TD') return;
        selectOnlyRow(rowIdx);
      });

      const idxTd = document.createElement('td');
      idxTd.className = 'col-idx';
      idxTd.textContent = displayIdx + 1;
      idxTd.addEventListener('click', (e) => {
        if (e.ctrlKey || e.metaKey) { toggleRowSelection(rowIdx); return; }
        selectOnlyRow(rowIdx);
      });
      tr.appendChild(idxTd);

      columns.forEach((col) => {
        const td = document.createElement('td');
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
          td.contentEditable = 'true';
          td.addEventListener('focus', () => { td.textContent = val; });
          td.addEventListener('blur', () => {
            const newVal = td.textContent.trim();
            if (newVal === (rows[rowIdx][col] || '')) return;
            pushUndo();
            rows[rowIdx][col] = newVal;
            markDirty();
            renderRowCell(td, rowIdx, col);
          });
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
          td.contentEditable = 'true';
          if (NUM_COLS.has(col)) td.classList.add('num');
          td.addEventListener('blur', () => {
            const newVal = td.textContent.trim();
            if (newVal === (rows[rowIdx][col] || '')) return;
            pushUndo();
            rows[rowIdx][col] = newVal;
            markDirty();
            if (CALC_TRIGGER_COLS.has(col)) renderBody();
          });
        }
        td.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); td.blur(); }
        });
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    rowCountEl.textContent = `${indices.length} of ${rows.length} rows`
      + (selectedRows.size ? ` · ${selectedRows.size} selected` : '');
    renderStatusSummary();
  }

  function applySelectionClasses() {
    document.querySelectorAll('#body tr').forEach((r) => {
      r.classList.toggle('selected', selectedRows.has(Number(r.dataset.rowIdx)));
    });
    const indices = getFilteredSortedIndices();
    rowCountEl.textContent = `${indices.length} of ${rows.length} rows`
      + (selectedRows.size ? ` · ${selectedRows.size} selected` : '');
  }

  function toggleRowSelection(rowIdx) {
    if (selectedRows.has(rowIdx)) selectedRows.delete(rowIdx);
    else selectedRows.add(rowIdx);
    applySelectionClasses();
  }

  function selectOnlyRow(rowIdx) {
    selectedRows = new Set([rowIdx]);
    applySelectionClasses();
  }

  function renderRowCell(td, rowIdx, col) {
    const val = rows[rowIdx][col] || '';
    td.innerHTML = '';
    const span = document.createElement('span');
    span.className = 'badge ' + badgeClass(val);
    span.textContent = val;
    td.appendChild(span);
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
    totalCard.className = 'stat-card total';
    totalCard.innerHTML = `<span class="stat-value">${indices.length}</span><span class="stat-label">Total Students</span>`;
    statusSummaryEl.appendChild(totalCard);

    let visaIssuedCount = 0;
    SUMMARY_STATUSES.forEach((status) => {
      const count = indices.reduce((acc, i) => acc + (rows[i]['APPLICATION STATUS'] === status ? 1 : 0), 0);
      if (status === 'Visa Issued') visaIssuedCount = count;
      const card = document.createElement('div');
      card.className = 'stat-card ' + badgeClass(status);
      card.innerHTML = `<span class="stat-value">${count}</span><span class="stat-label">${status}</span>`;
      statusSummaryEl.appendChild(card);
    });
    if (!SUMMARY_STATUSES.includes('Visa Issued')) {
      visaIssuedCount = indices.reduce((acc, i) => acc + (rows[i]['APPLICATION STATUS'] === 'Visa Issued' ? 1 : 0), 0);
    }

    const conversionRate = indices.length ? (visaIssuedCount / indices.length) * 100 : 0;
    const conversionCard = document.createElement('div');
    conversionCard.className = 'stat-card conversion';
    conversionCard.title = `${visaIssuedCount} Visa Issued out of ${indices.length} total students`;
    conversionCard.innerHTML = `<span class="stat-value">${conversionRate.toFixed(1)}%</span><span class="stat-label">Conversion Rate</span>`;
    statusSummaryEl.appendChild(conversionCard);
  }

  function markDirty() {
    dirty = true;
    statusEl.textContent = 'Unsaved changes…';
    statusEl.className = 'save-status dirty';
    renderStatusSummary();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveData, 600);
  }

  // For deliberate, infrequent actions (rename/add/delete/duplicate a sheet) — save
  // right away instead of waiting out the debounce, so a quick refresh can't lose it.
  function markDirtyAndSaveNow() {
    dirty = true;
    statusEl.textContent = 'Unsaved changes…';
    statusEl.className = 'save-status dirty';
    renderStatusSummary();
    clearTimeout(saveTimer);
    saveData();
  }

  async function saveData() {
    clearTimeout(saveTimer);
    try {
      const res = await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheets, activeSheetId }),
      });
      if (!res.ok) throw new Error('save failed');
      dirty = false;
      statusEl.textContent = 'All changes saved';
      statusEl.className = 'save-status';
    } catch (e) {
      statusEl.textContent = 'Save failed — retrying…';
      statusEl.className = 'save-status error';
      saveTimer = setTimeout(saveData, 3000);
    }
  }

  function addRow() {
    pushUndo();
    const blank = { _id: makeRowId() };
    columns.forEach((c) => (blank[c] = ''));
    rows.push(blank);
    selectedRows = new Set([rows.length - 1]);
    markDirty();
    renderBody();
    document.querySelector('.table-wrap').scrollTop = 1e9;
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
    markDirty();
    renderBody();
  }

  function csvEscape(v) {
    v = String(v ?? '');
    if (/[",\n]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
    return v;
  }

  function exportCsv() {
    const lines = [columns.map(csvEscape).join(',')];
    rows.forEach((r) => {
      lines.push(columns.map((c) => csvEscape(r[c])).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const sheetName = (getActiveSheet() || {}).name || 'sheet';
    a.download = `uk-student-niec-${sheetName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  $('#addRow').addEventListener('click', addRow);
  $('#delRow').addEventListener('click', deleteRow);
  $('#exportCsv').addEventListener('click', exportCsv);
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
    e.preventDefault();
    if (key === 'y' || (key === 'z' && e.shiftKey)) redo();
    else undo();
  });

  window.addEventListener('beforeunload', (e) => {
    if (!dirty) return;
    // A regular fetch can be cancelled mid-flight when the page unloads; sendBeacon
    // is designed to survive that, so use it to flush any pending debounced save.
    try {
      const blob = new Blob([JSON.stringify({ sheets, activeSheetId })], { type: 'application/json' });
      navigator.sendBeacon('/api/data', blob);
    } catch (err) { /* best effort */ }
    e.preventDefault();
    e.returnValue = '';
  });

  loadData();
})();
