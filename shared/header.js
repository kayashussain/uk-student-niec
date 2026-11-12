// The side menu every page shares: the Recruitment 360 mark and the name of the consultancy using it, navigation between the pages, and the account
// menu with Log out. A page puts <header class="niec-header" data-page="..."></header> at the top (page
// is dashboard, sheet, b2b, templates, incentive, users, activity or direct), loads header.css and this file (after
// session.js), and the header fills itself in.
//
// Navigation depends on the account: Admin sees every page (Users and Activity in the account menu), the Manager the Dashboard, Student Details and
// Fact File, and the teams Student Details and Fact File.
(function () {
  const header = document.querySelector('.niec-header');
  if (!header) return;
  const page = header.dataset.page;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  header.innerHTML = `
    <a class="niec-brand" href="/today" title="Home" id="niecHome">
      <svg class="niec-logo-full" role="img" aria-label="Recruitment 360" viewBox="0 0 249 80"><defs><linearGradient id="r3g" gradientUnits="userSpaceOnUse" x1="14" y1="70" x2="70" y2="14"><stop offset="0" stop-color="#2f6bff"/><stop offset="1" stop-color="#8a4dff"/></linearGradient><linearGradient id="r3t" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#2f6bff"/><stop offset="1" stop-color="#8a4dff"/></linearGradient></defs><path d="M40.91 16.02 A26 26 0 0 0 21.62 23.62" fill="none" stroke="url(#r3g)" stroke-width="4" stroke-linecap="round" stroke-dasharray="0.01 7.3" opacity="1.00"/><path d="M21.62 23.62 A26 26 0 0 0 14.02 42.91" fill="none" stroke="url(#r3g)" stroke-width="4" stroke-linecap="round" stroke-dasharray="0.01 7.3" opacity="0.84"/><path d="M14.02 42.91 A26 26 0 0 0 22.94 61.62" fill="none" stroke="url(#r3g)" stroke-width="4" stroke-linecap="round" stroke-dasharray="0.01 7.3" opacity="0.67"/><path d="M22.94 61.62 A26 26 0 0 0 42.72 67.86" fill="none" stroke="url(#r3g)" stroke-width="4" stroke-linecap="round" stroke-dasharray="0.01 7.3" opacity="0.51"/><path d="M42.72 67.86 A26 26 0 0 0 60.76 57.65" fill="none" stroke="url(#r3g)" stroke-width="4" stroke-linecap="round" stroke-dasharray="0.01 7.3" opacity="0.34"/><path d="M60.76 57.65 A26 26 0 0 0 65.61 37.49" fill="none" stroke="url(#r3g)" stroke-width="4" stroke-linecap="round" stroke-dasharray="0.01 7.3" opacity="0.18"/><g transform="translate(63 20) rotate(-26) scale(0.62)"><path d="M26 -2L-18 -14L-6 2z" fill="url(#r3g)"/><path d="M26 -2L-6 2L-12 14z" fill="url(#r3g)" opacity=".62"/></g><path d="M91.4091796875 37.0H95.3193359375V30.3857421875H98.7470703125C98.759765625 30.3857421875 98.7724609375 30.3857421875 98.78515625 30.3857421875L102.13671875 37.0H106.326171875L102.5302734375 29.6494140625C104.650390625 28.671875 105.9072265625 26.79296875 105.9072265625 24.2919921875C105.9072265625 20.4833984375 103.2412109375 18.083984375 98.9755859375 18.083984375H91.4091796875ZM95.3193359375 27.25V21.333984375H98.734375C100.8037109375 21.333984375 102.0859375 22.4892578125 102.0859375 24.2919921875C102.0859375 26.0947265625 100.8037109375 27.25 98.7470703125 27.25Z M114.549609375 37.3046875C117.799609375 37.3046875 120.389453125 35.451171875 120.8845703125 32.78515625H117.46953125C117.1267578125 33.826171875 116.123828125 34.4990234375 114.6638671875 34.4990234375C112.69609375 34.4990234375 111.553515625 33.216796875 111.4900390625 31.236328125H121.02421875V30.2333984375C121.02421875 26.1455078125 118.3708984375 23.2890625 114.42265625 23.2890625C110.5759765625 23.2890625 107.846484375 26.2216796875 107.846484375 30.3095703125C107.846484375 34.384765625 110.487109375 37.3046875 114.549609375 37.3046875ZM111.5154296875 28.849609375C111.7185546875 27.173828125 112.823046875 26.1328125 114.498828125 26.1328125C116.1873046875 26.1328125 117.3044921875 27.173828125 117.494921875 28.849609375Z M129.374609375 37.3046875C132.9419921875 37.3046875 135.5064453125 35.0576171875 135.671484375 31.9599609375H132.0279296875C131.78671875 33.369140625 130.9361328125 34.283203125 129.425390625 34.283203125C127.546484375 34.283203125 126.4166015625 32.7470703125 126.4166015625 30.3095703125C126.4166015625 27.859375 127.5337890625 26.310546875 129.425390625 26.310546875C130.9234375 26.310546875 131.862890625 27.2373046875 132.0533203125 28.6083984375H135.671484375C135.4302734375 25.4853515625 132.90390625 23.2890625 129.374609375 23.2890625C125.3501953125 23.2890625 122.64609375 26.158203125 122.64609375 30.3095703125C122.64609375 34.4609375 125.3375 37.3046875 129.374609375 37.3046875Z M137.8646484375 37.0H141.609765625V29.73828125C141.609765625 27.7197265625 142.7396484375 26.6533203125 144.27578125 26.6533203125C144.910546875 26.6533203125 145.6087890625 26.7041015625 145.8880859375 26.716796875V23.5302734375C145.5833984375 23.517578125 145.215234375 23.5048828125 144.78359375 23.5048828125C143.0189453125 23.5048828125 142.0033203125 24.2666015625 141.508203125 25.87890625H141.4701171875V23.59375H137.8646484375Z M152.47382812499998 37.279296875C154.40351562499998 37.279296875 155.76191406249998 36.416015625 156.66328124999998 34.892578125V37.0H160.33222656249998V23.59375H156.59980468749998V31.0458984375C156.59980468749998 33.1279296875 155.52070312499998 34.0546875 153.97187499999998 34.0546875C152.41035156249998 34.0546875 151.50898437499998 33.1025390625 151.50898437499998 31.2998046875V23.59375H147.76386718749998V31.9853515625C147.76386718749998 35.375 149.61738281249998 37.279296875 152.47382812499998 37.279296875Z M163.18554687499997 37.0H166.93066406249997V23.59375H163.18554687499997ZM165.05175781249997 21.9052734375C166.28320312499997 21.9052734375 167.18457031249997 21.0546875 167.18457031249997 19.912109375C167.18457031249997 18.76953125 166.28320312499997 17.9189453125 165.05175781249997 17.9189453125C163.82031249999997 17.9189453125 162.91894531249997 18.76953125 162.91894531249997 19.912109375C162.91894531249997 21.0546875 163.82031249999997 21.9052734375 165.05175781249997 21.9052734375Z M177.47734374999996 23.59375H174.73515624999996V19.9375H170.99003906249996V23.59375H168.67949218749996V26.5263671875H170.99003906249996V33.4453125C170.99003906249996 35.8828125 172.34843749999996 37.0 175.29374999999996 37.0H177.47734374999996V34.0673828125H176.04277343749996C175.02714843749996 34.0673828125 174.73515624999996 33.775390625 174.73515624999996 32.861328125V26.5263671875H177.47734374999996Z M179.55624999999995 37.0H183.30136718749995V29.0908203125C183.30136718749995 27.3642578125 184.36777343749995 26.3994140625 185.70078124999995 26.3994140625C187.00839843749995 26.3994140625 187.92246093749995 27.30078125 187.92246093749995 28.697265625V37.0H191.52792968749995V28.92578125C191.52792968749995 27.427734375 192.42929687499995 26.3994140625 193.87656249999995 26.3994140625C195.15878906249995 26.3994140625 196.14902343749995 27.1865234375 196.14902343749995 28.798828125V37.0H199.88144531249995V28.11328125C199.88144531249995 25.041015625 197.96445312499995 23.314453125 195.38730468749995 23.314453125C193.44492187499995 23.314453125 191.79453124999995 24.2919921875 191.09628906249995 25.9296875C190.53769531249995 24.2919921875 189.02695312499995 23.314453125 187.22421874999995 23.314453125C185.52304687499995 23.314453125 183.96152343749995 24.1904296875 183.16171874999995 26.005859375V23.59375H179.55624999999995Z M208.85390624999994 37.3046875C212.10390624999994 37.3046875 214.69374999999994 35.451171875 215.18886718749994 32.78515625H211.77382812499994C211.43105468749994 33.826171875 210.42812499999994 34.4990234375 208.96816406249994 34.4990234375C207.00039062499994 34.4990234375 205.85781249999994 33.216796875 205.79433593749994 31.236328125H215.32851562499994V30.2333984375C215.32851562499994 26.1455078125 212.67519531249994 23.2890625 208.72695312499994 23.2890625C204.88027343749994 23.2890625 202.15078124999994 26.2216796875 202.15078124999994 30.3095703125C202.15078124999994 34.384765625 204.79140624999994 37.3046875 208.85390624999994 37.3046875ZM205.81972656249994 28.849609375C206.02285156249994 27.173828125 207.12734374999994 26.1328125 208.80312499999994 26.1328125C210.49160156249994 26.1328125 211.60878906249994 27.173828125 211.79921874999994 28.849609375Z M221.27949218749993 29.5478515625C221.27949218749993 27.4658203125 222.35859374999993 26.5390625 223.90742187499993 26.5390625C225.46894531249993 26.5390625 226.37031249999993 27.4912109375 226.37031249999993 29.2939453125V37.0H230.10273437499993V28.6083984375C230.10273437499993 25.21875 228.26191406249993 23.314453125 225.40546874999993 23.314453125C223.47578124999993 23.314453125 222.11738281249993 24.177734375 221.21601562499993 25.701171875V23.59375H217.53437499999993V37.0H221.27949218749993Z M240.66210937499991 23.59375H237.91992187499991V19.9375H234.17480468749991V23.59375H231.86425781249991V26.5263671875H234.17480468749991V33.4453125C234.17480468749991 35.8828125 235.53320312499991 37.0 238.47851562499991 37.0H240.66210937499991V34.0673828125H239.22753906249991C238.21191406249991 34.0673828125 237.91992187499991 33.775390625 237.91992187499991 32.861328125V26.5263671875H240.66210937499991Z" fill="#1a2230" stroke="#1a2230" stroke-width="0.5" stroke-linejoin="round"/><path d="M98.099609375 66.3046875C102.33984375 66.3046875 105.310546875 63.943359375 105.310546875 60.66796875C105.310546875 58.4208984375 103.76171875 56.529296875 101.12109375 56.1865234375V56.1484375C103.25390625 55.7041015625 104.7265625 54.193359375 104.7265625 52.060546875C104.7265625 48.9755859375 101.93359375 46.779296875 98.0615234375 46.779296875C93.9228515625 46.779296875 91.2822265625 49.3056640625 91.2822265625 52.7587890625H94.9638671875C94.9638671875 50.9306640625 96.1953125 49.7626953125 98.0615234375 49.7626953125C99.8642578125 49.7626953125 101.095703125 50.8291015625 101.095703125 52.4541015625C101.095703125 53.9775390625 99.7880859375 54.9296875 97.744140625 54.9296875H96.0556640625V57.7861328125H97.744140625C99.978515625 57.7861328125 101.4638671875 58.83984375 101.4638671875 60.4521484375C101.4638671875 62.140625 100.080078125 63.2578125 98.0615234375 63.2578125C95.916015625 63.2578125 94.6337890625 61.9501953125 94.6337890625 59.75390625H90.9013671875C90.9013671875 63.359375 93.3896484375 66.3046875 98.099609375 66.3046875Z M115.5623046875 66.3046875C119.662890625 66.3046875 122.557421875 63.6640625 122.557421875 59.8046875C122.557421875 56.1611328125 119.89140625 53.482421875 116.23515625 53.482421875C114.280078125 53.482421875 112.6677734375 54.2568359375 111.7283203125 55.7041015625H111.7029296875C111.7029296875 52.1748046875 112.9724609375 49.80078125 115.6765625 49.80078125C117.3396484375 49.80078125 118.41875 50.740234375 118.698046875 52.2255859375H122.354296875C122.0115234375 49.1025390625 119.48515625 46.779296875 115.7146484375 46.779296875C110.75078125 46.779296875 108.11015625 50.791015625 108.11015625 57.0244140625C108.11015625 62.90234375 110.85234375 66.3046875 115.5623046875 66.3046875ZM115.5369140625 63.232421875C113.6833984375 63.232421875 112.248828125 61.7470703125 112.248828125 59.8173828125C112.248828125 57.900390625 113.69609375 56.4150390625 115.575 56.4150390625C117.4412109375 56.4150390625 118.850390625 57.875 118.850390625 59.8046875C118.850390625 61.7470703125 117.4158203125 63.232421875 115.5369140625 63.232421875Z M133.0123046875 66.3046875C137.773046875 66.3046875 140.667578125 62.5595703125 140.667578125 56.5546875C140.667578125 50.5244140625 137.773046875 46.779296875 133.0123046875 46.779296875C128.2515625 46.779296875 125.35703125 50.537109375 125.35703125 56.5546875C125.35703125 62.5595703125 128.2515625 66.3046875 133.0123046875 66.3046875ZM133.0123046875 63.181640625C130.5494140625 63.181640625 129.038671875 60.66796875 129.038671875 56.5546875C129.038671875 52.4287109375 130.5494140625 49.90234375 133.0123046875 49.90234375C135.4751953125 49.90234375 136.9859375 52.4287109375 136.9859375 56.5546875C136.9859375 60.66796875 135.4751953125 63.181640625 133.0123046875 63.181640625Z" fill="url(#r3t)" stroke="url(#r3t)" stroke-width="0.5" stroke-linejoin="round"/></svg>
      <span class="niec-mark" aria-hidden="true"><svg aria-hidden="true" viewBox="0 0 80 80"><defs><linearGradient id="r3b" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#2f6bff"/><stop offset="1" stop-color="#8a4dff"/></linearGradient></defs><rect width="80" height="80" rx="20" fill="url(#r3b)"/><g transform="translate(40 40) scale(.78) translate(-41 -40)"><path d="M40.91 16.02 A26 26 0 0 0 21.62 23.62" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-dasharray="0.01 7.3" opacity="1.00"/><path d="M21.62 23.62 A26 26 0 0 0 14.02 42.91" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-dasharray="0.01 7.3" opacity="0.84"/><path d="M14.02 42.91 A26 26 0 0 0 22.94 61.62" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-dasharray="0.01 7.3" opacity="0.67"/><path d="M22.94 61.62 A26 26 0 0 0 42.72 67.86" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-dasharray="0.01 7.3" opacity="0.51"/><path d="M42.72 67.86 A26 26 0 0 0 60.76 57.65" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-dasharray="0.01 7.3" opacity="0.34"/><path d="M60.76 57.65 A26 26 0 0 0 65.61 37.49" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-dasharray="0.01 7.3" opacity="0.18"/><g transform="translate(63 20) rotate(-26) scale(0.62)"><path d="M26 -2L-18 -14L-6 2z" fill="#fff"/><path d="M26 -2L-6 2L-12 14z" fill="#fff" opacity=".62"/></g></g></svg></span></span>
    </a>
    <nav class="niec-nav" aria-label="Pages"></nav>
    <div class="niec-account"></div>`;


  // ---- Quick search (Ctrl+K, or the Search button): jump to a page or a student from anywhere, with the keyboard ----
  function palette(links) {
    const back = document.createElement('div');
    back.className = 'fly-pal-back';
    back.innerHTML = '<div class="fly-pal" role="dialog" aria-label="Quick search"><input class="fly-pal-input" type="search" placeholder="Search a student or go to a page" autocomplete="off" aria-label="Quick search"><div class="fly-pal-list" role="listbox"></div><div class="fly-pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> choose</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span></div></div>';
    document.body.append(back);
    const input = back.querySelector('input');
    const list = back.querySelector('.fly-pal-list');
    let items = [];
    let at = 0;
    let timer;
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey, true); };
    const go = (it) => { if (!it) return; close(); if (it.card && window.CardDrawer) window.CardDrawer.open(it.card); else location.href = it.href; };
    const draw = () => {
      list.innerHTML = items.length ? items.map((it, i) => `<button type="button" class="fly-pal-item${i === at ? ' on' : ''}" role="option" data-i="${i}"><span class="fly-pal-kind">${esc(it.kind)}</span><span class="fly-pal-main"><b>${esc(it.title)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span></button>`).join('') : '<div class="fly-pal-empty">Nothing found</div>';
      const on = list.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' });
    };
    const run = async () => {
      const q = input.value.trim().toLowerCase();
      const pages = links.filter(([, , label]) => !q || label.toLowerCase().includes(q)).map(([, href, label]) => ({ kind: 'Page', title: label, href }));
      let people = [];
      if (q.length >= 2) {
        try { const r = await (await fetch('/api/students/search?q=' + encodeURIComponent(q), { cache: 'no-store' })).json(); people = (r.students || []).slice(0, 8).map((s) => ({ kind: 'Student', title: s.name, sub: [s.stage, s.intake, s.university].filter(Boolean).join(' · '), card: s.id, href: '/student?id=' + encodeURIComponent(s.id) })); } catch (e) { /* only the pages are shown */ }
      }
      items = [...people, ...pages].slice(0, 12); at = 0; draw();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); at = Math.min(items.length - 1, at + 1); draw(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); at = Math.max(0, at - 1); draw(); }
      else if (e.key === 'Enter') { e.preventDefault(); go(items[at]); }
    };
    document.addEventListener('keydown', onKey, true);
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    list.addEventListener('click', (e) => { const b = e.target.closest('.fly-pal-item'); if (b) go(items[Number(b.dataset.i)]); });
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 140); });
    run(); input.focus();
  }
  let paletteLinks = [];
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (!document.querySelector('.fly-pal-back') && paletteLinks.length) palette(paletteLinks); }
  });

  // The menu is folded or open as the person left it.
  try { if (localStorage.getItem('niecNav') === 'folded') document.documentElement.setAttribute('data-nav', 'folded'); } catch (e) { /* open */ }
  const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const ICONS = {
    today: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"/>'),
    dashboard: svg('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
    sheet: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>'),
    direct: svg('<path d="M3 9l9-5 9 5-9 5-9-5z"/><path d="M7 11.5V16c0 1.4 2.2 3 5 3s5-1.6 5-3v-4.5"/>'),
    b2b: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
    agents: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-3.5 3.2-5.5 6.5-5.5s6 2 6.5 5.5"/><path d="M16 5a3.5 3.5 0 0 1 0 7M18.5 15c1.8.8 3 2.4 3.3 5"/>'),
    bulk: svg('<path d="M4 5h16v11H8l-4 4V5z"/><path d="M8 9h8M8 12h5"/>'),
    bulkadd: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-3.5 3.2-5.5 6.5-5.5 1.4 0 2.6.3 3.6.9"/><path d="M18 13v6M15 16h6"/>'),
    users: svg('<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.6-3.8 3.4-6 7-6s6.4 2.2 7 6"/>'),
    activity: svg('<path d="M3 12h4l3-8 4 16 3-8h4"/>'),
    templates: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 8l9 6 9-6"/>'),
    incentive: svg('<path d="M12 3v18M16.5 7.5C15.8 6.4 14.2 6 12.5 6 10.3 6 8.5 7 8.5 8.8c0 4 8 2 8 6.2 0 1.8-1.9 3-4.2 3-2 0-3.7-.6-4.5-1.8"/>'),
    events: svg('<path d="M4 14V8l12-4v14L4 14z"/><path d="M16 8a3 3 0 0 1 0 6M7 14v4a2 2 0 0 0 4 0v-3"/>'),
    factfile: svg('<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5z"/><path d="M4 19a2 2 0 0 1 2-2h13"/>'),
  };
  const LINKS = {
    admin: [['today', '/today', 'Today'], ['dashboard', '/dashboard', 'Dashboard'], ['sheet', '/students', 'Student Details'],
      ['direct', '/partner-universities', 'Partner Universities'], ['events', '/events', 'Events and marketing'], ['b2b', '/b2b-partners', 'B2B Partners'], ['agents', '/agents', 'Agents'], ['factfile', '/fact-file', 'Fact File']],
    manager: [['today', '/today', 'Today'], ['dashboard', '/dashboard', 'Dashboard'], ['sheet', '/students', 'Student Details'], ['events', '/events', 'Events and marketing'], ['factfile', '/fact-file', 'Fact File']],
    staff: [['today', '/today', 'Today'], ['sheet', '/students', 'Student Details'], ['factfile', '/fact-file', 'Fact File']],
    followup: [['today', '/today', 'Today'], ['sheet', '/students', 'Student Details'], ['bulk', '/bulk', 'Bulk follow-up'], ['factfile', '/fact-file', 'Fact File']],
    branch: [['today', '/today', 'Today'], ['sheet', '/students', 'Student Details'], ['bulkadd', '/bulk-add', 'Add many students'], ['bulk', '/bulk', 'Bulk follow-up'], ['factfile', '/fact-file', 'Fact File']],
  };
  // The menu of an account: Admin and Manager have their own; a team gets the pages its work needs (a branch adds students, the Follow-up Team follows up).
  const kindOf = (me) => {
    const deps = me.departments || [];
    if (me.role === 'admin' || me.role === 'manager') return me.role === 'manager' && deps.length ? (deps.some((d) => !['application', 'mock', 'followup'].includes(d)) ? 'branch' : 'staff') : me.role;
    if (deps.some((d) => !['application', 'mock', 'followup'].includes(d))) return 'branch';
    return deps.includes('followup') ? 'followup' : 'staff';
  };

  // Admin's own pages (people and the record of what happened) are in the account menu, not in the top menu.
  const MENU_LINKS = {
    admin: [['users', '/users', 'Users'], ['activity', '/activity', 'Activity'], ['templates', '/message-templates', 'Message templates'], ['incentive', '/incentive/', 'Incentive']],
  };

  function render(me) {
    const links = LINKS[kindOf(me)] || [];
    paletteLinks = [...links, ...(MENU_LINKS[me.role] || [])];
    header.querySelector('.niec-nav').innerHTML = links
      .map(([id, href, label]) => `<a href="${href}" title="${label}"${id === page ? ' aria-current="page"' : ''}><span class="niec-ico" aria-hidden="true">${ICONS[id] || ''}</span><span class="niec-lbl">${label}</span></a>`).join('')
      // Admin's own pages are in the menu too, under their own heading (Users, Activity, Message templates, Incentive).
      + ((MENU_LINKS[me.role] || []).length ? `<div class="niec-sep" role="presentation"><span>Admin only</span></div>` + (MENU_LINKS[me.role] || []).map(([id, href, label]) => `<a href="${href}" title="${label}"${id === page ? ' aria-current="page"' : ''}><span class="niec-ico" aria-hidden="true">${ICONS[id] || ''}</span><span class="niec-lbl">${label}</span></a>`).join('') : '')
      + '<button type="button" class="niec-fold" aria-label="Fold or open the menu" title="Fold or open the menu"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg><span>Fold the menu</span></button>';
    const fold = header.querySelector('.niec-fold');
    fold.addEventListener('click', () => {
      const folded = document.documentElement.getAttribute('data-nav') !== 'folded';
      document.documentElement.setAttribute('data-nav', folded ? 'folded' : 'open');
      try { localStorage.setItem('niecNav', folded ? 'folded' : 'open'); } catch (e) { /* the menu simply opens as usual next time */ }
    });
    // On a phone the menu may not fit: its right edge fades until it is scrolled to the end, as a hint to swipe.
    const nav = header.querySelector('.niec-nav');
    const edge = () => nav.classList.toggle('at-end', nav.scrollLeft + nav.clientWidth >= nav.scrollWidth - 2);
    nav.addEventListener('scroll', edge, { passive: true });
    window.addEventListener('resize', edge);
    edge();
    // The current page is scrolled into view in a menu that doesn't fit.
    const here = nav.querySelector('[aria-current="page"]');
    if (here) nav.scrollLeft = Math.max(0, here.getBoundingClientRect().left - nav.getBoundingClientRect().left + nav.scrollLeft - (nav.clientWidth - here.offsetWidth) / 2);
    // The logo goes home: the dashboard for the Manager, Student Details for everyone else.
    header.querySelector('#niecHome').setAttribute('href', '/today');
    const initials = String(me.name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    const account = header.querySelector('.niec-account');
    account.innerHTML = `
      <button type="button" class="niec-account-btn" aria-haspopup="menu" aria-expanded="false" aria-label="Account menu for ${esc(me.name)}">
        <span class="niec-avatar" aria-hidden="true">${esc(initials)}</span>
        <span class="niec-account-text"><span class="niec-account-name">${esc(me.name)}</span><span class="niec-account-role">${esc(me.roleLabel)}</span></span>
        <span class="niec-caret" aria-hidden="true">▾</span>
      </button>
      <div class="niec-menu" role="menu" hidden>
        <div class="niec-menu-head"><b>${esc(me.name)}</b><span>${esc(me.username)} · ${esc(me.roleLabel)}</span></div>
        ${(MENU_LINKS[me.role] || []).map(([id, href, label]) => `<a role="menuitem" href="${href}"${id === page ? ' aria-current="page"' : ''}>${label}</a>`).join('')}
        <button type="button" role="menuitem" class="niec-logout">Log out</button>
      </div>`;
    const btn = account.querySelector('.niec-account-btn');
    const menu = account.querySelector('.niec-menu');
    const setOpen = (open) => { menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)); };
    btn.addEventListener('click', (e) => { e.stopPropagation(); setOpen(menu.hidden); });
    document.addEventListener('click', (e) => { if (!account.contains(e.target)) setOpen(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { setOpen(false); btn.focus(); } });
    account.querySelector('.niec-logout').addEventListener('click', () => window.NiecSession.logout());
  }

  fetch('/api/me', { cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : null))
    .then((me) => { if (me) render(me); })
    .catch(() => { /* the session helper sends a logged-out page to the login page */ });
})();
