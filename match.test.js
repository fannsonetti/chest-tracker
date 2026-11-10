const test = require('node:test');
const assert = require('node:assert/strict');
const { OpeningStreaks } = require('./match');
const { recapDetails } = require('./match');
const { matchLeaderboards, recapPlayers, recapStages } = require('./match');

test('solo openings never build streaks, including across joins, leaves and corrections', () => {
  const s = new OpeningStreaks();
  s.observe('a',0); s.setCompetitive(false); s.observe('a',8);
  assert.equal(s.longest('a'),0); assert.equal(s.current('a'),0);
  s.setCompetitive(true); s.observe('b',0); s.observe('a',10);
  assert.equal(s.current('a'),2);
  s.setCompetitive(false); s.observe('a',15); s.observe('a',12);
  assert.equal(s.current('a'),0); assert.equal(s.longest('a'),2);
  s.setCompetitive(true); s.observe('a',13);
  assert.equal(s.current('a'),0); assert.equal(s.longest('a'),2);
  s.observe('a',14); assert.equal(s.current('a'),2);
  assert.equal(s.timeline().reduce((n,e)=>n+e.n,0),14);
  assert.equal(recapPlayers([{name:'Solo',bestStreak:99}])[0].bestStreak,0);
});

test('leaderboards separate roster sizes, keep personal match bests and exclude solo streaks', () => {
  const player = (id, chests, bestStreak) => ({id,name:id,chests,bestStreak});
  const history = [
    {recap:[player('a',20,20)]},
    {recap:[player('a',10,4),player('b',15,3)]},
    {recap:[player('a',12,2),player('b',5,5)]},
    {recap:[player('a',40,6),player('b',1,1),player('c',1,1)]},
    {recap:[player('a',50,7),player('b',1,1),player('c',1,1),player('d',1,1)]},
    {recap:['a','b','c','d','e'].map(id=>player(id,99,99))}
  ];
  const boards = matchLeaderboards(history);
  assert.equal(boards[0].chests[0].chests,20); assert.deepEqual(boards[0].streaks,[]);
  assert.equal(boards[1].chests[0].id,'b'); assert.equal(boards[1].chests[1].chests,12);
  assert.equal(boards[1].streaks[0].bestStreak,5);
  assert.equal(boards[2].chests[0].chests,40); assert.equal(boards[3].chests[0].chests,50);
});

test('timeline preserves receipt times, excludes baselines, undoes corrections and freezes snapshots', () => {
  const s = new OpeningStreaks();
  s.observe('a', 20, 100); s.observe('b', 5, 100);
  s.observe('a', 23, 200); s.observe('b', 6, 300); s.observe('a', 25, 400);
  const frozen = s.timeline();
  s.observe('a', 22, 500);
  assert.deepEqual(s.timeline(), [{id:'a',n:2,at:200},{id:'b',n:1,at:300}]);
  assert.equal(frozen.length, 3);
  assert.equal(frozen[0].n, 3);
  s.reset(); assert.deepEqual(s.timeline(), []);
});

test('full recap escapes names and renders duration, contributions and cumulative player timelines', () => {
  const html = recapDetails({ start:1000, end:61000, teamChests:4,
    recap:[{id:'a',name:'<script>',chests:3,bestStreak:2},{id:'b',name:'Friend',chests:1,bestStreak:1}],
    timeline:[{id:'a',n:3,at:31000},{id:'b',n:1,at:61000}] });
  assert.ok(html.includes('1:00 played'));
  assert.ok(html.includes('75%'));
  assert.ok(html.includes('Opening timeline'));
  assert.equal((html.match(/<polyline/g) || []).length, 2);
  assert.ok(!html.includes('<script>'));
  assert.ok(recapDetails({start:0,end:0,recap:[]}).includes('No recorded opening timeline'));
});
test('a single opening is not a streak; two in a row starts one', () => {
  const s = new OpeningStreaks();
  s.observe('a',0); s.observe('b',0);
  s.observe('a',1); assert.equal(s.current('a'),0); assert.equal(s.longest('a'),0);
  s.observe('a',2); assert.equal(s.current('a'),2);
  s.observe('b',1); assert.equal(s.current('a'),0); assert.equal(s.current('b'),0); assert.equal(s.longest('a'),2);
  assert.deepEqual(recapPlayers([{name:'a',chests:1,bestStreak:1},{name:'b',chests:1,bestStreak:2}]).map(p=>p.bestStreak),[0,2]);
});

test('recap stages show one category each and skip squad-only stages when solo', () => {
  const match = { n:4, start:0, end:120000, teamChests:5,
    recap:[{id:'me',name:'Me',chests:3,bestStreak:3},{id:'b',name:'<b>',chests:2,bestStreak:1}],
    timeline:[{id:'me',n:3,at:30000},{id:'b',n:2,at:90000}] };
  const stages = recapStages(match, 'me');
  assert.deepEqual(stages.map(s=>s.key),['total','share','streaks','timeline']);
  assert.ok(stages[0].html.includes('2.5'));
  assert.ok(stages[1].html.includes('60%') && stages[1].html.includes('You'));
  assert.ok(stages[1].html.includes('&lt;b&gt;') && !stages.some(s=>s.html.includes('<b><b>')));
  assert.ok(stages[2].html.includes('>3<'));
  assert.deepEqual(recapStages({ start:0, end:0, recap:[{id:'me',name:'Me',chests:0}] }, 'me').map(s=>s.key),['total']);
});

test('another player breaks a streak; corrections undo openings; baseline and resets exclude old chests', () => {
  const s = new OpeningStreaks();
  s.observe('a',20); s.observe('b',10);
  s.observe('a',23); s.observe('b',11); s.observe('a',25);
  assert.equal(s.longest('a'),3); assert.equal(s.longest('b'),0);
  assert.equal(s.current('a'),2); assert.equal(s.current('b'),0);
  assert.deepEqual(s.live([{id:'a'},{id:'b'}]).map(p=>p.streak),[2,0]);
  s.observe('b',10);
  assert.equal(s.longest('a'),5);
  assert.equal(s.current('a'),5);
  s.observe('a',24); assert.equal(s.longest('a'),4);
  s.reset(); s.observe('a',0); s.observe('a',2); assert.equal(s.longest('a'),2);
});
