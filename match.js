// The host's receipt order defines the order of simultaneous openings.
// Corrections remove the latest openings credited to that player.
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
  longest(id) { return Math.max(0,...this.runs.filter(r=>r.id===id).map(r=>r.n)); }
  current(id) { const last = this.runs.at(-1); return this.competitive && last?.id === id ? last.n : 0; }
  live(players) { return players.map(p=>({ ...p, streak:this.current(p.id), bestStreak:players.length > 1 ? this.longest(p.id) : 0 })); }
  recap(players) { return recapPlayers(players.map(p=>({ ...p, bestStreak:this.longest(p.id) }))); }
}
function recapPlayers(players) {
  return players.map(p=>({ ...p, bestStreak:players.length > 1 ? p.bestStreak || 0 : 0 })).sort((a,b)=>b.chests-a.chests || a.name.localeCompare(b.name));
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
        if (size > 1) record.bestStreak = Math.max(record.bestStreak, Number(p.bestStreak) || 0);
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
if (typeof module !== 'undefined') module.exports = { OpeningStreaks, recapPlayers, recapDetails, matchLeaderboards };
