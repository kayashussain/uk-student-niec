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
const { spawn } = require('child_process');
const path = require('path');

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

function startChild(name, cwd, port, extraEnv) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd,
    env: { ...process.env, PORT: String(port), ...extraEnv },
    stdio: 'inherit',
  });
  child.on('exit', (code) => {
    console.error(`[gateway] ${name} exited with code ${code} — shutting down.`);
    process.exit(1);
  });
  return child;
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

function checkAuth(req) {
  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme !== 'Basic' || !encoded) return false;
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const sep = decoded.indexOf(':');
  if (sep === -1) return false;
  const user = decoded.slice(0, sep);
  const pass = decoded.slice(sep + 1);
  return user === USERNAME && pass === PASSWORD;
}

const server = http.createServer((req, res) => {
  if (!checkAuth(req)) {
    res.writeHead(401, {
      'WWW-Authenticate': 'Basic realm="UK Student NIEC", charset="UTF-8"',
      'Content-Type': 'text/plain',
    });
    res.end('Authentication required.');
    return;
  }

  const [urlPath, query = ''] = req.url.split('?');
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

server.listen(PORT, () => {
  console.log(`Gateway listening on http://localhost:${PORT}`);
});
