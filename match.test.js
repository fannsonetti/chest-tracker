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
  assert.deepEqual(recapPlayers([{name:'a',chests:1,bestStreak:1},{name:'b',chests:1,bestStreak:2}]).map(p=>p.bestStreak),[0,2]);
});

test('one opening by someone else does not break a streak; a second one takes it over', () => {
  const s = new OpeningStreaks();
  s.observe('me',0); s.observe('b',0);
  s.observe('me',3); assert.equal(s.current('me'),3);
  s.observe('b',1); assert.equal(s.current('me'),3); assert.equal(s.current('b'),0);
  s.observe('b',2); assert.equal(s.current('me'),0); assert.equal(s.current('b'),2);
  assert.equal(s.longest('me'),3); assert.equal(s.longest('b'),2);
});

test('the holder opening first resets every challenger and keeps growing the streak', () => {
  const s = new OpeningStreaks();
  for (const id of ['me','b','c']) s.observe(id,0);
  s.observe('me',2);
  s.observe('b',1); s.observe('c',1);
  s.observe('me',3); assert.equal(s.current('me'),3);
  s.observe('b',2); assert.equal(s.current('me'),3, 'b restarted from 0, so one opening is not enough');
  s.observe('c',2); assert.equal(s.current('me'),3);
  s.observe('b',3); assert.equal(s.current('b'),2); assert.equal(s.current('me'),0);
  s.observe('me',4); assert.equal(s.current('b'),2, 'one holder-less opening does not take it back');
  s.observe('me',5); assert.equal(s.current('me'),2); assert.equal(s.longest('me'),3);
});

