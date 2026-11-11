// Overlay popups (match recap, streak taken, personal best) styled like the MiniHUD.
// A recap shows one category per stage, then dismisses itself. Pills show
// only the feat: who has the streak now, or the new best.
const STAGE_MS = 5500, PILL_MS = 4200, STALE_MS = 15000;
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const panel = $('panel');
let queue = [], current = null, stages = [], index = 0;
let timer = 0, startedAt = 0, remaining = 0, hovering = false, playing = null;
addRainbowWave(document);

// Report the panel's natural size (not its animated transform) and kind,
// so the main process can place it: pills top middle, recaps centered.
// Measured right away, not on the next animation frame: after the first
// popup closes the window is hidden, and a hidden window gets no animation
// frames, so waiting for one left every later popup invisible.
function fit() {
  window.api.popupResize({ w:panel.offsetWidth, h:panel.offsetHeight, kind:current?.kind || 'recap' });
}
function applyOpacity(opacity) {
  const a = Math.max(0, Math.min(100, Number.isFinite(opacity) ? opacity : 88)) / 100;
  // A popup has to stay readable even when the HUD is nearly transparent.
  document.documentElement.style.setProperty('--alpha', Math.max(a, .55));
  panel.classList.toggle('low', a < .6);
}

// Streak taken: the holder's name and run are struck through while the flame
// cools, then the reel rolls up to the new holder and it relights.
function brokenStage(item) {
  const owner = item.mine ? 'You' : esc(item.owner), taker = item.byMe ? 'You' : esc(item.breaker);
  const from = streakTier(item.n || 0), to = streakTier(item.newN || 0);
  const count = n => n > 0 ? '<span class="count">' + tierNumber(n) + '</span>' : '';
  return { key:'broken', label:'', html:'<div class="taken" data-from="' + from + '" data-to="' + to + '" aria-label="' + taker + ' took the streak from ' + owner + '">' +
    '<span class="flame">' + RECAP_FIRE + '</span><span class="slot"><span class="reel">' +
    '<span class="line old tier-' + from + '"><span class="struck"><span class="name">' + owner + '</span>' + count(item.n) + '</span></span>' +
    '<span class="line new tier-' + to + (item.byMe ? ' me' : '') + '"><span class="name">' + taker + '</span>' + count(item.newN) + '</span>' +
    '</span></span></div>' };
}

// New flame colour: the flame ignites from its old colour into the new one.
function tierStage(item) {
  const who = item.mine ? 'You' : esc(item.name);
  return { key:'tier', label:'', html:'<div class="tierup" data-from="' + esc(item.from || 'ember') + '" data-to="' + esc(item.tier) + '" aria-label="' + who + ' reached a ' + item.n + ' streak">' +
    '<span class="flame">' + RECAP_FIRE + '</span><span class="line tier-' + esc(item.tier) + '"><span class="name">' + who + '</span><span class="count">' + tierNumber(item.n) + '</span></span></div>' };
}

// Personal best: a gold trophy and the new count.
const TROPHY = '<svg class="trophy" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 2h6v4a3 3 0 0 1-6 0z"/><path d="M5 3H3a2 2 0 0 0 2.2 2.6M11 3h2a2 2 0 0 1-2.2 2.6"/><path d="M8 9v3M5.5 14h5"/></svg>';
function bestStage(item) {
  return { key:'best', label:'', html:'<div class="best" aria-label="New personal best: ' + item.n + ' chests"><span class="flame">' + TROPHY + '</span>' +
    '<span class="line">' + item.n + ' chests</span></div>' };
}
// A short rising two-note chime for a personal best.
function bestSound() {
  try {
    const ctx = new AudioContext(), t = ctx.currentTime;
    [[659, 0.05], [988, 0.17]].forEach(([f, at]) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, t + at);
      gain.gain.exponentialRampToValueAtTime(0.06, t + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.45);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(t + at); osc.stop(t + at + 0.5);
    });
    setTimeout(() => ctx.close(), 1000);
  } catch (error) { console.warn('Could not play best sound:', error.message); }
}

