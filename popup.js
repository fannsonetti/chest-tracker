// Overlay popups (match recap, streak scenes, personal best) styled like the MiniHUD.
// A recap shows one category per stage, then dismisses itself. Streak rank-ups,
// losses and lead changes are free-floating flame scenes; a personal best is a
// pill showing only the feat.
const STAGE_MS = 5500, PILL_MS = 4200, STALE_MS = 15000, PILL_PAD = 28;
const $ = id => document.getElementById(id);
// Outside Electron (milestones-preview.html embeds this page) there is no
// preload: take popups from the embedding page's messages instead.
window.api ||= { onPopup: cb => addEventListener('message', e => cb(e.data)), getPopups: async () => [], popupResize() {}, closePopup() {}, recapDone() {} };
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const panel = $('panel');
let queue = [], current = null, stages = [], index = 0;
let timer = 0, startedAt = 0, remaining = 0, hovering = false, playing = null;

// Report the panel's natural size (not its animated transform) and kind,
// so the main process can place it: pills top middle, recaps centered.
// Measured right away, not on the next animation frame: after the first
// popup closes the window is hidden, and a hidden window gets no animation
// frames, so waiting for one left every later popup invisible.
function fit() {
  // Pills leave room around the panel for their glow and sparks (body
  // padding); the rare colours' scenes get much more.
  const pad = document.body.classList.contains('pill-body') ? stages[0]?.pad || PILL_PAD : 0;
  document.body.style.setProperty('--pad', pad + 'px');
  const scenePad = stages[0]?.death || stages[0]?.reveal || stages[0]?.overtake ? (stages[0].reveal?.compact ? 0 : REVEAL_PAD) : pad;
  window.api.popupResize({ w:panel.offsetWidth + pad * 2, h:panel.offsetHeight + pad * 2, pad:scenePad, kind:current?.kind || 'recap' });
}
function applyOpacity(opacity) {
  const a = Math.max(0, Math.min(100, Number.isFinite(opacity) ? opacity : 88)) / 100;
  // A popup has to stay readable even when the HUD is nearly transparent.
  document.documentElement.style.setProperty('--alpha', Math.max(a, .55));
  panel.classList.toggle('low', a < .6);
}

// Pills scale with how rare the moment is: `hype` 1 (blue) up to 6 (void, or
// a leaderboard record) adds sparks, shockwaves, glow, a shake, a flash, more
// notes in the chime and a longer stay.
const tierVars = (prefix, tier) => '--' + prefix + ':var(--c-' + tier + ');--' + prefix + '-glow:var(--g-' + tier + ')';
const hypeClass = hype => ' burst' + (hype >= 3 ? ' big' : '') + (hype >= 5 ? ' huge' : '');
function sparks(hype, reach = 16 + hype * 4) {
  let html = '';
  const count = hype * 4;
  for (let i = 0; i < count; i++) {
    const a = Math.round(360 * i / count + Math.random() * 24), d = Math.round(reach * (.55 + Math.random() * .6)), t = Math.round(Math.random() * 160);
    html += '<i class="spark" style="--a:' + a + 'deg;--d:' + d + 'px;--t:' + t + 'ms"></i>';
  }
  return html;
}

// The streak lead changing hands: two flames fighting for the middle
// (streak-overtakes.js). Losing your own lead plays the defeat, from your
// side; any other new lead plays the new leader's victory. The passed
// leader's count after the drop (dropTo) is the one the scene ends on.
function overtakeStage(item) {
  const owner = item.mine ? 'You' : String(item.owner || 'Someone'), taker = item.byMe ? 'You' : String(item.breaker || 'Someone');
  const n = item.n || 0, newN = item.newN || 0, drop = Number.isFinite(item.dropTo) ? item.dropTo : droppedStreak(n);
  const overtake = item.mine && !item.lossAlreadyShown
    ? { dir:'defeat', hero:{ name:owner, from:n, to:drop }, rival:{ name:taker, from:newN, to:newN } }
    : { dir:'victory', hero:{ name:taker, from:Math.max(0, newN - 1), to:newN }, rival:{ name:owner, from:n, to:drop } };
  return { key:'overtake', label:'', overtake, html:'<div class="reveal"></div>' };
}

