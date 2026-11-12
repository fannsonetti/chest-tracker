'use strict';
// Flame milestone reveals: a free-floating flame drawn on a canvas, with its
// name in DOM text beneath it. No card, no backing, no images: every frame is
// drawn here from the icon's own flame path (FIRE_PATHS in match.js), which is
// sampled into points so each tier can bend, stretch, morph and clip it.
//
// playMilestone(host, tier, { who, achieved, compact, reduced }) fills host and returns
// { ms, at, stop }: ms is the whole run (reveal + hold + fade), at the moment
// the flame lands (for the chime), stop() tears it all down. compact (a
// teammate's milestone) skips the reveal: the settled flame slides in from the
// top, small, for MS_COMPACT ms. Each SCENE's
// draw(c, t, st) is closed-form in t (seconds), so a frame never depends on
// the one before it: reduced motion simply draws the settled frame once.
//
// The eight are one climb: from Flare up, each reveal opens on the settled
// flame of the tier below (ghost()) and turns it into the new one, so played
// in order they read as a single flame evolving. Quasar's body (quasarBody)
// is shared with Singularity, which opens by collapsing it.
const MS_W = 360, MS_H = 360, MS_CX = 180, MS_CY = 176, MS_S = 7, MS_HOLD = 1500, MS_FADE = 450, MS_COMPACT = 2600;
const MS_TAU = Math.PI * 2;

// ---------- small maths ----------
const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const out3 = x => 1 - (1 - x) ** 3, in3 = x => x ** 3;
const inOut = x => x < .5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2;
const outBack = x => 1 + 2.2 * (x - 1) ** 3 + 1.2 * (x - 1) ** 2;
const bell = (t, a, b) => { const x = seg(t, a, b); return x > 0 && x < 1 ? Math.sin(Math.PI * x) : 0; };
const lerp = (a, b, x) => a + (b - a) * x;
const rgba = (c, a) => 'rgba(' + c + ',' + clamp01(a).toFixed(3) + ')';
const hsla = (h, s, l, a) => 'hsla(' + (h % 360).toFixed(1) + ',' + s + '%,' + l + '%,' + clamp01(a).toFixed(3) + ')';
// Seeded, so a scene's particles are the same on every frame and every replay.
function seeded(seed) {
  let s = seed % 2147483646 + 1;
  const next = () => (s = s * 16807 % 2147483647) / 2147483647;
  next(); next(); next();   // small seeds start near zero; stir them first
  return next;
}

