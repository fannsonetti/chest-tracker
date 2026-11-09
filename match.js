// The host's receipt order defines the order of simultaneous openings.
// Corrections remove the latest openings credited to that player.
class OpeningStreaks {
  constructor() { this.reset(); }
  reset() { this.counts = new Map(); this.runs = []; }
  observe(id, count) {
    count = Math.max(0, Math.min(9999, Math.floor(Number(count) || 0)));
    const before = this.counts.get(id);
    this.counts.set(id, count);
    if (before === undefined) return;
    const delta = count - before;
    if (delta > 0) {
      const last = this.runs.at(-1);
      if (last?.id === id) last.n += delta;
      else this.runs.push({ id, n:delta });
    } else if (delta < 0) {
      let remaining = -delta;
      for (let i=this.runs.length-1; i>=0 && remaining; i--) {
        const run = this.runs[i];
        if (run.id !== id) continue;
        const remove = Math.min(remaining,run.n); run.n -= remove; remaining -= remove;
      }
      const merged = [];
      for (const run of this.runs.filter(r=>r.n)) {
        if (merged.at(-1)?.id === run.id) merged.at(-1).n += run.n;
        else merged.push({ ...run });
      }
      this.runs = merged;
    }
  }
  longest(id) { return Math.max(0,...this.runs.filter(r=>r.id===id).map(r=>r.n)); }
  recap(players) { return players.map(p=>({ ...p, bestStreak:this.longest(p.id) })).sort((a,b)=>b.chests-a.chests || a.name.localeCompare(b.name)); }
}
function recapPlayers(players) {
  return players.map(p=>({ ...p, bestStreak:p.bestStreak || 0 })).sort((a,b)=>b.chests-a.chests || a.name.localeCompare(b.name));
}
if (typeof module !== 'undefined') module.exports = { OpeningStreaks, recapPlayers };
