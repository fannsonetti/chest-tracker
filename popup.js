// Overlay popups (match recap, streak broken) styled like the MiniHUD.
// A recap shows one category per stage, then dismisses itself.
const STAGE_MS = 5000, BROKEN_MS = 4500, STALE_MS = 15000;
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const panel = $('panel');
let queue = [], current = null, stages = [], index = 0, duration = STAGE_MS;
let timer = 0, startedAt = 0, remaining = 0, hovering = false;

function fit() {
  requestAnimationFrame(() => window.api.popupResize({ w:panel.offsetWidth, h:panel.offsetHeight }));
}
function applyOpacity(opacity) {
  const a = Math.max(0, Math.min(100, Number.isFinite(opacity) ? opacity : 88)) / 100;
  // A popup has to stay readable even when the HUD is nearly transparent.
  document.documentElement.style.setProperty('--alpha', Math.max(a, .55));
  panel.classList.toggle('low', a < .6);
}

function brokenStage(item) {
  const owner = item.mine ? 'Your streak' : esc(item.owner) + '’s streak';
  const by = item.byMe ? 'You broke it' : 'Broken by <em>' + esc(item.breaker) + '</em>';
  return { key:'broken', label:'', html:'<div class="broken' + (item.mine ? ' mine' : '') + '">' + RECAP_FIRE +
    '<div class="what"><b>' + owner + ' ended</b><span>' + by + '</span></div><span class="run"><b class="num">' + item.n + '</b><small>IN A ROW</small></span></div>' };
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
  }
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
  panel.classList.remove('in');
  current = null;
  setTimeout(() => {
    if (current) return;
    while (queue.length && Date.now() - queue[0].at > STALE_MS) queue.shift();
    if (queue.length) show(queue.shift());
    else window.api.closePopup();
  }, 240);
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
