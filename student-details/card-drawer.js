// Opens a student's card over the page the person is on (the sheet, the Fact File ...), so they can look
// at the student and carry on where they were. window.CardDrawer.open(rowId, { onClose }). Escape or the Close button shuts it;
// onClose (optional) runs then, so a page can show what was changed on the card (a new note, a new stage).
(function (root) {
  let current = null;
  function close() {
    if (!current) return;
    current.back.remove();
    current.drawer.remove();
    if (current.before && document.contains(current.before)) { try { current.before.focus({ preventScroll: true }); } catch (e) { /* the cell is gone: nothing to go back to */ } }
    document.removeEventListener('keydown', current.onKey);
    window.removeEventListener('message', current.onMessage);
    const after = current.onClose;
    current = null;
    if (typeof after === 'function') after();
  }
  function open(id, { onClose } = {}) {
    close();
    const back = document.createElement('div');
    back.className = 'p-drawer-back';
    const drawer = document.createElement('aside');
    drawer.className = 'p-drawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-label', 'Student card');
    const frame = document.createElement('iframe');
    frame.title = 'Student card';
    frame.src = '/student?embed=1&id=' + encodeURIComponent(id);
    drawer.append(frame);
    const onKey = (e) => { if (e.key === 'Escape' && !(root.NiecUI && root.NiecUI.isOpen())) close(); };
    const onMessage = (e) => { if (e.origin === location.origin && e.data && e.data.niecCard === 'close') close(); };
    back.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    window.addEventListener('message', onMessage);
    // The keyboard goes with the card: whatever was being typed in on the page underneath (a cell of the sheet, after a
    // double-click on the name) lets go, so nothing typed now lands in a cell hidden behind the card. Closing gives it back.
    const before = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
    document.body.append(back, drawer);
    if (before && before.blur) before.blur();
    frame.tabIndex = -1;
    frame.focus({ preventScroll: true });
    current = { back, drawer, onKey, onMessage, before, onClose };
  }
  // Loaded in its own stylesheet-less pages too (the Fact File): make sure the drawer's look is there.
  if (!document.querySelector('link[href^="portal.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'portal.css';
    document.head.append(link);
  }
  root.CardDrawer = { open, close };
})(this);
