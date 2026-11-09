const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync('index.html', 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
function tracker() {
  let onNet;
  const element = { hidden:true, style: { setProperty() {} }, classList: { toggle() {} } };
  const elements = new Map();
  const context = vm.createContext({
    window: { api: { onAction() {}, onNet(cb) { onNet = cb; }, netState() {} }, addEventListener() {} },
    document: { getElementById(id) { if (!elements.has(id)) elements.set(id, { ...element }); return elements.get(id); }, querySelectorAll() { return []; }, addEventListener() {} },
    localStorage: { getItem() { return null; }, setItem() {} },
    setInterval() {},
    requestAnimationFrame() {},
  });
  vm.runInContext(fs.readFileSync('match.js', 'utf8'), context);
  vm.runInContext(source.replace(/render\(\);\s*applyKeys\(\);\s*$/, '') + '\nrender = () => { save(); pushNet(); };', context);
  vm.runInContext('s.recaps = false', context);
  return {
    run: code => vm.runInContext(code, context),
    roster: players => onNet({ status: 'client', players }),
    counts: () => JSON.parse(vm.runInContext('JSON.stringify([s.chests, s.teamChests, s.cur.chests, s.cur.teamChests])', context)),
    off: () => onNet({ status: 'off', players: [] }),
  };
}
const peer = (chests, matchStart = 100) => ({ id: 'teammate', name: 'Friend', chests, teamChests: chests, matchStart });
test('joining a teammate with 120 chests keeps my 70 and counts only subsequent openings', () => {
  const t = tracker();
  t.run("bump('teamChests', 70)");
  t.roster([peer(120)]);
  assert.deepEqual(t.counts(), [0, 70, 0, 70]);
  t.roster([{ ...peer(121), teamChests: 999 }]);
  assert.deepEqual(t.counts(), [0, 71, 0, 71]);
  t.roster([{ ...peer(121), teamChests: 1000 }]);
  assert.deepEqual(t.counts(), [0, 71, 0, 71]);
  t.roster([peer(120)]);
  assert.deepEqual(t.counts(), [0, 70, 0, 70]);
});
test('reconnecting excludes openings while away', () => {
  const t = tracker();
  t.roster([peer(2)]);
  t.roster([peer(3)]);
  t.off();
  t.roster([peer(20)]);
  assert.deepEqual(t.counts(), [0, 1, 0, 1]);
  t.roster([peer(21)]);
  assert.deepEqual(t.counts(), [0, 2, 0, 2]);
});
test('a teammate leaving and rejoining establishes a fresh baseline', () => {
  const t = tracker();
  t.roster([peer(2)]);
  t.roster([peer(3)]);
  t.roster([]);
  t.roster([peer(10)]);
  t.roster([peer(11)]);
  assert.deepEqual(t.counts(), [0, 2, 0, 2]);
});
test('teammate match resets preserve totals and count new openings', () => {
  const t = tracker();
  t.roster([peer(3)]);
  t.roster([peer(4)]);
  t.roster([peer(0, 200)]);
  assert.deepEqual(t.counts(), [0, 1, 0, 1]);
  t.roster([peer(1, 200)]);
  assert.deepEqual(t.counts(), [0, 2, 0, 2]);
});
test('local match end logs observed team chests and resets the match baseline', () => {
  const t = tracker();
  t.roster([peer(3)]);
  t.roster([peer(6)]);
  t.run('finishMatch()');
  assert.equal(t.run('s.history[0].teamChests'), 3);
  t.roster([peer(6)]);
  t.roster([peer(5)]);
  assert.deepEqual(t.counts(), [0, 3, 0, 0]);
  t.roster([peer(6)]);
  assert.deepEqual(t.counts(), [0, 4, 0, 1]);
});
test('own roster entry is ignored and multiple teammates contribute independently', () => {
  const t = tracker();
  const id = t.run('s.id');
  t.run("bump('chests', 1)");
  t.roster([{ ...peer(10), id }, peer(2), { ...peer(4), id: 'other' }]);
  t.roster([{ ...peer(11), id }, peer(3), { ...peer(6), id: 'other' }]);
  assert.deepEqual(t.counts(), [1, 4, 1, 4]);
});
test('session rates include personal and observed teammate chests and completed matches only', () => {
  const t = tracker();
  t.run('session.start = 1000');
  t.run("bump('chests', 2)");
  t.roster([peer(120)]);
  t.roster([peer(123)]);
  t.run('finishMatch()');
  t.run("bump('chests', 1)");
  const stats = JSON.parse(t.run('JSON.stringify(Object.fromEntries(sessionStats(3601000)))'));
  assert.deepEqual(stats, {
    Duration: '01:00:00', 'Your chests': 3, 'Team chests': 6,
    'Your chests / hour': '3.0', 'Team chests / hour': '6.0',
    'Completed matches': 1, 'Team chests / match': '5.00',
  });
});
test('new session preserves lifetime counts and teammate baselines', () => {
  const t = tracker();
  t.roster([peer(120)]);
  t.roster([peer(123)]);
  t.run('session = newSession()');
  t.roster([peer(124)]);
  assert.deepEqual(t.counts(), [0, 4, 0, 4]);
  assert.equal(t.run('session.teamChests'), 1);
  assert.equal(t.run('session.matches'), 0);
  assert.equal(t.run("Object.fromEntries(sessionStats(session.start))['Team chests / hour']"), '–');
});

test('scoreboard ranks current personal counts and replaces stale local network data', () => {
  const t = tracker();
  t.run("bump('chests', 5)");
  const id = t.run('s.id');
  t.roster([{ ...peer(99), id }, peer(6), { ...peer(2), id:'other' }]);
  assert.deepEqual(JSON.parse(t.run('JSON.stringify(rankedPlayers().map(p => p.chests))')), [6, 5, 2]);
  t.run('renderRoster()');
  assert.equal(t.run("$('roster').innerHTML.includes('Party · personal chests')"), false);
  assert.equal(t.run("$('roster').innerHTML.includes('class=\"crown\"')"), true);
  assert.equal(t.run("$('roster').innerHTML.includes('Personal 5, team 5')"), false);
  assert.equal(t.run("$('roster').innerHTML.includes('Inactive opening streak: 0')"), true);
  t.run("bump('chests', 2); renderRoster()");
  assert.equal(t.run('rankedPlayers()[0].id === s.id'), true);
  assert.equal(t.run("$('roster').innerHTML.includes('p me leader')"), true);
});

test('the roster uses the authoritative active streak, with no per-player token chance', () => {
  const t = tracker();
  t.run("bump('chests',5)");
  const id=t.run('s.id');
  t.roster([{...peer(5),id,streak:3},{...peer(9),streak:0}]);
  t.run('renderRoster()');
  assert.equal(t.run("$('roster').innerHTML.includes('streak active')"),true);
  assert.equal(t.run("$('roster').innerHTML.includes('Active opening streak: 3')"),true);
  assert.equal(t.run("($('roster').innerHTML.match(/class=\"streak/g)||[]).length"),1);
  assert.equal(t.run("$('roster').innerHTML.includes('Inactive opening streak')"),false);
  assert.equal(t.run("$('roster').innerHTML.includes('Token')"),false);
  t.roster([{...peer(5),id,streak:0},{...peer(10),streak:1}]);
  assert.equal(t.run('rankedPlayers().find(p=>p.id===s.id).streak'),0);
  t.run('renderRoster()');
  assert.equal(t.run("($('roster').innerHTML.match(/class=\"streak/g)||[]).length"),1);
  assert.equal(t.run("$('roster').innerHTML.includes('Active opening streak: 1')"),true);
});

test('only one crown is shown for tied leaders and no crown is shown before any openings', () => {
  const t=tracker();
  t.run('renderRoster()');
  assert.equal(t.run("$('roster').innerHTML.includes('class=\"crown\"')"),false);
  t.run("bump('chests',5)");
  t.roster([peer(5)]);
  t.run('renderRoster()');
  assert.equal(t.run("($('roster').innerHTML.match(/class=\"crown\"/g)||[]).length"),1);
  assert.equal(t.run("($('roster').innerHTML.match(/class=\"streak/g)||[]).length"),1);
});

test('overtake notifications fire on crossings, excluding joins, repeats and match resets', () => {
  const t = tracker();
  t.run("bump('chests', 5)");
  t.roster([peer(5)]);
  assert.equal(t.run('noticeUntil'), 0);
  t.roster([peer(6)]);
  assert.equal(t.run("$('notice').textContent"), 'Friend overtook you');
  assert.ok(t.run('noticeUntil > Date.now()'));
  t.run('noticeUntil = 0');
  t.roster([peer(7)]);
  assert.equal(t.run('noticeUntil'), 0);
  t.roster([peer(8, 200)]);
  assert.equal(t.run('noticeUntil'), 0);
  t.off();
  t.roster([peer(20)]);
  assert.equal(t.run('noticeUntil'), 0);
});

test('guests cannot end a party match; shared match events reset once and preserve the supplied streak', () => {
  const t = tracker();
  t.run("bump('chests', 4)");
  t.roster([peer(2)]);
  t.run('endMatch()');
  assert.equal(t.run('s.matches'),0);
  t.run("finishMatch({id:'match-one',end:200,players:[{id:s.id,name:'You',chests:4,bestStreak:3},{id:'teammate',name:'Friend',chests:2,bestStreak:2}]})");
  assert.equal(t.run('s.matches'),1);
  assert.equal(t.run('s.history[0].recap[0].bestStreak'),3);
  assert.equal(t.run('s.cur.chests'),0);
  t.run("finishMatch({id:'match-one',end:200,players:[]})");
  assert.equal(t.run('s.matches'),1);
});
