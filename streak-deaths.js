'use strict';

// Loss scenes continue the settled milestone's clock and seeded material.
// Each one paints its milestone's own artwork (milestones.js) and takes that
// apart: Ember cools and crumbles into ash, Flare tears itself up and
// gutters, Solar implodes and throws off its corona, Plasma's globe loses
// containment, Nebula's cloud diffuses, Aurora's window shears into rising
// curtains, Quasar browns out, Singularity winds space up round itself.
// Timing and trails are sampled from elapsed seconds so replays can skip frames.
const DEATH_REDUCED_MS = 2300;
const DEATH_LEAD = .18;
const DEATH_Y = MS_CY + 9;
const WHITE_LIGHT = '255,255,255';
const smooth = (t, a, b) => {
  const p = seg(t, a, b);
  return p * p * (3 - 2 * p);
};
const curve = (steps, point) => Array.from({ length:steps + 1 }, (_, i) => point(i / steps));
// Seeded per 45ms tick: the same flicker on every replay.
const chance = (t, seed) => seeded(Math.floor(t / .045) * 7919 + seed);

function ovalGlow(c, x, y, rx, ry, tilt, color, alpha) {
  if (alpha <= .002) return;
  c.save();
  c.translate(x, y); c.rotate(tilt); c.scale(1, ry / rx);
  glow(c, 0, 0, rx, color, alpha);
  c.restore();
}

function lightTrace(c, points, color, alpha, width, core) {
  if (alpha <= .002) return;
  trace(c, points, false);
  c.lineWidth = width * 6; c.strokeStyle = rgba(color, .13 * alpha); c.stroke();
  c.lineWidth = width * 2.6; c.strokeStyle = rgba(color, .42 * alpha); c.stroke();
  c.lineWidth = width; c.strokeStyle = rgba(core, alpha); c.stroke();
}

// ---------- the milestone's own pixels ----------
// A cleared offscreen canvas at the drawing canvas's pixel ratio. A death
// paints the milestone's artwork into it, then cuts, shears and twists the copy.
const LAYERS = {};
function layer(c, key) {
  const k = c.getTransform().a, w = Math.round(MS_W * k);
  const cv = LAYERS[key] ||= document.createElement('canvas');
  if (cv.width !== w) cv.width = cv.height = w;
  const x = cv.getContext('2d');
  x.setTransform(k, 0, 0, k, 0, 0);
  x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.filter = 'none';
  x.clearRect(0, 0, MS_W, MS_H);
  return x;
}
const blit = (c, x) => c.drawImage(x.canvas, 0, 0, MS_W, MS_H);
// Only the part of a layer inside [x0, y0, x1, y1]: small pieces stay cheap.
function blitRect(c, x, [x0, y0, x1, y1]) {
  const k = x.getTransform().a;
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
  x1 = Math.min(MS_W, Math.ceil(x1)); y1 = Math.min(MS_H, Math.ceil(y1));
  if (x1 > x0 && y1 > y0) c.drawImage(x.canvas, x0 * k, y0 * k, (x1 - x0) * k, (y1 - y0) * k, x0, y0, x1 - x0, y1 - y0);
}
const boundsOf = (P, pad = 0) => P.reduce(([a, b, c, d], [x, y]) => [Math.min(a, x - pad), Math.min(b, y - pad), Math.max(c, x + pad), Math.max(d, y + pad)], [Infinity, Infinity, -Infinity, -Infinity]);
// Icon units (bulb-relative) to the canvas for a flame pose, without its ripple.
function poseMap(o) {
  const s = (o.s ?? 1) * MS_S, x = o.x ?? MS_CX, y = o.y ?? MS_CY, sx = o.sx ?? 1, sy = o.sy ?? 1;
  return ([u, v]) => [x + u * sx * s, y + v * sy * s];
}
const pathOf = (c, polys) => {
  c.beginPath();
  for (const P of polys) { c.moveTo(...P[0]); for (const p of P.slice(1)) c.lineTo(...p); c.closePath(); }
};

