// Overlay popups (match recap, streak broken) styled like the MiniHUD.
// A recap shows one category per stage, then dismisses itself.
const STAGE_MS = 5000, BROKEN_MS = 3500, STALE_MS = 15000;
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const panel = $('panel');
let queue = [], current = null, stages = [], index = 0, duration = STAGE_MS;
let timer = 0, startedAt = 0, remaining = 0, hovering = false;

// Report the panel's natural size (not its animated transform) and kind,
// so the main process can place it: streaks top middle, recaps centered.
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

// Only who broke it, and the struck-through flame cooling to grey.
const STRIKE = '<svg class="strike" viewBox="0 0 26 30" aria-hidden="true"><path d="M3 27L23 3"/></svg>';
function brokenStage(item) {
  const who = item.byMe ? 'You' : esc(item.breaker);
  return { key:'broken', label:'', html:'<div class="broken" aria-label="Streak broken by ' + who + '"><span class="flame">' + RECAP_FIRE + STRIKE + '</span><b class="who">' + who + '</b></div>' };
}

// A soft, short falling tone when your own streak is lost.
function lossSound() {
  try {
    const ctx = new AudioContext(), t = ctx.currentTime;
    const out = ctx.createGain(); out.gain.value = 0.9;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 1600;
    filter.connect(out); out.connect(ctx.destination);
    [[523, 262, 0.07, 'sine'], [784, 392, 0.025, 'triangle']].forEach(([from, to, level, type]) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(from, t + 0.28);
      osc.frequency.exponentialRampToValueAtTime(to, t + 0.72);
      gain.gain.setValueAtTime(0.0001, t + 0.28);
      gain.gain.exponentialRampToValueAtTime(level, t + 0.31);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
      osc.connect(gain); gain.connect(filter);
      osc.start(t + 0.28); osc.stop(t + 0.85);
    });
    setTimeout(() => ctx.close(), 1200);
  } catch (error) { console.warn('Could not play streak sound:', error.message); }
}

function show(item) {
  clearTimeout(timer);
  current = item; index = 0;
  applyOpacity(item.opacity);
  if (item.kind === 'recap') {
    const m = item.match;
    stages = recapStages(m, item.selfId);
    duration = STAGE_MS;
    $('kicker').textContent = m.n ? 'Match ' + m.n : 'Match';
    $('sub').textContent = 'recap';
  } else {
    stages = [brokenStage(item)];
    duration = BROKEN_MS;
    $('kicker').textContent = 'Streak broken';
    $('sub').textContent = '';
    if (item.mine && item.sound !== false) lossSound();
  }
  panel.classList.toggle('broken-kind', item.kind !== 'recap');
  panel.classList.toggle('mine', item.kind !== 'recap' && !!item.mine);
  panel.classList.remove('out', 'in'); void panel.offsetWidth; // restart the entry animation
  document.documentElement.style.setProperty('--stage', duration + 'ms');
  $('stages').innerHTML = stages.map(s => '<section class="stage" data-key="' + s.key + '">' + s.html + '</section>').join('');
  $('steps').innerHTML = stages.map((s, i) => '<button aria-label="Show ' + esc(s.label || 'popup') + '" data-i="' + i + '"><i></i></button>').join('');
  panel.classList.add('in');
  go(0);
  fit();
}

function go(i) {
  index = i;
  const nodes = $('stages').children, steps = $('steps').children;
  for (let k = 0; k < nodes.length; k++) {
    nodes[k].classList.toggle('now', k === i);
    steps[k].classList.toggle('done', k < i);
    steps[k].classList.remove('now');
  }
  void steps[i].offsetWidth; // restart the progress animation
  steps[i].classList.add('now');
  $('label').textContent = stages[i].label;
  $('label').hidden = !stages[i].label;
  remaining = duration;
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
  clearTimeout(timer);
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
    queue = queue.filter(q => q.kind !== 'streakBroken');
    show(item);
  } else if (!current || current.kind === 'streakBroken') show(item);
  else queue = queue.filter(q => q.kind !== 'streakBroken').concat(item);
}

panel.addEventListener('mouseenter', () => {
  hovering = true; panel.classList.add('paused');
  clearTimeout(timer); remaining = Math.max(0, remaining - (Date.now() - startedAt));
});
panel.addEventListener('mouseleave', () => { hovering = false; panel.classList.remove('paused'); if (current) run(); });
// Any left click on the popup dismisses it (and anything queued behind it).
panel.addEventListener('click', () => { if (current) { queue = []; finish(); } });

window.api.onPopup(receive);
window.api.getPopups().then(items => { for (const item of items || []) receive(item); });
