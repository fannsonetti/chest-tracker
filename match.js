// The host's receipt order defines the order of simultaneous openings.
// Corrections remove the latest openings credited to that player.
//
// Streak rules: a streak is only broken when another one starts.
// - Anyone who reaches MIN_STREAK openings before the holder opens again
//   takes the streak, at that count. Until then their count is invisible and
//   the holder keeps the streak.
// - When the holder opens a chest, their streak grows and every challenger's
//   invisible count resets to 0. A takeover keeps the other challengers'
//   counts, so they still need only the rest of their two.
// - With no holder yet, the first player to reach MIN_STREAK starts one.
const MIN_STREAK = 2;
const asStreak = n => n >= MIN_STREAK ? n : 0;
class OpeningStreaks {
  constructor() { this.reset(); }
  reset() { this.counts = new Map(); this.events = []; this.competitive = true; this.segment = 0; this.replay(); }
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
    if (delta > 0) this.events.push({ id, n:delta, at, competitive:this.competitive, segment:this.segment });
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
  // Rebuild streak state from the opening log, so corrections stay exact.
  replay() {
    let holder = null, streak = 0, segment = null, pending = new Map();
    const best = new Map();
    for (const e of this.events) {
      if (!e.competitive) continue;
      if (e.segment !== segment) { segment = e.segment; holder = null; streak = 0; pending = new Map(); }
      for (let k=0; k<e.n; k++) {
        if (e.id === holder) { streak++; pending.clear(); }
        else {
          const n = (pending.get(e.id) || 0) + 1;
          if (n >= MIN_STREAK) { holder = e.id; streak = n; pending.delete(e.id); }
          else pending.set(e.id, n);
        }
        if (holder) best.set(holder, Math.max(best.get(holder) || 0, streak));
      }
    }
    const live = this.competitive && segment === this.segment;
    this.holder = live ? holder : null; this.streak = live ? streak : 0;
    this.pending = live ? pending : new Map(); this.best = best;
  }
  timeline() { return this.events.map(({id,n,at}) => ({ id,n,at })); }
  longest(id) { return asStreak(this.best.get(id) || 0); }
  current(id) { return this.holder === id ? asStreak(this.streak) : 0; }
  live(players) { return players.map(p=>({ ...p, streak:this.current(p.id), bestStreak:players.length > 1 ? this.longest(p.id) : 0 })); }
  recap(players) { return recapPlayers(players.map(p=>({ ...p, bestStreak:this.longest(p.id) }))); }
}
function recapPlayers(players) {
  return players.map(p=>({ ...p, bestStreak:players.length > 1 ? asStreak(p.bestStreak || 0) : 0 })).sort((a,b)=>b.chests-a.chests || a.name.localeCompare(b.name));
}
// Records use the saved roster size; custom lobbies above four stay separate.
// Each record also carries matches played, total and average chests.
function matchLeaderboards(history) {
  return [1,2,3,4].map(size => {
    const records = new Map();
    let matches = 0;
    for (const match of history) {
      const players = match.recap || [];
      if ((match.teamSize || players.length) !== size) continue;
      matches++;
      for (const p of players) {
        const id = p.id || p.name;
        const record = records.get(id) || { id, name:p.name, chests:0, bestStreak:0, matches:0, total:0, avg:0 };
        const chests = Number(p.chests) || 0;
        record.name = p.name;
        record.chests = Math.max(record.chests, chests);
        record.matches++; record.total += chests;
        record.avg = Math.round(record.total / record.matches * 10) / 10;
        if (size > 1) record.bestStreak = Math.max(record.bestStreak, asStreak(Number(p.bestStreak) || 0));
        records.set(id, record);
      }
    }
    const rank = metric => [...records.values()].filter(p=>p[metric] > 0).sort((a,b)=>b[metric]-a[metric] || a.name.localeCompare(b.name));
    return { size, matches, chests:rank('chests'), streaks:rank('bestStreak'), avg:rank('avg'), played:rank('matches') };
  });
}
// Your own career across saved matches, overall and per lobby size.
function careerStats(history, selfId) {
  const mine = [];
  for (const match of history) {
    const players = match.recap || [];
    const own = players.find(p => p.id === selfId);
    const chests = own ? Number(own.chests) || 0 : Number(match.chests) || 0;
    const size = match.teamSize || players.length || 1;
    const team = Number(match.recapTeamTotal ?? match.teamChests) || chests;
    const minutes = Math.max(0, (match.end || 0) - (match.timelineStart || match.start || 0)) / 60000;
    const top = Math.max(0, ...players.map(p => Number(p.chests) || 0));
    mine.push({ n:match.n, end:match.end, size, chests, team, minutes, streak:size > 1 ? asStreak(Number(own?.bestStreak) || 0) : 0,
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
  return { ...summary(mine), modes:[1,2,3,4].map(size => ({ size, ...summary(mine.filter(m => m.size === size)) })), recent:mine.slice(-20) };
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
  if (players.length > 1) html += '<div class="recap-highlight">Longest streak · ' + most + (most ? ' · ' + escape(players.filter(p=>p.bestStreak===most).map(p=>p.name).join(', ')) : '') + '</div>';
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
// Overlay recap: one category per stage, cycled by popup.js.
const RECAP_FIRE = '<svg class="fire" viewBox="0 0 16 16" aria-hidden="true"><path d="M8.5 1.5c.8 3-2.8 4.1-2.1 6.4C5 7.4 4.3 6.5 4.2 5.4 2.8 7 2 8.5 2 10a6 6 0 0 0 12 0c0-3-2.4-5.3-5.5-8.5Z"/><path d="M8 9c1.5 1.1 2 2 2 3a2 2 0 0 1-4 0c0-.8.6-1.9 2-3Z"/></svg>';
const RECAP_CROWN = '<svg class="crown" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 5l3 2 3-4 3 4 3-2-1.5 7h-9zM4 14h8"/></svg>';
function recapStages(match, selfId) {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const players = recapPlayers(match.recap || []);
  const squad = players.length > 1;
  const name = p => escape(p.id && p.id === selfId ? 'You' : p.name);
  const names = list => list.map(name).join(', ');
  const duration = Math.max(0, (match.end || 0) - (match.start || 0));
  const seconds = Math.floor(duration / 1000);
  const clock = n => Math.floor(n / 60) + ':' + String(n % 60).padStart(2,'0');
  const total = match.teamChests ?? players.reduce((n,p) => n+p.chests,0);
  const color = i => RECAP_COLORS[i % RECAP_COLORS.length];
  const top = players[0]?.chests || 0;
  const stat = (label, value) => '<div class="stat"><span>' + label + '</span><b>' + value + '</b></div>';
  const stages = [];

  const perMin = seconds >= 60 ? (total / (seconds / 60)).toFixed(1) : '–';
  stages.push({ key:'total', label:'Total', html:
    '<div class="hero"><b class="num">' + total + '</b><span>' + (squad ? 'team chests' : 'chests opened') + '</span></div>' +
    '<div class="stats">' + stat('Time', clock(seconds)) + stat('Per min', perMin) + stat(squad ? 'Squad' : 'Mode', squad ? players.length : 'Solo') + '</div>' +
    (top > 0 ? '<p class="foot">' + RECAP_CROWN + '<span>Most opened · <em>' + names(players.filter(p=>p.chests===top)) + '</em></span></p>' : '<p class="foot dim">No chests opened this match.</p>') });

  if (squad) stages.push({ key:'share', label:'Chest share', html:
    '<div class="head"><span>SQUAD</span><span>OPENED</span><span>%</span></div>' +
    players.map((p,i) => {
      const share = total ? Math.round(p.chests/total*100) : 0;
      return '<div class="share" style="--player:' + color(i) + ';--delay:' + i*80 + 'ms"><span class="who">' + (top > 0 && p.chests === top ? RECAP_CROWN : '<i class="swatch"></i>') + '<span>' + name(p) + '</span></span><b>' + p.chests + '</b><span class="pct">' + share + '%</span>' +
        '<span class="track"><i style="width:' + Math.min(100, share) + '%"></i></span></div>';
    }).join('') });

  if (squad) {
    const best = Math.max(0, ...players.map(p=>p.bestStreak || 0));
    const ranked = players.map((p,i)=>({ ...p, i })).sort((a,b)=>(b.bestStreak||0)-(a.bestStreak||0) || a.name.localeCompare(b.name));
    stages.push({ key:'streaks', label:'Streaks', html: best
      ? '<div class="hero streak">' + RECAP_FIRE + '<b class="num">' + best + '</b><span>in a row<br><em>' + names(players.filter(p=>p.bestStreak===best)) + '</em></span></div>' +
        '<div class="list">' + ranked.map(p => '<div class="row' + (p.bestStreak ? '' : ' none') + '"><span style="--player:' + color(p.i) + '"><i class="swatch"></i>' + name(p) + '</span><b>' + (p.bestStreak || '–') + '</b></div>').join('') + '</div>'
      : '<div class="hero streak idle">' + RECAP_FIRE + '<b class="num">0</b><span>streaks<br>this match</span></div><p class="foot dim">A streak starts when someone opens ' + MIN_STREAK + ' chests before the current holder opens another.</p>' });
  }

  const events = (match.timeline || []).filter(e => Number.isFinite(e.at) && e.n > 0);
  if (events.length) {
    const max = Math.max(1, ...players.map(p=>events.filter(e=>e.id===p.id).reduce((n,e)=>n+e.n,0)));
    let svg = '<svg viewBox="0 0 200 72" role="img" aria-label="Cumulative chest openings per player"><path class="grid" d="M0 70H200M0 36H200M0 2H200"/>';
    players.forEach((p,i) => {
      let count = 0, points = '0,70';
      for (const e of events.filter(e=>e.id===p.id)) {
        const x = 200*Math.max(0,Math.min(1,(e.at-match.start)/Math.max(1,duration)));
        points += ' ' + x.toFixed(1) + ',' + (70-68*count/max).toFixed(1);
        count += e.n;
        points += ' ' + x.toFixed(1) + ',' + (70-68*count/max).toFixed(1);
      }
      points += ' 200,' + (70-68*count/max).toFixed(1);
      svg += '<polyline class="line" points="' + points + '" stroke="' + color(i) + '"/>';
    });
    svg += '</svg>';
    stages.push({ key:'timeline', label:'Timeline', html:
      '<div class="chart">' + svg + '<div class="axis"><span>0:00</span><span>' + clock(seconds) + '</span></div></div>' +
      (squad ? '<div class="legend">' + players.map((p,i)=>'<span style="--player:' + color(i) + '"><i class="swatch"></i>' + name(p) + '</span>').join('') + '</div>' : '') });
  }
  return stages;
}
if (typeof module !== 'undefined') module.exports = { MIN_STREAK, asStreak, OpeningStreaks, recapPlayers, recapDetails, recapStages, matchLeaderboards, careerStats };