// Cut a box into n convex pieces, each time splitting the largest across a
// random line near its centre. The cuts are the cracks between the pieces.
function shatter(rand, box, n) {
  const area = P => Math.abs(P.reduce((s, p, i) => { const q = P[(i + 1) % P.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
  const centre = P => P.reduce(([x, y], p) => [x + p[0] / P.length, y + p[1] / P.length], [0, 0]);
  const pieces = [box], cracks = [];
  while (pieces.length < n) {
    pieces.sort((a, b) => area(b) - area(a));
    const P = pieces.shift(), [cx, cy] = centre(P), turn = rand() * Math.PI;
    const nx = Math.cos(turn), ny = Math.sin(turn), off = (rand() - .5) * .45 * Math.sqrt(area(P));
    const side = p => (p[0] - cx) * nx + (p[1] - cy) * ny - off;
    const A = [], B = [], cut = [];
    for (const [i, p] of P.entries()) {
      const q = P[(i + 1) % P.length], sp = side(p), sq = side(q);
      (sp < 0 ? A : B).push(p);
      if ((sp < 0) !== (sq < 0)) {
        const f = sp / (sp - sq), x = [lerp(p[0], q[0], f), lerp(p[1], q[1], f)];
        A.push(x); B.push(x); cut.push(x);
      }
    }
    if (cut.length < 2) { pieces.push(P); continue; }
    pieces.push(A, B); cracks.push(cut);
  }
  return { pieces:pieces.map(P => ({ P, c:centre(P) })), cracks };
}

// ---------- Ember ----------
// The flame cools through char, glowing fissures opening in its crust; it
// breaks along them from the tip down, each piece greying to ash as it falls.
const EMBER_CHAR = { edge:'46,10,12', body:'94,20,18', core:'184,54,32', glow:'140,26,18', blur:5 };
const EMBER_ASH = { edge:'36,33,33', body:'68,63,61', core:'90,84,80', glow:'0,0,0', blur:0 };

function drawEmberDeath(c, t, st) {
  const base = MS_CY + 42, phase = st.phase + t;
  const cool = smooth(t, .24, 1.25), gutter = 4 * cool * (1 - cool);
  const flicker = (.5 + .5 * Math.sin(t * (17 + t * 8))) ** 3;
  const pose = emberPose(phase), settle = 1 - .09 * cool;
  const o = { ...pose, sy:pose.sy * settle, y:base - (base - pose.y) * settle,
    wob:pose.wob * (1 - cool) + .14 * flicker * gutter, a:pose.a * (1 - .3 * flicker * gutter),
    heart:mix('255,255,240', '255,126,70', cool) };
  const map = poseMap(o);

  const hot = layer(c, 'ember');
  const P = paintFire(hot, o, mixPal(SCENES.red.pal, EMBER_CHAR, cool));
  const fissure = 1 - smooth(t, 1.18, 1.72);
  if (t > .4 && fissure > .002) {
    hot.save(); trace(hot, P); hot.clip();
    hot.globalCompositeOperation = 'lighter'; hot.lineCap = 'round'; hot.lineJoin = 'round';
    for (const [i, k] of st.cracks.entries()) {
      const a = smooth(t, k.at, k.at + .32) * fissure * k.k * (.74 + .26 * Math.sin(t * 7.3 + i * 1.7));
      if (a <= .002) continue;
      trace(hot, k.pts.map(map), false);
      hot.lineWidth = 5.5; hot.strokeStyle = rgba('255,56,22', .15 * a); hot.stroke();
      hot.lineWidth = 2.2; hot.strokeStyle = rgba('255,102,40', .5 * a); hot.stroke();
      hot.lineWidth = .8; hot.strokeStyle = rgba('255,204,150', .92 * a); hot.stroke();
    }
    hot.restore();
  }

  ovalGlow(c, MS_CX, base - 21, 54, 41, 0, '255,58,35', .22 * bell(t, .24, 1.37));
  const held = st.pieces.filter(p => t < p.at), flame = [MS_CX - 70, MS_CY - 90, MS_CX + 70, MS_CY + 70];
  if (held.length === st.pieces.length) blitRect(c, hot, flame);
  else {
    const ash = layer(c, 'ash');
    paintFire(ash, { ...o, heart:'108,100,94' }, EMBER_ASH);
    if (held.length) { c.save(); pathOf(c, held.map(p => p.P.map(map))); c.clip(); blitRect(c, hot, flame); c.restore(); }
    for (const p of st.pieces) {
      const age = t - p.at, fade = 1 - smooth(age, .2, .52);
      if (age <= 0 || fade <= .002) continue;
      const grey = smooth(age, .06, .38), [cx, cy] = map(p.c), k = 1 - .4 * smooth(age, .05, .5);
      c.save();
      c.translate(cx + p.vx * age, cy + 8 * age + p.drop * age * age);
      c.rotate(p.spin * age); c.scale(k, k); c.translate(-cx, -cy);
      const Q = p.P.map(map), box = boundsOf(Q, 2);
      trace(c, Q); c.clip();
      c.globalAlpha = fade * (1 - grey); blitRect(c, hot, box);
      c.globalAlpha = fade * grey; blitRect(c, ash, box);
      c.restore();
    }
    // Flakes of ash shed from each piece and flutter down after it.
    for (const p of st.pieces) for (const f of p.flecks) {
      const age = t - f.at;
      if (age <= 0 || age >= f.life) continue;
      const [cx, cy] = map(p.c), free = f.at - p.at;
      const x = cx + p.vx * free + f.dx + f.vx * age + 3 * Math.sin(age * 7 + f.ph) * age;
      const y = cy + 8 * free + p.drop * free * free + f.dy + f.fall * age + 16 * age * age;
      const a = smooth(age, 0, .08) * (1 - age / f.life), heat = f.hot * (1 - seg(age, 0, f.life * .55));
      c.save(); c.translate(x, y); c.rotate(f.ph + f.spin * age);
      c.fillStyle = rgba(mix('148,140,136', '255,146,88', heat), a); c.fillRect(-f.sz / 2, -f.sz * .32, f.sz, f.sz * .64);
      c.restore();
      if (heat > .05) { c.globalCompositeOperation = 'lighter'; glow(c, x, y, 3.5, '255,90,50', .5 * a * heat); c.globalCompositeOperation = 'source-over'; }
    }
  }

  c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
  for (const p of st.sparks) {
    const age = t - p.start;
    if (age <= 0 || age >= p.life) continue;
    const low = 1 - .6 * smooth(p.start, .6, 1.4);
    const pos = a => [MS_CX + p.x * low + p.vx * a + Math.sin(a * 8 + p.x) * 3 * a,
      base - p.y * low - p.rise * a + 94 * a * a];
    const a = smooth(age, 0, .06) * (1 - age / p.life) ** 1.65;
    const end = pos(age);
    lightTrace(c, [pos(Math.max(0, age - .06)), end], '255,65,36', a, p.size, '255,163,126');
    glow(c, ...end, 4 + p.size * 3, '255,99,65', .51 * a);
  }
  const coal = smooth(t, 1.2, 1.5) * (1 - smooth(t, 1.62, 2.17));
  ovalGlow(c, MS_CX, base - 2, 23, 6, 0, '255,61,34', .6 * coal);
  glow(c, MS_CX + 1.5, base - 2, 5, '255,205,158', coal * (.77 + .23 * Math.sin(t * 18)));
}

// ---------- Flare ----------
// It surges and flickers hard; three tongues lick up off its tip and tear
// free, each time snapping the tip back. Then it gutters to a red wick and
// leaves a thread of smoke.
const FLARE_LICKS = [{ at:.31, h:.36, grow:.1, side:-1 }, { at:.47, h:.52, grow:.12, side:1 }, { at:.63, h:.3, grow:.09, side:-1 }];
const FLARE_HOT = { edge:'242,107,17', body:'255,185,63', core:'255,253,224', glow:'255,163,47', blur:26 };
const FLARE_SPENT = { edge:'124,24,18', body:'218,64,34', core:'255,128,72', glow:'224,52,26', blur:9 };

function flareLossPose(t, phase) {
  const base = flarePose(phase);
  const surge = smooth(t, .19, .47) * (1 - smooth(t, .53, .87)), out = smooth(t, .55, 1.02);
  const jit = (Math.sin(t * 41) + .7 * Math.sin(t * 67 + 1.3) + .5 * Math.sin(t * 23 + 2.1)) / 2.2;
  let lick = 0;
  for (const l of FLARE_LICKS) lick += l.h * seg(t, l.at - l.grow, l.at) ** 2 * (1 - seg(t, l.at, l.at + .04));
  const s = base.s * (1 + .12 * surge) * (1 - .72 * out), sy = 1 + .15 * surge * jit + .24 * out;
  return { ...base, s, sy, sx:1 - .12 * surge * Math.abs(jit) - .2 * out, y:MS_CY + 42 - 42 * s * sy,
    wob:base.wob + .95 * surge + .5 * out, curl:1.5 * surge * (.6 + .4 * jit) + .5 * out * Math.sin(t * 13),
    stretch:.26 * surge + lick, core:mix(base.core, '255,254,231', surge),
    a:(1 - smooth(t, .9, 1.02)) * (1 - .2 * (surge + out) * Math.max(0, Math.sin(t * 53) * Math.sin(t * 29 + .7))),
    heart:mix('255,255,240', '255,178,120', out), surge, out };
}

function drawFlareDeath(c, t, st) {
  const phase = st.phase + t, pose = flareLossPose(t, phase), floor = MS_CY + 42;
  const pal = mixPal(mixPal(SCENES.orange.pal, FLARE_HOT, pose.surge), FLARE_SPENT, pose.out);
  paintFire(c, pose, pal);
  // Each tongue is the length of tip the flame just lost, from where the tip
  // snapped back to up to where it reached.
  for (const l of FLARE_LICKS) {
    const age = t - l.at;
    if (age <= 0 || age >= .34) continue;
    const reach = flamePts(msShape().outer, flareLossPose(l.at - .002, st.phase + l.at))[0];
    const snap = flamePts(msShape().outer, flareLossPose(l.at + .045, st.phase + l.at + .045))[0];
    const k = age / .34, rise = 50 * age + 160 * age * age, sy = 1.5 + .5 * k;
    const s = (snap[1] - reach[1] + 8) / (14.5 * MS_S * sy) * (1 - .45 * k);
    paintFire(c, { t:phase * 1.7 + l.at * 9, s, sx:.9 - .4 * k, sy, x:lerp(snap[0], reach[0], .5) + l.side * 8 * k,
      y:snap[1] + 4 - 6 * s * MS_S * sy - rise, wob:.6, curl:.9, a:(1 - k) ** 1.3 }, mixPal(pal, FLARE_HOT, .5));
  }

  c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
  glow(c, MS_CX, MS_CY - 12, 85, '255,131,33', .43 * pose.surge);
  // The reveal's curved sparks, spat off the tip as it breaks up.
  const [sx, sy] = flamePts(msShape().outer, flareLossPose(.52, st.phase + .52))[0];
  for (const p of st.settled.sparks) {
    const age = t - .52 - p.d;
    if (age <= 0 || age >= p.life) continue;
    const pos = a => {
      const angle = -Math.PI / 2 + (p.a + Math.PI / 2) * 1.52 + p.bend * a;
      return [sx + Math.cos(angle) * p.v * a, sy + 16 + Math.sin(angle) * p.v * a + 87 * a * a];
    };
    lightTrace(c, [pos(Math.max(0, age - .055)), pos(age)], '255,125,26',
      smooth(age, 0, .038) * (1 - age / p.life) ** 1.45, 1.45, '255,215,140');
  }
  const wick = bell(t, .86, 1.32);
  ovalGlow(c, MS_CX, floor - 5, 9, 4, 0, '255,80,36', .85 * wick);
  glow(c, MS_CX, floor - 5, 2.6, '255,206,160', wick);

  const smoke = smooth(t, .9, 1.06) * (1 - smooth(t, 1.24, 1.56));
  if (smoke > .002) {
    c.globalCompositeOperation = 'source-over';
    const y0 = floor - 8, rise = 34 + 84 * seg(t, .9, 1.56);
    const g = c.createLinearGradient(0, y0, 0, y0 - rise);
    g.addColorStop(0, rgba('176,166,160', .55 * smoke)); g.addColorStop(.45, rgba('150,142,138', .3 * smoke)); g.addColorStop(1, 'rgba(140,134,130,0)');
    trace(c, curve(32, s => [MS_CX + (7 * Math.sin(s * 5.2 - t * 3.4) + 3 * Math.sin(s * 11.5 + t * 2.2)) * s * (.4 + s), y0 - rise * s]), false);
    c.strokeStyle = g;
    for (const [w, a] of [[7, .2], [2.6, .5], [1, 1]]) { c.lineWidth = w; c.globalAlpha = a; c.stroke(); }
    c.globalAlpha = 1;
  }
}

// ---------- Solar ----------
// The surface boils and throws up the reveal's prominences, then the flame
// swells white and falls in on itself, dragging its corona down with it. A
// flash, the corona thrown off as a shell, a cooling ember of light.
const SOLAR_WHITE = { edge:'255,196,80', body:'255,244,186', core:'255,255,250', glow:'255,228,150', blur:30 };

function drawSolarDeath(c, t, st) {
  const phase = st.phase + t, pal = SCENES.yellow.pal, rays = st.settled.rays;
  const boil = smooth(t, .23, 1.3), swell = bell(t, .98, 1.72), fall = in3(seg(t, 1.36, 1.9));
  const white = Math.max(swell, smooth(t, 1.36, 1.7));
  const pose = { t:phase, s:(1 + .05 * boil + .07 * swell) * (1 - .965 * fall), sy:1 - .16 * fall, wob:.12 + .5 * boil + .9 * fall,
    curl:.8 * boil + .9 * fall, stretch:.1 * swell, core:mix(pal.core, WHITE_LIGHT, white), a:1 - smooth(t, 1.84, 1.92) };
  c.globalCompositeOperation = 'lighter';
  glow(c, MS_CX, MS_CY + 4, 70 + 45 * swell - 40 * fall, '255,190,60', .22 * boil + .5 * swell);
  c.globalCompositeOperation = 'source-over';
  const P = pose.a > .002 ? paintFire(c, pose, mixPal(pal, SOLAR_WHITE, white)) : null;

  c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
  if (P) {
    solarShimmer(c, P, phase, (1 + 1.8 * boil) * pose.a);
    for (const p of st.settled.proms) {
      const at = .3 + p.d * 2.6 + p.ph * .3, g = bell(t, at, at + .95) * (1 - fall);
      if (!g) continue;
      const A = flameFootpoint(P, p.a - p.w, MS_CX, MS_CY), B = flameFootpoint(P, p.a + p.w, MS_CX, MS_CY);
      solarProminence(c, A, B, { height:p.h * 1.9 * out3(seg(t, at, at + .4)) * pose.s, alpha:g, u:(phase * .8 + p.ph) % 1 });
    }
  }
  solarCorona(c, phase, lerp(76, 14, fall), .9 * smooth(t, 1.28, 1.5) * (1 - smooth(t, 1.8, 1.9)), rays);
  const shell = seg(t, 1.86, 2.75);
  solarCorona(c, phase, 18 + 150 * out3(shell), smooth(t, 1.86, 1.92) * (1 - shell) ** 1.6, rays);
  const flash = bell(t, 1.82, 2.3);
  glow(c, MS_CX, MS_CY, 30 + 100 * flash, '255,236,170', .75 * flash);
  glow(c, MS_CX, MS_CY, 9, WHITE_LIGHT, smooth(t, 1.78, 1.88) * (1 - smooth(t, 1.95, 2.25)));
  for (const p of st.ejecta) {
    const prom = st.settled.proms[p.prom], age = t - 1.86 - p.delay * .5;
    if (age <= 0 || age >= p.life) continue;
    const pos = a => {
      const angle = prom.a + 1.6 * p.fan + p.bend * a, r = 6 + p.r * .25 + p.reach * 1.3 * (1 - Math.exp(-3.5 * a));
      return [MS_CX + r * Math.cos(angle), MS_CY + r * Math.sin(angle)];
    };
    const a = smooth(age, 0, .06) * (1 - age / p.life) ** 1.5;
    lightTrace(c, curve(4, s => pos(Math.max(0, age - .092 * (1 - s)))), '255,149,31', a, p.size, '255,235,154');
  }
  const rest = smooth(t, 1.9, 2.05) * (1 - smooth(t, 2.3, 2.92)), cool = seg(t, 2, 2.9);
  glow(c, MS_CX, MS_CY, 34 - 12 * cool, mix('255,200,90', '255,96,36', cool), .55 * rest);
  glow(c, MS_CX, MS_CY, 7 - 3 * cool, mix('255,246,210', '255,160,100', cool), .9 * rest);
}

// ---------- Plasma ----------
// The globe's tendrils thrash and its light browns out as the charge
// builds; arcs crawl its rim, then leap off it. It ruptures in the reveal's
// own burst, the charge escaping as lightning, and a little static lingers.
const PLASMA_RUPTURE = 1.62;

function drawPlasmaDeath(c, t, st) {
  const sh = msShape(), settled = st.settled;
  const charge = smooth(t, .24, 1.53), burst = seg(t, PLASMA_RUPTURE, PLASMA_RUPTURE + .36);
  const phase = st.phase + t + .67 * charge * charge;
  const pose = { t:phase, s:1 + .025 * charge * Math.sin(t * 31) * Math.sin(t * 13 + 1), wob:.06 + .3 * charge, curl:.25 * charge };
  const P = flamePts(sh.outer, pose);
  const tend = charge ? settled.tend.map(d => ({ ...d, amp:d.amp * (1 + 1.6 * charge), wan:d.wan * (1 + 1.8 * charge) })) : settled.tend;
  const gone = smooth(t, PLASMA_RUPTURE, PLASMA_RUPTURE + .32);
  if (gone < 1) {
    const body = layer(c, 'plasma');
    plasmaBody(body, P, flamePts(sh.inner, { ...pose, s:pose.s * (1 + .05 * Math.sin(phase * 7)) }), phase, { tend });
    const dim = chance(t, 11)() < .32 * charge ? .45 * charge : 0;
    const b = (1 - dim) * (1 + 1.6 * bell(t, PLASMA_RUPTURE - .05, PLASMA_RUPTURE + .3)), k = 1 + .14 * out3(burst);
    c.save();
    if (b !== 1) c.filter = 'brightness(' + b.toFixed(3) + ')';
    c.globalAlpha = 1 - gone;
    c.translate(MS_CX, DEATH_Y); c.scale(k, k); c.translate(-MS_CX, -DEATH_Y);
    blit(c, body);
    c.restore();
  }
  c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.lineJoin = 'round';
  plasmaRim(c, P, phase, settled.arcs, 1 - charge);
  const erratic = charge * (1 - gone), leap = smooth(t, .8, 1.5);
  for (let k = 0; k < 4; k++) {
    const rand = chance(t, k * 17 + 5);
    if (rand() > .85 * erratic) continue;
    const i = Math.floor(rand() * P.length), A = outward(P[i], 1);
    const free = rand() < leap, reach = outward(P[i], 14 + 30 * rand() * charge);
    const B = free ? [reach[0] + (rand() - .5) * 22, reach[1] + (rand() - .5) * 22] : outward(P[(i + 6 + Math.floor(rand() * 16)) % P.length], 1);
    drawBolt(c, bolt(A, B, rand, .5, 3, free ? (rand() - .5) * 14 : -(6 + 9 * rand())), (.55 + .45 * rand()) * erratic, 1.2 * charge);
  }
  if (burst > 0 && burst < 1) {
    glow(c, MS_CX, MS_CY + 3, 30 + out3(burst) * 120, '69,168,255', .5 * (1 - burst));
    c.beginPath(); c.arc(MS_CX, MS_CY + 3, 14 + out3(burst) * 134, 0, MS_TAU); c.lineWidth = 2 * (1 - burst) + .4; c.strokeStyle = rgba('210,245,255', 1 - burst); c.stroke();
    const split = 3 * (1 - burst);
    for (const [dx, col] of [[-split, '255,60,210'], [split, '40,255,240']]) {
      c.save(); c.translate(dx, 0); trace(c, P); c.lineWidth = 1.2; c.strokeStyle = rgba(col, .5 * (1 - burst)); c.stroke(); c.restore();
    }
  }
  const flash = smooth(t, 1.54, 1.72) * (1 - smooth(t, 1.85, 2.4));
  for (const p of st.bolts) {
    const reach = out3(seg(t, 1.56 + p.delay, 1.8 + p.delay));
    const a = flash * reach * p.alpha * (.7 + .3 * Math.sin(phase * 15 + p.phase));
    if (a <= .002) continue;
    const pts = p.points.map(([x, y], i) => [MS_CX + (x - MS_CX) * reach + Math.sin(phase * 17 + i * .52 + p.phase) * 2.5 * reach,
      DEATH_Y + (y - DEATH_Y) * reach]);
    drawBolt(c, pts, a, 2 * flash, '237,251,255', '64,164,255', p.width);
  }
  glow(c, MS_CX, DEATH_Y, 16, '213,241,255', flash);
  const rest = smooth(t, 1.9, 2.15) * (1 - smooth(t, 2.5, 3.2));
  glow(c, MS_CX, DEATH_Y, 58 + 18 * seg(t, 1.9, 3.2), '69,145,255', .2 * rest);
  for (let k = 0; k < 3; k++) {
    const rand = chance(t, k * 31 + 977);
    if (rand() > .9 * rest) continue;
    const a = rand() * MS_TAU, r = 18 + 60 * rand(), A = [MS_CX + Math.cos(a) * r, DEATH_Y + Math.sin(a) * r * .9];
    const turn = a + (rand() - .5) * 2, len = 6 + 12 * rand();
    drawBolt(c, bolt(A, [A[0] + Math.cos(turn) * len, A[1] + Math.sin(turn) * len], rand, .55, 2), rest * (.4 + .5 * rand()));
  }
}

// ---------- Nebula ----------
// The cloud loses cohesion: its body diffuses and drifts apart, the clouds
// inside it escape, the wisps uncoil, the dust scatters and the stars go out.
function drawNebulaDeath(c, t, st) {
  const phase = st.phase + t, fray = smooth(t, .41, 2.5), loose = smooth(t, .6, 2.6);
  const density = 1 - smooth(t, 2.72, 4.01);
  c.globalCompositeOperation = 'lighter';
  glow(c, MS_CX, MS_CY + 3, 50 + 59 * fray, '190,140,255', .275 * (1 - fray) + .13 * bell(t, .51, 2.95));
  for (const [i, w] of st.settled.wisps.entries()) {
    const drift = smooth(t, .39 + i * .051, 3.37 + i * .052);
    const fade = 1 - smooth(t, 2.42 + i * .065, 3.52 + i * .052);
    const r = w.rest + (w.r0 * (.34 + .24 * Math.sin(i * 2.5)) + 23) * drift;
    const angle = w.a0 + w.sp * phase * 1.3 + 3.4 + (1.8 + .3 * i) * drift;
    const flat = .62 + .24 * drift * Math.sin(i * 1.2);
    nebulaWisp(c, w, r, angle, .55 * fade * (1 + .5 * drift), 1 + .52 * drift, flat, drift);
    for (const [s, size] of [[.13, 28], [.72, 41]]) {
      const a = angle - w.len * s * (.43 + .3 * drift);
      const x = MS_CX + r * Math.cos(a), y = MS_CY + r * Math.sin(a) * flat;
      ovalGlow(c, x, y, size + 21 * drift, 11 + 9 * drift, a + Math.PI / 2, w.col, .22 * drift * fade);
    }
  }
  if (loose < 1) {
    const x = layer(c, 'nebula'), k = 1 + .3 * loose;
    nebulaBody(x, flamePts(msShape().outer, { t:phase, wob:.05 + .6 * loose, curl:.9 * loose }), phase, st.settled.blobs, 1);
    c.save(); c.globalCompositeOperation = 'source-over';
    if (loose > .004) c.filter = 'blur(' + (9 * loose).toFixed(2) + 'px)';
    c.globalAlpha = 1 - smooth(t, 1.05, 2.6);
    c.translate(MS_CX, MS_CY); c.scale(k, k * (1 - .12 * loose)); c.translate(-MS_CX, -MS_CY);
    blit(c, x);
    c.restore();
  }
  const out = smooth(loose, .03, .5) * (1 - smooth(t, 2.3, 3.6));
  if (out > .002) for (const [ph, sp] of st.settled.blobs) {
    const x = Math.cos(phase * sp + ph) * 20, y = -4 + Math.sin(phase * sp * 1.3 + ph) * 24, l = Math.hypot(x, y) || 1, push = 58 * loose;
    glow(c, MS_CX + x + x / l * push, MS_CY + y + y / l * push * .7, 26 + 24 * loose, ph > 3 ? '240,200,255' : '150,100,255', .2 * out);
  }
  if (density > .002) for (const p of st.settled.dust) {
    const drift = smooth(t, .47 + p.d * 2.2, 3.56 + p.d);
    const [x, y] = nebulaMote(p, phase);
    const dx = x - MS_CX, dy = (y - MS_CY) / .62;
    const r = Math.hypot(dx, dy) + (p.r0 * .72 + 29) * drift;
    const a = Math.atan2(dy, dx) + (1.1 + p.sp) * drift;
    nebulaDust(c, p, phase, MS_CX + r * Math.cos(a), MS_CY + .62 * r * Math.sin(a), density * (1 - .35 * drift));
  }
  for (const [i, s] of st.settled.stars.entries()) {
    const drift = smooth(t, .58 + i * .12, 3.65);
    const a = 1 - smooth(t, 2.17 + i * .18, 2.75 + i * .17);
    nebulaStar(c, s, phase, s.x * drift * 1.22, s.y * drift * .86, a);
  }
}

// ---------- Aurora ----------
// The curtains inside the window race and the veil pulses; the window then
// shears into strips of curtain that lift away, the night behind them going
// first, while the two outer ribbons part into lengths that go out one by one.
function ribbonPieces(c, x, { cuts, pieces }, t) {
  // Each length is the ribbon under a soft mask; unbroken, the masks sum to one.
  const edge = 9;
  for (const [j, p] of pieces.entries()) {
    const L = cuts[j - 1], R = cuts[j], a = 1 - smooth(t, p.fade, p.fade + .7);
    const left = L ? L.x + 22 * smooth(t, L.at, L.at + .7) : 0, right = R ? R.x - 22 * smooth(t, R.at, R.at + .7) : MS_W;
    if (a <= .002 || right - left < 2 * edge) continue;
    const age = Math.max(0, t - Math.min(L?.at ?? 9, R?.at ?? 9));
    const x0 = Math.max(0, Math.floor(L ? left - edge : 0)), x1 = Math.min(MS_W, Math.ceil(R ? right + edge : MS_W));
    const m = layer(c, 'piece'), k = m.getTransform().a, w = x1 - x0;
    m.drawImage(x.canvas, x0 * k, 0, w * k, MS_H * k, x0, 0, w, MS_H);
    m.globalCompositeOperation = 'destination-in';
    const g = m.createLinearGradient(0, 0, MS_W, 0), stop = (px, v) => g.addColorStop(clamp01(px / MS_W), rgba('0,0,0', v));
    if (L) { stop(left - edge, 0); stop(left + edge, 1); } else stop(0, 1);
    if (R) { stop(right - edge, 1); stop(right + edge, 0); } else stop(MS_W, 1);
    m.fillStyle = g; m.fillRect(x0, 0, w, MS_H);
    c.save(); c.globalAlpha = a; c.translate(p.vx * age, -p.vy * age - 9 * age * age);
    c.drawImage(m.canvas, x0 * k, 0, w * k, MS_H * k, x0, 0, w, MS_H); c.restore();
  }
}

function drawAuroraDeath(c, t, st) {
  const phase = st.phase + t, lift = smooth(t, .38, 2.78), leave = smooth(t, 2.13, 4.27);
  const unrest = smooth(t, .3, 1.5), fast = phase + .8 * unrest * unrest;
  const P = flamePts(msShape().outer, { t:phase, wob:.08 });
  const pulse = 1 + .3 * unrest * Math.sin(t * 7.3) * Math.sin(t * 3.1 + 1);
  c.globalCompositeOperation = 'lighter';
  glow(c, MS_CX, MS_CY - lift * 21, 80 + lift * 36, '90,255,220', .12 * (1 - leave));
  auroraVeil(c, P, fast, 87 + 24 * lift, 1.1 * (1 + .26 * lift) * (1 - leave) * pulse,
    { span:46 + 101 * lift, lift:29 * lift + 32 * leave, drift:18 * lift - 54 * leave });
  for (const [i, rb] of st.settled.rib.slice(0, 2).entries()) {
    const open = smooth(t, .36 + i * .28, 2.05 + i * .4), x = layer(c, 'ribbon' + i);
    x.globalCompositeOperation = 'lighter';
    auroraRibbon(x, rb, i, phase, 1, 1, { open, lift:(31 - i * 13) * open, drift:(i ? 1 : -1) * 20 * open, alpha:1 + .65 * open });
    ribbonPieces(c, x, st.breaks[i], t);
  }

  const sky = layer(c, 'sky'), light = layer(c, 'light'), rim = layer(c, 'rim');
  auroraBody(sky, P, fast, 0, 1);
  auroraBody(light, P, fast, 1, 0);
  rim.globalCompositeOperation = 'lighter';
  auroraRim(rim, P, 1);
  const held = st.strips.filter(s => t < s.at);
  if (held.length) {
    c.save();
    if (held.length < st.strips.length) { c.beginPath(); for (const s of held) c.rect(s.x, 0, 4, MS_H); c.clip(); }
    c.globalCompositeOperation = 'source-over'; blit(c, sky);
    c.globalCompositeOperation = 'lighter'; blit(c, light); blit(c, rim);
    c.restore();
  }
  const hem = MS_CY + 46;
  for (const s of st.strips) {
    const age = t - s.at, a = 1 - smooth(age, s.fade, s.fade + .85);
    if (age <= 0 || a <= .002) continue;
    const up = (16 + 22 * s.rise) * age + 26 * s.rise * age * age, tall = 1 + .9 * smooth(age, 0, 1.3);
    c.save();
    c.translate(7 * s.sway * Math.sin(age * 1.6 + s.ph) * Math.min(1, age), hem - up); c.scale(1, tall); c.translate(0, -hem);
    c.beginPath(); c.rect(s.x - .3, 0, 4.6, MS_H); c.clip();
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = a * (1 - smooth(age, 0, .35)); blit(c, sky);
    c.globalCompositeOperation = 'lighter'; c.globalAlpha = a; blit(c, light);
    c.globalAlpha = a * (1 - smooth(age, 0, .3)); blit(c, rim);
    c.restore();
  }
}

// ---------- Quasar ----------
// The engine browns out in stutters. One last pair of jets erupts, then
// thins and falls back into the core; the flame dims to violet and goes,
// and the matter it held flies loose.
function drawQuasarDeath(c, t, st) {
  const wind = smooth(t, .27, 1.86), fail = smooth(t, .95, 2.7);
  const release = smooth(t, 2.1, 3.86), after = 1 - smooth(t, 2.75, 4.11);
  const phase = st.phase + t + wind * .73;
  const cut = chance(t, 3)() < .32 * smooth(t, .3, 1.2) * (1 - smooth(t, 2.2, 2.6)) ? 1 : 0;
  const power = (1 - .55 * fail) * (1 - .45 * cut);
  const disk = { wind:wind * (1 - .82 * release), escape:release, alpha:after * (1 + .83 * wind) };
  c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
  quasarDisk(c, phase, st.settled.disk, true, disk);
  const on = out3(seg(t, 1.29, 1.58)), weak = smooth(t, 1.62, 2.3), sink = in3(seg(t, 2.05, 2.7));
  quasarJets(c, t - 1.25 * Math.max(0, t - 1.75) ** 2, (40 + 230 * on) * (1 - .35 * weak) * (1 - sink),
    7 * on * (1 - .7 * weak) * (1 - .4 * cut), { a:(1 - .5 * cut) * (1 - smooth(t, 2.5, 2.72)) });
  const gone = smooth(t, 2.3, 3.4);
  glow(c, MS_CX, MS_CY + 5, 42, '200,215,255', .9 * power * (1 - gone));
  glow(c, MS_CX, MS_CY + 5, 6, WHITE_LIGHT, power * (1 - gone));
  if (gone < 1) {
    const x = layer(c, 'quasar');
    const P = flamePts(msShape().outer, { t:phase, s:1.12 * (1 - .1 * fail), wob:.06 + .35 * wind, curl:.45 * fail });
    quasarBody(x, P, phase, st.settled.core, .3 * bell(t, .27, .7), 1);
    if (fail > .002) {
      // Its white heat cools to indigo, core and lane still showing through.
      x.save(); trace(x, P); x.clip(); x.globalCompositeOperation = 'multiply';
      x.fillStyle = rgba(mix(WHITE_LIGHT, '112,74,232', fail), 1); x.fillRect(0, 0, MS_W, MS_H); x.restore();
    }
    c.save(); c.globalCompositeOperation = 'source-over';
    if (power < .999) c.filter = 'brightness(' + power.toFixed(3) + ')';
    c.globalAlpha = 1 - gone;
    blit(c, x);
    c.restore();
  }
  c.globalCompositeOperation = 'lighter';
  quasarDisk(c, phase, st.settled.disk, false, disk);
  const last = bell(t, 2.37, 2.77);
  ovalGlow(c, MS_CX, DEATH_Y, 119, 15, QUASAR_TILT, '174,193,255', .58 * last);
  glow(c, MS_CX, DEATH_Y, 17, '227,235,255', .89 * last);
}

// ---------- Singularity ----------
const HORIZON_LOSS = 3.69;

function singularityInfall(c, t, streams) {
  for (const p of streams) {
    const age = seg(t, p.start, p.end);
    if (age <= 0 || age >= 1) continue;
    const path = curve(24, s => {
      const u = Math.max(0, age - .4 * (1 - s)), r = lerp(p.radius, p.inner, u ** 1.45);
      const a = p.angle + 1.15 * u + 4.9 * u ** 3;
      return singularityPoint(r, a, lerp(.88, .28, u));
    });
    const [x, y] = path[0], [endX, endY] = path.at(-1);
    const a = smooth(age, 0, .31) * (1 - smooth(age, .71, 1));
    const g = c.createLinearGradient(x, y, endX, endY);
    g.addColorStop(0, rgba('166,182,237', 0)); g.addColorStop(.65, rgba('212,221,248', .35 * a));
    g.addColorStop(1, rgba('254,248,237', .91 * a));
    trace(c, path, false);
    c.lineWidth = p.size * 6; c.strokeStyle = rgba('177,197,248', .074 * a); c.stroke();
    c.lineWidth = p.size; c.strokeStyle = g; c.stroke();
  }
}

// The lensed rim unwinds from the last pinprick as the star images return
// to their original positions behind the passing wavefront.
function singularityLastLight(c, t, release) {
  const point = smooth(t, 3.34, 3.48) * (1 - smooth(t, HORIZON_LOSS - .13, HORIZON_LOSS));
  ovalGlow(c, MS_CX, HOLE_Y, 12, 4, HOLE_TILT, '235,240,255', .65 * point);
  glow(c, MS_CX, HOLE_Y, 4.5, WHITE_LIGHT, point);
  if (!release || release >= 1) return;
  const light = smooth(release, 0, .14) * (1 - release) ** 1.7;
  for (const [i, start] of [-1.54, .15, 2.3, 3.77].entries()) {
    const path = curve(37, s => {
      const a = start + s * (1.3 + .08 * i) - .38 * release;
      const r = 10 + 154 * out3(release) + (10 * Math.sin(3 * a + t * 3) + 4 * Math.sin(a * 7 - t * 4)) * (1 - release);
      return singularityPoint(r, a, .83 + .17 * release);
    });
    const g = c.createLinearGradient(...path[0], ...path.at(-1));
    g.addColorStop(0, rgba('235,239,255', 0)); g.addColorStop(.52, rgba('235,239,255', light * (.74 - .12 * i)));
    g.addColorStop(1, rgba('235,239,255', 0));
    trace(c, path, false);
    c.lineWidth = 6; c.strokeStyle = rgba('191,210,255', .074 * light); c.stroke();
    c.lineWidth = 1.1; c.strokeStyle = g; c.stroke();
  }
}

// The milestone's horizon, disk, infalling matter and starlight, collapsing.
function singularityLoss(c, t, st) {
  const phase = st.phase + t;
  const gravity = smooth(t, .25, 2.43), collapse = inOut(seg(t, 1.83, 3.56));
  const totality = smooth(t, 2.62, 3.44) * (1 - smooth(t, HORIZON_LOSS, 4.42));
  const release = seg(t, HORIZON_LOSS, 5.11), fade = smooth(t, 4.39, 5.2);
  singularityVignette(c, (.72 + .16 * gravity + .12 * totality) * (1 - smooth(t, HORIZON_LOSS, 4.82)));
  c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.lineJoin = 'round';
  singularityStars(c, phase, st.settled.stars, 58 + 2 * Math.sin(phase * 1.3) + 26 * gravity,
    (1 - .63 * totality) * (1 - fade), { pull:gravity, release });

  if (t < HORIZON_LOSS) {
    const a = 1 - smooth(t, 3.21, 3.53), disk = { pull:collapse, wind:gravity, alpha:a };
    singularityInfall(c, t, st.streams);
    singularityFall(c, phase, st.settled.fall, true, collapse, a);
    singularityDisk(c, phase, st.settled.disk, true, 1, disk);
    const round = smooth(t, 1.52, 3.06), scale = 1 - .981 * collapse;
    const center = [MS_CX, lerp(MS_CY + 4, HOLE_Y, round)];
    const P = flamePts(msShape().outer, { t:phase, y:lerp(MS_CY, HOLE_Y, round), round, R:4.7,
      wob:.04 + .03 * Math.sin(phase * 2.3) + .72 * gravity, curl:.47 * gravity });
    const warped = P.map(([x, y]) => {
      const dx = x - MS_CX, dy = y - HOLE_Y, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      const angle = a + gravity * (.58 * Math.exp(-r / 54) + .21 * Math.sin(r * .09 - t * 3.4)) + 1.27 * collapse;
      const d = r * (1 + .12 * gravity * (1 - round) * Math.sin(angle * 3 - t * 4));
      return [MS_CX + d * Math.cos(angle), HOLE_Y + d * Math.sin(angle)];
    });
    c.save(); c.translate(MS_CX, HOLE_Y); c.scale(scale, scale); c.translate(-MS_CX, -HOLE_Y);
    singularityHorizon(c, warped, center, phase, 1, 1 - .9 * collapse, 1 - .95 * collapse);
    c.restore();
    singularityDisk(c, phase, st.settled.disk, false, 1, disk);
    singularityFall(c, phase, st.settled.fall, false, collapse, a);
    singularityDrift(c, phase + gravity * .73, st.settled.drift, collapse, a);
  }
  singularityLastLight(c, t, release);
}

// Space itself winds up round the hole: the frame is redrawn in thin rings
// out to SWIRL_R, each turned further the nearer it lies, and pulled in.
// Each ring is a stroke filled with the turned frame: erasing its footprint
// then adding it back blends neighbours by coverage, so rings meet with no
// seam; 1.6px apart, the steps between them stay around a pixel.
const SWIRL_R = 150, SWIRL_RINGS = Array.from({ length:93 }, (_, i) => 2 + 1.6 * i);
// (cx, cy) is the centre of the whirlpool; overtakes move it off the hole.
function swirl(c, src, twist, pull, cx = MS_CX, cy = HOLE_Y) {
  const out = layer(c, 'swirl'), k = out.getTransform().a, frame = out.createPattern(src.canvas, 'no-repeat');
  out.drawImage(src.canvas, 0, 0, MS_W, MS_H);
  for (let i = SWIRL_RINGS.length - 1; i >= 0; i--) {
    const r = SWIRL_RINGS[i], inner = i ? r - 2.6 : 0, mid = (r + inner) / 2, s = pull(mid);
    frame.setTransform(new DOMMatrix().translateSelf(cx, cy).rotateSelf(twist(mid) * 180 / Math.PI)
      .scaleSelf(s, s).translateSelf(-cx, -cy).scaleSelf(1 / k, 1 / k));
    out.beginPath(); out.arc(cx, cy, mid, 0, MS_TAU); out.lineWidth = r - inner;
    out.globalCompositeOperation = 'destination-out'; out.strokeStyle = '#000'; out.stroke();
    out.globalCompositeOperation = 'lighter'; out.strokeStyle = frame; out.stroke();
  }
  blit(c, out);
}

// Everything round it is dragged into a whirlpool as it collapses; when the
// horizon goes, the twist unwinds behind the wavefront that frees the stars.
function drawSingularityDeath(c, t, st) {
  const x = layer(c, 'singularity');
  singularityLoss(x, t, st);
  const gravity = smooth(t, .25, 2.43), collapse = inOut(seg(t, 1.83, 3.56)), release = seg(t, HORIZON_LOSS, 5.11);
  const wind = 4.2 * gravity * gravity + 6 * collapse;
  if (wind < .002) return blit(c, x);
  const front = 195 * out3(release), wave = release ? (1 - release) * seg(release, 0, .1) : 0;
  // Both fall to nothing by SWIRL_R, where the rings stop.
  const edge = Math.exp(-SWIRL_R / 46), taper = r => Math.max(0, (Math.exp(-r / 46) - edge) / (1 - edge));
  swirl(c, x, r => wind * taper(r) * (1 - (release ? smooth(front - r - 24, -24, 24) : 0)),
    r => 1 - .3 * collapse * (1 - release) * taper(r) * Math.exp(-r / 120) + .07 * wave * Math.exp(-(((r - front) / 16) ** 2)) * seg(SWIRL_R - r, 0, 20));
}

const DEATH_SCENES = {
  red: {
    ms:2200, caption:[.93, 1.53], draw:drawEmberDeath,
    init:r => {
      const { pieces, cracks } = shatter(r, [[-7.4, -10], [7.4, -10], [7.4, 7.4], [-7.4, 7.4]], 28);
      const probe = insideFlame.ctx ||= document.createElement('canvas').getContext('2d');
      const lit = P => [...P, ...P.map((p, i) => [(p[0] + P[(i + 1) % P.length][0]) / 2, (p[1] + P[(i + 1) % P.length][1]) / 2])]
        .some(([u, v]) => probe.isPointInPath(msShape().path, u + 8, v + 10));
      return {
        sparks:Array.from({ length:9 }, (_, i) => ({
          x:(r() - .5) * 48, y:16 + 53 * r(), vx:(r() - .5) * 66, rise:32 + 30 * r(),
          start:.28 + i * .112 + r() * .075, life:.45 + r() * .36, size:.65 + r() * .72
        })),
        cracks:cracks.map(([a, b]) => ({ pts:bolt(a, b, r, .32, 4), at:.42 + .34 * r(), k:(.35 + .65 * r()) * Math.min(1, 7 / Math.hypot(b[0] - a[0], b[1] - a[1])) })),
        pieces:pieces.map(({ P, c }) => {
          const at = .9 + .56 * (c[1] + 10) / 17.4 + .1 * r();
          return { P, c, at, vx:c[0] * 2.4 + (r() - .5) * 18, drop:80 + 70 * r(), spin:(r() - .5) * 4.2,
            flecks:lit(P) ? Array.from({ length:4 }, () => ({ dx:(r() - .5) * 8, dy:(r() - .5) * 8, vx:(r() - .5) * 26,
              fall:12 + 20 * r(), at:at + .08 + .3 * r(), life:.5 + .5 * r(), sz:.8 + 1.1 * r(),
              ph:r() * MS_TAU, spin:(r() - .5) * 8, hot:r() < .4 ? 1 : 0 })) : [] };
        })
      };
    }
  },
  orange: { ms:1560, caption:[.79, 1.32], draw:drawFlareDeath },
  yellow: {
    ms:2950, caption:[1.49, 2.08], draw:drawSolarDeath,
    init:r => ({
      ejecta:Array.from({ length:44 }, (_, i) => ({
        prom:i % 4, fan:(r() - .5) * .77, bend:(r() - .5) * 1.22, r:40 + 36 * r(), reach:30 + 74 * r(),
        delay:.03 + r() * .38, life:.43 + r() * .55, size:.64 + r() * .85
      }))
    })
  },
  blue: {
    ms:3280, caption:[1.6, 2.18], draw:drawPlasmaDeath,
    init:r => ({
      bolts:Array.from({ length:10 }, (_, i) => {
        const main = i % 3 === 0, a = i / 10 * MS_TAU + (r() - .5) * .5, len = main ? 140 + 30 * r() : 60 + 70 * r();
        return {
          points:bolt([MS_CX, DEATH_Y], [MS_CX + Math.cos(a) * len, DEATH_Y + Math.sin(a) * len], r, .5, 4, (r() - .5) * 26),
          delay:r() * .12, phase:r() * MS_TAU, width:main ? 1.8 : .65 + .45 * r(), alpha:main ? .99 : .35 + r() * .45
        };
      })
    })
  },
  purple: { ms:4110, caption:[1.84, 3.06], draw:drawNebulaDeath },
  aurora: {
    ms:4440, caption:[1.65, 2.74], draw:drawAuroraDeath,
    init:r => ({
      strips:Array.from({ length:33 }, (_, j) => ({ x:114 + 4 * j, at:.95 + .62 * j / 32 + .05 * r(),
        rise:.95 + .35 * Math.sin(j * .5 + 1) + .08 * r(), sway:Math.sin(j * .31), ph:j * .27, fade:.45 + .3 * Math.sin(j * .7) ** 2 + .1 * r() })),
      breaks:[0, 1].map(i => ({
        cuts:[72, 138, 208, 276].map(x => ({ x:x + (r() - .5) * 24, at:1.45 + i * .3 + .9 * r() })),
        pieces:Array.from({ length:5 }, () => ({ fade:2.05 + i * .25 + 1.1 * r(), vy:6 + 16 * r(), vx:(r() - .5) * 26 }))
      }))
    })
  },
  quasar: { ms:4190, caption:[1.35, 1.97], draw:drawQuasarDeath },
  singularity: {
    ms:5290, caption:[2.68, 3.24], draw:drawSingularityDeath,
    init:r => ({
      streams:Array.from({ length:16 }, (_, i) => ({
        angle:MS_TAU * i / 16 + r() * .65, radius:112 + 53 * r(), inner:2 + 11 * r(),
        start:.57 + r() * 1.44, end:2.63 + .87 * r(), size:.63 + r() * .87
      }))
    })
  }
};

// Cache glyph positions once, then move them through the horizon with the dust.
function singularityCaption(root, heading) {
  const name = heading.textContent;
  heading.setAttribute('role', 'heading');
  heading.setAttribute('aria-level', '2');
  heading.setAttribute('aria-label', name);
  heading.replaceChildren(...Array.from(name, letter => {
    const span = document.createElement('span');
    span.textContent = letter;
    span.setAttribute('aria-hidden', 'true');
    return span;
  }));
  const bounds = root.getBoundingClientRect(), scale = bounds.width / MS_W || 1;
  const glyphs = Array.from(heading.children, el => {
    const r = el.getBoundingClientRect();
    const dx = (r.left + r.width / 2 - bounds.left) / scale - MS_CX;
    const dy = (r.top + r.height / 2 - bounds.top) / scale - HOLE_Y;
    return { el, dx, dy, angle:Math.atan2(dy, dx), r:Math.hypot(dx, dy) };
  });
  return t => {
    for (const { el, dx, dy, r, angle } of glyphs) {
      const delay = .00165 * r, fall = smooth(t, 1.75 + delay, 3.04 + delay);
      const a = angle - fall ** 1.4 * (2.75 - .009 * r), d = r * (1 - .97 * fall);
      const x = (Math.cos(a) * d - dx) * scale, y = (Math.sin(a) * d - dy) * scale;
      el.style.transform = 'translate(' + x + 'px,' + y + 'px) rotate(' + (a - angle) + 'rad) scale(' + (1 - .9 * fall) + ')';
      el.style.opacity = 1 - smooth(fall, .62, .94);
    }
  };
}

function playStreakDeath(host, tier, { n = TIER_MIN[tier], owner, handoff, reduced, onEnd } = {}) {
  const scene = DEATH_SCENES[tier], milestone = SCENES[tier];
  const root = document.createElement('div');
  root.className = 'ms ms-' + tier + ' ms-death';
  root.innerHTML = '<canvas aria-hidden="true"></canvas><div class="ms-title"><b></b><small></small><i class="ms-line"></i></div>';
  const canvas = root.firstChild, title = root.lastChild, [heading, summary, line] = title.children;
  heading.textContent = TIER_LABEL[tier];
  summary.textContent = (owner ? owner + ' · ' : '') + 'Streak of ' + n + ' lost';
  const details = [summary];
  if (handoff) {
    const lead = document.createElement('small');
    lead.textContent = handoff;
    title.insertBefore(lead, line);
    details.push(lead);
  }
  host.replaceChildren(root);

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(MS_W * dpr); canvas.height = Math.round(MS_H * dpr);
  const c = canvas.getContext('2d');
  const still = !c || (reduced ?? !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const ms = still ? DEATH_REDUCED_MS : scene.ms;
  const settled = c && initMilestoneScene(tier, milestone), end = milestoneEndTime(milestone);
  const st = still ? null : { settled, phase:end - (milestone.lead ?? 0),
    ...scene.init?.(seeded(309 + TIER_ORDER.indexOf(tier) * 727)) };
  let raf = 0, timer = 0, start = null, moveCaption = null;

  function stop() {
    cancelAnimationFrame(raf);
    clearTimeout(timer);
    root.remove();
  }
  function complete() {
    stop();
    onEnd?.();
  }
  function draw(t) {
    if (t < DEATH_LEAD) renderScene(c, dpr, milestone, end + t, settled);
    else renderScene(c, dpr, scene, t, st);
  }
  function caption(t) {
    title.style.opacity = 1 - smooth(t, ...scene.caption);
    for (const el of details) el.style.opacity = smooth(t, .12, .39);
    if (tier === 'singularity') {
      line.style.opacity = .8 * (1 - smooth(t, 1.31, 2.17));
      if (t >= 1.75) (moveCaption ??= singularityCaption(root, heading))(t);
    }
  }
  function frame(now) {
    if (!root.isConnected) return stop();
    start ??= now;
    const elapsed = now - start;
    if (elapsed >= ms) return complete();
    const t = elapsed / 1000;
    draw(t);
    caption(t);
    raf = requestAnimationFrame(frame);
  }
  if (c) draw(0);
  if (still) {
    title.style.opacity = 1;
    if (tier === 'singularity') line.style.opacity = .8;
    timer = setTimeout(complete, ms);
  } else {
    caption(0);
    raf = requestAnimationFrame(frame);
  }
  return { ms, stop };
}
