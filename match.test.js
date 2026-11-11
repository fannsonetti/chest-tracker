const test = require('node:test');
const assert = require('node:assert/strict');
const { OpeningStreaks } = require('./match');
const { recapDetails } = require('./match');
const { matchLeaderboards, recapPlayers, recapStages } = require('./match');

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

test('recap stages show one category each and skip squad-only stages when solo', () => {
  const match = { n:4, start:0, end:120000, teamChests:5,
    recap:[{id:'me',name:'Me',chests:3,bestStreak:3},{id:'b',name:'<b>',chests:2,bestStreak:1}],
    timeline:[{id:'me',n:3,at:30000},{id:'b',n:2,at:90000}] };
  const stages = recapStages(match, 'me');
  const by = key => stages.find(s => s.key === key);
  assert.deepEqual(stages.map(s=>s.key),['total','replay','awards','share','streaks','timeline']);
  assert.ok(by('total').html.includes('2.5'));
  assert.ok(by('share').html.includes('60%') && by('share').html.includes('You'));
  assert.ok(by('share').html.includes('&lt;b&gt;') && !stages.some(s=>s.html.includes('<b><b>')));
  assert.ok(by('streaks').html.includes('data-text="3"'));
  // Awards: first and last chest with when they happened, and the longest streak.
  assert.ok(by('awards').html.includes('First chest') && by('awards').html.includes('at 0:30'));
  assert.ok(by('awards').html.includes('Last chest') && by('awards').html.includes('at 1:30'));
  assert.ok(by('awards').html.includes('Longest streak') && !by('awards').html.includes('burst'));
  // Replay frames: cumulative counts and what happened at each opening.
  const { frames } = by('replay').play;
  assert.deepEqual(frames.map(f => [f.t, f.counts.me, f.counts.b]),[[0.25,3,0],[0.75,3,2]]);
  assert.deepEqual(frames[0].notes.map(n => n.kind),['first','streak']);
  assert.deepEqual(frames[1].notes.map(n => n.kind),['last'], "b's 2 does not pass the leader's 3");
  assert.deepEqual(recapStages({ start:0, end:0, recap:[{id:'me',name:'Me',chests:0}] }, 'me').map(s=>s.key),['total']);
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
  const signed = { v:1, id:'m1', players:[{ id:'me', points:128 }, { id:'b', points:20 }] };   // old 10-per-chest result
  const history = [
    { recap:[p('me',8),p('b',6)], proof:{ data:'ok', sig:'s1' } },
    { recap:[p('me',8),p('b',6)], proof:{ data:'ok', sig:'s1' } },          // the same match saved twice
    { recap:[{ ...p('me',99), points:99999 },p('b',1)] },                     // unsigned party match
    { recap:[{ ...p('me',5), points:99999 }] },                               // solo: chests x 10, stored points ignored
    { recap:[{ ...p('me',3) }] }                                              // under 5 chests: not counted
  ];
  const verified = m => m.proof?.sig === 's1' ? signed : null;
  const all = matchLeaderboards(history, verified)[4];
  assert.equal(all.size,0); assert.equal(all.matches,3, 'the match saved twice counts once');
  assert.deepEqual(all.points.map(r=>[r.id,r.points]),[['me',128/40+5*0.25],['b',0.5]]);
  const fresh = m => m.proof?.sig === 's1' ? { ...signed, v:2, players:[{ id:'me', points:3.2 }, { id:'b', points:0.5 }] } : null;
  assert.deepEqual(matchLeaderboards(history, fresh)[4].points.map(r=>[r.id,r.points]),[['me',3.2+1.25],['b',0.5]]);
  assert.deepEqual(matchLeaderboards(history)[1].points,[]);
});

