// The host's receipt order defines the order of simultaneous openings.
// Corrections remove the latest openings credited to that player.
//
// Streaks: every player runs their own streak at the same time.
// - Each opening within your window of your previous one adds 1 to your
//   streak; a longer gap starts you over at 1. MIN_STREAK or more is a streak.
// - Your window is STREAK_MS (45s) and shrinks with every flame colour
//   (TIER_MS), so long streaks take real pace.
// - Passing the leader's live streak takes the lead; the passed leader drops
//   to the start of the tier below (droppedStreak) and can win the lead back
//   by passing again. When the
//   leader's streak runs out, the biggest live streak left takes over. Ties
//   stay with the player who already leads.
// - A window is set by each opening: becoming leader without opening keeps
//   the deadline you already had.
const MIN_STREAK = 3;
const asStreak = n => n >= MIN_STREAK ? n : 0;
const STREAK_MS = 45000, TIER_MS = { red:STREAK_MS, orange:30000, yellow:22000, blue:18000, purple:15000, aurora:12000, quasar:10000, singularity:8000 };
const streakWindow = n => TIER_MS[streakTier(n)];
// Points: every opening scores POINTS_PER_CHEST, plus 10% per streak level
// only while you lead, times the lobby size when it was opened (solo 1x up to
// squads 4x). Solo games have no streak bonus.
//
// Holding the lead (party games only) also scores LEAD_POINTS_PER_SEC for
// every second you have the biggest live streak, times the other players in
// the lobby (none when solo).
//
// Awards (party games only): the game's first and last chest each score
// AWARD_POINTS times the lobby size. "Last" moves to whoever opens next.
const POINTS_PER_CHEST = 0.25;
// Results signed before 1.2.2 (v1) scored 10 per chest; they count at 1/40.
const LEGACY_POINT_SCALE = 1 / 40, POINTS_VERSION = 2;
// Streak tiers by length: Ember (red), Flare (orange), Solar (yellow), Plasma
// (blue) and Nebula (purple), then three rare ones: Aurora at 50 (flowing
// cyan-green light), Quasar at 75 (white-blue radiance round a spinning disk)
// and Singularity at 100 (a black flame traced by a white corona).
// TIER_ORDER runs lowest to highest. Their reveals live in milestones.js.
const STREAK_TIERS = [[100, 'singularity'], [75, 'quasar'], [50, 'aurora'], [40, 'purple'], [30, 'blue'], [20, 'yellow'], [10, 'orange']];
const TIER_ORDER = ['red', ...STREAK_TIERS.map(t => t[1]).reverse()];
const TIER_MIN = Object.fromEntries([[MIN_STREAK, 'red'], ...STREAK_TIERS].map(([n, t]) => [t, n]));
const TIER_LABEL = { red:'Ember', orange:'Flare', yellow:'Solar', blue:'Plasma', purple:'Nebula', aurora:'Aurora', quasar:'Quasar', singularity:'Singularity' };
const streakTier = n => (STREAK_TIERS.find(([min]) => n >= min) || [0, 'red'])[1];
// A streak's place in TIER_ORDER; -1 below MIN_STREAK, so reaching 3 is a step up to Ember.
const tierRank = n => n >= MIN_STREAK ? TIER_ORDER.indexOf(streakTier(n)) : -1;
// Overtaken: your streak falls to the start of the tier below yours (Solar 20+
// to 10, Quasar 75+ to 50). Ember has nothing below, so it ends.
const droppedStreak = n => { const r = tierRank(n); return r > 0 ? TIER_MIN[TIER_ORDER[r - 1]] : 0; };
const MAX_MULTIPLIER = 4, AWARD_POINTS = 1, LEAD_POINTS_PER_SEC = 0.01;
const multiplier = size => Math.max(1, Math.min(MAX_MULTIPLIER, Math.floor(size) || 1));
// `streak` is the opener's streak if they lead after this opening, else 0.
const openingPoints = (streak, size) =>
  (POINTS_PER_CHEST + POINTS_PER_CHEST * asStreak(streak) / 10) * multiplier(size);
