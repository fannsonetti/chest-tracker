// The host's receipt order defines the order of simultaneous openings.
// Corrections remove the latest openings credited to that player.
// A run only counts as a streak once it reaches MIN_STREAK openings.
const MIN_STREAK = 2;
const asStreak = n => n >= MIN_STREAK ? n : 0;
class OpeningStreaks {
  constructor() { this.reset(); }
  reset() { this.counts = new Map(); this.runs = []; this.events = []; this.competitive = true; }
  setCompetitive(enabled) {
    if (this.competitive !== enabled) this.runs.push({ id:null, n:0 });
    this.competitive = enabled;
  }
  observe(id, count, at = Date.now()) {
    count = Math.max(0, Math.min(9999, Math.floor(Number(count) || 0)));
    const before = this.counts.get(id);
    this.counts.set(id, count);
    if (before === undefined) return;
    const delta = count - before;
    if (delta > 0) {
      this.events.push({ id, n:delta, at, competitive:this.competitive });
      if (!this.competitive) return;
      const last = this.runs.at(-1);
      if (last?.id === id) last.n += delta;
      else this.runs.push({ id, n:delta });
    } else if (delta < 0) {
      let undo = -delta, competitiveUndo = 0;
      for (let i=this.events.length-1; i>=0 && undo; i--) {
        if (this.events[i].id !== id) continue;
        const remove = Math.min(undo, this.events[i].n);
        if (this.events[i].competitive) competitiveUndo += remove;
        this.events[i].n -= remove; undo -= remove;
      }
      this.events = this.events.filter(e => e.n);
      let remaining = competitiveUndo;
      for (let i=this.runs.length-1; i>=0 && remaining; i--) {
        const run = this.runs[i];
        if (run.id !== id) continue;
        const remove = Math.min(remaining,run.n); run.n -= remove; remaining -= remove;
      }
      const merged = [];
      for (const run of this.runs.filter(r=>r.n || r.id === null)) {
        if (merged.at(-1)?.id === run.id) merged.at(-1).n += run.n;
        else merged.push({ ...run });
      }
      this.runs = merged;
    }
  }
  timeline() { return this.events.map(({id,n,at}) => ({ id,n,at })); }
  longest(id) { return asStreak(Math.max(0,...this.runs.filter(r=>r.id===id).map(r=>r.n))); }
  current(id) { const last = this.runs.at(-1); return this.competitive && last?.id === id ? asStreak(last.n) : 0; }
  live(players) { return players.map(p=>({ ...p, streak:this.current(p.id), bestStreak:players.length > 1 ? this.longest(p.id) : 0 })); }
  recap(players) { return recapPlayers(players.map(p=>({ ...p, bestStreak:this.longest(p.id) }))); }
}
function recapPlayers(players) {
  return players.map(p=>({ ...p, bestStreak:players.length > 1 ? asStreak(p.bestStreak || 0) : 0 })).sort((a,b)=>b.chests-a.chests || a.name.localeCompare(b.name));
}
// Records use the saved roster size; custom lobbies above four stay separate.
function matchLeaderboards(history) {
  return [1,2,3,4].map(size => {
    const records = new Map();
    for (const match of history) {
      const players = match.recap || [];
      if ((match.teamSize || players.length) !== size) continue;
      for (const p of players) {
        const id = p.id || p.name;
        const record = records.get(id) || { id, name:p.name, chests:0, bestStreak:0 };
        record.name = p.name;
        record.chests = Math.max(record.chests, Number(p.chests) || 0);
        if (size > 1) record.bestStreak = Math.max(record.bestStreak, asStreak(Number(p.bestStreak) || 0));
        records.set(id, record);
      }
    }
    const rank = metric => [...records.values()].filter(p=>p[metric] > 0).sort((a,b)=>b[metric]-a[metric] || a.name.localeCompare(b.name));
    return { size, chests:rank('chests'), streaks:rank('bestStreak') };
  });
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
      : '<div class="hero streak idle">' + RECAP_FIRE + '<b class="num">0</b><span>streaks<br>this match</span></div><p class="foot dim">A streak starts at ' + MIN_STREAK + ' chests in a row before anyone else opens one.</p>' });
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
if (typeof module !== 'undefined') module.exports = { MIN_STREAK, asStreak, OpeningStreaks, recapPlayers, recapDetails, recapStages, matchLeaderboards };
