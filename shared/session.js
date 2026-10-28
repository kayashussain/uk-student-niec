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

  root.NiecSession = { logout };
})(this);
