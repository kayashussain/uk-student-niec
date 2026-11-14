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
      if (!choices.some((c) => (Array.isArray(c) ? c[0] : c) === '')) input.append(h('option', { value: '' }, '')); // a blank choice only when the list has none of its own
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

  // The conversation on a task (the owner, 14 Nov 2026): the team writes how it went, what it needs (a student's email, a document)
  // or what is in the way, with or without ticking the task, and whoever gave the task answers. Shown on Today and on the student
  // card; a reply from the other side opens the thread by itself. `me` is the reader's name; `rowId` the student's card.
  const openThreads = new Set();
  function taskThread(task, { rowId, me, canWrite }) {
    const box = el('div', 'tk-thread');
    const list = el('ol', 'tk-list');
    const comments = () => (Array.isArray(task.comments) ? task.comments : []);
    const last = () => comments()[comments().length - 1];
    const fromOther = () => Boolean(last() && last().by !== me);
    const toggle = h('button', { class: 'tk-toggle', type: 'button', 'aria-expanded': 'false' });
    const body = el('div', 'tk-body');
    const label = () => {
      const n = comments().length;
      toggle.replaceChildren();
      const ico = el('span', 'tk-ico'); ico.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4V5z"/></svg>';
      toggle.append(ico, el('span', '', n ? `${n} comment${n === 1 ? '' : 's'}` : (canWrite ? 'Comment' : 'No comments')));
      if (n && fromOther() && !task.done) { toggle.append(el('span', 'tk-new', `Reply from ${String(last().by).split(/\s+/)[0] || 'the team'}`)); }
      toggle.classList.toggle('has-new', Boolean(n && fromOther() && !task.done));
    };
    const bubble = (c, fresh) => {
      const li = el('li', `tk-msg${c.by === me ? ' mine' : ''}${fresh ? ' is-new' : ''}`);
      li.append(el('div', 'tk-bubble', c.text), el('small', '', `${c.by === me ? 'You' : c.by || 'Someone'} \u00b7 ${when(c.at)}`));
      return li;
    };
    const draw = () => { list.replaceChildren(...comments().map((c) => bubble(c))); if (!comments().length) list.append(el('li', 'tk-empty', canWrite ? 'Ask for what you need, or say how it went.' : 'No comments yet.')); };
    const setOpen = (open) => {
      if (open) openThreads.add(task.id); else openThreads.delete(task.id);
      toggle.setAttribute('aria-expanded', String(open));
      box.classList.toggle('is-open', open);
    };
    toggle.addEventListener('click', () => { setOpen(!box.classList.contains('is-open')); if (box.classList.contains('is-open') && input) input.focus(); });
    let input = null;
    const inner = el('div', 'tk-inner');
    body.append(inner);
    inner.append(list);
    if (canWrite) {
      const form = el('div', 'tk-compose');
      input = el('textarea', 'tk-input');
      input.rows = 1; input.maxLength = 2000; input.placeholder = 'Write a comment';
      input.setAttribute('aria-label', 'Write a comment');
      const grow = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 160) + 'px'; };
      input.addEventListener('input', () => { grow(); send.disabled = !input.value.trim(); });
      const send = h('button', { class: 'tk-send', type: 'button', 'aria-label': 'Send the comment', title: 'Send (Enter)', disabled: true });
      send.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5.5 11.5L12 5l6.5 6.5"/></svg>';
      const post = async () => {
        const text = input.value.trim();
        if (!text) return;
        send.disabled = true; input.disabled = true;
        try {
          const out = await api(`/api/cards/${encodeURIComponent(rowId)}/tasks/${task.id}`, { comment: text });
          const fresh = out && out.card && (out.card.tasks || []).find((t) => t.id === task.id);
          task.comments = fresh ? fresh.comments || [] : [...comments(), { by: me, at: new Date().toISOString(), text }];
          input.value = ''; grow();
          const empty = list.querySelector('.tk-empty'); if (empty) empty.remove();
          list.append(bubble(last(), true));
          label();
        } catch (e) { if (root.NiecUI) root.NiecUI.toast(e.message, { type: 'error' }); }
        input.disabled = false; send.disabled = !input.value.trim(); input.focus();
      };
      send.addEventListener('click', post);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); post(); } });
      form.append(input, send);
      inner.append(form);
    }
    label(); draw();
    box.append(toggle, body);
    setOpen(openThreads.has(task.id) || (fromOther() && !task.done));
    return box;
  }

  root.Portal = { taskThread, el, h, api, day, when, fromToday, stageKind, stagePill, initials, number, rupees, percent, richText, field, datalist, dialog, copy, waitFor };
})(this);
