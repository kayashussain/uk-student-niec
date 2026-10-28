// The Fact File list: every university as a card, a search box, and (Admin) adding a university.
(function () {
  const $ = (id) => document.getElementById(id);
  let list = [];

  const when = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  function card(u) {
    const a = document.createElement('a');
    a.className = 'uni-card';
    a.href = '/fact-file?u=' + encodeURIComponent(u.id);
    const h = document.createElement('h2');
    h.textContent = u.name;
    a.append(h);
    if (u.city) { const c = document.createElement('div'); c.className = 'city'; c.textContent = u.city; a.append(c); }
    if (u.intakes.length) {
      const chips = document.createElement('div');
      chips.className = 'chips';
      u.intakes.forEach((n) => { const s = document.createElement('span'); s.className = 'chip'; s.textContent = n; chips.append(s); });
      a.append(chips);
    }
    const up = document.createElement('div');
    up.className = 'updated';
    up.textContent = u.updatedAt ? 'Updated ' + when(u.updatedAt) : '';
    a.append(up);
    return a;
  }

  function render() {
    const q = $('search').value.trim().toLowerCase();
    const shown = list.filter((u) => !q || `${u.name} ${u.city}`.toLowerCase().includes(q));
    const box = $('cards');
    box.replaceChildren(...shown.map(card));
    if (!shown.length) {
      const p = document.createElement('div');
      p.className = 'empty';
      p.textContent = list.length ? 'No university matches your search.' : 'No universities yet.';
      box.replaceChildren(p);
    }
  }

  async function load() {
    try {
      const res = await fetch('/api/facts', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      list = await res.json();
      render();
    } catch (e) {
      $('msg').textContent = 'Could not load the Fact File. Please reload the page.';
      $('msg').className = 'msg error';
    }
  }

  $('search').addEventListener('input', render);
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
  load();
})();
