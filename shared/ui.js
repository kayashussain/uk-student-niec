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
      form.addEventListener('submit', () => { answer = true; });
      if (cancel) cancel.addEventListener('click', () => dialog.close());
      // Clicking the dimmed area outside the box cancels it.
      dialog.addEventListener('mousedown', (e) => { if (e.target === dialog) dialog.close(); });
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

  root.NiecUI = { toast, confirm: confirmBox, alert: alertBox, isOpen: () => openDialogs > 0 };
})(this);