// ---------- the flame silhouette ----------
// Points of the icon's outer and inner paths, relative to the bulb's centre
// (8, 10) in icon units. Index 0 of the outer path is the tip.
let MS_SHAPE = null;
function msShape() {
  if (MS_SHAPE) return MS_SHAPE;
  const [outerD, innerD] = [...FIRE_PATHS.matchAll(/d="([^"]+)"/g)].map(m => m[1]);
  const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
  document.body.appendChild(svg);
  const sample = (d, n) => {
    const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); svg.appendChild(p);
    const L = p.getTotalLength();
    return Array.from({ length:n }, (_, i) => { const q = p.getPointAtLength(L * i / n); return [q.x - 8, q.y - 10]; });
  };
  MS_SHAPE = { outer:sample(outerD, 150), inner:sample(innerD, 70), path:new Path2D(outerD) };
  svg.remove();
  return MS_SHAPE;
}
// A random point inside the silhouette (icon units, bulb-relative).
function insideFlame(rand) {
  const probe = msShape(), c = (insideFlame.ctx ||= document.createElement('canvas').getContext('2d'));
  for (let k = 0; k < 40; k++) {
    const u = -5.5 + rand() * 11, v = -7.5 + rand() * 13;
    if (c.isPointInPath(probe.path, u + 8, v + 10)) return [u, v];
  }
  return [0, 2];
}
// The silhouette bent by time: o.s scale, o.sx/o.sy squash, o.wob a ripple
// that climbs the flame, o.curl tongues that sway near the tip, o.stretch a
// surge that lengthens the top, o.round (0-1) morphs it towards a circle of
// o.R icon units, o.x/o.y the bulb's centre on the canvas.
function flamePts(pts, o) {
  const s = (o.s ?? 1) * MS_S, t = o.t || 0, x = o.x ?? MS_CX, y = o.y ?? MS_CY, out = new Array(pts.length);
  const sx = o.sx ?? 1, sy = o.sy ?? 1, wob = o.wob || 0, curl = o.curl || 0, stretch = o.stretch || 0, round = o.round || 0, R = o.R || 1;
  for (let i = 0; i < pts.length; i++) {
    let [u, v] = pts[i];
    const h = v < 0 ? Math.min(1, -v / 8.5) : 0;
    u = u * sx + wob * h * Math.sin(v * 1.4 + t * 11 + u * .5) + curl * h * h * Math.sin(t * 7 - v * 1.1);
    v = v * sy - stretch * h * h * 8.5;
    if (round) { const a = Math.atan2(v, u); u = lerp(u, Math.cos(a) * R, round); v = lerp(v, Math.sin(a) * R, round); }
    out[i] = [x + u * s, y + v * s];
  }
  return out;
}
function trace(c, P, close = true) {
  c.beginPath(); c.moveTo(P[0][0], P[0][1]);
  for (let i = 1; i < P.length; i++) c.lineTo(P[i][0], P[i][1]);
  if (close) c.closePath();
}
function glow(c, x, y, r, col, a) {
  if (a <= .002 || r <= .5) return;
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(col, a)); g.addColorStop(.4, rgba(col, a * .45)); g.addColorStop(1, rgba(col, 0));
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, MS_TAU); c.fill();
}
// A fire-coloured flame: hot centre, body colour, darker edge, restrained glow.
// o.heart tints the near-white middle of the inner flame (a cooling ember).
function paintFire(c, o, pal) {
  const sh = msShape(), P = flamePts(sh.outer, o), Q = flamePts(sh.inner, o);
  const s = (o.s ?? 1) * MS_S, x = o.x ?? MS_CX, y = o.y ?? MS_CY;
  c.save(); c.globalAlpha = o.a ?? 1;
  c.shadowColor = rgba(pal.glow, .6); c.shadowBlur = pal.blur * (o.s ?? 1);
  const g = c.createRadialGradient(x, y + 3 * s, 0, x, y + s, 10.5 * s);
  g.addColorStop(0, rgba(o.core || pal.core, 1)); g.addColorStop(.42, rgba(pal.body, 1)); g.addColorStop(1, rgba(pal.edge, 1));
  trace(c, P); c.fillStyle = g; c.fill();
  c.shadowBlur = 0; c.lineWidth = 1.2; c.strokeStyle = rgba(pal.edge, .9); c.stroke();
  const g2 = c.createRadialGradient(x, y + 2.4 * s, 0, x, y + 2 * s, 3.6 * s);
  g2.addColorStop(0, rgba(o.heart || '255,255,240', .95)); g2.addColorStop(1, rgba(o.core || pal.core, .85));
  trace(c, Q); c.fillStyle = g2; c.fill();
  c.restore();
  return P;
}
// Midpoint-displaced lightning between a and b; bend pushes the first midpoint sideways.
function bolt(a, b, rand, rough = .32, depth = 4, bend = 0) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  let pts = bend ? [a, [(a[0] + b[0]) / 2 - dy / len * bend, (a[1] + b[1]) / 2 + dx / len * bend], b] : [a, b];
  for (let d = 0; d < depth; d++) {
    const next = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i], ex = q[0] - p[0], ey = q[1] - p[1], l = Math.hypot(ex, ey) || 1, off = (rand() - .5) * l * rough;
      next.push([(p[0] + q[0]) / 2 - ey / l * off, (p[1] + q[1]) / 2 + ex / l * off], q);
    }
    pts = next;
  }
  return pts;
}
// Thin, sharp electricity: a blue sheath, a white core, and while `split` > 0
// a magenta/cyan chromatic split either side. w thickens it (a lightning strike).
function drawBolt(c, pts, a, split = 0, core = '235,250,255', sheath = '69,150,255', w = 1) {
  if (a <= 0 || pts.length < 2) return;
  c.lineJoin = 'round'; c.lineCap = 'round';
  if (split > .3) {
    c.save(); c.translate(-split, 0); trace(c, pts, false); c.lineWidth = 1.2 * w; c.strokeStyle = rgba('255,60,210', .4 * a); c.stroke(); c.restore();
    c.save(); c.translate(split, 0); trace(c, pts, false); c.lineWidth = 1.2 * w; c.strokeStyle = rgba('40,255,240', .4 * a); c.stroke(); c.restore();
  }
  trace(c, pts, false);
  if (w > 1) { c.lineWidth = 9 * w; c.strokeStyle = rgba(sheath, .1 * a); c.stroke(); }
  c.lineWidth = 3 * w; c.strokeStyle = rgba(sheath, .35 * a); c.stroke();
  c.lineWidth = w; c.strokeStyle = rgba(core, a); c.stroke();
}
// A point offset outward from the bulb's centre by d pixels.
const outward = (p, d, cx = MS_CX, cy = MS_CY) => { const dx = p[0] - cx, dy = p[1] - cy, l = Math.hypot(dx, dy) || 1; return [p[0] + dx / l * d, p[1] + dy / l * d]; };
// A band of light climbing the flame, clipped to it.
function climb(c, P, p, col, a, h = 34) {
  if (p <= 0 || p >= 1 || a <= 0) return;
  const y = MS_CY + 48 - p * 118;
  c.save(); trace(c, P); c.clip();
  const g = c.createLinearGradient(0, y - h, 0, y + h);
  g.addColorStop(0, rgba(col, 0)); g.addColorStop(.5, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
  c.fillStyle = g; c.fillRect(MS_CX - 70, y - h, 140, h * 2);
  c.restore();
}
function star(c, x, y, r, a) {
  if (a <= 0) return;
  c.strokeStyle = rgba('255,255,255', a); c.lineWidth = .8;
  c.beginPath(); c.moveTo(x - r, y); c.lineTo(x + r, y); c.moveTo(x, y - r); c.lineTo(x, y + r); c.stroke();
  glow(c, x, y, r * .9, '255,255,255', a * .8);
}
// 'r,g,b' strings mixed; whiten() takes an [r,g,b] array towards white.
const mix = (a, b, x) => { const q = b.split(','); return a.split(',').map((v, i) => Math.round(lerp(+v, +q[i], clamp01(x)))).join(','); };
const mixPal = (a, b, x) => ({ edge:mix(a.edge, b.edge, x), body:mix(a.body, b.body, x), core:mix(a.core, b.core, x), glow:mix(a.glow, b.glow, x), blur:lerp(a.blur, b.blur, x) });
const whiten = (col, x) => col.map(v => Math.round(v + (255 - v) * clamp01(x))).join(',');

// The last fully visible frame is also the pose used to begin the next scene.
const milestoneEndTime = scene => (scene.ms + MS_HOLD - MS_FADE) / 1000;
const initMilestoneScene = (tier, scene) => scene.init?.(seeded(7 + tier.length * 131)) ?? {};

function renderScene(c, dpr, scene, t, st) {
  c.save();
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 1;
  c.clearRect(0, 0, MS_W, MS_H);
  scene.draw(c, t, st);
  c.restore();
}

// ---------- the tier below ----------
// Every reveal from Flare up opens on the flame it grows out of: the previous
// tier's scene drawn at its settled end (same seed as its own reveal), through
// an offscreen canvas so it can be faded, filtered, moved and scaled as one.
const GHOST = {};
function ghost(c, tier, t, o = {}) {
  if ((o.a ?? 1) <= .004) return;
  const sc = SCENES[tier], k = c.getTransform().a;
  const g = GHOST[tier] ||= { st:initMilestoneScene(tier, sc), cv:document.createElement('canvas') };
  if (g.cv.width !== Math.round(MS_W * k)) { g.cv.width = Math.round(MS_W * k); g.cv.height = Math.round(MS_H * k); }
  renderScene(g.cv.getContext('2d'), k, sc, milestoneEndTime(sc) + t, g.st);
  const s = o.s ?? 1, ox = o.x ?? MS_CX, oy = o.y ?? MS_CY;
  c.save(); c.globalAlpha = o.a ?? 1; if (o.filter) c.filter = o.filter;
  c.translate(ox, oy); c.scale(s, s); c.translate(-ox, -oy);
  c.drawImage(g.cv, 0, 0, MS_W, MS_H);
  c.restore();
}

// ---------- tier bodies ----------
function emberPose(t) {
  const grow = seg(t, .1, .42), sc = grow < 1 ? Math.max(.02, outBack(grow)) : 1;
  const after = Math.max(0, t - .42), flick = Math.exp(-after * 5) * Math.sin(after * 38) * .07;
  return { s:sc * (1 + flick), sy:1 - flick * .6, y:MS_CY + (1 - sc) * 14, t,
    wob:lerp(.7, .2, seg(t, .35, 1)), a:seg(t, .1, .2) * (1 - Math.max(0, flick) * 2.5) };
}

function flarePose(t) {
  const surge = out3(seg(t, .28, .5)) * (1 - inOut(seg(t, .52, 1)));
  const hot = seg(t, .55, .9), sc = t < .26 ? lerp(1, .76, inOut(seg(t, 0, .26))) : lerp(.76, 1, out3(seg(t, .26, .55)));
  return { s:sc, y:MS_CY + (1 - sc) * 18, t, wob:.25 + surge * .9, curl:surge * 1.6, stretch:surge * .42,
    core:hot ? '255,' + Math.round(205 + 40 * hot) + ',' + Math.round(100 + 80 * hot) : null };
}

function flameFootpoint(P, angle, x, y) {
  let point = P[0], nearest = Infinity;
  for (const q of P) {
    const a = Math.atan2(q[1] - y, q[0] - x) - angle;
    const distance = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
    if (distance < nearest) { point = q; nearest = distance; }
  }
  return point;
}

// Two rooted plasma strands and their glowing sheath. The light follows the
// same curve as the material, including when a prominence leans or lifts off.
function solarProminence(c, A, B, { x = MS_CX, y = MS_CY, height, alpha, u, lean = 0, flare = 0, phase = 0, tear = 0 }) {
  if (alpha <= .002) return;
  function loop(scale) {
    const handle = foot => {
      const [px, py] = outward(foot, height * 1.33 * scale, x, y);
      return [px - (py - foot[1]) * lean, py + (px - foot[0]) * lean];
    };
    const a = handle(A), b = handle(B);
    c.beginPath(); c.moveTo(...A); c.bezierCurveTo(...a, ...b, ...B);
    return [a, b];
  }
  for (const scale of [.8, 1.14]) {
    loop(scale); c.lineWidth = .9; c.strokeStyle = rgba('255,226,120', (.5 - .26 * flare) * alpha * (1 - tear)); c.stroke();
  }
  const [a, b] = loop(1);
  const start = .15 * tear, end = 1 - .36 * tear;
  const point = s => {
    const v = 1 - s, lift = Math.sin(s * Math.PI) * flare;
    return [0, 1].map(i => v ** 3 * A[i] + 3 * v * v * s * a[i] + 3 * v * s * s * b[i] + s ** 3 * B[i]
      + lift * (2.2 * Math.sin(s * 15 + phase + 1.8 * i) + .8 * Math.sin(s * 24 - phase * 1.2 + i)));
  };
  let core = rgba('255,250,222', .95 * alpha);
  if (flare > .002) {
    // A broad, turbulent sheet of hot gas around the prominence's filaments.
    const spine = Array.from({ length:31 }, (_, i) => point(lerp(start, end, i / 30)));
    const left = [], right = [];
    for (const [i, p] of spine.entries()) {
      const s = i / 30, prev = spine[Math.max(0, i - 1)], next = spine[Math.min(30, i + 1)];
      const dx = next[0] - prev[0], dy = next[1] - prev[1], len = Math.hypot(dx, dy) || 1;
      const w = flare * Math.sin(Math.PI * s) * (5.4 + 2.8 * Math.sin(s * 18 - phase));
      left.push([p[0] - dy / len * w, p[1] + dx / len * w]);
      right.push([p[0] + dy / len * w * .59, p[1] - dx / len * w * .59]);
    }
    const [px, py] = point(.5), g = c.createRadialGradient(px, py, 0, px, py, height * .77 + 9);
    g.addColorStop(0, rgba('255,215,110', .73 * alpha));
    g.addColorStop(.53, rgba('255,135,24', .57 * alpha)); g.addColorStop(1, rgba('255,82,14', 0));
    c.fillStyle = g; trace(c, left.concat(right.reverse())); c.fill();
    trace(c, spine, false);
    const filament = c.createLinearGradient(...spine[0], ...spine.at(-1));
    filament.addColorStop(0, rgba('255,210,107', .95 * alpha * (1 - .91 * tear)));
    filament.addColorStop(.53, core);
    filament.addColorStop(1, rgba('255,224,151', .95 * alpha * (1 - .94 * tear)));
    core = filament;
  }
  c.lineWidth = 11 * alpha; c.strokeStyle = rgba('255,150,30', .16 * alpha); c.stroke();
  c.lineWidth = 4 * alpha + .6; c.strokeStyle = rgba('255,206,70', .6 * alpha); c.stroke();
  c.lineWidth = 1.5; c.strokeStyle = core; c.stroke();
  const K = point(lerp(start, end, u));
  glow(c, K[0], K[1], 6, '255,250,215', .9 * alpha);
  glow(c, A[0], A[1], 8, '255,220,110', .5 * alpha * (1 - tear));
  glow(c, B[0], B[1], 8, '255,220,110', .5 * alpha * (1 - tear));
}

// The feathered corona Solar bursts out of: a soft ring of radius R, fine rays.
function solarCorona(c, t, R, ca, rays, y = MS_CY) {
  if (ca <= 0) return;
  const g = c.createRadialGradient(MS_CX, y, R * .72, MS_CX, y, R * 1.32);
  g.addColorStop(0, rgba('255,220,80', 0)); g.addColorStop(.45, rgba('255,214,70', .32 * ca)); g.addColorStop(1, rgba('255,200,60', 0));
  c.fillStyle = g; c.beginPath(); c.arc(MS_CX, y, R * 1.32, 0, MS_TAU); c.fill();
  c.lineWidth = .8; c.strokeStyle = rgba('255,236,140', .5 * ca); c.beginPath();
  rays.forEach(([len, ph], k) => {
    const a = k / rays.length * MS_TAU + t * .18, L = R * (.05 + .16 * len * (.6 + .4 * Math.sin(t * 5 + ph)));
    c.moveTo(MS_CX + Math.cos(a) * R * .97, y + Math.sin(a) * R * .97); c.lineTo(MS_CX + Math.cos(a) * (R + L), y + Math.sin(a) * (R + L));
  });
  c.stroke();
  c.beginPath(); c.arc(MS_CX, y, R, 0, MS_TAU); c.lineWidth = 1.2; c.strokeStyle = rgba('255,244,190', .8 * ca); c.stroke();
}

function solarShimmer(c, P, t, alpha, x = MS_CX, y = MS_CY) {
  c.save(); trace(c, P); c.clip();
  for (let i = 0; i < 3; i++) glow(c, x + Math.sin(t * 1.7 + i * 2.1) * 16,
    y - 6 + Math.cos(t * 1.3 + i * 2) * 18, 22, '255,255,230', .16 * alpha);
  c.restore();
}

// A plasma-globe tendril from A to B: a smooth line with travelling ripples, pinned at both ends.
function tendril(A, B, t, d) {
  const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, pts = [];
  for (let j = 0; j <= 18; j++) {
    const s = j / 18, w = Math.sin(Math.PI * s) * d.amp * (Math.sin(s * 6 + t * 4 * d.sp + d.ph) + .5 * Math.sin(s * 15 - t * 9 + d.ph * 3));
    pts.push([A[0] + dx * s + nx * w, A[1] + dy * s + ny * w]);
  }
  return pts;
}
// Plasma: a deep blue globe, its rim glowing like glass, tendrils of charge
// wandering from a white-hot heart (the icon's inner flame) to the rim.
function plasmaBody(c, P, Q, t, st) {
  const H = [MS_CX, MS_CY + 14];
  c.save(); trace(c, P);
  const g = c.createRadialGradient(H[0], H[1], 0, MS_CX, MS_CY + 4, 76);
  g.addColorStop(0, '#9ad8ff'); g.addColorStop(.3, '#3b86ff'); g.addColorStop(.68, '#1d4bd0'); g.addColorStop(1, '#12308c');
  c.fillStyle = g; c.fill(); c.clip();
  c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.lineJoin = 'round';
  trace(c, P); c.lineWidth = 10; c.strokeStyle = 'rgba(80,160,255,.26)'; c.stroke(); c.lineWidth = 4; c.strokeStyle = 'rgba(150,215,255,.3)'; c.stroke();
  glow(c, H[0], H[1], 34 + 4 * Math.sin(t * 7), '90,170,255', .55);
  for (const d of st.tend) {
    const E = P[(d.i + Math.round(Math.sin(t * d.sp + d.ph) * d.wan) + P.length * 4) % P.length], B = [lerp(E[0], H[0], .03), lerp(E[1], H[1], .03)];
    const fl = .72 + .28 * Math.sin(t * 19 + d.ph * 5), pts = tendril(H, B, t, d);
    trace(c, pts, false);
    c.lineWidth = 5; c.strokeStyle = rgba('60,130,255', .22 * fl); c.stroke();
    c.lineWidth = 2; c.strokeStyle = rgba('140,210,255', .55 * fl); c.stroke();
    c.lineWidth = .8; c.strokeStyle = rgba('240,252,255', .95 * fl); c.stroke();
    glow(c, B[0], B[1], 9, '170,225,255', .8 * fl); glow(c, B[0], B[1], 2.5, '255,255,255', fl);
  }
  c.globalCompositeOperation = 'source-over';
  const hg = c.createRadialGradient(H[0], H[1] + 3, 0, H[0], H[1], 20);
  hg.addColorStop(0, '#ffffff'); hg.addColorStop(.5, 'rgba(225,246,255,.96)'); hg.addColorStop(1, 'rgba(130,200,255,.9)');
  trace(c, Q); c.shadowColor = 'rgba(140,210,255,1)'; c.shadowBlur = 18 + 6 * Math.sin(t * 7); c.fillStyle = hg; c.fill();
  c.restore();
  c.save(); trace(c, P); c.lineWidth = 1.3; c.strokeStyle = 'rgba(185,238,255,.95)'; c.shadowColor = 'rgba(69,168,255,.95)'; c.shadowBlur = 12; c.stroke(); c.restore();
}

function plasmaRim(c, P, t, arcs, alpha = 1) {
  for (const a of arcs) {
    const lt = (t - a.at) / .13;
    if (lt <= 0 || lt >= 1) continue;
    const A = outward(P[a.i], 1), B = outward(P[(a.i + a.span) % P.length], 1);
    drawBolt(c, bolt(A, B, seeded(a.seed + Math.floor(lt * 3)), .45, 3, -a.out), alpha * (1 - lt));
  }
}

function nebulaWisp(c, w, r, a, alpha, length = 1, flat = .62, scatter = 0) {
  if (alpha <= .002) return;
  const span = w.len * .45 * length;
  if (scatter > .002) {
    const points = Array.from({ length:25 }, (_, i) => {
      const s = i / 24, angle = a - span * (1 - s);
      const radius = r * (1 + scatter * (1 - s) * (.29 * Math.sin(w.a0 + s * 4) - .31));
      return [MS_CX + radius * Math.cos(angle), MS_CY + radius * Math.sin(angle) * flat];
    });
    trace(c, points, false);
  } else {
    c.beginPath(); c.ellipse(MS_CX, MS_CY, r, r * flat, 0, a - span, a);
  }
  c.lineCap = 'round';
  c.lineWidth = w.wid; c.strokeStyle = rgba(w.col, .07 * alpha); c.stroke();
  c.lineWidth = w.wid * .4; c.strokeStyle = rgba(w.col, .1 * alpha); c.stroke();
  c.save(); c.translate(MS_CX + Math.cos(a) * r, MS_CY + Math.sin(a) * r * flat); c.rotate(a + Math.PI / 2); c.scale(1.9, 1);
  glow(c, 0, 0, w.wid, w.col, .2 * alpha); c.restore();
}

function nebulaBody(c, P, t, blobs, alpha) {
  c.save(); c.globalAlpha = alpha; trace(c, P);
  const g = c.createRadialGradient(MS_CX, MS_CY + 10, 0, MS_CX, MS_CY, 80);
  g.addColorStop(0, '#c9a2ff'); g.addColorStop(.4, '#7a4bdc'); g.addColorStop(1, '#2a1a6e');
  c.fillStyle = g; c.fill(); c.clip(); c.globalCompositeOperation = 'lighter';
  for (const [ph, sp] of blobs) glow(c, MS_CX + Math.cos(t * sp + ph) * 20,
    MS_CY - 4 + Math.sin(t * sp * 1.3 + ph) * 24, 26, ph > 3 ? '240,200,255' : '150,100,255', .22);
  c.restore();
  c.save(); trace(c, P); c.lineWidth = 1.2; c.strokeStyle = rgba('214,180,255', .85 * alpha);
  c.shadowColor = 'rgba(183,121,255,.9)'; c.shadowBlur = 12; c.stroke(); c.restore();
}

const nebulaMote = (p, t) => [MS_CX + p.tgt[0] * MS_S + Math.sin(t * .9 + p.a0) * 1.5,
  MS_CY + p.tgt[1] * MS_S + Math.cos(t * .7 + p.a0) * 1.5];

function nebulaDust(c, p, t, x, y, alpha) {
  c.fillStyle = rgba(p.col, alpha * (.55 + .35 * Math.sin(t * 3 + p.a0)));
  c.fillRect(x - p.sz / 2, y - p.sz / 2, p.sz, p.sz);
}

function nebulaStar(c, s, t, dx = 0, dy = 0, alpha = 1) {
  const lt = t - s.at;
  if (lt <= 0) return;
  const light = bell(lt % 1.7, 0, .5);
  star(c, MS_CX + s.x + dx, MS_CY + s.y + dy, s.r * light, .9 * light * alpha);
}

// A curtain of aurora: 2px vertical slices of light, each a gradient from a
// soft bright hem up through cyan to violet and out. hem, H and I give each
// slice's hem height, length and brightness; keep their ripples slow along x
// so it reads as one sheet of light, not bars.
function curtain(c, x0, x1, hem, H, I, hue) {
  for (let x = Math.round(x0); x <= x1; x += 2) {
    const y = hem(x), h = H(x), a = I(x);
    if (a <= .01 || h < 2) continue;
    const g = c.createLinearGradient(0, y + 5, 0, y - h);
    g.addColorStop(0, hsla(hue, 100, 65, 0)); g.addColorStop(.07, hsla(hue, 100, 72, a)); g.addColorStop(.35, hsla(hue + 25, 95, 62, .5 * a));
    g.addColorStop(.75, hsla(hue + 125, 85, 66, .2 * a)); g.addColorStop(1, hsla(hue + 135, 80, 66, 0));
    c.fillStyle = g; c.fillRect(x, y - h, 2, h + 5);
  }
}
// Aurora: a window onto a night sky with curtains of light hanging in it.
const AUR_CURTAINS = [{ y:MS_CY + 34, amp:7, ph:0, h:80, hue:138 }, { y:MS_CY + 8, amp:6, ph:2.2, h:64, hue:156 }, { y:MS_CY - 20, amp:5, ph:4.1, h:46, hue:172 }];
// sky sets the night behind the curtains apart from a, so a streak loss can
// lift the light out of the window on its own.
function auroraBody(c, P, t, a, sky = a) {
  const top = MS_CY - 64, bot = MS_CY + 46;
  c.save(); trace(c, P); c.clip();
  c.globalAlpha = sky;
  const g = c.createLinearGradient(0, bot, 0, top);
  g.addColorStop(0, '#0e5c4a'); g.addColorStop(.5, '#0f4258'); g.addColorStop(1, '#30206c');
  c.fillStyle = g; c.fillRect(MS_CX - 60, top, 120, bot - top);
  c.globalAlpha = 1; c.globalCompositeOperation = 'lighter';
  for (const cu of AUR_CURTAINS) curtain(c, MS_CX - 50, MS_CX + 50,
    x => cu.y + cu.amp * Math.sin(x * .07 + t * 1.6 + cu.ph) + 2.5 * Math.sin(x * .16 - t * 2.4 + cu.ph),
    x => cu.h * (.6 + .4 * Math.sin(x * .05 + t * 1.9 + cu.ph)),
    x => a * (.68 + .32 * Math.sin(x * .08 - t * 2.6 + cu.ph)) * (.86 + .14 * Math.sin(x * .9 + t * 3)), cu.hue);
  c.restore();
}

function auroraRim(c, P, alpha) {
  c.save(); trace(c, P); c.lineWidth = 1.2; c.strokeStyle = rgba('210,255,245', .85 * alpha);
  c.shadowColor = 'rgba(90,255,220,.95)'; c.shadowBlur = 12; c.stroke(); c.restore();
}

function auroraVeil(c, P, t, height, intensity, { span = 46, lift = 0, drift = 0 } = {}) {
  if (intensity <= .002) return;
  const center = MS_CX + drift, x0 = center - span, x1 = center + span;
  const fold = x => Math.sin(Math.PI * (x - x0) / (x1 - x0));
  const hem = x => {
    const sample = MS_CX + (x - center) * 46 / span;
    let y = MS_CY - 14;
    for (const p of P) if (Math.abs(p[0] - sample) < 2.5 && p[1] < y) y = p[1];
    return y + 3 - lift + 3 * Math.sin(x * .05 + t * 1.7);
  };
  curtain(c, x0, x1, hem,
    x => height * (.45 + .55 * fold(x)) * (.7 + .3 * Math.sin(x * .04 + t * 1.3)),
    x => intensity * fold(x) * (.6 + .4 * Math.sin(x * .07 - t * 2.4)) * (.88 + .12 * Math.sin(x * .8 + t * 5)), 150);
}

function auroraRibbon(c, rb, i, t, conv, body, { open = 0, lift = 0, drift = 0, alpha = 1 } = {}) {
  const aura = i < 2, N = 56;
  const m = inOut(seg(t, .9 + rb.d, 1.62)) * (1 - open), drop = out3(seg(t, .15 + rb.d, 1.15));
  const k = lerp(rb.k, aura ? [1.3, 1.15][i] : 1 - i * .1, conv);
  const loop = flamePts(msShape().outer, { s:k, t, wob:.1, y:MS_CY - (aura ? 6 * conv : 0) });
  const Y = lerp(-40 - i * 14, MS_CY - 36 + i * 11, drop) - lift;
  const a = alpha * seg(t, .15 + rb.d, .6) * (aura ? 1 - .2 * body + .1 * Math.sin(t * 1.7 + i) * body : 1 - body);
  if (a <= .01) return;
  const points = [];
  for (let j = 0; j <= N; j++) {
    const s = j / N;
    const x = MS_CX + drift + (2 * s - 1) * (135 + 32 * open);
    const y = Y + (14 + 13 * open) * Math.sin(s * 6.5 + t * 2.2 + rb.ph) + 7 * Math.sin(s * 13 - t * 3.1);
    const L = loop[Math.round(s * loop.length) % loop.length];
    const rip = lerp(1.3, aura ? 2.2 : 1.3, conv) * Math.sin(s * 22 + t * 4 + rb.ph);
    points.push([lerp(x, L[0] + rip, m), lerp(y, L[1] + rip * .5, m)]);
  }
  const left = [], right = [], wide = aura ? 1 + .5 * conv : 1;
  for (let j = 0; j <= N; j++) {
    const p = points[Math.max(0, j - 1)], q = points[Math.min(N, j + 1)];
    const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1;
    const thickness = lerp(.35 + .65 * Math.sin(Math.PI * j / N), .7 + .5 * Math.sin(j / N * 9 + t * 2.4), seg(m, .4, .6));
    const w = wide * rb.w * thickness * (1 + .35 * Math.sin(j * .5 + t * 3));
    left.push([points[j][0] - dy / l * w / 2, points[j][1] + dx / l * w / 2]);
    right.push([points[j][0] + dy / l * w / 2, points[j][1] - dx / l * w / 2]);
  }
  const center = MS_CX + drift * open, h = rb.hue + 30 * Math.sin(t * 1.3 + i);
  const g = c.createLinearGradient(center - 120, 0, center + 120, 0);
  g.addColorStop(0, hsla(h, 90, 62, 0)); g.addColorStop(.25, hsla(h + 20, 95, 64, .5 * a));
  g.addColorStop(.55, hsla(h - 25, 90, 60, .6 * a)); g.addColorStop(.8, hsla(h + 95, 80, 70, .45 * a));
  g.addColorStop(1, hsla(h, 90, 62, 0));
  c.fillStyle = g; trace(c, left.concat(right.reverse())); c.fill();
  const unfurl = seg(open, .62, .91);
  if (m < .6 && unfurl < 1) {
    const height = 30 + 21 * open;
    c.save(); c.globalAlpha = (1 - m / .6) * a * .55 * (1 - unfurl);
    trace(c, left.concat(left.map((p, j) => [p[0], p[1] - height * Math.sin(Math.PI * j / N)]).reverse()));
    const cg = c.createLinearGradient(0, Y - height - 14, 0, Y + 8);
    cg.addColorStop(0, hsla(h + 40, 90, 70, 0)); cg.addColorStop(1, hsla(h, 90, 65, .5));
    c.fillStyle = cg; c.fill(); c.restore();
  }
  if (unfurl > 0) {
    const x0 = points[0][0], x1 = points[N][0];
    const fold = x => Math.sin(Math.PI * seg(x, x0, x1));
    let j = 0;
    const hem = x => {
      while (j < N - 1 && points[j + 1][0] < x) j++;
      const p = points[j], q = points[j + 1];
      return lerp(p[1], q[1], seg(x, p[0], Math.max(p[0] + .01, q[0])));
    };
    curtain(c, Math.max(0, Math.ceil(x0 / 2) * 2), Math.min(MS_W, x1), hem,
      x => (49 + 48 * fold(x)) * (.74 + .26 * Math.sin(x * .056 + t * 2.5)),
      x => a * unfurl * .79 * fold(x) * (.53 + .47 * Math.sin(x * .052 - t * 2.8)) * (.77 + .23 * Math.sin(x * .92 + t * 5)), h);
  }
}
// Quasar's flame holds a quasar of its own: a dark lane across it, a tilted
// inner disk streaming round a white-hot core (brighter on its approaching
// side), a thin jet on its axis and the core's diffraction spikes. ex washes
// it all out white, for the moment it lands. Drawn at the standard size;
// callers scale it with the canvas transform.
const QUASAR_TILT = -.2;
const coreDisk = r => Array.from({ length:120 }, (_, i) => ({ r0:5 + r() * 31, a0:r() * MS_TAU, sz:.5 + r() * 1.1, col:['150,175,255', '190,150,255', '225,232,255'][i % 3] }));
function quasarBody(c, P, t, core, ex, k = 1) {
  const x = MS_CX, y = MS_CY + 9, cs = Math.cos(QUASAR_TILT), sn = Math.sin(QUASAR_TILT);
  c.save(); trace(c, P); c.shadowColor = 'rgba(140,160,255,.95)'; c.shadowBlur = 28 * k;
  const g = c.createRadialGradient(x, y, 0, MS_CX, MS_CY, 92);
  g.addColorStop(0, '#ffffff'); g.addColorStop(.2, '#eef1ff'); g.addColorStop(.55, '#aab5ff'); g.addColorStop(1, '#6c46ff');
  c.fillStyle = g; c.fill(); c.shadowBlur = 0; c.lineWidth = 1.2; c.strokeStyle = 'rgba(255,255,255,.95)'; c.stroke(); c.clip();
  // The dust lane: the disk's plane, darker where it crosses the flame.
  c.save(); c.translate(x, y); c.rotate(QUASAR_TILT); c.scale(1, .26);
  const lg = c.createRadialGradient(0, 0, 6, 0, 0, 50);
  lg.addColorStop(0, 'rgba(50,30,150,0)'); lg.addColorStop(.3, 'rgba(50,30,150,.5)'); lg.addColorStop(.7, 'rgba(60,40,170,.3)'); lg.addColorStop(1, 'rgba(60,40,170,0)');
  c.fillStyle = lg; c.beginPath(); c.arc(0, 0, 50, 0, MS_TAU); c.fill(); c.restore();
  c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
  const pos = (r, a) => { const u = r * Math.cos(a), v = r * Math.sin(a) * .27; return [x + u * cs - v * sn, y + u * sn + v * cs]; };
  const ring = back => {
    for (const p of core) {
      const a = p.a0 + t * 2.6 * Math.sqrt(16 / p.r0);
      if ((Math.sin(a) < 0) !== back) continue;
      const d = .5 + .5 * Math.cos(a), A = pos(p.r0, a - .3), M = pos(p.r0, a - .15), B = pos(p.r0, a);
      c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(M[0], M[1]); c.lineTo(B[0], B[1]);
      c.lineWidth = p.sz; c.strokeStyle = rgba(p.r0 < 11 ? '255,255,255' : p.col, (back ? .5 : .95) * (.3 + .7 * d)); c.stroke();
    }
  };
  ring(true);
  // The jet, narrow and flickering, both ways along the axis.
  const jl = 34 + 4 * Math.sin(t * 13), jw = 2.2 + .7 * Math.sin(t * 29);
  for (const dir of [-1, 1]) {
    const nx = -sn * dir, ny = cs * dir, jg = c.createLinearGradient(x, y, x + nx * jl, y + ny * jl);
    jg.addColorStop(0, 'rgba(255,255,255,.95)'); jg.addColorStop(.5, 'rgba(190,200,255,.5)'); jg.addColorStop(1, 'rgba(150,120,255,0)');
    c.fillStyle = jg; c.beginPath(); c.moveTo(x + cs * jw, y + sn * jw); c.lineTo(x + nx * jl, y + ny * jl); c.lineTo(x - cs * jw, y - sn * jw); c.closePath(); c.fill();
  }
  // The core: a soft halo, an overexposed point, its photon ring, spikes.
  const pu = 1 + .12 * Math.sin(t * 9);
  glow(c, x, y, 24 * pu, '190,205,255', .85); glow(c, x, y, 9 * pu, '255,255,255', 1);
  c.save(); c.translate(x, y); c.rotate(QUASAR_TILT); c.beginPath(); c.ellipse(0, 0, 9.5, 2.7, 0, 0, MS_TAU); c.lineWidth = 1.1; c.strokeStyle = 'rgba(255,255,255,.85)'; c.stroke();
  for (let q = 0; q < 4; q++) {
    const L = (q % 2 ? 16 : 26) * pu, sg = c.createLinearGradient(0, 0, L, 0);
    sg.addColorStop(0, 'rgba(255,255,255,.9)'); sg.addColorStop(1, 'rgba(200,210,255,0)');
    c.save(); c.rotate(q * Math.PI / 2 + .78); c.fillStyle = sg; c.beginPath(); c.moveTo(0, -1.1); c.lineTo(L, 0); c.lineTo(0, 1.1); c.closePath(); c.fill(); c.restore();
  }
  c.restore();
  ring(false);
  if (ex > 0) { c.globalCompositeOperation = 'source-over'; c.fillStyle = rgba('255,255,255', ex); c.fillRect(0, 0, MS_W, MS_H); }
  c.restore();
}

// Twin jets along the disk's axis, L long and wid wide at the core, knots of
// light running out along them at flow px/s (negative: falling back in).
function quasarJets(c, t, L, wid, { a = 1, knots = a, flow = 420 } = {}) {
  if (wid <= .05 || L <= 1) return;
  const cos = Math.cos(QUASAR_TILT), sin = Math.sin(QUASAR_TILT), O = [MS_CX, MS_CY + 5];
  for (const dir of [-1, 1]) {
    const nx = -sin * dir, ny = cos * dir, px = -ny, py = nx;
    const g = c.createLinearGradient(O[0], O[1], O[0] + nx * L, O[1] + ny * L);
    g.addColorStop(0, rgba('255,255,255', .95 * a)); g.addColorStop(.35, rgba('160,180,255', .65 * a)); g.addColorStop(1, 'rgba(130,90,255,0)');
    c.fillStyle = g; c.beginPath(); c.moveTo(O[0] + px * wid, O[1] + py * wid); c.lineTo(O[0] + nx * L, O[1] + ny * L); c.lineTo(O[0] - px * wid, O[1] - py * wid); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(O[0], O[1]); c.lineTo(O[0] + nx * L * .85, O[1] + ny * L * .85); c.lineWidth = Math.max(.5, wid * .3); c.strokeStyle = rgba('255,255,255', .9 * a); c.stroke();
    for (let k = 0; k < 3; k++) { const d = ((t * flow + k * 85) % L + L) % L; glow(c, O[0] + nx * d, O[1] + ny * d, 6 * (1 - d / L) + 2, '220,230,255', .6 * (1 - d / L) * knots); }
  }
}

function quasarDisk(c, t, disk, back, { wind = 0, escape = 0, alpha = 1 } = {}) {
  const cos = Math.cos(QUASAR_TILT), sin = Math.sin(QUASAR_TILT);
  const spin = 2.4 * t + 7 * Math.max(0, Math.min(t, 1.9) - .25) ** 2 + Math.max(0, t - 1.9) * 7 * 2 * 1.65 * .35 + 2.8 * wind;
  const scat = seg(t, 1.78, 2.4), form = seg(t, .12, .7);
  for (const p of disk) {
    const a = p.a0 + spin * p.sp * Math.sqrt(34 / p.r0);
    if ((Math.sin(a) < 0) !== back) continue;
    const light = alpha * form * (p.keep ? 1 - .55 * seg(t, 2.2, 3.2) : 1 - scat) * (back ? .45 : .9);
    if (light <= .01) continue;
    const base = p.r0 * (1 - .22 * seg(t, .3, 1.5));
    const r = p.keep ? lerp(base, 46 + p.r0 * .4, out3(scat)) : base * (1 + 2.2 * out3(scat));
    const drift = seg(escape, .1 + .25 * (p.sp - .8) / .45, 1);
    const kick = (32 + 1.45 * p.r0) * drift;
    const pos = (angle, trail) => {
      const radius = r * (1 - .4 * wind) + kick * (1 - .56 * trail);
      const x = radius * Math.cos(angle), y = radius * Math.sin(angle) * (.27 + .39 * drift);
      return [MS_CX + x * cos - y * sin, MS_CY + 5 + x * sin + y * cos];
    };
    const lead = .1 + .12 * seg(t, .4, 1.6) + .24 * wind + .68 * drift;
    const points = drift ? [pos(a - lead, 1), pos(a - .47 * lead, .47), pos(a, 0)] : [pos(a - lead, 1), pos(a, 0)];
    trace(c, points, false); c.lineWidth = p.sz; c.strokeStyle = rgba(p.r0 < 28 ? '235,240,255' : p.col, light * (1 - .65 * drift)); c.stroke();
  }
}

const HOLE_Y = MS_CY + 9, HOLE_TILT = -.12, HOLE_FLAT = .2;
const HOLE_COS = Math.cos(HOLE_TILT), HOLE_SIN = Math.sin(HOLE_TILT);
function singularityPoint(r, a, flat = HOLE_FLAT) {
  const u = r * Math.cos(a), v = r * Math.sin(a) * flat;
  return [MS_CX + u * HOLE_COS - v * HOLE_SIN, HOLE_Y + u * HOLE_SIN + v * HOLE_COS];
}

function singularityVignette(c, opacity) {
  if (opacity <= .002) return;
  const g = c.createRadialGradient(MS_CX, HOLE_Y, 0, MS_CX, HOLE_Y, 178);
  g.addColorStop(0, rgba('0,0,0', opacity)); g.addColorStop(.4, rgba('0,0,0', .8 * opacity));
  g.addColorStop(.75, rgba('0,0,0', .3 * opacity)); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(0, 0, MS_W, MS_H);
}

function singularityStars(c, t, stars, lens, alpha, { pull = 0, release = 0 } = {}) {
  if (alpha <= .002) return;
  const front = 195 * out3(release), wake = seg(release, 0, .12);
  for (const s of stars) {
    const loosen = seg(front - s.r, -19, 17) * wake;
    const th = lens * (1 - loosen);
    const ripple = wake ? Math.exp(-(((s.r - front) / 19) ** 2)) * (1 - release) * wake : 0;
    const lensed = (s.r + Math.sqrt(s.r * s.r + 4 * th * th)) / 2, mag = lensed / s.r;
    const rp = lensed + 15 * ripple;
    const a = s.a + t * .03 + (pull * .32 * (1 - loosen) + .27 * ripple) * Math.sin(2 * s.a - t * 2.1);
    const al = s.b * alpha * (1 - seg(rp, 120, 176)) * Math.min(1, .5 + (mag - 1) * .6 + ripple * .3);
    if (al <= .01) continue;
    const L = (s.sz + (mag - 1) * (7 + 4 * pull) + 22 * ripple) / rp;
    c.beginPath(); c.arc(MS_CX, HOLE_Y, rp, a - L / 2, a + L / 2);
    c.lineWidth = s.sz * Math.min(1.8, 1 + .25 * (mag - 1)); c.strokeStyle = rgba('235,240,255', al); c.stroke();
    const reflection = lensed - s.r;
    const image = pull * (1 - loosen) * seg(reflection, 13, 26);
    if (image <= .01) continue;
    c.beginPath(); c.arc(MS_CX, HOLE_Y, reflection, a + Math.PI - .11 * image, a + Math.PI + .11 * image);
    c.lineWidth = .7 * s.sz; c.strokeStyle = rgba('235,240,255', .55 * al * image); c.stroke();
  }
}

function singularityDisk(c, t, disk, back, form, { pull = 0, wind = 0, alpha = 1 } = {}) {
  if (form * alpha <= .002) return;
  const scale = 1 - .975 * pull;
  c.save(); c.translate(MS_CX, HOLE_Y); c.rotate(HOLE_TILT); c.scale(scale, HOLE_FLAT * scale);
  const g = c.createLinearGradient(-100, 0, 100, 0);
  g.addColorStop(0, 'rgba(255,215,190,.14)'); g.addColorStop(.5, 'rgba(255,250,245,.42)'); g.addColorStop(1, 'rgba(225,235,255,.75)');
  c.strokeStyle = g; c.globalAlpha = alpha * form * (back ? .5 : .8);
  for (const [r, width] of [[54, 6], [66, 10], [82, 14], [96, 8]]) {
    c.beginPath(); c.arc(0, 0, r, back ? Math.PI : 0, back ? MS_TAU : Math.PI); c.lineWidth = width; c.stroke();
  }
  c.restore();
  for (const p of disk) {
    const a = p.a0 + (t * 1.9 + wind * 5.5) * p.sp * Math.sqrt(60 / p.r0);
    if ((Math.sin(a) < 0) !== back) continue;
    const r = p.r0 * (1 + .5 * (1 - out3(form))), dop = (1 + Math.cos(a)) / 2;
    const light = alpha * form * (back ? .55 : 1) * (.2 + .8 * dop * dop);
    const trail = .2 + .25 * wind;
    trace(c, [singularityPoint(r * scale + 8 * pull, a - trail),
      singularityPoint(r * scale + 4 * pull, a - trail / 2), singularityPoint(r * scale, a)], false);
    c.lineWidth = p.sz * (1 - .62 * pull);
    c.strokeStyle = rgba(r * scale < 62 ? '255,255,255' : dop > .5 ? '232,240,255' : '255,234,214', light); c.stroke();
  }
}

function singularityFall(c, t, particles, back, pull = 0, alpha = 1) {
  if (alpha <= .002) return;
  for (const p of particles) {
    const u0 = 1.3 + p.d * .7, u = seg(t, u0, u0 + 1.1);
    if (u <= 0 || (p.rf < 20 && u >= 1)) continue;
    let front = false, heat = 0, edge = 1;
    c.beginPath();
    for (let j = 0; j < 5; j++) {
      const tt = t - j * .018, uu = inOut(seg(tt, u0, u0 + 1.1)), r = lerp(p.r0, p.rf, uu) * (1 - .94 * pull);
      const a = p.a0 + p.sp * (.9 * tt + 1.6 * p.r0 / (r + 12));
      const q = singularityPoint(r, a, lerp(.9, HOLE_FLAT, uu));
      if (!j) { front = Math.sin(a) > 0; heat = 1 - clamp01((r - p.rf) / 70); edge = 1 - seg(Math.hypot(q[0] - MS_CX, q[1] - HOLE_Y), 125, 168); }
      j ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]);
    }
    if ((p.rf < 20 || !front) !== back) continue;
    const al = alpha * edge * seg(u, 0, .15) * (p.rf < 20 ? 1 - seg(u, .85, 1) : 1 - .5 * seg(t, 2.7, 3.5));
    c.lineWidth = p.sz; c.strokeStyle = rgba(whiten(p.col, heat * .85), al); c.stroke();
  }
}

