// Login session helpers for both pages. Served as /session.js; loaded as window.NiecSession.
// When the login has run out (any request answered 401), the page goes to the login page and comes
// back here afterwards. logout() ends the login on this device.
(function (root) {
  const loginUrl = () => '/login?next=' + encodeURIComponent(location.pathname + location.search);
  let leaving = false;

  // A page with work that is not saved yet can ask to stay where it is when the login runs out (holdWhile), so
  // the work isn't thrown away by a redirect: it shows its own notice, and its saves go through once the person
  // logs in again in another tab (the login cookie is shared by all tabs of the site).
  let holdIf = null;
  let holdNotice = null;
  function holdWhile(isHolding, notice) { holdIf = isHolding; holdNotice = notice; }

  const realFetch = root.fetch.bind(root);
  root.fetch = async function (...args) {
    const res = await realFetch(...args);
    if (res.status === 401 && !leaving) {
      if (holdIf && holdIf()) {
        if (holdNotice) holdNotice();
      } else {
        leaving = true;
        location.href = loginUrl();
      }
    }
    return res;
  };

  async function logout() {
    leaving = true;
    try { await realFetch('/api/logout', { method: 'POST' }); } catch (e) { /* cookie is cleared below either way */ }
    location.href = '/login';
  }

  // The Excel library is big (about 1 MB), so it's only downloaded the first time someone exports.
  let excel = null;
  function loadExcel() {
    if (root.ExcelJS) return Promise.resolve(root.ExcelJS);
    if (!excel) {
      excel = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
        s.onload = () => resolve(root.ExcelJS);
        s.onerror = () => { excel = null; reject(new Error('Excel library failed to load')); };
        document.head.appendChild(s);
      });
    }
    return excel;
  }

  root.NiecSession = { logout, loadExcel, holdWhile };
})(this);
