// Public entry point for the whole deployment.
//
// Runs both "student-details" and "counselor-incentive" as internal child processes
// (unchanged, still on their own default ports) and sits in front of them on the one
// port the host exposes publicly. Every request must pass HTTP Basic Auth first — a
// single shared username/password protects both apps.
//
// Routing:
//   /commission or /commission/*        -> counselor-incentive (prefix stripped)
//   /api/sync, /api/commissions*,
//   /api/advances*, /api/exchange-rate  -> counselor-incentive (these path names are
//                                          unique to it, so no prefix needed)
//   everything else (/, /app.js, /style.css, /api/data, ...) -> student-details
//
// Both child processes share one persistent disk via STUDENT_DETAILS_DATA_DIR and
// COUNSELOR_DATA_DIR (set by the host) so data survives redeploys.

const http = require('http');
const net = require('net');
const { spawn } = require('child_process');
const path = require('path');
const { createAuth, send } = require('../shared/server-utils');

const PORT = process.env.PORT || 8080;
const STUDENT_DETAILS_PORT = 4173;
const COUNSELOR_PORT = 5173;

const USERNAME = process.env.APP_USERNAME;
const PASSWORD = process.env.APP_PASSWORD;

if (!USERNAME || !PASSWORD) {
  console.error(
    'Missing APP_USERNAME and/or APP_PASSWORD environment variables.\n' +
    'Set both in your hosting dashboard before starting the gateway — refusing to run\n' +
    'without them so the site is never accidentally exposed with no password.'
  );
  process.exit(1);
}

const requireAuth = createAuth({ username: USERNAME, password: PASSWORD });

const children = [];
let shuttingDown = false;

function startChild(name, cwd, port, extraEnv) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd,
    env: { ...process.env, PORT: String(port), ...extraEnv },
    stdio: 'inherit',
  });
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.error(`[gateway] ${name} exited (${signal || 'code ' + code}) — shutting down.`);
    shutdown(1);
  });
  children.push(child);
  return child;
}

// On a redeploy the host sends SIGTERM to this process only: pass it on so both apps stop too,
// instead of being left running (and holding their ports) after the gateway is gone.
function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  children.forEach((c) => { if (c.exitCode === null) c.kill('SIGTERM'); });
  setTimeout(() => process.exit(exitCode), 3000).unref();
  Promise.all(children.map((c) => (c.exitCode !== null ? null : new Promise((r) => c.once('exit', r)))))
    .then(() => process.exit(exitCode));
}
process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));

// Resolves once something is accepting connections on the port.
function waitForPort(port, timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    (function attempt() {
      const socket = net.connect(port, '127.0.0.1');
      socket.once('connect', () => { socket.destroy(); resolve(); });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - started > timeoutMs) reject(new Error(`nothing listening on port ${port}`));
        else setTimeout(attempt, 200);
      });
    })();
  });
}

const studentDetailsDir = path.join(__dirname, '..', 'student-details');
const counselorDir = path.join(__dirname, '..', 'counselor-incentive');

startChild('student-details', studentDetailsDir, STUDENT_DETAILS_PORT, {
  STUDENT_DETAILS_DATA_DIR: process.env.STUDENT_DETAILS_DATA_DIR || '',
});
startChild('counselor-incentive', counselorDir, COUNSELOR_PORT, {
  COUNSELOR_DATA_DIR: process.env.COUNSELOR_DATA_DIR || '',
  STUDENT_DETAILS_DATA_DIR: process.env.STUDENT_DETAILS_DATA_DIR || '',
});

const COUNSELOR_API_PREFIXES = ['/api/sync', '/api/commissions', '/api/advances', '/api/exchange-rate'];

function pickTarget(urlPath) {
  if (urlPath === '/commission' || urlPath.startsWith('/commission/')) {
    const rewritten = urlPath.slice('/commission'.length) || '/';
    return { port: COUNSELOR_PORT, path: rewritten };
  }
  if (COUNSELOR_API_PREFIXES.some((p) => urlPath === p || urlPath.startsWith(p + '/'))) {
    return { port: COUNSELOR_PORT, path: urlPath };
  }
  return { port: STUDENT_DETAILS_PORT, path: urlPath };
}

const server = http.createServer((req, res) => {
  if (!requireAuth(req, res)) return;

  const [urlPath, query = ''] = req.url.split('?');
  // /commission -> /commission/, so the Incentive page's relative links (calc.js, favicon) stay inside it.
  if (urlPath === '/commission') {
    return send(res, 301, '', { Location: '/commission/' + (query ? '?' + query : '') });
  }
  const target = pickTarget(urlPath);
  const targetUrl = target.path + (query ? '?' + query : '');

  const proxyReq = http.request(
    {
      host: '127.0.0.1',
      port: target.port,
      path: targetUrl,
      method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${target.port}` },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', (err) => {
    console.error('[gateway] proxy error:', err.message);
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Bad gateway.');
  });

  req.pipe(proxyReq);
});

// Only start taking traffic once both apps are up, so the first visitors after a deploy don't get
// "Bad gateway" while they're still starting.
Promise.all([waitForPort(STUDENT_DETAILS_PORT), waitForPort(COUNSELOR_PORT)])
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Gateway listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[gateway] an app failed to start:', err.message);
    shutdown(1);
  });