function singularityDrift(c, t, particles, pull = 0, alpha = 1) {
  if (t <= 2.6 || alpha <= .002) return;
  for (const d of particles) {
    const al = alpha * .55 * seg(t, 2.6, 3.1), f0 = (t * .4 + d.ph) % 1;
    if (f0 < .04) continue;
    c.beginPath();
    for (let j = 0; j < 4; j++) {
      const ph = (t - j * .03) * .4 + d.ph, f = in3(ph % 1);
      const q = singularityPoint(lerp(130, 40, f) * (1 - .97 * pull), d.a + Math.floor(ph) * 2.4 + (2.2 + 4 * pull) * f, lerp(.8, .3, ph % 1));
      j ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]);
    }
    c.lineWidth = 1; c.strokeStyle = rgba('255,255,255', al * Math.sin(Math.PI * f0)); c.stroke();
  }
}

// Light bent up around the silhouette and the dark horizon in front of it.
function singularityHorizon(c, S, C, t, born, e, haloA) {
  if (haloA > 0) {
    let top = Infinity, bot = -Infinity;
    for (const p of S) { top = Math.min(top, p[1]); bot = Math.max(bot, p[1]); }
    top -= 22; bot += 22;
    const pl = clamp01((HOLE_Y - top) / (bot - top)), g = c.createLinearGradient(0, top, 0, bot);
    g.addColorStop(0, 'rgba(255,250,240,.7)'); g.addColorStop(.1, 'rgba(255,250,240,1)'); g.addColorStop(Math.max(.11, pl - .14), 'rgba(255,240,225,.8)');
    g.addColorStop(pl, 'rgba(255,255,255,.18)'); g.addColorStop(Math.min(.99, pl + .12), 'rgba(235,240,255,.6)'); g.addColorStop(1, 'rgba(235,240,255,.2)');
    c.strokeStyle = g;
    c.save(); trace(c, S.map(p => outward(p, 4, C[0], C[1]))); c.shadowColor = 'rgba(255,248,235,.95)'; c.shadowBlur = 22; c.globalAlpha = .75 * haloA; c.lineWidth = 4; c.stroke(); c.restore();
    for (const [d, w, al, dash, sp] of [[2.6, 1.4, 1, [], 0], [5.5, 2.6, .55, [], 0], [9.5, 3.6, .26, [], 0], [15, 6, .1, [], 0], [7.5, 1.4, .7, [3, 15, 1, 9], 70], [12, 1.2, .45, [2, 21], -40], [11, 5, .16, [], 0]]) {
      trace(c, S.map(p => outward(p, d, C[0], C[1]))); c.globalAlpha = haloA * al * (1 + .1 * Math.sin(t * 2.1 + d));
      c.lineWidth = w; c.setLineDash(dash); c.lineDashOffset = -t * sp; c.stroke();
    }
    c.setLineDash([]); c.globalAlpha = 1;
  }
  c.globalCompositeOperation = 'source-over';
  trace(c, S); c.fillStyle = '#000'; c.fill();
  if (e > 0) {
    c.save(); c.clip();
    for (let j = 0; j < 2; j++) glow(c, MS_CX + Math.sin(t * .7 + j * 3) * 14, MS_CY - 2 + Math.cos(t * .5 + j * 2) * 18, 26, '38,38,46', .55 * e);
    c.restore();
  }
  c.globalCompositeOperation = 'lighter';
  c.save(); c.shadowColor = 'rgba(255,255,255,.9)'; c.shadowBlur = 5; trace(c, S); c.lineWidth = 1.6; c.strokeStyle = rgba('255,255,255', born); c.stroke(); c.restore();
  if (e > 0) { trace(c, S.map(p => outward(p, 2.2 + .6 * Math.sin(t * 3), C[0], C[1]))); c.lineWidth = .5; c.strokeStyle = rgba('255,255,255', .4 * e); c.stroke(); }
}

