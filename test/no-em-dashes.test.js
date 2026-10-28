const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// The owner asked for no em dashes anywhere (pages, emails, documents, comments). The pattern is built
// from character codes so this file itself does not contain one.
const DASHES = new RegExp('[' + String.fromCharCode(0x2014, 0x2013) + ']');
const ROOT = path.join(__dirname, '..');
const SKIP = new Set(['node_modules', '.git', '.claude']);
const TEXT = /\.(js|html|css|md|json|yaml|yml|sh|txt)$|^\.gitignore$/;

function* files(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(full);
    else if (TEXT.test(entry.name)) yield full;
  }
}

test('no em dashes or en dashes in any project file', () => {
  const found = [];
  for (const file of files(ROOT)) {
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (DASHES.test(line)) found.push(`${path.relative(ROOT, file)}:${i + 1}: ${line.trim().slice(0, 80)}`);
    });
  }
  assert.deepStrictEqual(found, []);
});