// ---------- Stage animation ----------
const easeOut = x => 1 - Math.pow(1 - x, 3);
const clock = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
// Numbers count up from zero when their stage appears.
function countUp(node) {
  for (const el of node.querySelectorAll('.count-up')) {
    const to = Number(el.dataset.to) || 0, decimals = Number(el.dataset.decimals) || 0;
    if (reducedMotion()) { el.textContent = to.toFixed(decimals); continue; }
    const began = performance.now(), length = 900;
    const step = now => {
      const x = Math.min(1, (now - began) / length);
      el.textContent = (to * easeOut(x)).toFixed(decimals);
      if (x < 1 && node.classList.contains('now')) requestAnimationFrame(step); else el.textContent = to.toFixed(decimals);
    };
    el.textContent = (0).toFixed(decimals);
    requestAnimationFrame(step);
  }
}
const NOTE_ICONS = {
  first:'<svg viewBox="0 0 16 16"><path d="M3.5 14.5V2M3.5 2.5h8l-1.8 3 1.8 3h-8"/></svg>',
  last:'<svg viewBox="0 0 16 16"><path d="M3.5 14.5V2"/><path d="M3.5 2.5h9v6h-9"/><path d="M6.5 2.5v6M9.5 2.5v6M3.5 5.5h9"/></svg>'
};
function noteHtml(note, names) {
  const who = esc(names[note.id] ?? 'Someone');
  if (note.kind === 'first') return '<span class="note first">' + NOTE_ICONS.first + who + ' opened the first chest</span>';
  if (note.kind === 'last') return '<span class="note last">' + NOTE_ICONS.last + who + ' opened the last chest</span>';
  return '<span class="note streak tier-' + streakTier(note.n) + '">' + RECAP_FIRE + who + ' took the lead</span>';
}
// Replay: plays the match back over most of the stage, then holds the end.
function startReplay(node, play, length) {
  stopReplay();
  const rows = new Map([...node.querySelectorAll('.race')].map(r => [r.dataset.id, { bar:r.querySelector('.lane i'), n:r.querySelector('[data-n]'), shown:-1 }]));
  const clockEl = node.querySelector('[data-clock]'), ticker = node.querySelector('.ticker');
  const span = reducedMotion() ? 1 : length * .82;
  let elapsed = 0, last = performance.now(), frame = -1;
  const draw = p => {
    while (frame + 1 < play.frames.length && play.frames[frame + 1].t <= p) {
      frame++;
      const notes = play.frames[frame].notes;
      if (notes.length) ticker.innerHTML = noteHtml(notes.at(-1), play.names);
    }
    const counts = frame >= 0 ? play.frames[frame].counts : {};
    for (const [id, row] of rows) {
      const n = counts[id] || 0;
      row.bar.style.transform = 'scaleX(' + (n / play.max).toFixed(4) + ')';
      if (n !== row.shown) {
        row.shown = n; row.n.textContent = n;
        row.n.classList.remove('bump'); void row.n.offsetWidth; if (n) row.n.classList.add('bump');
      }
    }
    clockEl.textContent = clock(p * play.duration);
  };
  const tick = now => {
    if (!playing || playing.node !== node) return;
    if (!hovering) elapsed += now - last;
    last = now;
    const p = Math.min(1, elapsed / span);
    draw(easeInOut(p));
    if (p < 1) playing.raf = requestAnimationFrame(tick);
  };
  playing = { node, raf:0 };
  draw(0);
  if (reducedMotion()) draw(1); else playing.raf = requestAnimationFrame(tick);
}
const easeInOut = x => x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
function stopReplay() { if (playing) cancelAnimationFrame(playing.raf); playing = null; }