// ---------- the eight scenes ----------
// ms: reveal length; at: when the flame lands (chime); title: when the name
// shows, with its WAAPI keyframes (ti on the block, tb on the name itself).
const SCENES = {
  // Ember: a spark is born, swells into the flame, flickers, sheds three embers.
  red: {
    ms:1300, at:.3, title:.62, ti:[[{ opacity:0, transform:'translateY(5px)' }, { opacity:1, transform:'none' }], { duration:380, easing:'ease-out' }],
    pal:{ edge:'150,22,32', body:'255,69,69', core:'255,160,130', glow:'255,69,69', blur:14 },
    init:r => ({ embers:[0, 1, 2].map(i => ({ x:(i - 1) * 8 + r() * 6 - 3, d:.5 + i * .13, ph:r() * MS_TAU, rise:55 + r() * 25 })) }),
    draw(c, t, st) {
      c.globalCompositeOperation = 'lighter';
      glow(c, MS_CX, MS_CY + 14, 4 + 12 * seg(t, 0, .12), '255,190,170', .95 * (1 - seg(t, .18, .5)));
      c.globalCompositeOperation = 'source-over';
      if (t > .1) paintFire(c, emberPose(t), this.pal);
      c.globalCompositeOperation = 'lighter';
      for (const e of st.embers) {
        const p = seg(t, e.d, e.d + .85);
        if (p <= 0 || p >= 1) continue;
        const x = MS_CX + e.x + Math.sin(p * 5 + e.ph) * 4, y = MS_CY - 44 - p * e.rise, a = Math.min(1, p * 8) * (1 - p);
        glow(c, x, y, 5, '255,90,70', a * .7); glow(c, x, y, 1.6, '255,220,200', a);
      }
    } },

  // Flare: Ember's red flame draws in and reddens to orange, surges up,
  // tongues curling, a clean flash and curved sparks, then it settles at full
  // size burning hotter.
  orange: {
    ms:1500, at:.52, title:.78, ti:[[{ opacity:0, transform:'scale(1.35)' }, { opacity:1, transform:'scale(.95)', offset:.6 }, { opacity:1, transform:'none' }], { duration:300, easing:'ease-out' }],
    pal:{ edge:'200,72,10', body:'255,152,47', core:'255,205,100', glow:'255,140,40', blur:18 },
    init:r => ({ sparks:Array.from({ length:8 }, (_, i) => ({ a:-Math.PI / 2 + (i / 7 - .5) * 1.9 + (r() - .5) * .3, v:110 + r() * 70, bend:(r() - .5) * 2.4, d:r() * .09, life:.5 + r() * .25 })) }),
    draw(c, t, st) {
      paintFire(c, flarePose(t), mixPal(SCENES.red.pal, this.pal, seg(t, .08, .42)));
      c.globalCompositeOperation = 'lighter';
      const f = seg(t, .48, .78);
      if (f > 0 && f < 1) {
        glow(c, MS_CX, MS_CY, 14 + out3(f) * 78, '255,170,60', .55 * (1 - f));
        c.beginPath(); c.arc(MS_CX, MS_CY, 12 + out3(f) * 70, 0, MS_TAU); c.lineWidth = 1.4 * (1 - f) + .3; c.strokeStyle = rgba('255,220,150', .6 * (1 - f)); c.stroke();
      }
      c.lineCap = 'round';
      for (const p of st.sparks) {
        const ts = t - .5 - p.d;
        if (ts <= 0 || ts >= p.life) continue;
        const at = k => { const a = p.a + p.bend * k; return [MS_CX + Math.cos(a) * p.v * k, MS_CY - 22 + Math.sin(a) * p.v * k + 70 * k * k]; };
        const [x0, y0] = at(Math.max(0, ts - .05)), [x1, y1] = at(ts), a = 1 - ts / p.life;
        c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.lineWidth = 1.8; c.strokeStyle = rgba('255,215,140', a); c.stroke();
      }
    } },

  // Solar: Flare's flame heats white-gold at its heart and draws a breath,
  // then ignites: a feathered corona bursts out of it, the flame burns gold,
  // great prominences loop out of its surface in an X and drain back, a
  // golden pulse climbs it; a faint shimmer stays.
  yellow: {
    ms:1900, at:.42, title:1.25, ti:[[{ opacity:0, transform:'translateY(6px)', filter:'brightness(2.2)' }, { opacity:1, transform:'none', filter:'none' }], { duration:600, easing:'cubic-bezier(.2,.8,.3,1)' }],
    pal:{ edge:'214,150,0', body:'255,226,74', core:'255,248,205', glow:'255,210,60', blur:24 },
    init:r => ({ rays:Array.from({ length:72 }, () => [r(), r() * MS_TAU]), proms:[-2.5, -.65, .55, 2.6].map(a => ({ a:a + (r() - .5) * .3, w:.27 + r() * .08, h:8 + r() * 4, d:r() * .16, ph:r() })) }),
    draw(c, t, st) {
      const heat = seg(t, 0, .38);
      if (t < .5) ghost(c, 'orange', t, { a:(1 - seg(t, .32, .46)), s:1 - .08 * inOut(heat), filter:'brightness(' + (1 + 1.4 * heat).toFixed(2) + ')' });
      c.globalCompositeOperation = 'lighter';
      glow(c, MS_CX, MS_CY + 6, 10 + 36 * heat, '255,245,190', .9 * bell(t, .04, .8));
      glow(c, MS_CX, MS_CY, 90, '255,250,210', .6 * bell(t, .34, .85));
      solarCorona(c, t, 34 + out3(seg(t, .34, 1)) * 34, seg(t, .34, .46) * (1 - seg(t, 1.3, 1.9)), st.rays);
      const ig = seg(t, .36, .62);
      if (ig <= 0) return;
      c.globalCompositeOperation = 'source-over';
      const P = paintFire(c, { s:lerp(.92, 1, out3(ig)) * (1 + .05 * bell(t, .36, .9)), t, wob:.12, a:seg(t, .36, .44) }, this.pal);
      c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
      for (const p of st.proms) {
        const g = bell(t, .6 + p.d, 1.65 + p.d);
        if (!g) continue;
        const A = flameFootpoint(P, p.a - p.w, MS_CX, MS_CY), B = flameFootpoint(P, p.a + p.w, MS_CX, MS_CY);
        const H = p.h * 1.7 * out3(seg(t, .6 + p.d, 1.02 + p.d));
        solarProminence(c, A, B, { height:H, alpha:g, u:(t * .8 + p.ph) % 1 });
      }
      climb(c, P, seg(t, 1.1, 1.55), '255,255,215', .7);
      if (t > 1.2) solarShimmer(c, P, t, seg(t, 1.2, 1.6));
    } },

  // Plasma: Solar's flame under a gathering charge, streamers flickering off
  // its tip, until lightning strikes it from above. The charge runs down it,
  // both sides at once, turning it to plasma behind a crackling front: a deep
  // blue globe with tendrils wandering from a white-hot heart to its rim. A
  // sharp burst, arcs leaping round it, and they keep crackling.
  blue: {
    ms:2300, at:1.02, title:1.4,
    ti:[[{ opacity:0, filter:'brightness(2.5) drop-shadow(0 0 6px #45a8ff)' }, { opacity:1, offset:.15 }, { opacity:.2, offset:.3 }, { opacity:1, offset:.45 }, { opacity:.55, offset:.6 }, { opacity:1, filter:'none' }], { duration:480, easing:'linear' }],
    init:r => {
      const n = msShape().outer.length;
      return { tend:Array.from({ length:8 }, (_, k) => ({ i:Math.round((k + .5) / 8 * n + (r() - .5) * 8), ph:r() * MS_TAU, sp:.6 + r() * .8, amp:3 + r() * 4, wan:5 + r() * 8 })),
        veins:Array.from({ length:5 }, (_, k) => ({ x:(k / 4 - .5) * 70 + (r() - .5) * 10, y:.45 + r() * .5, seed:1 + Math.floor(r() * 1e6) })),
        arcs:Array.from({ length:14 }, (_, k) => ({ at:k < 7 ? 1.04 + r() * .6 : 1.85 + (k - 7) * .42 + r() * .2, i:Math.floor(r() * n), span:8 + Math.floor(r() * 10), out:6 + r() * 9, seed:1 + Math.floor(r() * 1e6) })),
        sky:1 + Math.floor(r() * 1e6) };
    },
    draw(c, t, st) {
      const sh = msShape(), P = flamePts(sh.outer, { t, wob:.06 }), tip = P[0], tick = Math.floor(t / .045);
      const top = tip[1] - 3, base = MS_CY + 6 * MS_S + 5, fr = inOut(seg(t, .5, 1)), yF = lerp(top, base, fr);
      const split = 2.4 * bell(t, .46, .72) + 2.2 * bell(t, .98, 1.22);
      // Solar's flame, still burning below the front, a little drained.
      if (t < 1.02) {
        c.save(); c.beginPath(); c.rect(0, t < .5 ? 0 : yF, MS_W, MS_H); c.clip();
        ghost(c, 'yellow', t, { filter:'saturate(' + (1 - .45 * seg(t, .1, .5)).toFixed(2) + ') brightness(' + (1 - .15 * seg(t, .1, .5) + .5 * bell(t, .46, .6)).toFixed(2) + ')' });
        c.restore();
      }
      c.globalCompositeOperation = 'lighter';
      // The charge gathers into a point overhead, crackling; streamers flicker
      // up off the tip to meet it.
      const sky = [MS_CX + 14, 26], ch = seg(t, .05, .45) * (1 - seg(t, .55, 1.1));
      glow(c, sky[0], sky[1], 24 + 26 * ch, '69,140,255', .5 * ch); glow(c, sky[0], sky[1], 4 + 4 * ch, '230,245,255', ch * (.7 + .3 * Math.sin(t * 60)));
      if (ch > .1) for (let k = 0; k < 3; k++) { const rand = seeded(tick * 17 + k * 5 + 9), a = rand() * MS_TAU; drawBolt(c, bolt(sky, [sky[0] + Math.cos(a) * 18 * ch, sky[1] + Math.sin(a) * 14 * ch], rand, .5, 2), .6 * ch); }
      const sa = seg(t, .14, .44) * (1 - seg(t, .48, .52));
      if (sa > 0) for (let k = 0; k < 3; k++) {
        const rand = seeded(tick * 31 + k * 7 + 3), end = [tip[0] + (rand() - .5) * 34, tip[1] - 8 - rand() * 22 * sa];
        drawBolt(c, bolt(tip, end, rand, .5, 3), sa * (.4 + .6 * rand()));
      }
      // The strike: a leader steps down from the top, then the return stroke
      // flickers along the same path.
      const ld = seg(t, .38, .5), ret = bell(t, .48, .86);
      if (ld > 0 && t < .86) {
        const rand = seeded(st.sky), pts = bolt(sky, tip, rand, .34, 5), m = Math.max(2, Math.ceil(ld * pts.length));
        const lit = t < .5 ? .75 : ret * (Math.sin(t * 90) > -.4 ? 1 : .35);
        drawBolt(c, pts.slice(0, m), lit, split, '245,252,255', '69,150,255', t < .5 ? 1 : 2.2);
        for (let b = 0; b < 4; b++) {
          const j = 5 + b * 6, s0 = pts[j], end = s0 && [s0[0] + (b % 2 ? 1 : -1) * (14 + rand() * 24), s0[1] + 10 + rand() * 22];
          if (j < m) drawBolt(c, bolt(s0, end, rand, .45, 3), lit * .6, split);
        }
        glow(c, tip[0], tip[1], 46, '160,215,255', .85 * ret); glow(c, tip[0], tip[1], 8, '255,255,255', ret);
      }
      // Plasma above the front.
      if (t >= .48) {
        c.save();
        if (t < 1.02) { c.beginPath(); c.rect(0, 0, MS_W, yF); c.clip(); }
        c.globalCompositeOperation = 'source-over';
        plasmaBody(c, P, flamePts(sh.inner, { s:1 + .05 * Math.sin(t * 7), t, wob:.06 }), t, st);
        c.restore();
        c.globalCompositeOperation = 'lighter';
      }
      if (fr > 0 && fr < 1) {
        // Branches of the strike race ahead of the front inside the flame...
        c.save(); trace(c, P); c.clip();
        for (const v of st.veins) {
          const g = seg(t, .5, .5 + .5 * v.y), pts = bolt(tip, [MS_CX + v.x, lerp(top, base, v.y)], seeded(v.seed + (tick >> 1)), .35, 4);
          drawBolt(c, pts.slice(0, Math.max(2, Math.ceil(out3(g) * pts.length))), .75 * (1 - seg(t, .85, 1.02)), split * .5);
        }
        // ...and the front itself crackles straight across it.
        const fg = c.createLinearGradient(0, yF - 14, 0, yF + 14);
        fg.addColorStop(0, 'rgba(120,200,255,0)'); fg.addColorStop(.5, 'rgba(170,230,255,.55)'); fg.addColorStop(1, 'rgba(120,200,255,0)');
        c.fillStyle = fg; c.fillRect(MS_CX - 70, yF - 14, 140, 28);
        drawBolt(c, bolt([MS_CX - 70, yF], [MS_CX + 70, yF], seeded(tick * 13 + 5), .16, 5), .95, split * .5);
        c.restore();
        // Where the front meets the edge, two sparks run down the sides.
        let L = null, R = null;
        for (const p of P) if (Math.abs(p[1] - yF) < 3) { if (!L || p[0] < L[0]) L = p; if (!R || p[0] > R[0]) R = p; }
        for (const p of [L, R]) if (p) { glow(c, p[0], p[1], 14, '150,215,255', .9); glow(c, p[0], p[1], 3.5, '255,255,255', 1); }
      }
      // A sharp burst: a ring, the outline splitting into colour.
      const b = seg(t, 1, 1.36);
      if (b > 0 && b < 1) {
        glow(c, MS_CX, MS_CY + 3, 30 + out3(b) * 110, '69,168,255', .42 * (1 - b));
        c.beginPath(); c.arc(MS_CX, MS_CY + 3, 14 + out3(b) * 124, 0, MS_TAU); c.lineWidth = 1.8 * (1 - b) + .4; c.strokeStyle = rgba('210,245,255', 1 - b); c.stroke();
        for (const [dx, col] of [[-split, '255,60,210'], [split, '40,255,240']]) { c.save(); c.translate(dx, 0); trace(c, P); c.lineWidth = 1.2; c.strokeStyle = rgba(col, .45 * (1 - b)); c.stroke(); c.restore(); }
      }
      // Arcs leap round the outside, then keep crackling now and then.
      plasmaRim(c, P, t, st.arcs);
    } },

  // Nebula: Plasma's flame comes apart, its matter flung out as dust; dust
  // and gas wisps spiral back in round an empty centre, the core brightens,
  // the cloud condenses into the silhouette; clouds keep orbiting and stars
  // twinkle through the mist.
  purple: {
    ms:2400, at:1.6, title:1.85,
    ti:[[{ opacity:0, filter:'blur(6px)' }, { opacity:1, filter:'none' }], { duration:800, easing:'ease-out' }],
    tb:[[{ letterSpacing:'.6em', paddingLeft:'.6em' }, { letterSpacing:'.32em', paddingLeft:'.32em' }], { duration:900, easing:'cubic-bezier(.2,.7,.2,1)' }],
    init:r => {
      const cols = ['183,121,255', '140,110,255', '230,195,255', '110,90,235'];
      return {
        dust:Array.from({ length:170 }, () => ({ r0:50 + r() * 95, a0:r() * MS_TAU, sp:.6 + r() * .8, sz:.5 + r() * 1.2, col:cols[Math.floor(r() * 4)], tgt:insideFlame(r), d:r() * .3 })),
        wisps:Array.from({ length:10 }, (_, i) => ({ r0:80 + r() * 50, a0:r() * MS_TAU, rest:40 + r() * 30, len:2.2 + r() * 1.6, wid:9 + r() * 9, sp:.5 + r() * .5, col:['123,77,255', '183,121,255', '80,60,210', '205,150,255'][i % 4] })),
        stars:Array.from({ length:8 }, () => ({ x:(r() - .5) * 120, y:(r() - .62) * 110, at:1.75 + r() * .9, r:3 + r() * 3 })),
        blobs:Array.from({ length:4 }, () => [r() * MS_TAU, .4 + r() * .5]) };
    },
    draw(c, t, st) {
      const sw = inOut(seg(t, .2, 1.75)), late = 1 - .45 * seg(t, 1.6, 2.4);
      if (t < .75) ghost(c, 'blue', t, { a:(1 - seg(t, .1, .7)), s:1 + .3 * out3(seg(t, .05, .7)), filter:'blur(' + (5 * seg(t, .05, .6)).toFixed(1) + 'px) hue-rotate(' + Math.round(45 * seg(t, .05, .5)) + 'deg)' });
      c.globalCompositeOperation = 'lighter';
      glow(c, MS_CX, MS_CY, 50 + 70 * out3(seg(t, .05, .6)), '130,130,255', .35 * bell(t, .02, .65));
      glow(c, MS_CX, MS_CY + 3, 24 + 26 * sw, '190,140,255', .55 * sw * (1 - .5 * seg(t, 1.6, 2.2)));
      // Gas streams along the spiral, each wisp a trail of soft light.
      const fadeIn = seg(t, .05, .6);
      for (const w of st.wisps) {
        const r = lerp(w.r0, w.rest, sw), a = w.a0 + w.sp * t * 1.3 + sw * 3.4;
        nebulaWisp(c, w, r, a, fadeIn * late);
      }
      // The flame condenses: a dark violet body, slow clouds inside it.
      const f = seg(t, 1.3, 1.95), P = flamePts(msShape().outer, { t, wob:.05 });
      if (f > 0) {
        c.globalCompositeOperation = 'source-over';
        nebulaBody(c, P, t, st.blobs, f);
        c.globalCompositeOperation = 'lighter';
      }
      // Dust spirals in, then settles into the silhouette as its inner dust.
      const appear = seg(t, 0, .1);
      for (const p of st.dust) {
        const k = inOut(seg(t, .2 + p.d * .4, 1.55 + p.d * .3)), rad = p.r0 * (1 - .9 * k), a = p.a0 + p.sp * t * 1.1 + k * 4.6;
        let x = MS_CX + Math.cos(a) * rad, y = MS_CY + Math.sin(a) * rad * .62;
        const ex = out3(seg(t, 0, .45 + p.d * .5));   // flung out of the flame first
        if (ex < 1) { x = lerp(MS_CX + p.tgt[0] * MS_S, x, ex); y = lerp(MS_CY + p.tgt[1] * MS_S, y, ex); }
        const q = inOut(seg(t, 1.2 + p.d * .5, 1.8 + p.d * .5));
        if (q > 0) { const [px, py] = nebulaMote(p, t); x = lerp(x, px, q); y = lerp(y, py, q); }
        nebulaDust(c, p, t, x, y, appear);
      }
      for (const s of st.stars) nebulaStar(c, s, t);
    } },

  // Aurora: Nebula's flame dims as curtains of green and cyan light ripple
  // down out of the dark, fold round it into nested flame-shaped loops and
  // snap together: a flash, and the flame becomes a window onto the aurora,
  // curtains hanging inside it, while a great veil of aurora rises behind it
  // and stays on, rippling. The two outer ribbons stay on, flowing round it.
  aurora: {
    ms:2900, at:1.72, title:2.15,
    ti:[[{ opacity:0, transform:'translateY(8px)', filter:'blur(3px)' }, { opacity:1, transform:'none', filter:'none' }], { duration:900, easing:'cubic-bezier(.25,.8,.25,1)' }],
    init:r => ({ rib:[1.06, .88, .7, .52, .34].map((k, i) => ({ k, ph:r() * MS_TAU, hue:[165, 140, 185, 275, 150][i], w:5 + r() * 3, d:i * .06 })) }),
    draw(c, t, st) {
      if (t < 1.7) ghost(c, 'purple', t, { a:(1 - seg(t, .55, 1.65)), filter:'brightness(' + (1 - .45 * seg(t, .1, 1.2)).toFixed(2) + ')' });
      c.globalCompositeOperation = 'lighter';
      glow(c, MS_CX, MS_CY, 80, '90,255,220', .12 * seg(t, 0, .5));
      const conv = out3(seg(t, 1.6, 1.85)), body = seg(t, 1.62, 2.05);
      // The veil: a curtain shooting up from behind the flame as it lands, settling lower.
      const vH = 150 * out3(seg(t, 1.64, 2.1)) * (1 - .42 * inOut(seg(t, 2.2, 3))), vI = seg(t, 1.64, 1.8) * (1.7 - .6 * seg(t, 2.2, 3));
      const P = flamePts(msShape().outer, { t, wob:.08 });
      auroraVeil(c, P, t, vH, vI);
      for (const [i, rb] of st.rib.entries()) auroraRibbon(c, rb, i, t, conv, body);
      glow(c, MS_CX, MS_CY - 6, 160, '150,255,225', .5 * bell(t, 1.6, 2.2));
      if (body > 0) {
        c.globalCompositeOperation = 'source-over';
        auroraBody(c, P, t, body);
        c.globalCompositeOperation = 'lighter';
        climb(c, P, seg(t, 1.85, 2.4), '220,255,250', .55, 26);
        auroraRim(c, P, body);
      }
    } },

  // Quasar: Aurora's flame falls in on itself to a blinding point, an
  // elliptical disk spinning up round it, twin jets erupting along its axis,
  // the core blowing out into an overexposed flame, a pulse scattering the
  // disk. As the glare settles the flame shows a quasar of its own inside
  // (quasarBody); the jets narrow away, a little matter keeps orbiting.
  quasar: {
    ms:3000, at:1.4, title:2.35,
    ti:[[{ opacity:0, transform:'scale(1.16)', filter:'brightness(3)' }, { opacity:1, transform:'none', filter:'none' }], { duration:520, easing:'cubic-bezier(.15,.9,.25,1)' }],
    init:r => ({ disk:Array.from({ length:260 }, (_, i) => ({ r0:15 + r() * 62, a0:r() * MS_TAU, sp:.8 + r() * .45, sz:.6 + r() * 1.3, col:['120,150,255', '165,115,255', '225,232,255', '90,125,255'][i % 4], keep:i % 5 === 0 })), core:coreDisk(r) }),
    draw(c, t, st) {
      const O = [MS_CX, MS_CY + 5];
      if (t < .36) ghost(c, 'aurora', t, { a:(1 - seg(t, .2, .34)), s:1 - .94 * in3(seg(t, .02, .32)), x:O[0], y:O[1], filter:'brightness(' + (1 + 3 * seg(t, .05, .3)).toFixed(2) + ')' });
      c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
      quasarDisk(c, t, st.disk, true);
      // Twin jets along the disk's axis.
      const on = out3(seg(t, 1.02, 1.22)), off = seg(t, 1.9, 2.35);
      quasarJets(c, t, 40 + 250 * on, 7 * on * (1 - off), { knots:1 - off });
      glow(c, O[0], O[1], 8 + 34 * seg(t, .15, 1.35), '200,215,255', .9 * seg(t, 0, .12));
      glow(c, O[0], O[1], 3 + 3 * seg(t, .8, 1.3), '255,255,255', seg(t, 0, .08));
      glow(c, MS_CX, MS_CY, 150, '225,232,255', .5 * bell(t, 1.32, 1.78));
      // The flame: overexposed as it lands, its inner quasar showing through as the glare settles.
      const f = out3(seg(t, 1.32, 1.95));
      if (f > 0) {
        c.globalCompositeOperation = 'source-over';
        c.save(); c.translate(MS_CX, MS_CY); c.scale(f, f); c.translate(-MS_CX, -MS_CY);
        quasarBody(c, flamePts(msShape().outer, { s:1.12, t, wob:.06 }), t, st.core, .95 * (1 - out3(seg(t, 1.6, 2.5))), f);
        c.restore();
      }
      c.globalCompositeOperation = 'lighter';
      quasarDisk(c, t, st.disk, false);
      const pr = seg(t, 1.78, 2.15);
      if (pr > 0 && pr < 1) { c.beginPath(); c.arc(O[0], O[1], 20 + out3(pr) * 175, 0, MS_TAU); c.lineWidth = 2.2 * (1 - pr) + .4; c.strokeStyle = rgba('225,232,255', .9 * (1 - pr)); c.stroke(); }
    } },

  // Singularity: Quasar's flame flickers, then winds in on itself, its
  // orbiting matter spiralling in after it, the world dimming and starlight
  // bending round the growing mass. A point; it inverts to black in a flash,
  // a shockwave throws the starlight back. Matter of every colour before it
  // pours in, whitening as it nears the edge and settling into a blazing
  // disk; the hole stretches into a black flame ringed in white, the far side
  // of the disk lensed up over its top, starlight smeared into arcs round it.
  singularity: {
    ms:4100, at:1.16, title:2.95,
    ti:[[{ opacity:0 }, { opacity:1 }], { duration:700, easing:'ease-out' }],
    tb:[[{ letterSpacing:'1.1em', paddingLeft:'1.1em' }, { letterSpacing:'.42em', paddingLeft:'.42em' }], { duration:1000, easing:'cubic-bezier(.2,.8,.2,1)' }],
    init:r => {
      const tiers = [[255, 69, 69], [255, 152, 47], [255, 226, 74], [69, 168, 255], [183, 121, 255], [94, 242, 208], [200, 210, 255]];
      return { core:coreDisk(r),
        orbit:Array.from({ length:110 }, (_, i) => ({ r0:40 + r() * 36, a0:r() * MS_TAU, sp:.8 + r() * .5, col:[[120, 150, 255], [165, 115, 255], [225, 232, 255], [90, 125, 255]][i % 4] })),
        stars:Array.from({ length:170 }, () => ({ r:6 + 172 * Math.sqrt(r()), a:r() * MS_TAU, b:.25 + r() * .75, sz:.5 + r() * .9 })),
        fall:Array.from({ length:112 }, (_, i) => ({ r0:110 + r() * 100, a0:r() * MS_TAU, d:r(), sp:.7 + r() * .6, col:tiers[i % 7], rf:i % 3 ? 4 + r() * 10 : 52 + r() * 40, sz:.6 + r() * .9 })),
        disk:Array.from({ length:240 }, () => ({ r0:48 + r() * 54, a0:r() * MS_TAU, sp:.85 + r() * .3, sz:.5 + r() * 1.1 })),
        arcs:Array.from({ length:7 }, (_, i) => ({ f:r(), at:2.6 + i * .2, len:14 + Math.floor(r() * 14), off:4 + r() * 4 })),
        drift:Array.from({ length:14 }, (_, i) => ({ a:r() * MS_TAU, ph:i / 14 })) };
    },
    draw(c, t, st) {
      const sh = msShape(), n = sh.outer.length, O = [MS_CX, HOLE_Y];
      const k = in3(seg(t, .3, 1.1)), born = out3(seg(t, 1.14, 1.4)), e = inOut(seg(t, 1.95, 2.65)), R = 15;
      // The world dims round it.
      const vig = .3 * k + .42 * seg(t, 1.1, 1.7);
      singularityVignette(c, vig);
      c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.lineJoin = 'round';
      // Starlight bent round the mass: each star's image pushed out from the
      // Einstein radius th and stretched along it into an arc.
      const th = 14 * k + 44 * out3(seg(t, 1.14, 1.65)) + 2 * Math.sin(t * 1.3) * seg(t, 1.7, 2.4), sf = seg(t, .15, .7);
      singularityStars(c, t, st.stars, th, sf);
      // Phase 1: Quasar's flame winds in on itself, matter spiralling after it.
      if (t < 1.16) {
        for (const p of st.orbit) {
          const al = .55 * seg(t, 0, .1) * (1 - seg(t, .95, 1.14));
          if (al <= 0) continue;
          c.beginPath();
          for (let j = 0; j < 6; j++) {
            const tt = Math.max(0, t - j * .025), kk = in3(seg(tt, .3, 1.1));
            const q = singularityPoint(p.r0 * (1 - .97 * kk), p.a0 + p.sp * (1.2 * tt + 2.2 * (1 / (1 - .92 * kk) - 1)), .27);
            j ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]);
          }
          c.lineWidth = 1.1; c.strokeStyle = rgba(whiten(p.col, k), al); c.stroke();
        }
        const s = 1 - .97 * k;
        if (s > .03) {
          // A swirl: points nearer the core turn further, so the flame spirals as it shrinks.
          const P = flamePts(sh.outer, { s:1.12, t, wob:.06 + .3 * k }).map(([x, y]) => {
            const dx = x - O[0], dy = y - O[1], ph = k * (3.4 - Math.min(Math.hypot(dx, dy), 84) / 28), co = Math.cos(ph), si = Math.sin(ph);
            return [O[0] + dx * co - dy * si, O[1] + dx * si + dy * co];
          });
          const ex = .15 * seg(t, .1, .35) + .75 * k + (Math.sin(t * 53) > .7 ? .25 : 0) * bell(t, .12, .7);
          c.globalCompositeOperation = 'source-over';
          c.save(); c.translate(O[0], O[1]); c.scale(s, s); c.translate(-O[0], -O[1]);
          quasarBody(c, P, t, st.core, Math.min(1, ex), s);
          c.restore();
          c.globalCompositeOperation = 'lighter';
        }
        glow(c, O[0], O[1], 16, '255,255,255', bell(t, .86, 1.2));
        glow(c, O[0], O[1], 3.5, '255,255,255', seg(t, .86, .95));
      }
      // The last light flares sideways as it goes.
      const fl = bell(t, .98, 1.36);
      if (fl) {
        const g = c.createLinearGradient(O[0] - 140, 0, O[0] + 140, 0);
        g.addColorStop(0, 'rgba(200,215,255,0)'); g.addColorStop(.5, rgba('255,255,255', .9 * fl)); g.addColorStop(1, 'rgba(200,215,255,0)');
        c.fillStyle = g; c.fillRect(O[0] - 140, O[1] - .9, 280, 1.8);
      }
      if (t < 1.14) return;
      // Phase 2: it inverts to black in a flash; a shockwave rolls out.
      glow(c, O[0], O[1], 170, '255,255,255', .5 * bell(t, 1.12, 1.55));
      const sw = seg(t, 1.14, 1.85);
      if (sw < 1) {
        // Faded out by the time it reaches the window's square edge.
        const rw = 16 + out3(sw) * 175, fa = (1 - sw) ** 2;
        c.beginPath(); c.arc(O[0], O[1], rw, 0, MS_TAU); c.lineWidth = 3.5 * (1 - sw) + .5; c.strokeStyle = rgba('255,255,255', .9 * fa); c.stroke();
        c.beginPath(); c.arc(O[0], O[1], rw * .9, 0, MS_TAU); c.lineWidth = 8 * (1 - sw); c.strokeStyle = rgba('200,215,255', .2 * fa); c.stroke();
      }
      // Phase 3: the hole, warping like lensed light, then stretching into the flame.
      const warp = bell(t, 1.3, 2.25), C = [MS_CX, lerp(O[1], MS_CY + 4, e)];
      const S = flamePts(sh.outer, { t, sx:1 + .07 * Math.sin(e * Math.PI), wob:.04 + .03 * Math.sin(t * 2.3), round:1 - e, R:R * (1 + .12 * warp * Math.sin(t * 7)) / MS_S, y:lerp(O[1], MS_CY, e) });
      for (let i = 0; i < n; i++) {
        const p = S[i], a = Math.atan2(p[1] - O[1], p[0] - O[0]), d = born * (1 + (1 - e) * warp * (.14 * Math.sin(2 * a + t * 4) + .06 * Math.sin(3 * a - t * 6)));
        S[i] = [O[0] + (p[0] - O[0]) * d, O[1] + (p[1] - O[1]) * d];
      }
      // Matter from the lower tiers and the lensed disk pass behind the horizon first.
      const form = seg(t, 1.45, 2.4);
      singularityFall(c, t, st.fall, true);
      singularityDisk(c, t, st.disk, true, form);
      singularityHorizon(c, S, C, t, born, e, seg(t, 1.28, 1.8));
      singularityDisk(c, t, st.disk, false, form);
      singularityFall(c, t, st.fall, false);
      // Arcs of light slide round the edge.
      for (const a of st.arcs) {
        const lt = seg(t, a.at, a.at + .55);
        if (!lt || lt >= 1) continue;
        const i0 = Math.floor(a.f * n + lt * 24), pts = [];
        for (let j = 0; j < a.len; j++) pts.push(outward(S[(i0 + j) % n], a.off + 2 * Math.sin(j / a.len * Math.PI), C[0], C[1]));
        trace(c, pts, false); c.lineWidth = .9; c.strokeStyle = rgba('255,255,255', .9 * Math.sin(Math.PI * lt)); c.stroke();
      }
      singularityDrift(c, t, st.drift);
    } },
};
// Every reveal after Ember holds the settled flame of the tier below for
// MS_LEAD seconds before it starts to move.
const MS_LEAD = .2;
Object.keys(SCENES).forEach((k, i, keys) => {
  if (!i) return;
  const sc = SCENES[k], draw = sc.draw, prev = keys[i - 1];
  sc.lead = MS_LEAD;
  sc.ms += MS_LEAD * 1000; sc.at += MS_LEAD; sc.title += MS_LEAD;
  sc.draw = function (c, t, st) { if (t < MS_LEAD) ghost(c, prev, 0); else draw.call(this, c, t - MS_LEAD, st); };
});

