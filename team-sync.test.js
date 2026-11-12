const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync('index.html', 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
function tracker() {
  let onNet, pollStreak;
  const element = { hidden:true, style: { setProperty() {} }, classList: { toggle() {} } };
  const elements = new Map();
  const context = vm.createContext({
    window: { api: { onAction() {}, onNet(cb) { onNet = cb; }, netState() {} }, addEventListener() {} },
    document: { getElementById(id) { if (!elements.has(id)) elements.set(id, { ...element }); return elements.get(id); }, querySelectorAll() { return []; }, querySelector() { return { classList: { toggle() {} } }; }, addEventListener() {} },
    localStorage: { getItem() { return null; }, setItem() {} },
    setInterval(fn, ms) { if (ms === 500) pollStreak = fn; },
    setTimeout() { return 0; },
    clearTimeout() {},
    requestAnimationFrame() {},
  });
  vm.runInContext(fs.readFileSync('match.js', 'utf8'), context);
  vm.runInContext(source.replace(/render\(\);\s*applyKeys\(\);\s*$/, '') + '\nrender = () => { save(); pushNet(); };', context);
  vm.runInContext('s.recaps = false', context);
  return {
    run: code => vm.runInContext(code, context),
    roster: players => onNet({ status: 'client', players }),
    pollStreak: () => pollStreak(),
    counts: () => JSON.parse(vm.runInContext('JSON.stringify([s.chests, s.teamChests, s.cur.chests, s.cur.teamChests])', context)),
    off: () => onNet({ status: 'off', players: [] }),
  };
}
const peer = (chests, matchStart = 100) => ({ id: 'teammate', name: 'Friend', chests, teamChests: chests, matchStart });

test('subtraction is limited to the current match and team chests cannot be added by hand', () => {
  const t = tracker();
  t.run("bump('chests', 5); bump('teamChests', 3); s.cur.start = Date.now() - 200000; finishMatch(); bump('chests', -1)");
  assert.deepEqual(t.counts(),[5,5,5,5]);
  t.run("newGame(); bump('chests', -1); bump('teamChests', -1)");
  assert.deepEqual(t.counts(),[5,5,0,0]);
  t.run("bump('chests', 2); bump('teamChests', 4); bump('chests', -99)");
  assert.deepEqual(t.counts(),[5,5,0,0]);
  assert.equal(t.run('s.history[0].chests'),5);
  assert.equal(t.run('s.history[0].teamChests'),5);
  assert.equal(t.run('session.chests'),5);
  assert.equal(t.run('session.teamChests'),5);
  assert.equal(t.run("KEYS.some(k => k.a.startsWith('team')) || 'teamUp' in s.keys"),false);
});

test('valid mouse and hotkey count changes play a click; rejected subtraction and muted changes do not', () => {
  const t = tracker();
  t.run('window.clicks = 0; window.playTrackerClick = () => window.clicks++');
  t.run("bump('chests', 1); bump('chests', -1); bump('chests', -1)");
  assert.equal(t.run('window.clicks'),2);
  t.run("s.sound = false; bump('chests', 1)");
  assert.equal(t.run('window.clicks'),2);
});

test('teammate corrections cannot subtract completed match totals', () => {
  const t = tracker();
  t.roster([peer(0)]); t.roster([peer(7)]);
  t.run('s.cur.start = Date.now() - 200000; finishMatch(); startGame(200)');
  t.roster([peer(0,200)]); t.roster([peer(3,200)]); t.roster([peer(0,200)]);
  assert.deepEqual(t.counts(),[0,7,0,0]);
  t.roster([peer(1,200)]);
  assert.deepEqual(t.counts(),[0,8,0,1]);
});

test('match summary is sent to the popup after freezing the match, without changing the next match', () => {
  const t = tracker();
  t.run("s.recaps = true; window.api.showPopup = data => window.popup = data; bump('chests', 5); s.cur.start = Date.now() - 200000; finishMatch()");
  assert.equal(t.run('window.popup.kind'),'recap');
  assert.equal(t.run('window.popup.match.teamChests'),5);
  assert.equal(t.run('window.popup.match.recap[0].chests'),5);
  assert.equal(t.run('s.cur.chests'),5);
  t.run("bump('chests', -1)");
  assert.equal(t.run('s.cur.chests'),5);
  t.run("bump('chests', 1)");
  assert.equal(t.run('s.cur.chests'),1);
  assert.equal(t.run('window.popup.match.recap[0].chests'),5);
});
test('joining a teammate with 120 chests keeps my 70 and counts only subsequent openings', () => {
  const t = tracker();
  t.run("bump('chests', 70)");
  t.roster([peer(120)]);
  assert.deepEqual(t.counts(), [70, 70, 70, 70]);
  t.roster([{ ...peer(121), teamChests: 999 }]);
  assert.deepEqual(t.counts(), [70, 71, 70, 71]);
  t.roster([{ ...peer(121), teamChests: 1000 }]);
  assert.deepEqual(t.counts(), [70, 71, 70, 71]);
  t.roster([peer(120)]);
  assert.deepEqual(t.counts(), [70, 70, 70, 70]);
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
  t.roster([peer(9)]);
  t.run('s.cur.start = Date.now() - 200000; finishMatch()');
  assert.equal(t.run('s.history[0].teamChests'), 6);
  t.roster([peer(9)]);
  t.roster([peer(8)]);
  assert.deepEqual(t.counts(), [0, 6, 0, 0]);
  t.roster([peer(9)]);
  assert.deepEqual(t.counts(), [0, 7, 0, 1]);
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
  t.run('s.cur.start = Date.now() - 200000; finishMatch()');
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
  assert.equal(t.run("$('roster').innerHTML.includes('No streak')"), true);
  t.run("bump('chests', 2); renderRoster()");
  assert.equal(t.run('rankedPlayers()[0].id === s.id'), true);
  assert.equal(t.run("$('roster').innerHTML.includes('p me leader')"), true);
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
  t.run("finishMatch({id:'match-one',start:1,end:200001,players:[{id:s.id,name:'You',chests:4,bestStreak:3},{id:'teammate',name:'Friend',chests:2,bestStreak:2}]})");
  assert.equal(t.run('s.matches'),1);
  assert.equal(t.run('s.history[0].recap[0].bestStreak'),3);
  assert.equal(t.run('s.cur.chests'),4);
  t.run("finishMatch({id:'match-one',end:200,players:[]})");
  assert.equal(t.run('s.matches'),1);
});

test('ending a game freezes it until New game; guests wait for the host', () => {
  const t = tracker();
  t.run("s.cur.start = Date.now() - 200000; bump('chests', 5); finishMatch()");
  assert.ok(t.run('s.cur.ended'));
  assert.equal(t.run('s.matches'),1);
  t.run("bump('chests', -1); renderBar()");
  assert.deepEqual(t.counts(),[5,5,5,5]);
  assert.equal(t.run("$('matchNo').textContent"),'Game 1');
  assert.ok(t.run("$('matchNow').textContent").endsWith('· ended'));
  t.run('renderGameEnd()');
  assert.ok(t.run("$('gameEnd').innerHTML.includes('New game')"));
  t.run('endMatch()');
  assert.ok(!t.run('s.cur.ended'));
  assert.equal(t.run('s.matches'),1);
  t.run("bump('chests', 1)");
  assert.deepEqual(t.counts(),[6,6,1,1]);

  const g = tracker();
  g.run("bump('chests', 1)");
  g.roster([peer(2)]);
  g.run("finishMatch({id:'m',end:Date.now(),players:[{id:s.id,name:'You',chests:1},{id:'teammate',name:'Friend',chests:2}]})");
  g.run("net.ended = true; newGame(); renderGameEnd()");
  assert.ok(g.run('s.cur.ended'));
  assert.ok(g.run("$('gameEnd').innerHTML.includes('open a chest to start')"));
  g.run('startGame(500)');
  assert.equal(g.run('s.cur.start'),500);
  assert.equal(g.run('s.cur.ended'),undefined);
});

test('opening a chest after a game ends starts the next one', () => {
  const t = tracker();
  t.run("s.cur.start = Date.now() - 200000; bump('chests', 5); finishMatch()");
  assert.ok(t.run('s.cur.ended'));
  t.run("bump('chests', 1)");
  assert.ok(!t.run('s.cur.ended'));
  assert.equal(t.run('s.matches'),1);
  assert.deepEqual(t.counts(),[6,6,1,1]);

  // In a frozen party the opening asks the relay to start, then counts once it has.
  const g = tracker();
  g.roster([peer(2)]);
  g.run("finishMatch({id:'m',end:Date.now(),players:[{id:s.id,name:'You',chests:0},{id:'teammate',name:'Friend',chests:2}]})");
  g.run("net.ended = true; window.__sent = []; window.api.netNewMatch = o => window.__sent.push(o); bump('chests', 1)");
  assert.equal(g.run('JSON.stringify(window.__sent)'),'[true]');
  assert.ok(g.run('s.cur.ended'));
  g.run("net.ended = false; startGame(900); const open = pendingOpen; pendingOpen = null; bump(open.f, open.d)");
  assert.equal(g.run('s.cur.chests'),1);
  assert.equal(g.run('s.cur.start'),900);
});

test('games under 3 minutes or 5 chests are not saved, recapped or counted at all', () => {
  const t = tracker();
  t.run("s.recaps = true; window.__pops = []; window.api.showPopup = p => window.__pops.push(p.kind)");
  t.run("bump('chests', 30); finishMatch(); renderBar()");            // 30 chests in a few ms
  assert.equal(t.run('s.history.length'),0);
  assert.equal(t.run('s.matches'),0);
  assert.equal(t.run('JSON.stringify([s.chests, s.teamChests, session.chests, session.teamChests])'),'[0,0,0,0]', 'its chests come back off every total');
  assert.equal(t.run("$('matchNo').textContent"),'Game 1');
  assert.ok(t.run("$('matchNow').textContent").endsWith('· ready'));
  assert.ok(!t.run('window.__pops.includes("recap")'), 'no recap');
  t.run("bump('chests', 1)");
  assert.equal(t.run('s.cur.chests'),1, 'the next chest starts the next game');
  t.run("s.cur.start = Date.now() - 200000; bump('chests', 3); finishMatch()"); // long but 4 chests
  assert.equal(t.run('s.history.length'),0);
  t.run("newGame(); s.cur.start = Date.now() - 200000; bump('chests', 20); finishMatch()");
  assert.equal(t.run('s.matches'),1);
  assert.equal(t.run('JSON.stringify(s.history.map(m => m.n))'),'[1]');
  assert.equal(t.run('s.chests'),20);
  assert.deepEqual(JSON.parse(t.run('JSON.stringify(matchAverages(s.history))')),{ matches:1, own:20, team:20 });
});

test('after the recap finishes the HUD shows the next game at zero', () => {
  const t = tracker();
  t.roster([{ ...peer(0), streak:0 }]);
  t.roster([{ ...peer(9), streak:3 }]);
  t.run("s.cur.start = Date.now() - 200000; bump('chests', 25); finishMatch(); renderBar()");
  assert.equal(t.run("$('matchNo').textContent"),'Game 1');
  assert.equal(t.run('rankedPlayers().find(p => p.id === s.id).chests'),25);
  t.run('clearEnded(); renderBar()');
  assert.equal(t.run("$('matchNo').textContent"),'Game 2');
  assert.ok(t.run("$('matchNow').textContent").startsWith('00:00'));
  assert.deepEqual(JSON.parse(t.run('JSON.stringify(rankedPlayers().map(p => [p.chests, p.streak]))')),[[0,0],[0,0]]);
  assert.equal(t.run('s.history[0].chests'),25);                     // the saved game keeps its count
  t.run("bump('chests', 1)");
  assert.equal(t.run('s.cur.chests'),1);
});

test('upgrading renumbers saved games and derives the game counter from them', () => {
  const store = JSON.stringify({ v:2, matches:26, chests:1, history:[
    { n:1, start:0, end:600000, chests:20, teamChests:20, recap:[{ id:'me', name:'Me', chests:20 }] },
    { n:2, start:0, end:60000, chests:30, teamChests:30, recap:[{ id:'me', name:'Me', chests:30 }] },
    { n:3, start:0, end:600000, chests:3, teamChests:3, recap:[{ id:'me', name:'Me', chests:3 }] },
    { n:4, start:0, end:600000, chests:9, teamChests:40 },
    { n:5, start:0, end:600000, chests:22, teamChests:22, recap:[{ id:'me', name:'Me', chests:22 }] }] });
  const context = vm.createContext({
    window:{ api:{ onAction() {}, onNet() {}, netState() {} }, addEventListener() {} },
    document:{ getElementById() { return { hidden:true, style:{ setProperty() {} }, classList:{ toggle() {} } }; }, querySelectorAll() { return []; }, querySelector() { return { classList:{ toggle() {} } }; }, addEventListener() {} },
    localStorage:{ getItem() { return store; }, setItem() {} }, setInterval() {}, setTimeout() { return 0; }, clearTimeout() {}, requestAnimationFrame() {},
  });
  vm.runInContext(fs.readFileSync('match.js', 'utf8'), context);
  vm.runInContext(source.replace(/render\(\);\s*applyKeys\(\);\s*$/, '') + '\nrender = () => {};', context);
  assert.equal(vm.runInContext('s.matches', context),2);
  assert.equal(vm.runInContext('JSON.stringify(s.history.map(m => m.n))', context),'[1,2]', 'short and pre-recap games are removed');
  assert.equal(vm.runInContext('matchAverages(s.history).own', context),21);
});

test('passing your best counted game shows one personal best pill per game', () => {
  const t = tracker();
  t.run("window.__pops = []; window.api.showPopup = p => { if (p.kind === 'personalBest') window.__pops.push(p); }");
  t.run("s.history = [{ n:1, start:0, end:600000, chests:12, teamChests:12 }, { n:null, start:0, end:1000, chests:40, teamChests:40 }]");
  t.run("for (let i = 0; i < 12; i++) bump('chests', 1)");
  assert.equal(t.run('window.__pops.length'),0);                    // tying is not a best; the 40 was a short game
  t.run("bump('chests', 1); bump('chests', 1)");
  assert.equal(t.run('JSON.stringify(window.__pops.map(p => [p.kind, p.n, p.best]))'),'[["personalBest",13,12]]');
  t.run("s.bestPopups = false; startGame(Date.now()); for (let i = 0; i < 20; i++) bump('chests', 1)");
  assert.equal(t.run('window.__pops.length'),1);
});

test('passing the leaderboard best for your lobby size shows one record pill instead of a personal best', () => {
  const t = tracker();
  t.run("window.__pops = []; window.api.showPopup = p => { if (p.kind === 'personalBest') window.__pops.push(p); }");
  t.run("s.history = [{ n:1, start:0, end:600000, chests:8, teamChests:8, recap:[{ id:s.id, name:'Me', chests:8 }] }]");
  t.run("s.shared = [{ start:0, end:600000, chests:0, teamChests:15, recap:[{ id:'x', name:'Pro', chests:15 }] }]");
  t.run("for (let i = 0; i < 15; i++) bump('chests', 1)");
  assert.equal(t.run('JSON.stringify(window.__pops.map(p => [!!p.record, p.n]))'),'[[false,9]]', 'personal best first');
  t.run("bump('chests', 1); bump('chests', 1)");
  assert.equal(t.run('JSON.stringify(window.__pops.map(p => [!!p.record, p.n, p.best]))'),'[[false,9,8],[true,16,15]]');
});

test('meeting someone new in a room sends them our signed results once', () => {
  const t = tracker();
  t.run("window.__shared = []; window.api.netShare = p => window.__shared.push(p.length)");
  t.run("s.history = [{ n:1, start:0, end:600000, chests:9, teamChests:12, recap:[], proof:{ data:'{\"id\":\"m1\"}', sig:'x' } }, { n:2, start:0, end:700000, chests:9, teamChests:9, recap:[] }]");
  t.roster([peer(0)]);
  assert.equal(t.run('JSON.stringify(window.__shared)'),'[1]', 'only the signed game is sent');
  t.roster([peer(1)]);
  assert.equal(t.run('window.__shared.length'),1, 'not again for the same teammate');
  t.roster([peer(1), { id:'third', name:'Third', chests:0, matchStart:100 }]);
  assert.equal(t.run('window.__shared.length'),2, 'again when someone new joins');
  t.off(); t.roster([peer(1)]);
  assert.equal(t.run('window.__shared.length'),3, 'and after rejoining');
});


test('offline your own streak shows, with its timer across the top bar; a solo game saves its streak', () => {
  const t = tracker();
  t.run("bump('chests',1); bump('chests',1); bump('chests',1); renderRoster()");
  assert.equal(t.run('rankedPlayers()[0].streak'),3);
  assert.ok(t.run("$('roster').innerHTML.includes('streak active flicker tier-red lead')"));
  assert.equal(t.run("$('streakTimer').hidden"),false);
  t.run('s.cur.start = Date.now() - 200000; bump("chests", 2); finishMatch()');
  assert.equal(t.run('s.history[0].recap[0].bestStreak'),5);
  assert.equal(t.run('rankedPlayers()[0].streak'),0, 'no streak once the game is over');
});

test('in a party every streak shows, and only your own timer', () => {
  const t = tracker();
  const id = t.run('s.id');
  const third = { id:'third', name:'Third', chests:0, matchStart:100 };
  t.roster([{ ...peer(5), streak:5, streakLeft:30000, streakWindow:41000, lead:true }, { ...third, chests:4, streak:4, streakLeft:40000, streakWindow:45000, lead:false },
    { id, name:'You', chests:3, matchStart:100, streak:3, streakLeft:44000, streakWindow:45000, lead:false }]);
  t.run('renderRoster()');
  const html = t.run("$('roster').innerHTML");
  assert.ok(html.includes('Leading streak: 5"'), "the leader's timer is not shown");
  assert.match(t.run("$('streakTimer').title"),/within 44s/);
  assert.ok(html.includes('Your streak: 3'));
  assert.ok(html.includes("Third's streak: 4"), "a third player's streak shows too");
  assert.equal(t.run("($('roster').innerHTML.match(/class=\"streak active/g)||[]).length"),3);
  t.roster([{ ...peer(4), streak:4, streakLeft:-5, streakWindow:41000, lead:true }, { ...third, chests:3 }, { id, name:'You', chests:2, matchStart:100 }]);
  assert.equal(t.run("rankedPlayers().find(p => p.id === 'teammate').streak"),0, 'a run-out streak is gone even before the relay says so');
});

test('everyone sees the lead change hands; corrections, leaving and match resets do not', () => {
  const t = tracker();
  const id = t.run('s.id');
  t.run("window.popups = []; window.api.showPopup = p => p.kind === 'streakBroken' && window.popups.push(p)");   // takeovers only
  const me = (chests, extra = {}) => ({ id, name:'You', chests, matchStart:100, ...extra });
  const third = (chests, extra = {}) => ({ id:'third', name:'Third', chests, matchStart:100, ...extra });
  t.roster([me(0), peer(3), third(0)]);
  t.roster([me(0), { ...peer(3), streak:3, lead:true }, third(0)]);
  t.roster([me(0), { ...peer(3), streak:3 }, third(4, { streak:4, lead:true })]);   // Third passes Friend: I'm just watching
  assert.equal(t.run('window.popups.length'),1);
  assert.deepEqual(JSON.parse(t.run('JSON.stringify([window.popups[0].owner, window.popups[0].breaker, window.popups[0].n, window.popups[0].newN, window.popups[0].mine, window.popups[0].byMe])')),['Friend','Third',3,4,false,false]);
  t.roster([me(0), { ...peer(3), streak:3, lead:true }, third(3, { streak:3 })]);   // a correction hands it back: no popup
  assert.equal(t.run('window.popups.length'),1);
  t.roster([me(0), { ...peer(0, 200) }, third(0, { matchStart:200 })]);
  t.roster([me(0), { ...peer(0, 200) }, third(2, { matchStart:200, streak:2, lead:true })]);
  assert.equal(t.run('window.popups.length'),1, 'a new game is not a takeover');
  t.run('s.streakPopups = false');
  t.roster([me(3, { matchStart:200, streak:3, lead:true }), { ...peer(0, 200) }, third(2, { matchStart:200, streak:2 })]);
  assert.equal(t.run('window.popups.length'),1);
});

test('relays before 1.2.2 (one holder, no timers) still show the takeover', () => {
  const t = tracker();
  const id = t.run('s.id');
  t.run("window.popups = []; window.tiers = []; window.api.showPopup = p => (p.kind === 'streakTier' ? window.tiers : window.popups).push(p)");
  t.roster([{ id, name:'You', chests:0, matchStart:100 }, { ...peer(3), streak:3 }]);
  t.roster([{ id, name:'You', chests:3, matchStart:100, streak:3 }, { ...peer(3), streak:0 }]);
  assert.equal(t.run('window.popups.length'),1);
  assert.equal(t.run('window.popups[0].byMe'),true);
  assert.equal(t.run("window.tiers.map(p => p.tier).join()"),'red', 'reaching 3 reveals Ember');
});

test('a personal streak loss and lead handoff play one death in either order', () => {
  // Legacy sounds play the falling tone from here; redesigned ones play in the popup, with its scene.
  for (const [clockFirst, legacy] of [[false, true], [true, true], [false, false], [true, false]]) {
    const t = tracker();
    const id = t.run('s.id');
    t.run(`s.hidden = true; s.sound = true; s.cur.chests = 100; s.legacySounds = ${legacy};
      window.lossSounds = 0; window.playStreakLost = () => window.lossSounds++; window.notificationSound = () => window.lossSounds += 10;
      window.popups = []; window.api.showPopup = p => window.popups.push(p);`);
    const own = { id, name:'You', chests:100, matchStart:100, streak:100, streakLeft:8000, lead:true };
    const next = { ...peer(20), streak:20, streakLeft:16000, lead:false };
    t.roster([own, next]);
    t.pollStreak();
    if (clockFirst) {
      t.run('net.players.find(p => p.id === s.id).streakUntil = Date.now() - 1');
      t.pollStreak();
    }
    t.roster([{ ...own, streak:0, streakLeft:0, lead:false }, { ...next, lead:true }]);
    t.pollStreak();
    const popups = JSON.parse(t.run('JSON.stringify(window.popups)'));
    const handoff = popups.find(p => p.kind === 'streakBroken');
    assert.equal(handoff.lossAlreadyShown, clockFirst);
    assert.equal(handoff.dropTo, 0);
    assert.equal(handoff.n, 100);
    assert.equal(popups.filter(p => p.kind === 'streakLost').length, clockFirst ? 1 : 0);
    assert.equal(t.run('window.lossSounds'), legacy ? 1 : 0);
    assert.ok(popups.every(p => p.sound === true && p.legacySounds === legacy));
  }
});

test('a reveal shows when anyone reaches a new flame colour, once per climb', () => {
  const t = tracker();
  const id = t.run('s.id');
  t.run('window.popups = []; window.api.showPopup = p => window.popups.push(p)');
  const lead = (n, m = 100) => ({ ...peer(n, m), streak:n, streakLeft:30000, streakWindow:60000, lead:true });
  const me = (n, chests = 0) => ({ id, name:'You', chests, matchStart:100, streak:n, streakLeft:30000, streakWindow:90000, lead:false });
  const third = n => ({ id:'third', name:'Third', chests:n, matchStart:100, streak:n, streakLeft:30000, streakWindow:90000, lead:false });
  t.roster([lead(4), me(0), third(0)]);
  t.roster([lead(5), me(0), third(0)]);
  assert.equal(t.run('window.popups.length'),0);
  t.roster([lead(6), me(0), third(0)]);
  assert.equal(t.run('JSON.stringify(window.popups.map(p => [p.kind, p.name, p.n, p.from, p.tier, p.mine]))'),'[["streakTier","Friend",6,"red","orange",false]]');
  t.roster([lead(7), me(0), third(7)]);
  assert.equal(t.run('window.popups.length'),2, 'not again at 7; the third player reaching Flare shows');
  assert.equal(t.run('window.popups[1].name'),'Third');
  t.run('bump("chests", 0)');
  t.roster([lead(8), me(6, 10), third(7)]);
  assert.equal(t.run('window.popups.at(-1).mine'),true, 'your own climb shows too');
  t.roster([lead(10), me(0, 10), third(7)]);
  assert.equal(t.run('window.popups.at(-1).tier'),'yellow');
  assert.equal(t.run('window.popups.length'),4);
  t.roster([lead(0), me(0, 10), third(7)]); t.roster([lead(6), me(0, 10), third(7)]);
  assert.equal(t.run('window.popups.at(-1).before'),1, 'climbing to Flare again this game counts the first time');
});