// A game only counts (match numbers, averages, leaderboards, career) when it
// ran at least MIN_MATCH_MS and the team opened at least MIN_MATCH_CHESTS.
// Shorter games are still saved so their recap can be viewed.
const MIN_MATCH_MS = 3 * 60000, MIN_MATCH_CHESTS = 5;
function matchTeamChests(m) {
  const players = m?.recap || [];
  const team = m?.recapTeamTotal ?? m?.teamChests ?? players.reduce((n, p) => n + (Number(p.chests) || 0), 0);
  return Number(team) || 0;
}
function countedMatch(m) {
  if (!m) return false;
  const from = m.timelineStart || m.start;
  const timed = Number.isFinite(m.end) && Number.isFinite(from);
  return matchTeamChests(m) >= MIN_MATCH_CHESTS && (!timed || m.end - from >= MIN_MATCH_MS);
}
// Chests per match for the HUD: your own and the team's, over counted games
// that ended after `since` (Reset counts moves it). Same rule as the boards.
function matchAverages(history, since = 0) {
  const list = history.filter(m => countedMatch(m) && (m.end || 0) > since);
  const avg = key => list.length ? Math.round(list.reduce((n, m) => n + key(m), 0) / list.length * 10) / 10 : null;
  return { matches:list.length, own:avg(m => Number(m.chests) || 0), team:avg(matchTeamChests) };
}
// The game the HUD and options top bar name. `cleared` is the ended game once
// its recap has finished, so the HUD already shows the next game at zero.
function gameLabel(s) {
  return 'Game ' + ((s.matches || 0) + (s.cur?.ended && !s.cur.cleared ? 0 : 1));
}
// The leader at time `at`: the current leader while their streak is live,
// otherwise the biggest live streak (the one with more time left on a tie).
function leaderAt(runs, leader, at) {
  const alive = id => { const r = runs.get(id); return !!r && r.n >= MIN_STREAK && r.deadline >= at; };
  if (leader && alive(leader)) return leader;
  let top = null;
  for (const [id, r] of runs) {
    if (!alive(id)) continue;
    const t = top && runs.get(top);
    if (!t || r.n > t.n || (r.n === t.n && r.deadline > t.deadline)) top = id;
  }
  return top;
}
// Credit whoever leads from `from` to `to` with lead points, following the
// lead as streaks run out. Returns the leader at `to`.
function creditLead(runs, leader, from, to, size, score) {
  for (let t = from; t < to;) {
    leader = leaderAt(runs, leader, t);
    if (!leader) break;
    const end = Math.min(to, runs.get(leader).deadline);
    score(leader, (end - t) / 1000 * LEAD_POINTS_PER_SEC * (multiplier(size) - 1));
    t = end + 1;
  }
  return leader;
}
class OpeningStreaks {
  constructor() { this.reset(); }
  reset() { this.counts = new Map(); this.events = []; this.competitive = true; this.size = 1; this.segment = 0; this.stopAt = Infinity; this.replay(); }
  // A finished match stops scoring lead time at `at`.
  stop(at = Date.now()) { this.stopAt = at; }
  // Lobby size sets the points multiplier; more than one player is competitive.
  setPlayers(n) { this.size = Math.max(1, Math.floor(n) || 1); this.setCompetitive(this.size > 1); }
  setCompetitive(enabled) {
    if (this.competitive !== enabled) this.segment++;
    this.competitive = enabled;
    this.replay();
  }
  observe(id, count, at = Date.now()) {
    count = Math.max(0, Math.min(9999, Math.floor(Number(count) || 0)));
    const before = this.counts.get(id);
    this.counts.set(id, count);
    if (before === undefined) return;
    const delta = count - before;
    if (delta > 0) this.events.push({ id, n:delta, at, competitive:this.competitive, segment:this.segment, size:this.competitive ? this.size : 1 });
    else if (delta < 0) {
      let undo = -delta;
      for (let i=this.events.length-1; i>=0 && undo; i--) {
        if (this.events[i].id !== id) continue;
        const remove = Math.min(undo, this.events[i].n);
        this.events[i].n -= remove; undo -= remove;
      }
      this.events = this.events.filter(e => e.n);
    } else return;
    this.replay();
  }
  // Rebuild streaks, the lead, points and awards from the opening log, so
  // corrections stay exact. A lobby-size change between solo and party
  // starts everyone's streaks over.
  replay() {
    let segment = null, runs = new Map(), leader = null, first = null, last = null, prev = null;
    const best = new Map(), points = new Map();
    const score = (id, value) => points.set(id, (points.get(id) || 0) + value);
    for (const e of this.events) {
      if (e.segment !== segment) { segment = e.segment; runs = new Map(); leader = null; }
      else if (prev?.competitive) leader = creditLead(runs, leader, prev.at, e.at, prev.size || 2, score);
      prev = e;
      if (e.competitive) {
        if (!first) first = { id:e.id, at:e.at, size:e.size || 2 };
        last = { id:e.id, at:e.at, size:e.size || 2 };
      }
      for (let k=0; k<e.n; k++) {
        leader = leaderAt(runs, leader, e.at);
        const run = runs.get(e.id);
        const n = run && run.deadline >= e.at ? run.n + 1 : 1;
        if (n >= MIN_STREAK && e.id !== leader && (!leader || n > runs.get(leader).n)) {
          // The passed leader drops a tier and starts that tier's full window.
          if (leader) { const n = droppedStreak(runs.get(leader).n), window = streakWindow(n); runs.set(leader, { n, deadline:e.at + window, window }); }
          leader = e.id;
        }
        const leading = e.id === leader, window = streakWindow(n, leading);
        runs.set(e.id, { n, deadline:e.at + window, window });
        if (n >= MIN_STREAK) best.set(e.id, Math.max(best.get(e.id) || 0, n));
        score(e.id, e.competitive ? openingPoints(leading ? n : 0, e.size || 2) : openingPoints(0, 1));
      }
    }
    if (first) score(first.id, AWARD_POINTS * multiplier(first.size));
    if (last) score(last.id, AWARD_POINTS * multiplier(last.size));
    const live = segment === this.segment;
    this.runs = live ? runs : new Map(); this.lastLeader = live ? leader : null;
    this.best = best; this.points = points; this.first = first; this.last = last;
    this.tail = live && prev?.competitive ? { at:prev.at, size:prev.size || 2 } : null;
  }
  timeline() { return this.events.map(({id,n,at}) => ({ id,n,at })); }
  leader(now = Date.now()) { return leaderAt(this.runs, this.lastLeader, now); }
  // A player's live streak, the ms left to keep it, and the window it started with.
  streakOf(id, now = Date.now()) {
    const r = this.runs.get(id);
    return r && r.n >= MIN_STREAK && r.deadline >= now ? { n:r.n, left:r.deadline - now, window:r.window } : { n:0, left:0, window:0 };
  }
  current(id, now = Date.now()) { return this.streakOf(id, now).n; }
  // The next moment a live streak runs out, so the relay can tell everyone.
  nextExpiry(now = Date.now()) {
    let next = Infinity;
    for (const r of this.runs.values()) if (r.n >= MIN_STREAK && r.deadline >= now) next = Math.min(next, r.deadline);
    return next;
  }
  longest(id) { return asStreak(this.best.get(id) || 0); }
  // Points so far, including lead time since the last opening up to `now`.
  score(id, now = Date.now()) {
    let total = this.points.get(id) || 0;
    if (this.tail) creditLead(this.runs, this.lastLeader, this.tail.at, Math.min(now, this.stopAt), this.tail.size, (who, v) => { if (who === id) total += v; });
    return Math.round(total * 10000) / 10000;
  }
  awards(id) { return { first:this.first?.id === id, last:this.last?.id === id }; }
  live(players, now = Date.now()) {
    const lead = this.leader(now);
    return players.map(p => { const st = this.streakOf(p.id, now);
      return { ...p, streak:st.n, streakLeft:Math.round(st.left), streakWindow:st.window, lead:!!lead && p.id === lead,
        bestStreak:this.longest(p.id), points:this.score(p.id, now) }; });
  }
  recap(players) {
    const party = players.length > 1;
    return recapPlayers(players.map(p => ({ ...p, bestStreak:this.longest(p.id), points:this.score(p.id),
      ...(party ? this.awards(p.id) : { first:false, last:false }) })));
  }
}
// Global shortcuts have no key-up event, so a held key arrives as a burst of
// auto-repeats. Presses closer than repeatMs are repeats and are dropped; a
// press that could be the first repeat of a hold (within settleMs of the last
// one) only fires once no repeat follows it within repeatMs. Holding a key
// therefore counts once; only separate presses count again.
class HoldFilter {
  constructor({ repeatMs = 80, settleMs = 1100, now = Date.now, schedule = setTimeout, cancel = clearTimeout } = {}) {
    Object.assign(this, { repeatMs, settleMs, now, schedule, cancel });
    this.keys = new Map();
  }
  press(key, fire) {
    const t = this.now(), state = this.keys.get(key) || { last:-Infinity, timer:null };
    const gap = t - state.last;
    state.last = t; this.keys.set(key, state);
    if (gap < this.repeatMs) { if (state.timer) this.cancel(state.timer); state.timer = null; }
    else if (gap >= this.settleMs) fire();
    else {
      if (state.timer) this.cancel(state.timer);
      state.timer = this.schedule(() => { state.timer = null; fire(); }, this.repeatMs);
    }
  }
}
function recapPlayers(players) {
  return players.map(p=>({ ...p, bestStreak:asStreak(p.bestStreak || 0) })).sort((a,b)=>b.chests-a.chests || a.name.localeCompare(b.name));
}
// Points only come from results the relay signed (`verified(match)` returns
// the signed result, or null), counted once per match id. Unsigned matches
// score only when solo, where points are always chests x POINTS_PER_CHEST.
function matchPoints(match, verified) {
  const signed = verified ? verified(match) : null;
  if (signed) {
    const scale = Number(signed.v) >= POINTS_VERSION ? 1 : LEGACY_POINT_SCALE;
    return { key:signed.id, players:new Map(signed.players.map(p => [p.id, (Number(p.points) || 0) * scale])) };
  }
  const players = match.recap || [];
  if (players.length !== 1) return null;
  return { key:null, players:new Map([[players[0].id || players[0].name, (Number(players[0].chests) || 0) * POINTS_PER_CHEST]]) };
}
// Records use the saved roster size; custom lobbies above four stay separate.
// Each record also carries matches played, total and average chests and total
// points, over counted games only. Size 0 is every lobby size from one to four.
// `since` keeps only games that ended after it (weekly / monthly boards).
// CPM is a player's chests over their played minutes.
const matchMinutes = m => Math.max(0, (m.end || 0) - (m.timelineStart || m.start || 0)) / 60000;
function matchLeaderboards(history, verified, since = 0) {
  const seen = new Set();
  history = history.filter(m => {
    if (!countedMatch(m) || (since && (m.end || 0) <= since)) return false;
    const key = m.proof?.sig;
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
  const scored = new Set();
  const points = history.map(match => {
    const result = matchPoints(match, verified);
    if (!result || (result.key && scored.has(result.key))) return null;
    if (result.key) scored.add(result.key);
    return result.players;
  });
  return [1,2,3,4,0].map(size => {
    const records = new Map();
    let matches = 0;
    history.forEach((match, i) => {
      const players = match.recap || [];
      const matchSize = match.teamSize || players.length;
      if (size ? matchSize !== size : !(matchSize >= 1 && matchSize <= 4)) return;
      matches++;
      for (const p of players) {
        const id = p.id || p.name;
        const record = records.get(id) || { id, name:p.name, chests:0, bestStreak:0, matches:0, total:0, avg:0, points:0, minutes:0, cpm:0 };
        const chests = Number(p.chests) || 0;
        record.name = p.name;
        record.chests = Math.max(record.chests, chests);
        record.matches++; record.total += chests;
        record.avg = Math.round(record.total / record.matches * 10) / 10;
        record.minutes += matchMinutes(match);
        record.cpm = record.minutes >= 1 ? Math.round(record.total / record.minutes * 100) / 100 : 0;
        record.points += points[i]?.get(id) || 0;
        record.bestStreak = Math.max(record.bestStreak, asStreak(Number(p.bestStreak) || 0));
        records.set(id, record);
      }
    });
    const rank = metric => [...records.values()].filter(p=>p[metric] > 0).sort((a,b)=>b[metric]-a[metric] || a.name.localeCompare(b.name));
    return { size, matches, points:rank('points'), chests:rank('chests'), cpm:rank('cpm'), streaks:rank('bestStreak'), avg:rank('avg'), played:rank('matches') };
  });
}
// ---------- Party sync ----------
// Party members trade relay-signed results when they meet. Games you played in
// join your history (counted for the HUD, Matches and career); games among
// others go to `s.shared`, which only the leaderboards read. Unsigned solo
// games are never shared, since nobody can check them.
const signedId = m => { try { return JSON.parse(m.proof.data).id || null; } catch { return null; } };
const MAX_SAVED = 300;
function renumberMatches(s) {
  let k = 0;
  for (const m of s.history) {
    if (!countedMatch(m)) m.n = null;
    else if ((m.end || 0) > (s.cpmFrom || 0)) m.n = ++k;
  }
  s.matches = k;
}
function mergeSignedMatches(s, items, selfId) {
  if (!Array.isArray(s.shared)) s.shared = [];
  const known = new Set([...s.history, ...s.shared].filter(m => m.proof).map(signedId).filter(Boolean));
  let mine = 0, others = 0;
  for (const { proof, result } of items) {
    if (!result || !Array.isArray(result.players) || known.has(result.id) || !Number.isFinite(result.end)) continue;
    known.add(result.id);
    const players = recapPlayers(result.players.map(p => ({ id:String(p.id || ''), name:String(p.name || 'Player').slice(0, 20),
      chests:Number(p.chests) || 0, bestStreak:Number(p.bestStreak) || 0, points:Number(p.points) || 0,
      bestBurst:Number(p.bestBurst) || 0, first:!!p.first, last:!!p.last })));
    const total = players.reduce((n, p) => n + p.chests, 0);
    const own = players.find(p => p.id === selfId);
    if (!countedMatch({ start:result.start, end:result.end, recapTeamTotal:players.reduce((n, p) => n + p.chests, 0) })) continue;
    const entry = { n:null, start:result.start, end:result.end, chests:own ? own.chests : 0, teamChests:total,
      party:players.filter(p => p.id !== selfId).map(p => ({ name:p.name, chests:p.chests, teamChests:p.chests })),
      recap:players, recapTeamTotal:total, timeline:[], timelineStart:result.start,
      proof:{ data:String(proof.data), sig:String(proof.sig) }, synced:true };
    if (own) { s.history.push(entry); mine++; } else { s.shared.push(entry); others++; }
  }
  const byEnd = (a, b) => (a.end || 0) - (b.end || 0);
  if (mine) {
    s.history.sort(byEnd);
    if (s.history.length > MAX_SAVED) s.history.splice(0, s.history.length - MAX_SAVED);
    renumberMatches(s);
  }
  if (others) { s.shared.sort(byEnd); if (s.shared.length > MAX_SAVED) s.shared.splice(0, s.shared.length - MAX_SAVED); }
  return { mine, others };
}
// Signed proofs to send, in chunks the relay accepts (it caps each message).
function proofChunks(s, maxChars = 6000) {
  const chunks = []; let chunk = [], size = 0;
  for (const m of [...s.history, ...(s.shared || [])]) {
    const p = m.proof;
    if (!p || typeof p.data !== 'string' || typeof p.sig !== 'string' || p.data.length > 4000) continue;
    const n = p.data.length + p.sig.length + 30;
    if (chunk.length && (size + n > maxChars || chunk.length >= 12)) { chunks.push(chunk); chunk = []; size = 0; }
    chunk.push({ data:p.data, sig:p.sig }); size += n;
  }
  if (chunk.length) chunks.push(chunk);
  return chunks;
}

// Your own career across saved matches, overall and per lobby size.
function careerStats(history, selfId) {
  const mine = [];
  for (const match of history.filter(countedMatch)) {
    const players = match.recap || [];
    const own = players.find(p => p.id === selfId);
    const chests = own ? Number(own.chests) || 0 : Number(match.chests) || 0;
    const size = match.teamSize || players.length || 1;
    const team = Number(match.recapTeamTotal ?? match.teamChests) || chests;
    const minutes = Math.max(0, (match.end || 0) - (match.timelineStart || match.start || 0)) / 60000;
    const top = Math.max(0, ...players.map(p => Number(p.chests) || 0));
    mine.push({ n:match.n, end:match.end, size, chests, team, minutes, streak:asStreak(Number(own?.bestStreak) || 0),
      mvp:size > 1 && chests > 0 && chests === top });
  }
  const sum = (list, key) => list.reduce((n, m) => n + m[key], 0);
  const summary = list => {
    const minutes = sum(list, 'minutes');
    return { matches:list.length, chests:sum(list, 'chests'), best:Math.max(0, ...list.map(m => m.chests)),
      avg:list.length ? Math.round(sum(list, 'chests') / list.length * 10) / 10 : 0,
      perMin:minutes >= 1 ? Math.round(sum(list, 'chests') / minutes * 10) / 10 : 0,
      streak:Math.max(0, ...list.map(m => m.streak)), mvps:list.filter(m => m.mvp).length,
      share:sum(list, 'team') ? Math.round(sum(list, 'chests') / sum(list, 'team') * 100) : 0 };
  };
  // How many matches your best streak reached each flame colour.
  const milestones = TIER_ORDER.map(tier => ({ tier, min:TIER_MIN[tier], matches:mine.filter(m => m.streak >= TIER_MIN[tier]).length }));
  return { ...summary(mine), modes:[1,2,3,4].map(size => ({ size, ...summary(mine.filter(m => m.size === size)) })), recent:mine.slice(-20), milestones };
}
const RECAP_COLORS = ['#f2c265','#8bc9e8','#be9fe8','#8dd4ab','#ef9e99','#d4d78a'];
function recapDetails(match) {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const players = recapPlayers(match.recap || []);
  const duration = Math.max(0, match.end - match.start);
  const seconds = Math.floor(duration / 1000);
  const clock = n => Math.floor(n / 60) + ':' + String(n % 60).padStart(2,'0');
  const total = match.teamChests ?? players.reduce((n,p) => n+p.chests,0);
  const most = Math.max(0,...players.map(p=>p.bestStreak || 0));
  const events = (match.timeline || []).filter(e => Number.isFinite(e.at) && e.n > 0);
  let html = '<div class="recap-meta">' + clock(seconds) + ' played · ' + players.length + ' player' + (players.length === 1 ? '' : 's') + '</div>';
  html += '<div class="recap-highlight">' + (players[0]?.chests > 0 ? 'Most opened · ' + escape(players.filter(p=>p.chests===players[0].chests).map(p=>p.name).join(', ')) : 'No chests opened') + '</div>';
  html += players.map((p,i) => '<div class="recap-person" style="--player:' + RECAP_COLORS[i%RECAP_COLORS.length] + ';--delay:' + i*70 + 'ms"><div class="recap-player"><span>' + escape(p.name) + '</span><b>' + p.chests + ' · ' + (total ? Math.round(p.chests/total*100) : 0) + '%</b></div><div class="recap-track"><i style="width:' + Math.min(100,total ? p.chests/total*100 : 0) + '%"></i></div>' + (players.length > 1 ? '<small>Best streak · ' + (p.bestStreak || 0) + '</small>' : '') + '</div>').join('');
  html += '<div class="recap-highlight">Longest streak · ' + most + (most ? ' · ' + escape(players.filter(p=>p.bestStreak===most).map(p=>p.name).join(', ')) : '') + '</div>';
  if (events.length) {
    const max = Math.max(1,...players.map(p=>events.filter(e=>e.id===p.id).reduce((n,e)=>n+e.n,0)));
    html += '<div class="recap-timeline"><b>Opening timeline</b><svg viewBox="0 0 200 80" role="img" aria-label="Cumulative recorded chest openings per player"><path d="M4 4V74H196" fill="none" stroke="#657080" stroke-width=".5"/>';
    players.forEach((p,i) => {
      let count = 0, points = '4,74';
      for (const e of events.filter(e=>e.id===p.id)) {
        const x = 4+192*Math.max(0,Math.min(1,(e.at-match.start)/Math.max(1,duration)));
        points += ' ' + x.toFixed(1) + ',' + (74-66*count/max).toFixed(1);
        count += e.n;
        points += ' ' + x.toFixed(1) + ',' + (74-66*count/max).toFixed(1);
      }
      points += ' 196,' + (74-66*count/max).toFixed(1);
      html += '<polyline class="recap-line" points="' + points + '" fill="none" stroke="' + RECAP_COLORS[i%RECAP_COLORS.length] + '" stroke-width="1.7"><title>' + escape(p.name) + ': ' + count + ' recorded openings</title></polyline>';
    });
    html += '</svg><div class="recap-axis"><span>0:00</span><span>' + clock(seconds) + '</span></div><small>Server receipt order · openings after connection</small></div>';
  } else html += '<div class="recap-meta">No recorded opening timeline for this match.</div>';
  return html;
}
// ---------- Overlay recap ----------
// One category per stage, cycled by popup.js. A stage may carry `play` (the
// replay frames popup.js animates) and `ms` (its own length).
// The third path is Plasma's electric filaments and the ellipse the orbit that
// Quasar and Singularity spin; the other tiers hide them (tiers.css).
const FIRE_PATHS = '<path d="M8.5 1.5c.8 3-2.8 4.1-2.1 6.4C5 7.4 4.3 6.5 4.2 5.4 2.8 7 2 8.5 2 10a6 6 0 0 0 12 0c0-3-2.4-5.3-5.5-8.5Z"/><path d="M8 9c1.5 1.1 2 2 2 3a2 2 0 0 1-4 0c0-.8.6-1.9 2-3Z"/>' +
  '<path class="arc" d="M8.7 3.3 7.6 5.7l1 1.4-.6 1.7M7.6 5.7 6.2 6.5M3.3 9.4l1.9 1.1.8 1.5M12.7 9l-1.6 1.3-.4 1.6"/>';
// The ring copy is a wide glow under the flame, shown only for the rare tiers (tiers.css).
const RECAP_FIRE = '<svg class="fire" viewBox="0 0 16 16" aria-hidden="true"><g class="ring">' + FIRE_PATHS + '</g><g class="core">' + FIRE_PATHS + '</g><ellipse class="orbit" cx="8" cy="10.5" rx="7.8" ry="2.1" pathLength="20"/></svg>';
const RECAP_CROWN = '<svg class="crown" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 5l3 2 3-4 3 4 3-2-1.5 7h-9zM4 14h8"/></svg>';
const RECAP_FLAG = '<svg class="flag" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 14.5V2M3.5 2.5h8l-1.8 3 1.8 3h-8"/></svg>';
const RECAP_FINISH = '<svg class="finish" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 14.5V2"/><path d="M3.5 2.5h9v6h-9"/><path d="M6.5 2.5v6M9.5 2.5v6M3.5 5.5h9"/></svg>';
const RECAP_STAR = '<svg class="star" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z"/></svg>';
// A number that wears the tier's colours (tiers.css styles .wave-text per tier).
const tierNumber = n => '<span class="wave-text" data-text="' + n + '">' + n + '</span>';

// Who earned what in a finished match: first and last chest (party only),
// from the saved timeline or the relay's flags.
function matchHighlights(match) {
  const players = match.recap || [];
  const events = (match.timeline || []).filter(e => Number.isFinite(e.at) && e.n > 0).slice().sort((a, b) => a.at - b.at);
  const start = [match.timelineStart, match.start].find(Number.isFinite) ?? events[0]?.at ?? 0;
  const party = players.length > 1;
  const flagged = key => { const p = players.find(q => q[key]); return p ? { id:p.id, at:null } : null; };
  const first = !party ? null : events.length ? { id:events[0].id, at:events[0].at - start } : flagged('first');
  const last = !party ? null : events.length ? { id:events.at(-1).id, at:events.at(-1).at - start } : flagged('last');
  return { first, last };
}

// Replay frames for the recap: cumulative counts after each opening, plus a
// note when something happens (first chest, a new streak leader, last chest).
function replayFrames(match) {
  const players = match.recap || [];
  const events = (match.timeline || []).filter(e => Number.isFinite(e.at) && e.n > 0).slice().sort((a, b) => a.at - b.at);
  const start = [match.timelineStart, match.start].find(Number.isFinite) ?? events[0]?.at ?? 0;
  const duration = Math.max(1, (match.end || events.at(-1)?.at || start) - start);
  const ids = players.map(p => p.id);
  const party = players.length > 1;
  const sim = new OpeningStreaks();
  sim.setPlayers(players.length);
  for (const id of ids) sim.observe(id, 0, start);
  const counts = Object.fromEntries(ids.map(id => [id, 0]));
  const frames = [];
  let leader = null;
  events.forEach((e, i) => {
    if (!(e.id in counts)) return;
    counts[e.id] += e.n;
    sim.observe(e.id, counts[e.id], e.at);
    const notes = [];
    if (party && i === 0) notes.push({ kind:'first', id:e.id });
    const lead = party ? sim.leader(e.at) : null;
    if (lead && lead !== leader) notes.push({ kind:'streak', id:lead, n:sim.current(lead, e.at) });
    leader = lead;
    if (party && i === events.length - 1) notes.push({ kind:'last', id:e.id });
    frames.push({ t:Math.max(0, Math.min(1, (e.at - start) / duration)), counts:{ ...counts }, notes });
  });
  return { duration, frames, max:Math.max(1, ...Object.values(counts)) };
}

function recapStages(match, selfId) {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const players = recapPlayers(match.recap || []);
  const squad = players.length > 1;
  const byId = new Map(players.map((p, i) => [p.id, { ...p, i }]));
  const name = p => escape(p && p.id && p.id === selfId ? 'You' : p?.name ?? 'Someone');
  const names = list => list.map(name).join(', ');
  const duration = Math.max(0, (match.end || 0) - (match.start || 0));
  const seconds = Math.floor(duration / 1000);
  const clock = n => Math.floor(n / 60) + ':' + String(n % 60).padStart(2,'0');
  const at = ms => ms == null ? '' : clock(Math.max(0, Math.floor(ms / 1000)));
  const total = match.teamChests ?? players.reduce((n,p) => n+p.chests,0);
  const color = i => RECAP_COLORS[i % RECAP_COLORS.length];
  const top = players[0]?.chests || 0;
  const count = (n, decimals = 0) => '<b class="num count-up" data-to="' + n + '" data-decimals="' + decimals + '">' + Number(n).toFixed(decimals) + '</b>';
  const stat = (label, value, i) => '<div class="stat rise" style="--i:' + i + '"><span>' + label + '</span><b>' + value + '</b></div>';
  const highlights = matchHighlights({ ...match, recap:players });
  const self = players.find(p => p.id === selfId) || (!squad ? players[0] : null);
  const fmtPoints = n => (Number(n) || 0) >= 100 ? Math.round(n).toLocaleString() : (Math.round((Number(n) || 0) * 10) / 10).toString();
  const stages = [];

  // 1. Total
  const perMin = seconds >= 60 ? (total / (seconds / 60)).toFixed(1) : '–';
  const pointsValue = squad ? (self ? self.points : null) : (self?.chests || 0) * POINTS_PER_CHEST;
  stages.push({ key:'total', label:'Total', html:
    '<div class="hero big rise" style="--i:0">' + count(total) + '<span>' + (squad ? 'team chests' : 'chests opened') + '</span></div>' +
    '<div class="stats four">' + stat('Time', clock(seconds), 1) + stat('Per min', perMin, 2) +
      stat(squad ? 'Your points' : 'Points', pointsValue == null ? '–' : fmtPoints(pointsValue), 3) + stat(squad ? 'Squad' : 'Mode', squad ? players.length : 'Solo', 4) + '</div>' +
    (top > 0 ? '<p class="foot rise" style="--i:5">' + RECAP_CROWN + '<span>Most opened · <em>' + names(players.filter(p=>p.chests===top)) + '</em></span></p>' : '<p class="foot dim rise" style="--i:5">No chests opened this match.</p>') });

  // 2. Replay: the match played back as a race.
  const replay = replayFrames({ ...match, recap:players, timelineStart:match.start });
  if (replay.frames.length) stages.push({ key:'replay', label:'Replay', ms:7000, play:{ ...replay, names:Object.fromEntries(players.map(p => [p.id, p.id === selfId ? 'You' : p.name])) }, html:
    '<div class="replay"><div class="replay-head"><span class="clock" data-clock>0:00</span><span class="dim">/ ' + clock(seconds) + '</span></div>' +
    players.map((p, i) => '<div class="race" data-id="' + escape(p.id) + '" style="--player:' + color(i) + '"><span class="who"><i class="swatch"></i><span>' + name(p) + '</span></span><span class="lane"><i></i></span><b data-n>0</b></div>').join('') +
    '<div class="ticker" aria-live="off"></div></div>' });

  // 3. Awards
  const award = (icon, title, who, detail, cls, i) => '<div class="award ' + cls + ' pop" style="--i:' + i + '">' + icon + '<span class="what">' + title + '</span><b>' + who + '</b><small>' + detail + '</small></div>';
  const cards = [];
  if (highlights.first) cards.push(award(RECAP_FLAG, 'First chest', name(byId.get(highlights.first.id)), highlights.first.at != null ? 'at ' + at(highlights.first.at) : '+' + AWARD_POINTS + ' pt × lobby', 'first', cards.length));
  if (highlights.last) cards.push(award(RECAP_FINISH, 'Last chest', name(byId.get(highlights.last.id)), highlights.last.at != null ? 'at ' + at(highlights.last.at) : '+' + AWARD_POINTS + ' pt × lobby', 'last', cards.length));
  const bestStreak = Math.max(0, ...players.map(p => p.bestStreak || 0));
  if (bestStreak) cards.push(award('<span class="tier-' + streakTier(bestStreak) + '">' + RECAP_FIRE + '</span>', 'Longest streak', names(players.filter(p => p.bestStreak === bestStreak)), bestStreak + ' in a row', 'streak', cards.length));
  const bestPoints = squad ? Math.max(0, ...players.map(p => Number(p.points) || 0)) : 0;
  if (bestPoints > 0) cards.push(award(RECAP_STAR, 'Most points', names(players.filter(p => (Number(p.points) || 0) === bestPoints)), fmtPoints(bestPoints) + ' points', 'points', cards.length));
  if (cards.length) stages.push({ key:'awards', label:'Awards', html:'<div class="awards">' + cards.join('') + '</div>' });

  // 4. Chest share
  if (squad) stages.push({ key:'share', label:'Chest share', html:
    '<div class="head"><span>SQUAD</span><span>OPENED</span><span>%</span></div>' +
    players.map((p,i) => {
      const share = total ? Math.round(p.chests/total*100) : 0;
      return '<div class="share rise" style="--player:' + color(i) + ';--i:' + i + '"><span class="who">' + (top > 0 && p.chests === top ? RECAP_CROWN : '<i class="swatch"></i>') + '<span>' + name(p) + '</span></span><b>' + p.chests + '</b><span class="pct">' + share + '%</span>' +
        '<span class="track"><i style="width:' + Math.min(100, share) + '%"></i></span></div>';
    }).join('') });

  // 5. Streaks (solo games have them too)
  {
    const ranked = players.map((p,i)=>({ ...p, i })).sort((a,b)=>(b.bestStreak||0)-(a.bestStreak||0) || a.name.localeCompare(b.name));
    stages.push({ key:'streaks', label:'Streaks', html: bestStreak
      ? '<div class="hero streak rise tier-' + streakTier(bestStreak) + '" style="--i:0">' + RECAP_FIRE + '<b class="num">' + tierNumber(bestStreak) + '</b><span>in a row<br><em>' + names(players.filter(p=>p.bestStreak===bestStreak)) + '</em></span></div>' +
        '<div class="list">' + ranked.map((p, k) => '<div class="row rise' + (p.bestStreak ? '' : ' none') + '" style="--i:' + (k + 1) + '"><span style="--player:' + color(p.i) + '"><i class="swatch"></i>' + name(p) + '</span><b class="tier-' + streakTier(p.bestStreak || 0) + '">' + (p.bestStreak ? tierNumber(p.bestStreak) : '–') + '</b></div>').join('') + '</div>'
      : '<div class="hero streak idle rise" style="--i:0">' + RECAP_FIRE + '<b class="num">0</b><span>streaks<br>this match</span></div><p class="foot dim rise" style="--i:1">Open ' + MIN_STREAK + ' chests within ' + STREAK_MS / 1000 + 's of each other to start a streak.</p>' });
  }

  // 6. Points
  if (squad && players.some(p => Number(p.points) > 0)) {
    const ranked = players.map((p, i) => ({ ...p, i, points:Number(p.points) || 0 })).sort((a, b) => b.points - a.points);
    const max = Math.max(1e-9, ranked[0].points);
    stages.push({ key:'points', label:'Points', html:
      '<div class="head"><span>SQUAD</span><span></span><span>POINTS</span></div>' +
      ranked.map((p, k) => '<div class="share rise" style="--player:' + color(p.i) + ';--i:' + k + '"><span class="who">' + (k === 0 ? RECAP_STAR : '<i class="swatch"></i>') + '<span>' + name(p) + '</span></span><span></span>' +
        '<b class="count-up" data-to="' + p.points + '" data-decimals="1">0</b><span class="track"><i style="width:' + Math.min(100, p.points / max * 100) + '%"></i></span></div>').join('') +
      '<p class="foot dim rise" style="--i:' + ranked.length + '">Chests, the streak bonus while leading, and the first and last chest, times the lobby size.</p>' });
  }

  // 7. Timeline
  const events = (match.timeline || []).filter(e => Number.isFinite(e.at) && e.n > 0);
  if (events.length) {
    const max = Math.max(1, ...players.map(p=>events.filter(e=>e.id===p.id).reduce((n,e)=>n+e.n,0)));
    let svg = '<svg viewBox="0 0 300 96" role="img" aria-label="Cumulative chest openings per player"><path class="grid" d="M0 94H300M0 48H300M0 2H300"/>';
    players.forEach((p,i) => {
      let c = 0, points = '0,94';
      for (const e of events.filter(e=>e.id===p.id)) {
        const x = 300*Math.max(0,Math.min(1,(e.at-match.start)/Math.max(1,duration)));
        points += ' ' + x.toFixed(1) + ',' + (94-92*c/max).toFixed(1);
        c += e.n;
        points += ' ' + x.toFixed(1) + ',' + (94-92*c/max).toFixed(1);
      }
      points += ' 300,' + (94-92*c/max).toFixed(1);
      svg += '<polyline class="line" style="--d:' + i * 120 + 'ms" points="' + points + '" stroke="' + color(i) + '"/>';
    });
    svg += '</svg>';
    stages.push({ key:'timeline', label:'Timeline', html:
      '<div class="chart">' + svg + '<div class="axis"><span>0:00</span><span>' + clock(seconds) + '</span></div></div>' +
      (squad ? '<div class="legend">' + players.map((p,i)=>'<span style="--player:' + color(i) + '"><i class="swatch"></i>' + name(p) + '</span>').join('') + '</div>' : '') });
  }
  return stages;
}
if (typeof module !== 'undefined') module.exports = { MIN_STREAK, droppedStreak, POINTS_PER_CHEST, LEAD_POINTS_PER_SEC, STREAK_MS, streakWindow, TIER_ORDER, TIER_MIN, TIER_LABEL, matchMinutes, AWARD_POINTS, openingPoints, LEGACY_POINT_SCALE, POINTS_VERSION, streakTier, tierRank, MIN_MATCH_MS, MIN_MATCH_CHESTS, countedMatch, matchTeamChests, matchAverages, gameLabel, asStreak, HoldFilter, OpeningStreaks, recapPlayers, recapDetails, recapStages, matchLeaderboards, careerStats, mergeSignedMatches, renumberMatches, proofChunks, signedId, matchHighlights, replayFrames, RECAP_FIRE, tierNumber };