function show(item) {
  clearTimeout(timer); stopReplay();
  current = item; index = 0;
  applyOpacity(item.opacity);
  if (item.kind === 'recap') {
    const m = item.match;
    stages = recapStages(m, item.selfId);
    const players = (m.recap || []).length;
    $('kicker').textContent = m.n ? 'Match ' + m.n : 'Match';
    $('sub').textContent = clock(Math.max(0, (m.end || 0) - (m.start || 0))) + ' · ' + (players > 1 ? 'squad of ' + players : 'solo');
  } else if (item.kind === 'streakTier') {
    stages = [tierStage(item)];
    if (item.mine && item.sound !== false) bestSound();
  } else if (item.kind === 'personalBest') {
    stages = [bestStage(item)];
    if (item.sound !== false) bestSound();
  } else {
    stages = [brokenStage(item)];   // the HUD plays the lost-streak sound
  }
  const pill = item.kind !== 'recap';
  panel.classList.toggle('pill-kind', pill);
  panel.classList.toggle('best-kind', item.kind === 'personalBest');
  panel.classList.toggle('mine', pill && !!item.mine);
  panel.classList.remove('out', 'in'); void panel.offsetWidth; // restart the entry animation
  $('stages').innerHTML = stages.map(s => '<section class="stage" data-key="' + s.key + '">' + s.html + '</section>').join('');
  $('steps').innerHTML = stages.map((s, i) => '<button aria-label="Show ' + esc(s.label || 'popup') + '" data-i="' + i + '"><i></i></button>').join('');
  for (const b of $('steps').children) b.onclick = e => { e.stopPropagation(); go(Number(b.dataset.i)); };
  panel.classList.add('in');
  go(0);
  fit();
}
const stageLength = i => current?.kind === 'recap' ? stages[i].ms || STAGE_MS : PILL_MS;

function go(i) {
  index = i;
  const nodes = $('stages').children, steps = $('steps').children;
  for (let k = 0; k < nodes.length; k++) {
    nodes[k].classList.toggle('now', k === i);
    nodes[k].classList.toggle('gone', k < i);
    steps[k].classList.toggle('done', k < i);
    steps[k].classList.remove('now');
  }
  const length = stageLength(i);
  document.documentElement.style.setProperty('--stage', length + 'ms');
  void steps[i].offsetWidth; // restart the progress animation
  steps[i].classList.add('now');
  $('label').textContent = stages[i].label;
  $('label').hidden = !stages[i].label;
  countUp(nodes[i]);
  if (stages[i].play) startReplay(nodes[i], stages[i].play, length); else stopReplay();
  remaining = length;
  run();
}
function run() {
  clearTimeout(timer);
  if (hovering) return;
  startedAt = Date.now();
  timer = setTimeout(next, remaining);
}
function next() {
  if (index + 1 < stages.length) go(index + 1);
  else finish();
}
function finish() {
  clearTimeout(timer); stopReplay();
  if (current?.kind === 'recap') window.api.recapDone?.();
  panel.classList.remove('in'); panel.classList.add('out');
  current = null;
  setTimeout(() => {
    if (current) return;
    while (queue.length && Date.now() - queue[0].at > STALE_MS) queue.shift();
    if (queue.length) show(queue.shift());
    else window.api.closePopup();
  }, 280);
}

function receive(item) {
  if (!item) return;
  item.at = Date.now();
  if (item.kind === 'recap') {
    queue = queue.filter(q => q.kind === 'recap');
    show(item);
  } else if (!current) show(item);
  // Pills wait their turn behind each other; a newer streak takeover replaces an older queued one.
  else queue = queue.filter(q => !(item.kind === 'streakBroken' && q.kind === 'streakBroken')).concat(item);
}

panel.addEventListener('mouseenter', () => {
  hovering = true; panel.classList.add('paused');
  clearTimeout(timer); remaining = Math.max(0, remaining - (Date.now() - startedAt));
});
panel.addEventListener('mouseleave', () => { hovering = false; panel.classList.remove('paused'); if (current) run(); });
// A left click skips to the next page; on the last page it dismisses the
// popup (and anything queued behind it). The progress segments jump instead.
panel.addEventListener('click', () => { if (!current) return; if (index + 1 < stages.length) go(index + 1); else { queue = []; finish(); } });

// The X always closes, whatever page the recap is on.
$('close').addEventListener('click', e => { e.stopPropagation(); if (current) { queue = []; finish(); } });

window.api.onPopup(receive);
window.api.getPopups().then(items => { for (const item of items || []) receive(item); });