function playMilestone(host, tier, opts = {}) {
  const scene = SCENES[tier] || SCENES.red, compact = !!opts.compact, ms = compact ? MS_COMPACT : scene.ms + MS_HOLD;
  const endTime = milestoneEndTime(scene), fadeAt = (ms - MS_FADE) / 1000;
  const reduced = opts.reduced ?? !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const root = document.createElement('div');
  root.className = 'ms ms-' + tier + (compact ? ' ms-compact' : '');
  const name = (typeof TIER_LABEL !== 'undefined' && TIER_LABEL[tier]) || tier;
  root.innerHTML = '<canvas width="' + MS_W + '" height="' + MS_H + '"></canvas><div class="ms-title"><b>' + name + '</b><small>' +
    String(opts.who || '').replace(/[&<>"']/g, '') + (opts.achieved > 0 ? ' | ' + opts.achieved + ' Achieved' : '') + '</small><i class="ms-line"></i></div>';
  host.replaceChildren(root);
  const canvas = root.firstChild, title = root.querySelector('.ms-title'), dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(MS_W * dpr); canvas.height = Math.round(MS_H * dpr);
  const c = canvas.getContext('2d'), st = c && initMilestoneScene(tier, scene);
  const anims = [];
  const draw = t => { if (c) renderScene(c, dpr, scene, t, st); };
  const showTitle = () => {
    if (reduced) { anims.push(title.animate([{ opacity:0 }, { opacity:1 }], { duration:300, fill:'forwards' })); return; }
    anims.push(title.animate(scene.ti[0], { ...scene.ti[1], fill:'forwards' }));
    if (scene.tb) anims.push(title.firstChild.animate(scene.tb[0], { ...scene.tb[1], fill:'forwards' }));
    if (tier === 'singularity') anims.push(title.lastChild.animate([{ transform:'scaleX(0)', opacity:0 }, { transform:'scaleX(1)', opacity:.8 }], { duration:900, delay:250, easing:'cubic-bezier(.2,.8,.2,1)', fill:'forwards' }));
  };
  let raf = 0, t0 = null, titled = false, faded = false, stopped = false;
  const fade = () => { faded = true; anims.push(root.animate([{ opacity:1 }, { opacity:0 }], { duration:MS_FADE, easing:'ease-in', fill:'forwards' })); };
  function stop() { stopped = true; cancelAnimationFrame(raf); for (const a of anims) a.cancel(); root.remove(); }
  function frame(now) {
    if (stopped || !root.isConnected) return stop();
    t0 ??= now;
    const t = (now - t0) / 1000;
    if (!faded) draw(t >= fadeAt ? endTime : compact ? lerp(scene.ms / 1000, endTime, t / fadeAt) : t);
    if (!titled && t >= scene.title) { titled = true; showTitle(); }
    if (!faded && t >= fadeAt) fade();
    if (t * 1000 < ms) raf = requestAnimationFrame(frame);
  }
  if (compact) {
    titled = true; title.style.opacity = 1;
    if (!reduced) anims.push(root.animate([{ opacity:0, transform:'translateY(-60px)' }, { opacity:1, transform:'none' }], { duration:450, easing:'cubic-bezier(.2,.8,.3,1)' }));
  }
  if (reduced) { draw(endTime); if (!compact) showTitle(); setTimeout(() => { if (!stopped) fade(); }, ms - MS_FADE); }
  else raf = requestAnimationFrame(frame);
  return { ms, at:reduced || compact ? 0 : scene.at, stop };
}

if (typeof module !== 'undefined') module.exports = { SCENES };
