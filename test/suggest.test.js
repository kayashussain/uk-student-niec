const test = require('node:test');
const assert = require('node:assert');
const { suggest } = require('../student-details/suggest');

const known = ['University of West London', 'University of West London', 'Coventry University', 'MSc Data Science'];

test('suggests the right capitals for a value already in the sheet', () => {
  assert.deepStrictEqual(suggest('university of West london', known), { value: 'University of West London', reason: 'capitals' });
});

test('suggests the matching entry for a small spelling slip', () => {
  assert.deepStrictEqual(suggest('Univesity of West London', known), { value: 'University of West London', reason: 'spelling' });
});

test('no suggestion when the entry is already right', () => {
  assert.strictEqual(suggest('University of West London', known), null);
  assert.strictEqual(suggest('Coventry University', known), null);
  assert.strictEqual(suggest('', known), null);
});

test('a new but properly written value is left alone, a badly capitalised new one is fixed', () => {
  assert.strictEqual(suggest('Brunel University', known), null);
  assert.deepStrictEqual(suggest('university of Brunel', []), { value: 'University of Brunel', reason: 'capitals' });
  assert.strictEqual(suggest('MSc Computing', []), null);
});
