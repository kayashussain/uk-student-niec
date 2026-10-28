// Login session helpers for both pages. Served as /session.js; loaded as window.NiecSession.
// When the login has run out (any request answered 401), the page goes to the login page and comes
// back here afterwards. logout() ends the login on this device.
(function (root) {
  const loginUrl = () => '/login?next=' + encodeURIComponent(location.pathname + location.search);
  let leaving = false;

  const realFetch = root.fetch.bind(root);
  root.fetch = async function (...args) {
    const res = await realFetch(...args);
    if (res.status === 401 && !leaving) {
      leaving = true;
      location.href = loginUrl();
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

  root.NiecSession = { logout, loadExcel };
})(this);