test('games under 3 minutes or 5 chests count nowhere, and every view uses the same games', () => {
  const { careerStats, matchAverages, countedMatch } = require('./match');
  const game = (chests, minutes) => ({ start:0, end:minutes * 60000, chests, teamChests:chests, recap:[{ id:'me', name:'me', chests }] });
  const history = [game(10, 10), game(4, 10), game(20, 10), game(0, 10), game(40, 2.9), game(5, 3)];
  assert.deepEqual(history.map(countedMatch),[true,false,true,false,false,true]);
  const all = matchLeaderboards(history)[4], solo = matchLeaderboards(history)[0];
  assert.equal(solo.avg[0].avg,11.7); assert.equal(solo.played[0].matches,3); assert.equal(all.avg[0].avg,11.7);
  const c = careerStats(history,'me');
  assert.equal(c.avg,11.7); assert.equal(c.matches,3); assert.equal(c.chests,35);
  assert.deepEqual(matchAverages(history),{ matches:3, own:11.7, team:11.7 });
  assert.equal(matchAverages(history, 10 * 60000 - 1).matches,2);    // after a reset
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

test('streak colours: ember, blue at 10, purple at 25, prism at 50', () => {
  const { streakTier } = require('./match');
  assert.deepEqual([0, 2, 9, 10, 24, 25, 49, 50, 300].map(streakTier),['ember','ember','ember','blue','blue','purple','purple','prism','prism']);
});

test('first and last chest awards go to party games only and follow corrections', () => {
  const duo = new OpeningStreaks();
  duo.setPlayers(2); duo.observe('a',0); duo.observe('b',0);
  duo.observe('b',1,0); duo.observe('a',1,100000); duo.observe('a',2,200000);
  let recap = duo.recap([{id:'a',name:'a',chests:2},{id:'b',name:'b',chests:1}]);
  assert.deepEqual(recap.map(p=>[p.id,p.first,p.last]),[['a',false,true],['b',true,false]]);
  duo.observe('a',1,300000); duo.observe('a',0,300000);   // a takes back both openings
  recap = duo.recap([{id:'a',name:'a',chests:0},{id:'b',name:'b',chests:1}]);
  assert.deepEqual(recap.map(p=>[p.id,p.first,p.last]),[['b',true,true],['a',false,false]]);
  const solo = new OpeningStreaks();
  solo.setPlayers(1); solo.observe('a',0); solo.observe('a',3,0);
  assert.deepEqual(solo.recap([{id:'a',name:'a',chests:3}]).map(p=>[p.first,p.last]),[[false,false]]);
});

test('party sync merges signed games: yours into history and renumbered, others into shared, never twice', () => {
  const { mergeSignedMatches, proofChunks, matchLeaderboards } = require('./match');
  const result = (id, end, players) => ({ v:2, id, start:end - 600000, end, size:players.length, players });
  const proofOf = r => ({ data:JSON.stringify(r), sig:'sig-' + r.id });
  const mine = { n:1, start:0, end:1e6, chests:10, teamChests:10, recap:[{ id:'me', name:'Me', chests:10 }] };
  const s = { history:[mine], shared:[], matches:1, cpmFrom:0 };
  const played = result('m1', 5e5, [{ id:'me', name:'Me', chests:8, points:3 }, { id:'b', name:'B', chests:12, points:4, first:true }]);
  const without = result('m2', 9e5, [{ id:'b', name:'B', chests:20, points:6 }, { id:'c', name:'C', chests:2, points:1 }]);
  const items = [played, without, { ...played }].map(r => ({ proof:proofOf(r), result:r }));
  items.push({ proof:{ data:'{}', sig:'bad' }, result:null });               // failed verification
  assert.deepEqual(mergeSignedMatches(s, items, 'me'),{ mine:1, others:1 });
  assert.deepEqual(s.history.map(m => [m.n, m.chests, !!m.synced]),[[1,8,true],[2,10,false]]);
  assert.equal(s.matches,2);
  assert.equal(s.shared.length,1); assert.equal(s.shared[0].chests,0);
  assert.deepEqual(mergeSignedMatches(s, items, 'me'),{ mine:0, others:0 }, 'already known');
  assert.ok(s.history[0].recap.find(p => p.id === 'b').first);
  const chunks = proofChunks(s, 1);                                   // tiny limit: one proof per chunk
  assert.deepEqual(chunks.map(c => c.length),[1,1]);
  const verified = m => { try { return JSON.parse(m.proof.data); } catch { return null; } };
  const all = matchLeaderboards(s.history.concat(s.shared), verified)[4];
  assert.equal(all.played.find(p => p.id === 'b').matches,2);
  assert.equal(all.points.find(p => p.id === 'b').points,10);
});

// ---------- Streaks: everyone at once, timed, the biggest live one leads ----------
const sec = n => n * 1000;
function duo(ids = ['a', 'b']) { const s = new OpeningStreaks(); s.setPlayers(ids.length); for (const id of ids) s.observe(id, 0, 0); return s; }
function open(s, id, at) { s.observe(id, (s.counts.get(id) || 0) + 1, at); }

test('everyone runs their own streak at once; a gap past the window starts you over', () => {
  const s = duo();
  open(s,'a',sec(0)); open(s,'a',sec(10));          // a: 2, leads (window 60s)
  open(s,'b',sec(5)); open(s,'b',sec(15));          // b: 2 at the same time, ties stay with a
  assert.equal(s.current('a',sec(16)),2); assert.equal(s.current('b',sec(16)),2);
  assert.equal(s.leader(sec(16)),'a');
  assert.equal(s.leader(sec(99)),'b', "a's 60s ran out at 70s; b's 90s runs to 105s");
  open(s,'a',sec(100));
  assert.equal(s.current('a',sec(100)),0, 'a starts over at 1');
  assert.equal(s.current('b',sec(100)),2);
  assert.equal(s.current('b',sec(106)),0, 'b ran out at 105s');
  assert.equal(s.leader(sec(106)),null);
  assert.equal(s.longest('a'),2); assert.equal(s.longest('b'),2);
});

test('the leader always has 60s between chests; everyone else has 90s', () => {
  const { streakWindow } = require('./match');
  assert.deepEqual([[2,false],[40,false],[2,true],[10,true],[80,true]].map(([n, lead]) => streakWindow(n, lead) / 1000),[90,90,60,60,60]);
  const steady = duo();
  for (let i = 0; i < 30; i++) open(steady,'a',sec(i * 59));   // a chest every 59s keeps a lead going
  assert.equal(steady.longest('a'),30);
  const slow = duo();
  for (let i = 0; i < 30; i++) open(slow,'a',sec(i * 61));     // 61s gaps: fine at 1, but a leader at 2 gets only 60s
  assert.equal(slow.longest('a'),2);
  const chase = duo();
  for (let i = 0; i < 12; i++) open(chase,'a',sec(i * 50));    // a leads with 50s gaps
  for (let i = 0; i < 6; i++) open(chase,'b',sec(5 + i * 80)); // b trails with 80s gaps, inside its 90s
  assert.equal(chase.current('b',sec(405)),6); assert.equal(chase.leader(sec(405)),'a');
});

test('passing the leader drops them to 0, so they cannot take it straight back', () => {
  const s = duo();
  open(s,'a',sec(0)); open(s,'a',sec(1)); open(s,'a',sec(2));      // a leads at 3
  open(s,'b',sec(3)); open(s,'b',sec(4)); open(s,'b',sec(5)); open(s,'b',sec(6));   // b passes at 4
  assert.equal(s.leader(sec(6)),'b');
  assert.equal(s.current('a',sec(6)),0, 'a was passed: back to 0');
  open(s,'a',sec(7));
  assert.equal(s.current('a',sec(7)),0, 'one more chest is a fresh 1, not a 4');
  open(s,'a',sec(8));
  assert.equal(s.current('a',sec(8)),2); assert.equal(s.leader(sec(8)),'b');
  assert.equal(s.longest('a'),3, 'the best streak is kept');
});

test('passing the leader takes the lead; the streak bonus only counts while you lead', () => {
  const { openingPoints } = require('./match');
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, a + ' != ' + b);
  near(openingPoints(0,1),0.25); near(openingPoints(2,2),0.6); near(openingPoints(3,3),0.975); near(openingPoints(0,9),1);
  const s = duo();
  open(s,'a',sec(1)); open(s,'a',sec(2)); open(s,'a',sec(3));          // 0.5, lead at 2 (0.6), 3 (0.65)
  open(s,'b',sec(4)); open(s,'b',sec(5)); open(s,'b',sec(6));          // 0.5 each: b trails, then ties
  assert.equal(s.leader(sec(6)),'a', 'a tie stays with the leader');
  open(s,'b',sec(7));                                                   // b passes: 4 while leading, (0.25+0.1)x2
  assert.equal(s.leader(sec(7)),'b');
  assert.equal(s.score('a'),1.75 + 2, 'plus the first chest, x2');
  assert.equal(s.score('b'),1.5 + 0.7 + 2, 'plus the last chest, x2');
  open(s,'b',sec(8)); s.observe('b',4,sec(8));                          // a correction takes one back
  assert.equal(s.current('b',sec(8)),4);
});

test('corrections, baselines and resets: only openings seen live count, and fixes stay exact', () => {
  const s = new OpeningStreaks();
  s.setPlayers(2);
  s.observe('a',20,0); s.observe('b',10,0);                             // baselines: chests from before do not count
  s.observe('a',23,sec(1));                                             // three at once: a streak of 3
  assert.equal(s.current('a',sec(1)),3); assert.equal(s.current('b',sec(1)),0);
  s.observe('a',22,sec(2));                                             // correction
  assert.equal(s.current('a',sec(2)),2); assert.equal(s.longest('a'),2);
  assert.deepEqual(s.live([{id:'a'},{id:'b'}],sec(2)).map(p=>[p.streak,p.lead,p.streakWindow]),[[2,true,60000],[0,false,0]]);
  assert.equal(s.nextExpiry(sec(2)),sec(1) + 60000);
  s.reset(); s.observe('a',0,0); s.observe('a',2,sec(1));
  assert.equal(s.longest('a'),2);
});

test('solo games have personal streaks but no streak bonus and no saved solo streak', () => {
  const s = new OpeningStreaks();
  s.setPlayers(1); s.observe('a',0,0);
  for (let i = 1; i <= 6; i++) s.observe('a',i,sec(i));
  assert.equal(s.current('a',sec(6)),6);
  assert.equal(s.score('a'),1.5, 'six chests at 0.25, no bonus, no awards');
  assert.equal(recapPlayers([{name:'Solo',bestStreak:99}])[0].bestStreak,0);
  s.setPlayers(2); s.observe('b',0,sec(7));
  assert.equal(s.current('a',sec(7)),0, 'going from solo to a party starts streaks over');
});
