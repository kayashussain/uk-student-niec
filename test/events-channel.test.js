// Events and marketing: each one says where it ran (older entries are read from their type), and a social media campaign is a
// choice under "Social Media" when a student is added, so the students it brought count in its cost per student.
const test = require('node:test');
const assert = require('node:assert');
const { LISTS, channelOf, CHANNELS } = require('../student-details/planning');

test('where it ran: chosen, or read from the older type; social media, newspaper and online ads are marketing', () => {
  const clean = LISTS.events.clean;
  const fb = clean({ name: 'Facebook campaign', date: '2026-11-01', channel: 'Social media', cost: '20000' });
  assert.deepStrictEqual([fb.channel, fb.kind, fb.cost], ['Social media', 'Marketing', 20000]);
  assert.strictEqual(clean({ name: 'Fair', date: '2026-08-08', type: 'Education fair' }).channel, 'Another venue (hall or hotel)', 'an older entry keeps its meaning');
  assert.strictEqual(clean({ name: 'Ad', date: '2026-08-08', type: 'Meta campaign (Facebook or Instagram)' }).kind, 'Marketing');
  assert.strictEqual(clean({ name: 'Open day', date: '2026-08-08', channel: 'Our office' }).kind, 'Event');
  assert.strictEqual(channelOf({ channel: 'made up' }), 'Other', 'an unknown choice is not kept');
  assert.ok(CHANNELS.includes('Social media'));
});
