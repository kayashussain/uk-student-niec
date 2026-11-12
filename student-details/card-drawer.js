// Opens a student's card over the page the person is on (the sheet, the follow-ups, the Fact File ...), so they can look
// at the student and carry on where they were. window.CardDrawer.open(rowId). Escape or the Close button shuts it.
(function (root) {
  let current = null;
  function close() {
    if (!current) return;
    current.back.remove();
    current.drawer.remove();
    document.removeEventListener('keydown', current.onKey);
    window.removeEventListener('message', current.onMessage);
    current = null;
  }
  function open(id) {
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
    document.body.append(back, drawer);
    current = { back, drawer, onKey, onMessage };
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