// A full loss uses the same free-floating stage as a rank-up. If the lead
// changes hands with the loss, carry the new leader in the caption.
function deathStage(item) {
  const tier = TIER_ORDER.includes(item.tier) ? item.tier : streakTier(item.n);
  const handoff = item.kind === 'streakBroken'
    ? (item.byMe ? 'You take' : (item.breaker || 'Someone') + ' takes') + ' the lead · ' + item.newN
    : '';
  return { key:'lost', label:'', death:{ tier, n:item.n, owner:item.mine ? null : item.owner, handoff }, html:'<div class="reveal"></div>' };
}

// New flame colour: a free-floating milestone reveal (milestones.js), no
// pill. The window fits the reveal's square stage; REVEAL_PAD lifts it so the
// flame sits where the pills did, leaving the top of the stage for the
// effects that rise above it.
const REVEAL_PAD = 110;
function tierStage(item) {
  // Your own milestone plays the full reveal; a teammate's is the small settled flame.
  const who = String(item.name || 'Someone'), tier = TIER_ORDER.includes(item.tier) ? item.tier : 'red', compact = !item.mine;
  return { key:'tier', label:'', reveal:{ tier, who, achieved:(item.before || 0) + 1, compact }, hype:Math.max(1, TIER_ORDER.indexOf(tier)),
    at:compact ? 0 : SCENES[tier].at, ms:compact ? MS_COMPACT : SCENES[tier].ms + MS_HOLD,
    html:'<div class="reveal" aria-label="' + esc(who) + ' reached ' + TIER_LABEL[tier] + ', a ' + TIER_MIN[tier] + ' streak"></div>' };
}
let sceneRun = null;
const stopScene = () => { sceneRun?.stop(); sceneRun = null; };

// Personal best: a gold trophy and the new count. A leaderboard record is the
// same trophy at full hype.
const TROPHY = '<svg class="trophy" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 2h6v4a3 3 0 0 1-6 0z"/><path d="M5 3H3a2 2 0 0 0 2.2 2.6M11 3h2a2 2 0 0 1-2.2 2.6"/><path d="M8 9v3M5.5 14h5"/></svg>';
function bestStage(item) {
  const hype = item.record ? 7 : 2, what = item.record ? 'New leaderboard record' : 'New personal best';
  return { key:'best', label:'', hype, glow:'gold', at:.5, ms:PILL_MS + hype * 450, html:'<div class="best' + hypeClass(hype) + (item.record ? ' record' : '') + '" style="' + tierVars('from', 'gold') + ';' + tierVars('to', 'gold') + ';--hype:' + hype + '" aria-label="' + what + ': ' + item.n + ' chests">' +
    '<span class="flame">' + TROPHY + sparks(hype) + '</span><span class="text"><small class="kicker">' + (item.record ? 'Leaderboard record' : 'Personal best') + '</small>' +
    '<span class="line">' + item.n + ' chests</span></span></div>' };
}
// A rising chime: more notes, higher, the rarer the moment.
function hypeSound(hype = 1) {
  try {
    const ctx = new AudioContext(), t = ctx.currentTime;
    const scale = [659, 784, 988, 1175, 1319, 1568, 1976];
    const notes = scale.slice(0, Math.min(scale.length, 2 + Math.ceil(hype / 1.5))).map((f, i) => [f, 0.05 + i * 0.1]);
    if (hype >= 5) notes.push([2637, 0.05 + notes.length * 0.1], [1976, 0.12 + notes.length * 0.1]);
    notes.forEach(([f, at]) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = hype >= 5 ? 'triangle' : 'sine'; osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, t + at);
      gain.gain.exponentialRampToValueAtTime(0.06, t + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.45);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(t + at); osc.stop(t + at + 0.5);
    });
    setTimeout(() => ctx.close(), 2000);
  } catch (error) { console.warn('Could not play chime:', error.message); }
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
  clearTimeout(timer); stopReplay(); stopScene();
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
    if (item.mine && item.sound !== false) setTimeout(hypeSound, (stages[0].at - .1) * 1000, stages[0].hype);
  } else if (item.kind === 'personalBest') {
    stages = [bestStage(item)];
    if (item.sound !== false) hypeSound(stages[0].hype);
  } else if (item.kind === 'streakLost' || (item.kind === 'streakBroken' && !item.lossAlreadyShown && item.dropTo === 0 && item.n >= MIN_STREAK && !(item.newN > item.n))) {
    stages = [deathStage(item)];     // the leader's streak ran out; the HUD plays the sound for your own
  } else {
    stages = [overtakeStage(item)];  // passed: the lead changes hands
  }
  const { reveal, death, overtake } = stages[0];
  const pill = item.kind !== 'recap' && !reveal && !death && !overtake, hype = pill ? stages[0].hype || 0 : 0;
  document.body.classList.toggle('pill-body', pill);
  panel.classList.toggle('reveal-kind', !!(reveal || death || overtake));
  panel.classList.toggle('death-kind', !!(death || overtake));   // scenes that fade themselves out
  panel.classList.toggle('compact', !!reveal?.compact);
  panel.classList.toggle('pill-kind', pill);
  panel.classList.toggle('best-kind', item.kind === 'personalBest');
  // Rarer moments glow, shake and flash (popup.html, data-hype).
  panel.classList.toggle('hype-big', hype >= 3);
  panel.classList.toggle('hype-huge', hype >= 5);
  if (stages[0].tier) panel.dataset.tier = stages[0].tier; else delete panel.dataset.tier;
  panel.style.setProperty('--at', (stages[0].at || 0) + 's');
  if (hype) {
    // A tier change glows in the old colour first; ::after brings in the new one at --at.
    const was = stages[0].from || stages[0].glow;
    panel.dataset.hype = hype; panel.style.setProperty('--hype', hype);
    panel.style.setProperty('--glow', 'var(--g-' + was + ')'); panel.style.setProperty('--edge', 'var(--c-' + was + ')');
    panel.style.setProperty('--glow2', 'var(--g-' + stages[0].glow + ')'); panel.style.setProperty('--edge2', 'var(--c-' + stages[0].glow + ')');
  } else delete panel.dataset.hype;
  panel.classList.remove('out', 'in'); void panel.offsetWidth; // restart the entry animation
  $('stages').innerHTML = stages.map(s => '<section class="stage" data-key="' + s.key + '">' + s.html + '</section>').join('');
  $('steps').innerHTML = stages.map((s, i) => '<button aria-label="Show ' + esc(s.label || 'popup') + '" data-i="' + i + '"><i></i></button>').join('');
  for (const b of $('steps').children) b.onclick = e => { e.stopPropagation(); go(Number(b.dataset.i)); };
  panel.classList.add('in');
  if (reveal) sceneRun = playMilestone($('stages').querySelector('.reveal'), reveal.tier, reveal);
  go(0);
  fit();
}
const stageLength = i => stages[i].ms || (current?.kind === 'recap' ? STAGE_MS : PILL_MS);

