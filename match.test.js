const test = require('node:test');
const assert = require('node:assert/strict');
const { OpeningStreaks } = require('./match');
test('another player breaks a streak; corrections undo openings; baseline and resets exclude old chests', () => {
  const s = new OpeningStreaks();
  s.observe('a',20); s.observe('b',10);
  s.observe('a',23); s.observe('b',11); s.observe('a',25);
  assert.equal(s.longest('a'),3); assert.equal(s.longest('b'),1);
  s.observe('b',10);
  assert.equal(s.longest('a'),5);
  s.observe('a',24); assert.equal(s.longest('a'),4);
  s.reset(); s.observe('a',0); s.observe('a',2); assert.equal(s.longest('a'),2);
});
