// Small helpers shared by the portal pages (student card, templates, B2B partners, the decision pages and
// the Fact File's option finder). Loaded as window.Portal after session.js and ui.js.
// Everything that comes from a student, a template or a partner is put on the page as text, never as HTML.
(function (root) {
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  // el() with attributes and children in one go: h('button', { class: 'btn', type: 'button', onclick: fn }, 'Save')
  function h(tag, attrs, ...children) {
    const e = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v === false || v === null || v === undefined) return;
      if (k === 'class') e.className = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k === 'value') e.value = v;
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, v);
    });
    children.flat().forEach((c) => { if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return e;
  }

  // GET (no body) or POST (a body). Throws an Error with the server's own sentence when the answer is not OK.
  // The same save sent again while the first is still on its way (a double click) is not sent twice: both callers get the one answer.
  const inFlight = new Map();
  function api(url, body) {
    if (body === undefined) return request(url, body);
    const key = url + '|' + JSON.stringify(body);
    if (inFlight.has(key)) return inFlight.get(key);
    const p = request(url, body).finally(() => { inFlight.delete(key); });
    inFlight.set(key, p);
    return p;
  }
  async function request(url, body) {
    const res = await fetch(url, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(json.error || 'Something went wrong. Please try again.'); e.status = res.status; e.body = json; throw e; }
    return json;
  }

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // "2026-11-12" or "11/12/2026" (month first, as imported sheets hold dates) as "12 Nov 2026"; anything else as typed.
  function day(v) {
    const s = String(v ?? '').trim();
    let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    return m ? `${Number(m[2])} ${MONTHS[Number(m[1]) - 1]} ${m[3]}` : s;
  }
  // A moment as "12 Nov 2026, 3:40 pm" in the reader's own time.
  function when(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  }
  // How far a day is from today: "today", "in 3 days", "4 days ago". `today` and `iso` are YYYY-MM-DD.
  function fromToday(iso, today) {
    const n = Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
    if (Number.isNaN(n)) return '';
    if (n === 0) return 'today';
    if (n === 1) return 'tomorrow';
    if (n === -1) return 'yesterday';
    return n > 0 ? `in ${n} days` : `${-n} days ago`;
  }

  // The colour family of a stage, the same as the badges on the sheet.
  function stageKind(stage) {
    const v = String(stage || '').toLowerCase();
    if (!v) return 'gray';
    if (/reject/.test(v)) return 'red';
    if (/issued/.test(v)) return 'green';
    if (/hold|defer|withdrawn/.test(v)) return 'amber';
    return 'blue';
  }
  const stagePill = (stage) => el('span', `p-pill p-pill-${stageKind(stage)}`, stage || 'No stage');
  const initials = (name) => String(name || '?').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const number = (n) => (n === null || n === undefined ? '' : Number(n).toLocaleString('en-IN'));
  const rupees = (n) => (n === null || n === undefined ? '' : `Rs ${Number(n).toLocaleString('en-IN')}`);
  const percent = (n) => (n === null || n === undefined ? 'n/a' : `${n}%`);

  // Typed text as paragraphs, bullets ("- ") and small headings ("## "), like the Fact File pages.
  function richText(parent, text) {
    let list = null;
    String(text || '').split('\n').forEach((raw) => {
      const line = raw.trim();
      const heading = /^##\s+(.*)$/.exec(line);
      if (heading) { list = null; parent.append(el('h4', '', heading[1])); return; }
      const bullet = /^[-*]\s+(.*)$/.exec(line);
      if (bullet) { if (!list) { list = el('ul'); parent.append(list); } list.append(el('li', '', bullet[1])); return; }
      list = null;
      if (line) parent.append(el('p', '', line));
    });
    return parent;
  }

  // A labelled box of a form. kind: text | date | number | area | select (choices: [value] or [[value, label]]).
  function field(label, { kind = 'text', value = '', choices = [], placeholder = '', max = 300, list = '', hint = '', wide = false, disabled = false } = {}) {
    let input;
    if (kind === 'select') {
      input = el('select');
      if (!choices.some((c) => (Array.isArray(c) ? c[0] : c) === '')) input.append(h('option', { value: '' }, 'Choose\u2026')); // a blank choice only when the list has none of its own (it reads "Choose...", so the box is never blank)
      choices.forEach((c) => { const [v, t] = Array.isArray(c) ? c : [c, c]; input.append(h('option', { value: v }, t)); });
      if (value && ![...input.options].some((o) => o.value === value)) input.append(h('option', { value }, value)); // an older value stays selectable
      input.value = value || '';
    } else if (kind === 'area') {
      input = el('textarea');
      input.value = value || '';
      input.maxLength = max;
    } else {
      input = el('input');
      input.type = kind === 'date' ? 'date' : 'text';
      if (kind === 'number') input.inputMode = 'numeric';
      input.value = value || '';
      if (kind !== 'date') input.maxLength = max;
      if (list) input.setAttribute('list', list);
    }
    if (placeholder) input.placeholder = placeholder;
    input.disabled = disabled;
    const wrap = el('label', `p-field${wide ? ' p-wide' : ''}`);
    wrap.append(el('span', 'p-label', label), input);
    if (hint) wrap.append(el('span', 'p-hint', hint));
    return { wrap, input };
  }
  function datalist(id, values) {
    const d = el('datalist');
    d.id = id;
    values.forEach((v) => d.append(h('option', { value: v })));
    return d;
  }

  // A dialog in the site's look. build(dialog, close) fills it; resolves with what close(value) was given (undefined when dismissed).
  function dialog(title, build, { wide = false } = {}) {
    return new Promise((resolve) => {
      const d = el('dialog', `p-dialog${wide ? ' p-dialog-wide' : ''}`);
      let result;
      // Closes with a short fade and shrink (as a Mac sheet does); a person who prefers less motion gets it at once.
      const close = (value) => {
        result = value;
        if (d.classList.contains('is-closing')) return;
        const quick = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (quick) { d.close(); return; }
        d.classList.add('is-closing');
        setTimeout(() => d.close(), 160);
      };
      const head = el('div', 'p-dialog-head');
      const x = h('button', { type: 'button', class: 'p-x', 'aria-label': 'Close', onclick: () => close() }, '×');
      head.append(el('h2', '', title), x);
      const body = el('div', 'p-dialog-body');
      d.append(head, body);
      d.addEventListener('close', () => { d.remove(); resolve(result); });
      d.addEventListener('mousedown', (e) => { if (e.target === d) close(); });
      // Escape closes with the same short animation as the close button, not the browser's instant close.
      d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
      document.body.append(d);
      build(body, close);
      d.showModal();
    });
  }

  // Copies text to the clipboard (with the older way as a fallback). true when it worked.
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* the older way below */ }
    const box = el('textarea');
    box.value = text;
    box.className = 'p-offscreen';
    document.body.append(box);
    box.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { /* not allowed */ }
    box.remove();
    return ok;
  }

  // Asks every few seconds for the answer of a question the server is working on (see ai.js). Resolves with the result.
  async function waitFor(url, { every = 2500, limit = 240000 } = {}) {
    const start = Date.now();
    for (;;) {
      await new Promise((r) => setTimeout(r, every));
      const j = await api(url);
      if (j.status === 'done') return j.result;
      if (j.status === 'failed') throw new Error(j.error || 'The question could not be answered.');
      if (Date.now() - start > limit) throw new Error('The answer is taking too long. Please try again.');
    }
  }

  // The comments on a task (the owner, 14 Nov 2026): the team writes how it went, what it needs (a student's email, a document) or what
  // is in the way, with or without ticking the task, and whoever gave the task answers. Shown on Today and on the student card as a
  // calm record (who, when, what), not a chat. What is new for the reader is marked with a red dot; opening the comments marks them
  // read. `me` is the reader's name; `rowId` the student's card; `unread` how much is new for the reader.
  const openThreads = new Set();
  const initialsOf = (name) => String(name || '?').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  function taskThread(task, { rowId, me, canWrite, unread = 0, teams = [] }) {
    const labelOf = (id) => (teams.find((t) => t.id === id) || { label: id === 'head' ? 'Admin' : id }).label;
    const box = el('div', 'tk-thread');
    const list = el('ol', 'tk-list');
    const comments = () => (Array.isArray(task.comments) ? task.comments : []);
    // `pending`: everything new on the task for the reader (new comments, or the task itself just given to them); `fresh`: the new
    // comments among it, shown on the comments line.
    let pending = unread;
    let fresh = Math.min(unread, comments().filter((c) => c.by !== me).length);
    const toggle = h('button', { class: 'tk-toggle', type: 'button', 'aria-expanded': 'false' });
    const body = el('div', 'tk-body');
    // The line is changed in place (never rebuilt), so a press on it is never lost while it is being clicked.
    const ico = el('span', 'tk-ico'); ico.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6.5h14M5 11.5h14M5 16.5h9"/></svg>';
    const words = el('span');
    const badge = el('span', 'tk-new');
    toggle.append(ico, words, badge);
    const label = () => {
      const n = comments().length;
      words.textContent = n ? `${n} update${n === 1 ? '' : 's'}` : (canWrite ? 'Add an update' : 'No updates');
      badge.textContent = `${fresh} new`;
      badge.hidden = !(fresh > 0);
      toggle.classList.toggle('has-new', fresh > 0);
    };
    const entry = (c, isNew, posted) => {
      const li = el('li', `tk-msg${isNew ? ' is-new' : ''}${posted ? ' is-posted' : ''}`);
      const av = el('span', `tk-av${c.by === me ? ' mine' : ''}`, initialsOf(c.by));
      av.setAttribute('aria-hidden', 'true');
      const main = el('div', 'tk-main');
      const head = el('div', 'tk-head');
      head.append(el('b', '', c.by === me ? 'You' : c.by || 'Someone'), el('time', '', when(c.at)));
      // A hand-on reads as one plain line in the thread: "Mock Team handed this to Application Team", then the reason.
      if (c.handoff) { li.classList.add('is-handoff'); main.append(head, el('p', 'tk-hand', `Reassigned: ${labelOf(c.handoff.from)} \u2192 ${labelOf(c.handoff.to)}`), el('p', 'tk-text', c.text)); } else main.append(head, el('p', 'tk-text', c.text));
      li.append(av, main);
      return li;
    };
    const draw = () => {
      const all = comments();
      list.replaceChildren(...all.map((c, i) => entry(c, i >= all.length - fresh && c.by !== me)));
      if (!all.length) list.append(el('li', 'tk-empty', canWrite ? 'Progress, a question or what is needed. Everyone on the task sees it on Today.' : 'No updates yet.'));
    };
    // Read: the dot goes, here and in the menu (shared/header.js listens for "isr-tasks-read").
    const markRead = () => {
      if (pending <= 0) return;
      pending = 0; fresh = 0; label();
      api(`/api/cards/${encodeURIComponent(rowId)}/tasks/${task.id}`, { seen: true })
        .then(() => window.dispatchEvent(new Event('isr-tasks-read'))).catch(() => { /* marked next time */ });
      const row = box.closest('.td-task');
      if (row) { row.classList.remove('has-unread'); const dot = row.querySelector('.td-dot'); if (dot) dot.remove(); }
    };
    const setOpen = (open) => {
      if (open) openThreads.add(task.id); else openThreads.delete(task.id);
      toggle.setAttribute('aria-expanded', String(open));
      box.classList.toggle('is-open', open);
    };
    let input = null;
    // What is new opens by itself so it is seen, but counts as read only once the person deals with it: a click on the comments or
    // on their line, or a comment of their own. So a red dot never disappears by itself.
    toggle.addEventListener('click', () => { markRead(); const open = !box.classList.contains('is-open'); setOpen(open); if (open && input) setTimeout(() => input.focus(), 250); });
    body.addEventListener('pointerdown', markRead);
    body.addEventListener('focusin', markRead);
    const inner = el('div', 'tk-inner');
    body.append(inner);
    inner.append(list);
    if (canWrite) {
      const form = el('div', 'tk-compose');
      input = el('textarea', 'tk-input');
      input.rows = 1; input.maxLength = 2000; input.placeholder = 'Write an update';
      input.setAttribute('aria-label', 'Write an update');
      const grow = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 180) + 'px'; };
      const send = h('button', { class: 'btn btn-primary btn-sm tk-send', type: 'button', disabled: true }, 'Post');
      input.addEventListener('input', () => { grow(); send.disabled = !input.value.trim(); });
      const post = async () => {
        const text = input.value.trim();
        if (!text) return;
        send.disabled = true; input.disabled = true;
        try {
          const out = await api(`/api/cards/${encodeURIComponent(rowId)}/tasks/${task.id}`, { comment: text });
          const now = out && out.card && (out.card.tasks || []).find((t) => t.id === task.id);
          task.comments = now ? now.comments || [] : [...comments(), { by: me, at: new Date().toISOString(), text }];
          input.value = ''; grow();
          fresh = 0;
          const empty = list.querySelector('.tk-empty'); if (empty) empty.remove();
          list.append(entry(comments()[comments().length - 1], false, true));
          label();
          window.dispatchEvent(new Event('isr-tasks-read'));
        } catch (e) { if (root.NiecUI) root.NiecUI.toast(e.message, { type: 'error' }); }
        input.disabled = false; send.disabled = !input.value.trim(); input.focus();
      };
      send.addEventListener('click', post);
      // Enter adds a line; Ctrl+Enter (or Cmd+Enter) posts, as in Apple's own apps.
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); post(); } });
      const bar = el('div', 'tk-compose-bar');
      bar.append(el('small', '', 'Ctrl+Enter to post'), send);
      form.append(input, bar);
      inner.append(form);
    }
    label(); draw();
    box.markRead = markRead; // a click anywhere on the task reads it too (Today and the student card)
    box.append(toggle, body);
    setOpen(openThreads.has(task.id) || fresh > 0);
    return box;
  }

  // The way a task went: "From SK → Mock Team → Application Team", the team it is with now last.
  function taskRoute(task, { fromName, toName, teams = [] }) {
    const labelOf = (id) => (teams.find((t) => t.id === id) || { label: id === 'head' ? 'Admin' : id }).label;
    const route = el('div', 'td-route');
    route.append(el('span', 'td-from-who', fromName));
    (Array.isArray(task.route) ? task.route : []).forEach((id) => route.append(el('span', 'td-arrow', '\u2192'), el('span', 'td-was', labelOf(id))));
    route.append(el('span', 'td-arrow', '\u2192'), el('span', 'td-to-who', toName));
    return route;
  }
  // Hand a task on to another team, in the same task (the owner, 14 Nov 2026): choose the team and say why. Resolves true once done.
  function handOn(task, { rowId, teams = [] }) {
    return dialog('Reassign task', (body, close) => {
      const choices = teams.filter((t) => t.id !== task.team).map((t) => [t.id, t.label]);
      body.append(el('p', 'p-muted p-small', 'The task and its updates move to the new team. Earlier teams keep access.'));
      const team = field('Reassign to', { kind: 'select', choices });
      const why = field('Reason and next step', { kind: 'area', max: 2000, wide: true, placeholder: 'e.g. Mock passed. Please request the CAS.' });
      const msg = el('div', 'p-msg');
      const foot = el('div', 'p-dialog-foot');
      const ok = h('button', { class: 'btn btn-primary', type: 'button' }, 'Reassign');
      ok.addEventListener('click', async () => {
        if (!team.input.value) { msg.textContent = 'Choose the team.'; msg.className = 'p-msg error'; return; }
        if (!why.input.value.trim()) { msg.textContent = 'Add the reason and next step.'; msg.className = 'p-msg error'; return; }
        ok.disabled = true;
        try { await api(`/api/cards/${encodeURIComponent(rowId)}/tasks/${task.id}`, { handTo: team.input.value, reason: why.input.value.trim() }); close(true); } catch (e) { msg.textContent = e.message; msg.className = 'p-msg error'; ok.disabled = false; }
      });
      foot.append(h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'), ok);
      const g = el('div', 'p-form'); g.append(team.wrap, why.wrap);
      body.append(g, msg, foot);
    });
  }
  // A task's actions, side by side at its top right (Reassign, Remove): small, quiet buttons, never spread across the row.
  function taskActions(list) {
    const box = el('div', 'td-acts');
    list.filter(Boolean).forEach(([label, onClick, danger]) => box.append(h('button', { class: `td-act${danger ? ' danger' : ''}`, type: 'button', onclick: onClick }, label)));
    return box.childNodes.length ? box : null;
  }
  root.Portal = { taskThread, taskRoute, handOn, taskActions, el, h, api, day, when, fromToday, stageKind, stagePill, initials, number, rupees, percent, richText, field, datalist, dialog, copy, waitFor };
})(this);