function go(i) {
  index = i;
  const nodes = $('stages').children, steps = $('steps').children;
  for (let k = 0; k < nodes.length; k++) {
    nodes[k].classList.toggle('now', k === i);
    nodes[k].classList.toggle('gone', k < i);
    steps[k].classList.toggle('done', k < i);
    steps[k].classList.remove('now');
  }
  if (stages[i].death) {
    const { tier, ...options } = stages[i].death;
    sceneRun = playStreakDeath(nodes[i].firstElementChild, tier, { ...options, onEnd:next });
    return;
  }
  if (stages[i].overtake) {
    sceneRun = playOvertake(nodes[i].firstElementChild, { ...stages[i].overtake, onEnd:next });
    return;
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
  if (hovering || stages[index]?.death || stages[index]?.overtake) return;
  startedAt = Date.now();
  timer = setTimeout(next, remaining);
}
function next() {
  if (index + 1 < stages.length) go(index + 1);
  else finish();
}
function finish() {
  clearTimeout(timer); stopReplay();
  if (stages[index]?.death || stages[index]?.overtake) stopScene();
  if (current?.kind === 'recap') window.api.recapDone?.();
  panel.classList.remove('in'); panel.classList.add('out');
  current = null;
  setTimeout(() => {
    if (current) return;
    while (queue.length && Date.now() - queue[0].at > STALE_MS) queue.shift();
    if (queue.length) show(queue.shift());
    else { stopScene(); window.api.closePopup(); }
  }, 280);
}

function receive(item) {
  if (!item) return;
  item.at = Date.now();
  if (item.kind === 'recap') {
    queue = queue.filter(q => q.kind === 'recap');
    show(item);
  } else if (!current) show(item);
  // Pills wait their turn behind each other; a newer streak takeover replaces an older queued one,
  // and a newer colour for the same player replaces their queued one, so only the highest plays.
  else queue = queue.filter(q => !(item.kind === q.kind && (item.kind === 'streakBroken' || (item.kind === 'streakTier' && q.name === item.name && q.mine === item.mine)))).concat(item);
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
