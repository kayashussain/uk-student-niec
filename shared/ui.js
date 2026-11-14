// Notices and confirmation boxes for every page, in place of the browser's plain pop-ups: they match the
// site, can be used from the keyboard (Enter confirms, Escape cancels) and don't freeze the page.
// Served as /ui.js together with /ui.css; loaded as window.NiecUI.
//
//   NiecUI.toast('Saved', { type: 'success' })           a short notice that fades by itself (type: info, success, error)
//   await NiecUI.confirm('Delete this?', { danger: true })   true if they confirmed, false if they cancelled
//   await NiecUI.alert('This cannot be done yet.')       a message with one OK button
(function (root) {
  let toastBox = null;
  let openDialogs = 0;

  function toast(message, { type = 'info', duration } = {}) {
    if (!toastBox) {
      toastBox = document.createElement('div');
      toastBox.className = 'ui-toasts';
      toastBox.setAttribute('role', 'status');
      toastBox.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastBox);
    }
    const el = document.createElement('div');
    el.className = 'ui-toast ' + type;
    const text = document.createElement('div');
    text.className = 'ui-toast-text';
    text.textContent = String(message);
    const close = document.createElement('button');
    close.type = 'button';
    close.setAttribute('aria-label', 'Dismiss');
    close.textContent = '×';
    el.append(text, close);
    toastBox.appendChild(el);
    while (toastBox.children.length > 4) toastBox.firstChild.remove();
    let timer = null;
    const remove = () => {
      clearTimeout(timer);
      if (!el.isConnected || el.classList.contains('leaving')) return;
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 200);
    };
    close.addEventListener('click', remove);
    // Errors stay a little longer than good news.
    timer = setTimeout(remove, duration || (type === 'error' ? 7000 : 3500));
    return remove;
  }

  // One box: a title, a message and one or two buttons. Resolves true for the main button.
  function ask({ title, message, confirmText, cancelText, danger }) {
    if (!root.HTMLDialogElement) { // very old browser: the plain pop-up still works
      return Promise.resolve(cancelText === null ? (root.alert(message), true) : root.confirm(message));
    }
    return new Promise((resolve) => {
      const dialog = document.createElement('dialog');
      dialog.className = 'ui-dialog';
      dialog.setAttribute('aria-labelledby', 'ui-dialog-title');
      dialog.setAttribute('aria-describedby', 'ui-dialog-text');
      const form = document.createElement('form');
      form.method = 'dialog';
      const h = document.createElement('h2');
      h.id = 'ui-dialog-title';
      h.textContent = title;
      const p = document.createElement('p');
      p.id = 'ui-dialog-text';
      p.textContent = message;
      const actions = document.createElement('div');
      actions.className = 'ui-actions';
      let cancel = null;
      if (cancelText !== null) {
        cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.textContent = cancelText;
        actions.appendChild(cancel);
      }
      const ok = document.createElement('button');
      ok.type = 'submit';
      ok.className = 'ui-ok' + (danger ? ' danger' : '');
      ok.textContent = confirmText;
      actions.appendChild(ok);
      form.append(h, p, actions);
      dialog.appendChild(form);

      let answer = false;
      // Closes with a short fade and shrink, like the other pop-ups (at once for a person who prefers less motion).
      const shut = () => {
        if (dialog.classList.contains('is-closing')) return;
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { dialog.close(); return; }
        dialog.classList.add('is-closing');
        setTimeout(() => dialog.close(), 160);
      };
      form.addEventListener('submit', (e) => { e.preventDefault(); answer = true; shut(); });
      if (cancel) cancel.addEventListener('click', shut);
      dialog.addEventListener('cancel', (e) => { e.preventDefault(); shut(); });
      // Clicking the dimmed area outside the box cancels it.
      dialog.addEventListener('mousedown', (e) => { if (e.target === dialog) shut(); });
      dialog.addEventListener('close', () => {
        openDialogs -= 1;
        dialog.remove();
        resolve(answer);
      });
      document.body.appendChild(dialog);
      openDialogs += 1;
      dialog.showModal();
      // A dangerous question starts on Cancel, so a stray Enter doesn't delete anything.
      (danger && cancel ? cancel : ok).focus();
    });
  }

  const confirmBox = (message, o = {}) => ask({
    title: o.title || 'Are you sure?', message, confirmText: o.confirmText || 'OK', cancelText: o.cancelText || 'Cancel', danger: Boolean(o.danger),
  });
  const alertBox = (message, o = {}) => ask({
    title: o.title || 'Please note', message, confirmText: o.confirmText || 'OK', cancelText: null, danger: false,
  }).then(() => undefined);

  // Changes the page in one smooth step, as moving to another page does (see the page transitions in theme.css): the old picture
  // fades away and the new one glides in. `soft` is for a switch inside a page (a tab, a filter): a quick cross-fade only. Where the
  // browser cannot (or the person prefers less motion) the change is simply made at once.
  function swap(change, { soft = false } = {}) {
    const quick = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (quick || !document.startViewTransition || document.hidden) { change(); return Promise.resolve(); }
    const html = document.documentElement;
    html.classList.toggle('isr-swap-soft', soft);
    let t;
    try { t = document.startViewTransition(change); } catch (e) { change(); return Promise.resolve(); }
    t.ready.catch(() => {});
    return t.finished.catch(() => {}).then(() => { html.classList.remove('isr-swap-soft'); });
  }

  root.NiecUI = { toast, confirm: confirmBox, alert: alertBox, swap, isOpen: () => openDialogs > 0 };
})(this);

