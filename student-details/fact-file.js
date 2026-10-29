// The Fact File list: every university as a card, a search box that also finds courses ("cyber security"
// shows who teaches it), and (Admin) adding a university.
(function () {
  const $ = (id) => document.getElementById(id);
  let list = [];
  let query = '';
  let loadedOnce = false;
  let searchTimer = null;
  let searchSeq = 0; // answers arriving out of order: only the latest search is shown

  const when = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function card(u) {
    const a = el('a', 'uni-card');
    a.href = '/fact-file?u=' + encodeURIComponent(u.id);
    a.append(el('h2', '', u.name));
    if (u.city) a.append(el('div', 'city', u.city));
    if (u.matches && u.matches.length) {
      const box = el('div', 'matches');
      box.append(el('div', 'match-count', `${u.matchCount} matching course${u.matchCount === 1 ? '' : 's'}`));
      const ul = el('ul');
      u.matches.forEach((m) => ul.append(el('li', '', m)));
      box.append(ul);
      if (u.matchCount > u.matches.length) box.append(el('div', 'match-more', `and ${u.matchCount - u.matches.length} more`));
      a.append(box);
    }
    if (u.intakes.length) {
      const chips = el('div', 'chips');
      u.intakes.forEach((n) => chips.append(el('span', 'chip', n)));
      a.append(chips);
    }
    a.append(el('div', 'updated', u.updatedAt ? 'Updated ' + when(u.updatedAt) : ''));
    return a;
  }

  function skeletons() {
    $('cards').replaceChildren(...Array.from({ length: 9 }, () => {
      const c = el('div', 'uni-card skeleton');
      c.setAttribute('aria-hidden', 'true');
      c.append(el('span', 'ui-skeleton line-lg'), el('span', 'ui-skeleton line-sm'), el('span', 'ui-skeleton line-chip'));
      return c;
    }));
  }

  function render() {
    const box = $('cards');
    $('count').textContent = loadedOnce && list.length ? (query ? `${list.length} of the universities match` : `${list.length} universities`) : '';
    if (!list.length) {
      const empty = el('div', 'ui-empty');
      empty.append(el('span', 'ui-empty-icon', query ? '🔍' : '🎓'), el('strong', '', query ? 'No university matches' : 'No universities yet'),
        el('span', '', query ? 'Try a university name, a city or a course such as "data science".' : 'Admin can add the first one above.'));
      box.replaceChildren(empty);
      return;
    }
    box.replaceChildren(...list.map(card));
  }

  async function load() {
    const seq = ++searchSeq;
    try {
      const res = await fetch('/api/facts' + (query ? '?q=' + encodeURIComponent(query) : ''), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (seq !== searchSeq) return;
      list = data;
      loadedOnce = true;
      $('msg').textContent = '';
      render();
    } catch (e) {
      if (seq !== searchSeq) return;
      $('msg').textContent = 'Could not load the Fact File. Please reload the page.';
      $('msg').className = 'msg error';
      if (!loadedOnce) $('cards').replaceChildren();
    }
  }

  $('search').addEventListener('input', () => {
    clearTimeout(searchTimer);
    query = $('search').value.trim().slice(0, 100);
    searchTimer = setTimeout(load, 180);
  });
  // "/" jumps to the search box, like on most sites.
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
      e.preventDefault();
      $('search').focus();
    }
  });
  $('addForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('msg').className = 'msg';
    $('msg').textContent = '';
    const res = await fetch('/api/facts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: $('addName').value }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { $('msg').textContent = json.error || 'Could not add it.'; $('msg').className = 'msg error'; return; }
    location.href = '/fact-file?u=' + json.id + '&edit=1'; // straight to its page, ready to fill in
  });

  fetch('/api/me', { cache: 'no-store' }).then((r) => r.json()).then((me) => { $('addForm').hidden = me.role !== 'admin'; }).catch(() => {});
  skeletons();
  load();
})();
