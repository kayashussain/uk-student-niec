// Today: the first screen. What needs a person's attention now, for the students this account sees, each a click away from the student's card.
(function () {
  const { el, h, api, initials, stagePill } = window.Portal;
  const view = document.getElementById('view');
  if (new URLSearchParams(location.search).get('notice') === 'admin') {
    history.replaceState(null, '', location.pathname);
    setTimeout(() => { if (window.NiecUI) window.NiecUI.toast('That page is for Admin only, so you are back on Today.', { type: 'error' }); }, 300);
  }
  const ICON = {
    inquiries: '<path d="M4 5h16v11H8l-4 4V5z"/>',
    apply: '<path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4M10 13h6M10 17h6"/>',
    mock: '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    offers: '<path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.6 7.1 18.200 8 12.700 4 8.800 9.500 8z"/>',
    cas: '<path d="M4 12l5 5L20 6"/>',
  };
  const icon = (key) => { const s = el('span', 't-ico'); s.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[key] || ''}</svg>`; return s; };
  const greeting = () => { const hr = new Date().getHours(); return hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening'; };

  function tile(label, value) { const t = el('div', 't-tile'); t.append(el('b', '', String(value)), el('span', '', label)); return t; }

  let readOnly = false;
  function section(x) {
    const c = el('section', 't-card');
    const head = el('header', 't-head');
    head.append(icon(x.key));
    const title = el('div', 't-title');
    title.append(el('h2', '', x.title), el('p', '', x.hint));
    head.append(title, el('span', `t-count${x.count ? '' : ' zero'}`, String(x.count)));
    c.append(head);
    if (!x.count) {
      const ok = el('div', 't-clear');
      ok.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.500l4.500 4.500L19 7.500"/></svg>';
      ok.append(el('span', '', 'All clear'));
      c.append(ok);
      return c;
    }
    const list = el('div', 't-list');
    x.students.forEach((s) => {
      const row = h('a', { class: 't-row', href: '/student?id=' + encodeURIComponent(s.id), title: 'Open the student card' });
      row.append(el('span', 't-av', initials(s.name)));
      const mid = el('span', 't-mid');
      mid.append(el('b', '', s.name), el('small', '', `${s.detail} · ${s.intake}`));
      row.append(mid, stagePill(s.stage));
      list.append(row);
    });
    c.append(list);
    const foot = el('footer', 't-foot');
    if (x.count > x.students.length) foot.append(el('span', '', `and ${x.count - x.students.length} more`));
    if (x.stage && !readOnly) foot.append(h('a', { class: 'btn btn-sm', href: '/bulk?stage=' + encodeURIComponent(x.stage) }, 'Follow up these'));
    if (foot.childNodes.length) c.append(foot);
    return c;
  }

  api('/api/today').then((d) => {
    document.title = 'Today · Fly';
    readOnly = Boolean(d.readOnly);
    const page = el('div');
    const head = el('div', 't-hello');
    const first = String(d.name || '').split(/\s+/)[0] || '';
    head.append(el('h1', '', `${greeting()}${first ? ', ' + first : ''}`), el('p', '', new Date(d.today + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + '. Here is what needs you today.'));
    const actions = el('div', 't-actions');
    actions.append(h('a', { class: 'btn btn-primary', href: '/students' }, 'Open Student Details'));
    if (!d.readOnly) actions.append(h('a', { class: 'btn', href: '/bulk-add' }, 'Add many students'), h('a', { class: 'btn', href: '/bulk' }, 'Bulk follow-up'));
    head.append(actions);
    const tiles = el('div', 't-tiles');
    tiles.append(tile('Students in progress', d.totals.active), tile('Applications submitted', d.totals.applied), tile('Visas issued', d.totals.visas));
    const grid = el('div', 't-grid');
    d.sections.forEach((x) => grid.append(section(x)));
    page.append(head, tiles, grid);
    view.replaceChildren(page);
  }).catch((e) => view.replaceChildren(el('div', 'p-card', e.message)));
})();