// Segmented controls (the card's tabs, the intake tabs under All Students, the Dashboard's switches): a light pill slides to the
// chosen segment, as on a Mac. It only adds a decorative <span class="seg-thumb"> inside the control; nothing else changes.
(function () {
  if (typeof document === 'undefined' || !window.MutationObserver) return;
  const BOXES = '.p-tabs, .sheet-tabs-list, .dd-switch, .tabs, .ev-pills';
  const isOn = (c) => c.getAttribute('aria-selected') === 'true' || c.classList.contains('active') || c.classList.contains('on');
  function sync(box, animate) {
    let thumb = box.querySelector(':scope > .seg-thumb');
    const on = [...box.children].find((c) => c !== thumb && isOn(c));
    if (!on || !on.offsetWidth) { if (thumb) thumb.style.opacity = '0'; return; }
    if (!thumb) {
      thumb = document.createElement('span');
      thumb.className = 'seg-thumb';
      thumb.setAttribute('aria-hidden', 'true');
      box.prepend(thumb);
      box.classList.add('has-thumb');
      animate = false;
    }
    thumb.style.transition = animate ? '' : 'none';
    thumb.style.opacity = '1';
    thumb.style.width = on.offsetWidth + 'px';
    thumb.style.height = on.offsetHeight + 'px';
    thumb.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
    if (!animate) requestAnimationFrame(() => { thumb.style.transition = ''; });
  }
  const all = (animate) => document.querySelectorAll(BOXES).forEach((b) => sync(b, animate));
  let queued = false;
  const later = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; all(true); }); };
  new MutationObserver((list) => { if (list.some((m) => !(m.target.classList && m.target.classList.contains('seg-thumb')))) later(); })
    .observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'aria-selected'] });
  window.addEventListener('resize', () => all(false));
  document.addEventListener('DOMContentLoaded', () => all(false));
})();

// Big figures count up from zero the first time they appear (the Dashboard, the team dashboards, Events and marketing, the partner
// pages), as Apple's own pages do: about 0.7s, fast at first and settling gently. The number written in the page is never changed:
// it is only shown rising to it. Nothing moves for a person who asks their computer for less motion.
(function () {
  if (typeof document === 'undefined' || !window.MutationObserver || !window.requestAnimationFrame) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const FIGURES = '.ov-kpi-value, .md-kpi > b, .ev-band b, .pu-num, .bp-num';
  const seen = new WeakSet();
  function rise(el) {
    if (seen.has(el) || el.children.length) return;
    seen.add(el);
    const m = /^(\D*?)(\d[\d,]*)(\D*)$/.exec(el.textContent.trim());
    if (!m) return;
    const target = Number(m[2].replace(/,/g, ''));
    if (!(target >= 2) || target > 1e12) return;
    const grouping = !m[2].includes(',') ? null : /\d,\d\d,\d{3}/.test(m[2]) ? 'en-IN' : 'en-US';
    const shown = (n) => m[1] + (grouping ? n.toLocaleString(grouping) : String(n)) + m[3];
    const final = el.textContent;
    let last = shown(0);
    el.textContent = last;
    const start = performance.now();
    const step = (now) => {
      if (el.textContent !== last) return; // the page wrote something new: leave it
      const k = Math.min(1, (now - start) / 700);
      last = k < 1 ? shown(Math.round(target * (1 - Math.pow(1 - k, 3)))) : final;
      el.textContent = last;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  const scan = (node) => {
    if (!node || node.nodeType !== 1) return;
    if (node.matches(FIGURES)) rise(node);
    node.querySelectorAll(FIGURES).forEach(rise);
  };
  new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach(scan))).observe(document.documentElement, { childList: true, subtree: true });
})();
