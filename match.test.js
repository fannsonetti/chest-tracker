const test = require('node:test');
const assert = require('node:assert/strict');
const { OpeningStreaks } = require('./match');
const { recapDetails } = require('./match');
const { matchLeaderboards, recapPlayers, recapStages } = require('./match');

test('leaderboards separate roster sizes, keep personal match bests and count solo streaks', () => {
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
  assert.equal(boards[0].chests[0].chests,20); assert.equal(boards[0].streaks[0].bestStreak,20);
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
test('one or two openings are not a streak; three in a row starts one', () => {
  const s = new OpeningStreaks();
  s.observe('a',0); s.observe('b',0);
  s.observe('a',1); s.observe('a',2); assert.equal(s.current('a'),0); assert.equal(s.longest('a'),0);
  s.observe('a',3); assert.equal(s.current('a'),3);
  assert.deepEqual(recapPlayers([{name:'a',chests:1,bestStreak:2},{name:'b',chests:1,bestStreak:3}]).map(p=>p.bestStreak),[0,3]);
});

test('recap stages show one category each and skip squad-only stages when solo', () => {
  const match = { n:4, start:0, end:120000, teamChests:5,
    recap:[{id:'me',name:'Me',chests:3,bestStreak:3},{id:'b',name:'<b>',chests:2,bestStreak:1}],
    timeline:[{id:'me',n:3,at:30000},{id:'b',n:3,at:90000}] };
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
  assert.deepEqual(frames.map(f => [f.t, f.counts.me, f.counts.b]),[[0.25,3,0],[0.75,3,3]]);
  assert.deepEqual(frames[0].notes.map(n => n.kind),['first','streak']);
  assert.deepEqual(frames[1].notes.map(n => n.kind),['streak','last'], "me's 45s ran out at 1:15, so b's 3 leads");
  assert.deepEqual(recapStages({ start:0, end:0, recap:[{id:'me',name:'Me',chests:0}] }, 'me').map(s=>s.key),['total','streaks']);
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
  assert.equal(c.matches,3); assert.equal(c.chests,37); assert.equal(c.best,20); assert.equal(c.streak,7, 'the solo game streak counts');
  assert.equal(c.mvps,1); assert.equal(c.modes[0].matches,1); assert.equal(c.modes[0].streak,7);
  assert.equal(c.perMin,1.5); assert.equal(c.recent.length,3);
});

test('streak colours: red 3, orange 10, yellow 20, blue 30, purple 40, Aurora 50, Quasar 75, Singularity 100', () => {
  const { streakTier, tierRank, TIER_ORDER, TIER_MIN, TIER_LABEL } = require('./match');
  assert.deepEqual([3, 9, 10, 20, 30, 40, 49, 50, 74, 75, 99, 100, 300].map(streakTier),
    ['red','red','orange','yellow','blue','purple','purple','aurora','aurora','quasar','quasar','singularity','singularity']);
  assert.deepEqual(TIER_ORDER,['red','orange','yellow','blue','purple','aurora','quasar','singularity']);
  assert.deepEqual(TIER_ORDER.map(t => TIER_LABEL[t]),['Ember','Flare','Solar','Plasma','Nebula','Aurora','Quasar','Singularity']);
  assert.equal(TIER_MIN.red,3); assert.equal(TIER_MIN.singularity,100);
  // No streak ranks below Ember, so reaching 3 is a new colour; 0 -> 100 at once is one step to the top.
  assert.deepEqual([0, 2, 3, 10, 100].map(tierRank), [-1, -1, 0, 1, 7]);
});

test('boards filter by period and rank CPM by chests over played minutes; career counts flame milestones', () => {
  const { careerStats } = require('./match');
  const game = (end, minutes, chests, bestStreak) => ({ start:end - minutes * 60000, end, teamSize:2,
    recap:[{ id:'me', name:'me', chests, bestStreak }, { id:'b', name:'b', chests:5, bestStreak:0 }] });
  const history = [game(1e9, 10, 30, 12), game(2e9, 5, 30, 32)];
  const all = matchLeaderboards(history)[1];
  assert.equal(all.cpm[0].id,'me'); assert.equal(all.cpm[0].cpm,4);          // 60 chests in 15 minutes
  assert.equal(matchLeaderboards(history, null, 1.5e9)[1].cpm[0].cpm,6);     // only the later game
  const c = careerStats(history, 'me');
  assert.deepEqual(c.milestones.map(m => m.matches),[2,2,1,1,0,0,0,0]);
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
  open(s,'a',sec(0)); open(s,'a',sec(5)); open(s,'a',sec(10));   // a: 3, leads (window 45s)
  open(s,'b',sec(3)); open(s,'b',sec(9)); open(s,'b',sec(15));   // b ties at 3 later: b takes the lead, and Ember a ends
  assert.equal(s.current('a',sec(16)),0); assert.equal(s.current('b',sec(16)),3);
  assert.equal(s.leader(sec(16)),'b');
  assert.equal(s.current('b',sec(58)),3);
  assert.equal(s.current('b',sec(61)),0, 'b ran out at 60s');
  assert.equal(s.leader(sec(61)),null);
  assert.equal(s.longest('a'),3); assert.equal(s.longest('b'),3);
});

test('the streak window is 45s and shrinks with every flame colour', () => {
  const { streakWindow } = require('./match');
  assert.deepEqual([3,9,10,20,30,40,50,75,100].map(n => streakWindow(n) / 1000),[45,45,30,22,18,15,12,10,8]);
  const steady = duo();
  for (let i = 0; i < 12; i++) open(steady,'a',sec(i * 29));   // 29s gaps hold through orange
  assert.equal(steady.longest('a'),12);
  const slow = duo();
  for (let i = 0; i < 30; i++) open(slow,'a',sec(i * 40));     // 40s gaps: fine below 10, too slow at orange
  assert.equal(slow.longest('a'),10);
});

test('being passed drops you to the tier below; passing back retakes the lead', () => {
  const { droppedStreak } = require('./match');
  assert.deepEqual([2,3,9,10,19,20,25,49,50,75,99,100,140].map(droppedStreak),[0,0,0,3,3,10,10,30,40,50,50,75,75]);
  const s = duo();
  for (let i=0; i<20; i++) open(s,'a',sec(i));                       // a leads at Solar 20
  for (let i=0; i<21; i++) open(s,'b',sec(20+i));                    // b passes at 21
  assert.equal(s.leader(sec(40)),'b');
  assert.equal(s.current('a',sec(40)),10, 'Solar drops to 10');
  assert.deepEqual(s.streakOf('a',sec(40)), { n:10, left:29000, window:30000 }, 'with a fresh Flare window, started when b tied at 20');
  open(s,'a',sec(41)); assert.equal(s.current('a',sec(41)),11, 'and climbs on from there');
  const e = duo();
  open(e,'a',sec(0)); open(e,'a',sec(1)); open(e,'a',sec(2));      // a leads at Ember 3
  for (let i=0; i<4; i++) open(e,'b',sec(3+i));                      // b passes at 4
  assert.equal(e.current('a',sec(6)),0, 'Ember has no tier below: it ends');
  for (let i=0; i<5; i++) open(e,'a',sec(7+i));
  assert.equal(e.leader(sec(11)),'a', 'a passes back');
  assert.equal(e.current('b',sec(11)),0);
});

test('passing the leader takes the lead; the streak bonus only counts while you lead', () => {
  const { openingPoints } = require('./match');
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, a + ' != ' + b);
  near(openingPoints(0,1),0.25); near(openingPoints(2,2),0.5); near(openingPoints(3,2),0.65); near(openingPoints(3,3),0.975); near(openingPoints(0,9),1);
  const s = duo();
  open(s,'a',sec(1)); open(s,'a',sec(2)); open(s,'a',sec(3));          // 0.5, 0.5, then a streak of 3 leads (0.65)
  open(s,'b',sec(4)); open(s,'b',sec(5)); open(s,'b',sec(6));          // 0.5 each: b trails, then ties and takes the lead
  assert.equal(s.leader(sec(6)),'b', 'a tie goes to whoever got there last');
  near(s.score('a',sec(6)),1.65 + 2 + 0.03, 'plus the first chest x2, plus 3s leading at 0.01/s x1 other player');
  near(s.score('b',sec(6)),1 + 0.65 + 2, 'plus the last chest, x2');
  near(s.score('b',sec(16)),3.65 + 0.1, 'b earns while leading');
  near(s.score('b',sec(99)),3.65 + 0.45, 'until the streak runs out');
  s.stop(sec(11)); near(s.score('b',sec(99)),3.65 + 0.05, 'and stops when the match ends');
  open(s,'b',sec(7)); s.observe('b',3,sec(7));                          // a correction takes one back
  assert.equal(s.current('b',sec(7)),3);
});

test('corrections, baselines and resets: only openings seen live count, and fixes stay exact', () => {
  const s = new OpeningStreaks();
  s.setPlayers(2);
  s.observe('a',20,0); s.observe('b',10,0);                             // baselines: chests from before do not count
  s.observe('a',23,sec(1));                                             // three at once: a streak of 3
  assert.equal(s.current('a',sec(1)),3); assert.equal(s.current('b',sec(1)),0);
  s.observe('a',24,sec(2));                                             // a fourth
  s.observe('a',23,sec(3));                                             // correction
  assert.equal(s.current('a',sec(3)),3); assert.equal(s.longest('a'),3);
  assert.deepEqual(s.live([{id:'a'},{id:'b'}],sec(3)).map(p=>[p.streak,p.lead,p.streakWindow]),[[3,true,45000],[0,false,0]]);
  assert.equal(s.nextExpiry(sec(3)),sec(1) + 45000);
  s.reset(); s.observe('a',0,0); s.observe('a',3,sec(1));
  assert.equal(s.longest('a'),3);
});

test('solo games have personal streaks that are saved, but no streak bonus', () => {
  const s = new OpeningStreaks();
  s.setPlayers(1); s.observe('a',0,0);
  for (let i = 1; i <= 6; i++) s.observe('a',i,sec(i));
  assert.equal(s.current('a',sec(6)),6);
  assert.equal(s.score('a'),1.5, 'six chests at 0.25, no bonus, no awards');
  assert.equal(recapPlayers([{name:'Solo',bestStreak:99}])[0].bestStreak,99);
  assert.equal(s.live([{id:'a'}],sec(6))[0].bestStreak,6);
  s.setPlayers(2); s.observe('b',0,sec(7));
  assert.equal(s.current('a',sec(7)),0, 'going from solo to a party starts streaks over');
});
