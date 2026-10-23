// "Do you really want to make this change?" — asked before any edit is saved, in both apps, like
// Google Sheets' warning on a protected range. Ticking "Don't ask again for 5 minutes" skips the
// question for that long in this browser (both apps share it, as they're on the same site).
// Served to both pages as /edit-guard.js; loaded as window.EditGuard.
(function (root) {
  const SNOOZE_MS = 5 * 60 * 1000;
  const SNOOZE_KEY = 'niec-edit-guard-snooze-until';

  function snoozedUntil() {
    try { return Number(localStorage.getItem(SNOOZE_KEY)) || 0; } catch (e) { return memorySnooze; }
  }
  let memorySnooze = 0; // used when the browser blocks storage (e.g. a private window)
  function snooze() {
    memorySnooze = Date.now() + SNOOZE_MS;
    try { localStorage.setItem(SNOOZE_KEY, String(memorySnooze)); } catch (e) { /* kept in memory instead */ }
  }

  const css = `
    .eg-overlay { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center; justify-content: center;
      padding: 16px; background: rgba(15, 23, 42, .45); }
    .eg-box { width: 100%; max-width: 400px; background: #fff; color: #1f2937; border-radius: 10px; padding: 20px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, .3); font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
    .eg-box h2 { margin: 0 0 6px; font-size: 16px; }
    .eg-box p { margin: 0 0 14px; color: #4b5563; }
    .eg-box label { display: flex; align-items: center; gap: 8px; margin-bottom: 18px; cursor: pointer; color: #374151; }
    .eg-actions { display: flex; justify-content: flex-end; gap: 8px; }
    .eg-actions button { padding: 7px 16px; border-radius: 6px; font: inherit; font-weight: 600; cursor: pointer;
      border: 1px solid #d1d5db; background: #fff; color: #374151; }
    .eg-actions .eg-ok { background: #ea580c; border-color: #ea580c; color: #fff; }
    .eg-actions button:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
    @media (prefers-color-scheme: dark) {
      .eg-box { background: #1f2937; color: #f3f4f6; }
      .eg-box p, .eg-box label { color: #d1d5db; }
      .eg-actions button { background: #374151; border-color: #4b5563; color: #f3f4f6; }
    }`;

  let open = null; // { finish } while the box is showing

  function isOpen() { return Boolean(open); }

  // Runs apply() once the change is confirmed (straight away while snoozed), or revert() if cancelled.
  function confirmChange(apply, revert) {
    if (Date.now() < snoozedUntil()) { apply(); return; }
    if (open) { if (revert) revert(); return; } // one question at a time

    if (!document.getElementById('eg-style')) {
      const style = document.createElement('style');
      style.id = 'eg-style';
      style.textContent = css;
      document.head.appendChild(style);
    }
    const overlay = document.createElement('div');
    overlay.className = 'eg-overlay';
    overlay.innerHTML = `
      <div class="eg-box" role="alertdialog" aria-modal="true" aria-labelledby="eg-title" aria-describedby="eg-text">
        <h2 id="eg-title">Make this change?</h2>
        <p id="eg-text">Do you really want to make this change to the sheet?</p>
        <label><input type="checkbox" class="eg-snooze"> Don't ask again for 5 minutes</label>
        <div class="eg-actions">
          <button type="button" class="eg-cancel">Cancel</button>
          <button type="button" class="eg-ok">OK</button>
        </div>
      </div>`;
    const okBtn = overlay.querySelector('.eg-ok');
    let returnFocus = null;

    function finish(ok) {
      if (!open) return;
      if (ok && overlay.querySelector('.eg-snooze').checked) snooze();
      open = null;
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      if (returnFocus && document.contains(returnFocus)) returnFocus.focus({ preventScroll: true });
      if (ok) apply();
      else if (revert) revert();
    }
    // While the box is up, Enter/Escape answer it and no key reaches the sheet underneath.
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      else if (e.key === 'Enter' && !e.target.matches('.eg-cancel')) { e.preventDefault(); finish(true); }
      else if (e.key !== 'Tab' && e.key !== ' ') { e.preventDefault(); }
      e.stopPropagation();
    }

    overlay.querySelector('.eg-cancel').addEventListener('click', () => finish(false));
    okBtn.addEventListener('click', () => finish(true));
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) e.preventDefault(); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    open = { finish };
    // After the current click/keypress has finished moving focus around, take it for the box.
    setTimeout(() => {
      if (!open) return;
      returnFocus = document.activeElement;
      okBtn.focus();
    }, 0);
  }

  root.EditGuard = { confirmChange, isOpen };
})(this);