test('with no holder, the first player to reach two openings starts the streak', () => {
  const s = new OpeningStreaks();
  s.observe('a',0); s.observe('b',0);
  s.observe('a',1); s.observe('b',1); assert.equal(s.current('a'),0); assert.equal(s.current('b'),0);
  s.observe('a',2); assert.equal(s.current('a'),2);
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

test('challengers do not break a streak; corrections undo openings; baseline and resets exclude old chests', () => {
  const s = new OpeningStreaks();
  s.observe('a',20); s.observe('b',10);
  s.observe('a',23); s.observe('b',11); s.observe('a',25);
  assert.equal(s.longest('a'),5); assert.equal(s.longest('b'),0);
  assert.equal(s.current('a'),5); assert.equal(s.current('b'),0);
  assert.deepEqual(s.live([{id:'a'},{id:'b'}]).map(p=>p.streak),[5,0]);
  s.observe('b',13); assert.equal(s.current('b'),2); assert.equal(s.current('a'),0);
  s.observe('b',12); assert.equal(s.current('a'),5, 'correcting the takeover gives the streak back');
  s.observe('a',24); assert.equal(s.longest('a'),4);
  s.reset(); s.observe('a',0); s.observe('a',2); assert.equal(s.longest('a'),2);
});

test('a takeover keeps the other challengers hidden counts', () => {
  const s = new OpeningStreaks();
  for (const id of ['me','a','b']) s.observe(id,0);
  s.observe('me',2);
  s.observe('a',1); s.observe('b',1);
  s.observe('a',2); assert.equal(s.current('a'),2);
  s.observe('b',2); assert.equal(s.current('b'),2, 'b needed only one more'); assert.equal(s.current('a'),0);
});

test('points: 10 per chest, +10% per streak level, times lobby size up to 4x; corrections remove them', () => {
  const { openingPoints } = require('./match');
  assert.equal(openingPoints(0,1),10); assert.equal(openingPoints(1,2),20); assert.equal(openingPoints(3,3),39); assert.equal(openingPoints(0,9),40);
  const solo = new OpeningStreaks();
  solo.setPlayers(1); solo.observe('a',0); solo.observe('a',6);
  assert.equal(solo.score('a'),60, 'solo has no streak bonus');
  const duo = new OpeningStreaks();
  duo.setPlayers(2); duo.observe('a',0); duo.observe('b',0);
  duo.observe('a',3);   // 20, then streak 2 (24), streak 3 (26)
  duo.observe('b',1);   // 20, no streak
  assert.equal(duo.score('a'),70); assert.equal(duo.score('b'),20);
  duo.observe('a',2);   // correction removes the streak-3 opening
  assert.equal(duo.score('a'),44);
  duo.setPlayers(4); duo.observe('b',2); // 40 at squad size, b's second opening takes the streak: (10+2)*4
  assert.equal(duo.score('b'),20+48);
  assert.equal(duo.recap([{id:'a',name:'a',chests:2},{id:'b',name:'b',chests:2}]).find(p=>p.id==='b').points,68);
});

test('a held hotkey counts once; separate presses each count', () => {
  const { HoldFilter } = require('./match');
  let t = 0, timers = [], fired = 0;
  const f = new HoldFilter({ now:() => t, schedule:(fn, ms) => { const timer = { fn, at:t + ms }; timers.push(timer); return timer; }, cancel:timer => { timers = timers.filter(x => x !== timer); } });
  const advance = to => { t = to; for (const timer of timers.filter(x => x.at <= t)) { timers = timers.filter(x => x !== timer); timer.fn(); } };
  const press = at => { advance(at); f.press('chestUp', () => fired++); };
  // Hold: first press, first auto-repeat after 500ms, then a repeat every 33ms.
  press(10000); for (let at = 10500; at < 12000; at += 33) press(at); advance(13000);
  assert.equal(fired,1);
  // Taps 300ms apart each count once the repeat window passes.
  press(20000); press(20300); press(20600); advance(21000);
  assert.equal(fired,4);
  // Another key is tracked on its own.
  f.press('chestDown', () => fired += 10); assert.equal(fired,14);
});

test('points leaderboard only counts relay-verified party results once, plus solo chests', () => {
  const p = (id, chests) => ({ id, name:id, chests, bestStreak:0 });
  const signed = { id:'m1', players:[{ id:'me', points:128 }, { id:'b', points:20 }] };
  const history = [
    { recap:[p('me',8),p('b',6)], proof:{ data:'ok', sig:'s1' } },
    { recap:[p('me',8),p('b',6)], proof:{ data:'ok', sig:'s1' } },          // the same match saved twice
    { recap:[{ ...p('me',99), points:99999 },p('b',1)] },                     // unsigned party match
    { recap:[{ ...p('me',4), points:99999 }] }                                // solo: chests x 10, stored points ignored
  ];
  const verified = m => m.proof?.sig === 's1' ? signed : null;
  const all = matchLeaderboards(history, verified)[4];
  assert.equal(all.size,0); assert.equal(all.matches,4);
  assert.deepEqual(all.points.map(r=>[r.id,r.points]),[['me',168],['b',20]]);
  assert.deepEqual(matchLeaderboards(history)[1].points,[]);
});

test('averages skip matches under 5 chests', () => {
  const { careerStats } = require('./match');
  const history = [10, 4, 20, 0].map((chests, i) => ({ n:i+1, start:0, end:60000, chests, teamChests:chests, recap:[{ id:'me', name:'me', chests }] }));
  assert.equal(matchLeaderboards(history)[0].avg[0].avg,15);
  assert.equal(matchLeaderboards(history)[0].played[0].matches,4);
  const c = careerStats(history,'me');
  assert.equal(c.avg,15); assert.equal(c.matches,4); assert.equal(c.chests,34);
});

test('leaderboards add matches and averages; career stats summarize your own matches', () => {
  const { careerStats } = require('./match');
  const player = (id, chests, bestStreak) => ({id,name:id,chests,bestStreak});
  const history = [
    {n:1,start:0,end:600000,chests:10,teamChests:15,recap:[player('me',10,4),player('b',5,2)]},
    {n:2,start:0,end:600000,chests:20,teamChests:50,recap:[player('me',20,3),player('b',30,6)]},
    {n:3,start:0,end:300000,chests:7,teamChests:7,recap:[player('me',7,7)]}
  ];
  const duo = matchLeaderboards(history)[1];
  assert.equal(duo.matches,2);
  assert.deepEqual(duo.avg.map(p=>[p.id,p.avg]),[['b',17.5],['me',15]]);
  assert.equal(duo.played[0].matches,2);
  const c = careerStats(history,'me');
  assert.equal(c.matches,3); assert.equal(c.chests,37); assert.equal(c.best,20); assert.equal(c.streak,4);
  assert.equal(c.mvps,1); assert.equal(c.modes[0].matches,1); assert.equal(c.modes[0].streak,0);
  assert.equal(c.perMin,1.5); assert.equal(c.recent.length,3);
});
