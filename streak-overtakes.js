'use strict';
// Overtakes: two streaks fighting for the lead on the milestone stage
// (milestones.js), drawn from the same artwork and seeded state. The leader
// burns full size in the middle; the challenger burns small at the left. The
// lead changes hands when the challenger drives into the middle and knocks
// the old leader out to the right, where it settles small. Each player's
// name and count ride under their flame in DOM text, so whoever holds the
// middle owns the big type.
//
// Every tier has two choreographies, and neither is the other backwards:
// - defeat (you are passed): your milestone resists, is stripped of its tier
//   and the one below shows through; the rival takes what was torn off.
//   Being passed drops a streak to the start of the tier below
//   (droppedStreak, match.js), so the tier left showing is the real one.
// - victory (you pass them): your flame builds, breaks through and claims the
//   middle. Your tier stays the one your count earns; the passed rival drops
//   a tier at the side.
// A lead change between two teammates plays the new leader's victory.
//
// playOvertake(host, { dir, hero, rival, reduced, onEnd }) fills host and
// returns { ms, stop }. hero and rival are { name, from, to }: the counts
// shown before and after. Like the milestones, each frame is closed-form in t.
const OT_HOLD = 1500, OT_FADE = 450, OT_STILL_MS = 2800;
const OT_LEAD = { x:MS_CX, y:MS_CY, s:1 }, OT_CHASE = { x:76, y:200, s:.44 }, OT_BEATEN = { x:286, y:203, s:.42 }, OT_OFF = { x:-46, y:206, s:.44 };
const OT_RGB = { red:'255,69,69', orange:'255,152,47', yellow:'255,226,74', blue:'69,168,255', purple:'183,121,255', aurora:'94,242,208', quasar:'205,212,255', singularity:'255,255,255' };
const OT_INK = { red:'#ff8a80', orange:'#ffb46a', yellow:'#ffe98a', blue:'#bfe4ff', purple:'#e3d0ff', aurora:'#c9fff3', quasar:'#f6f8ff', singularity:'#ffffff' };
const otTier = n => n >= MIN_STREAK ? streakTier(n) : null;
const otSlot = (a, b, x, arc = 0) => ({ x:lerp(a.x, b.x, x), y:lerp(a.y, b.y, x) - arc * Math.sin(Math.PI * clamp01(x)), s:lerp(a.s, b.s, x) });
// A point on the flame at slot p, in icon units from its bulb's centre.
const otPt = (p, u = 0, v = 0) => [p.x + u * MS_S * p.s, p.y + v * MS_S * p.s];
const otMix = (A, B, x) => [lerp(A[0], B[0], x), lerp(A[1], B[1], x)];
// A quadratic curve from A to B bowed sideways by bend pixels.
function otBez(A, B, bend, u) {
  const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1, v = 1 - u;
  const C = [(A[0] + B[0]) / 2 - dy / L * bend, (A[1] + B[1]) / 2 + dx / L * bend];
  return [v * v * A[0] + 2 * v * u * C[0] + u * u * B[0], v * v * A[1] + 2 * v * u * C[1] + u * u * B[1]];
}
// Draw in a flame's own frame (centred on MS_CX, MS_CY at full size), placed at slot p.
function otAt(c, p, fn) { c.save(); c.translate(p.x, p.y); c.scale(p.s, p.s); c.translate(-MS_CX, -MS_CY); fn(); c.restore(); }
// Lean the flame by k on its base (negative leans right).
function otLean(c, k, base = MS_CY + 42) { c.translate(0, base); c.transform(1, 0, k, 1, 0, 0); c.translate(0, -base); }
function otRing(c, x, y, r, w, col, a) {
  if (a <= .004) return;
  c.beginPath(); c.arc(x, y, Math.max(.1, r), 0, MS_TAU); c.lineWidth = w; c.strokeStyle = rgba(col, a); c.stroke();
}

// Any tier's settled milestone at slot p, at time `time` past its reveal:
// the reveal's own last frame, through the same cache as ghost().
function otFlame(c, tier, time, p, o = {}) {
  const a = o.a ?? 1;
  if (!tier || a <= .004 || p.s <= .01) return;
  const sc = SCENES[tier], k = c.getTransform().a;
  const g = GHOST[tier] ||= { st:initMilestoneScene(tier, sc), cv:document.createElement('canvas') };
  if (g.cv.width !== Math.round(MS_W * k)) { g.cv.width = Math.round(MS_W * k); g.cv.height = Math.round(MS_H * k); }
  renderScene(g.cv.getContext('2d'), k, sc, milestoneEndTime(sc) + time, g.st);
  c.save(); c.globalCompositeOperation = o.comp || 'source-over'; c.globalAlpha = a; if (o.filter) c.filter = o.filter;
  c.translate(p.x, p.y); if (o.rot) c.rotate(o.rot); c.scale(p.s, p.s); c.translate(-MS_CX, -MS_CY);
  c.drawImage(g.cv, 0, 0, MS_W, MS_H);
  c.restore();
}

// Quasar's jet aimed from O at B: a tapered beam with a white spine and
// knots of light streaming along it at flow px/s.
function otJet(c, O, B, wid, t, a = 1, flow = 520) {
  if (wid <= .05 || a <= .004) return;
  const dx = B[0] - O[0], dy = B[1] - O[1], L = Math.hypot(dx, dy) || 1, nx = dx / L, ny = dy / L, px = -ny, py = nx;
  const g = c.createLinearGradient(O[0], O[1], B[0], B[1]);
  g.addColorStop(0, rgba('255,255,255', .95 * a)); g.addColorStop(.6, rgba('175,188,255', .7 * a)); g.addColorStop(1, rgba('140,110,255', .2 * a));
  c.fillStyle = g; c.beginPath();
  c.moveTo(O[0] + px * wid, O[1] + py * wid); c.lineTo(B[0] + px * wid * .4, B[1] + py * wid * .4);
  c.lineTo(B[0] - px * wid * .4, B[1] - py * wid * .4); c.lineTo(O[0] - px * wid, O[1] - py * wid); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(O[0], O[1]); c.lineTo(B[0], B[1]);
  c.lineWidth = wid * 3.4; c.strokeStyle = rgba('150,160,255', .1 * a); c.stroke();
  c.lineWidth = Math.max(.6, wid * .32); c.strokeStyle = rgba('255,255,255', .9 * a); c.stroke();
  for (let k = 0; k < 4; k++) {
    const d = ((t * flow + k * L / 4) % L + L) % L;
    glow(c, O[0] + nx * d, O[1] + ny * d, 4 + wid * .7, '225,232,255', .7 * a * (1 - .5 * d / L));
  }
}

// ---------- the two flames ----------
// The rival's flame at its slot: shaken and dimmed when hit, brighter and
// haloed while it feeds on what it took. After losing the lead it cools to
// the tier it really drops to.
function otRival(c, S, o = {}) {
  const tier = S.rivalTier, t = S.t;
  if (!tier) return;
  const hit = clamp01(S.hit), feed = clamp01(S.feed), p = S.rp;
  const flick = .5 + .5 * Math.sin(t * 47) * Math.sin(t * 23 + 1);
  const q = { x:p.x + (hit ? (chance(t, 91)() - .5) * 7 * hit : 0) + (o.dx || 0), y:p.y + (o.dy || 0), s:p.s * (1 + .1 * feed - .08 * hit) };
  const b = (1 + .6 * feed) * (1 - .45 * hit * flick), filter = Math.abs(b - 1) > .01 ? 'brightness(' + b.toFixed(3) + ')' : undefined;
  const a = (o.a ?? 1) * S.ra;
  if (feed > .01 && o.a === undefined) {
    c.save(); c.globalCompositeOperation = 'lighter';
    const C = otPt(p, 0, 0); glow(c, C[0], C[1], 70 * p.s + 20, OT_RGB[tier], .35 * feed);
    c.restore();
  }
  const down = S.dir === 'victory' && S.rivalLow !== tier ? smooth(t, S.scene.swap[1] - .1, S.scene.swap[1] + .5) : 0;
  otFlame(c, tier, t, q, { a:a * (1 - down), filter, rot:S.rrot, comp:o.comp });
  if (down) otFlame(c, S.rivalLow, t, q, { a:a * down, rot:S.rrot, comp:o.comp });
}

// The rival's interference, in its own tier's kind of energy, from its
// flame to B: heat for the fire tiers, lightning for Plasma, a band of
// light for Nebula and Aurora, a jet for Quasar, warped space for Singularity.
const OT_STYLE = { red:'fire', orange:'fire', yellow:'fire', blue:'bolt', purple:'mist', aurora:'mist', quasar:'beam', singularity:'void' };
function otAssault(c, S, power, B, bend = -24) {
  const tier = S.rivalTier, t = S.t;
  if (!tier || power <= .01) return;
  const A = otPt(S.rp, 1.6, -2.5), col = OT_RGB[tier], style = OT_STYLE[tier];
  c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.lineJoin = 'round';
  if (style === 'fire') {
    for (let i = 0; i < 30; i++) {
      const u = (t * 1.7 + i / 30 + .11 * Math.sin(i * 7.3)) % 1, b = bend + 12 * Math.sin(i * 3.1) + 4 * Math.sin(i * 5.7 + t * 6);
      lightTrace(c, [otBez(A, B, b, Math.max(0, u - .06)), otBez(A, B, b, u)], col, .85 * power * Math.sin(Math.PI * u), .9 + .25 * (i % 3), '255,236,210');
    }
  } else if (style === 'bolt') {
    for (let k = 0; k < 3; k++) {
      const rand = chance(t, 41 + k * 13);
      if (rand() > .55 + .4 * power) continue;
      drawBolt(c, bolt(A, B, rand, .38, 4, bend * (.4 + rand())), power * (.5 + .5 * rand()), 1.2 * power, '235,250,255', col);
    }
  } else if (style === 'mist') {
    const pts = curve(26, u => otBez(A, B, bend + 6 * Math.sin(u * 7 - t * 3), u));
    for (const [w, al] of [[18, .06], [8, .14], [2.4, .42]]) { trace(c, pts, false); c.lineWidth = w; c.strokeStyle = rgba(col, al * power); c.stroke(); }
    for (let i = 0; i < 18; i++) {
      const u = (t * .9 + i / 18) % 1, q = otBez(A, B, bend + 10 * Math.sin(i * 4.1), u);
      glow(c, q[0], q[1], 4, col, .55 * power * Math.sin(Math.PI * u));
    }
  } else if (style === 'beam') {
    otJet(c, A, B, 4.5 * power, t, power);
  } else {
    // A thread of darkened, warped space edged in white light.
    const pts = curve(26, u => otBez(A, B, bend + 5 * Math.sin(u * 9 - t * 4), u));
    c.globalCompositeOperation = 'source-over'; trace(c, pts, false); c.lineWidth = 7 * power; c.strokeStyle = rgba('0,0,0', .55 * power); c.stroke();
    c.globalCompositeOperation = 'lighter';
    for (const s of [-1, 1]) {
      trace(c, pts.map(([x, y], i) => [x, y + s * (3.5 + Math.sin(i * .6 + t * 5)) * power]), false);
      c.lineWidth = .8; c.strokeStyle = rgba('255,255,255', .7 * power); c.stroke();
    }
  }
  glow(c, B[0], B[1], 10 + 12 * power, col, .6 * power); glow(c, B[0], B[1], 3, '255,255,255', .9 * power);
  c.restore();
}

// The rival's win, once it holds the middle: a ring, a flash and sparks in its colour.
function otTriumph(c, S, t0) {
  const tier = S.rivalTier, x = seg(S.t, t0, t0 + .8);
  if (!tier || x <= 0 || x >= 1) return;
  const col = OT_RGB[tier], hot = mix(col, '255,255,255', .55), O = otPt(S.rp, 0, .5);
  c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
  glow(c, O[0], O[1], 30 + 80 * out3(x), col, .55 * (1 - x) ** 1.5);
  otRing(c, O[0], O[1], 16 + 120 * out3(x), 2.4 * (1 - x) + .4, hot, .9 * (1 - x));
  otRing(c, O[0], O[1], 10 + 80 * out3(seg(x, .12, 1)), 1.2, col, .6 * (1 - x));
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * MS_TAU + .3, d = 20 + 70 * out3(x) * (.7 + .3 * Math.sin(i * 2.7));
    lightTrace(c, [[O[0] + Math.cos(a) * (d - 12), O[1] + Math.sin(a) * (d - 12) * .8], [O[0] + Math.cos(a) * d, O[1] + Math.sin(a) * d * .8]], col, .8 * (1 - x), 1, hot);
  }
  c.restore();
}

// Where the flames stand at t. Defeat: the rival slides in at the left,
// creeps nearer, then drives into the middle as you are knocked out to the
// right a beat later. Victory: you come in at the left and build, pull back,
// lunge into the middle, and the rival is knocked out as you land.
function otLayout(S, t) {
  const [a, b] = S.scene.swap, w = seg(t, a, b), enter = S.scene.enter ?? .6;
  S.rrot = 0;
  if (S.dir === 'defeat') {
    const r = otSlot(OT_OFF, OT_CHASE, out3(seg(t, 0, enter))), creep = inOut(seg(t, enter, a));
    r.x += 14 * creep; r.s += .04 * creep;
    S.ra = seg(t, 0, enter * .6); S.ha = 1;
    S.rp = w > 0 ? otSlot(r, OT_LEAD, inOut(w), 10) : r;
    S.hp = otSlot(OT_LEAD, OT_BEATEN, out3(seg(w, .18, 1)), -6);
  } else {
    const h = otSlot(OT_OFF, OT_CHASE, out3(seg(t, 0, .4))), build = inOut(seg(t, .4, a));
    h.x += 12 * build; h.s += .05 * build;
    S.ha = seg(t, 0, .25); S.ra = 1;
    const lunge = w < .22 ? -.07 * Math.sin(Math.PI * w / .22) : out3((w - .22) / .78), k = seg(w, .4, 1);
    S.hp = otSlot(h, OT_LEAD, lunge, 16);
    S.rp = otSlot(OT_LEAD, OT_BEATEN, out3(k), 14);
    S.rrot = .3 * Math.sin(Math.PI * k) * (1 - k);
  }
}

function otDraw(c, t, S) {
  S.t = t; S.hit = S.feed = S.flip = 0;
  (S.scene.layout || otLayout)(S, t);
  const warp = S.scene.warp?.(S, t), x = warp ? layer(c, 'ot-frame') : c;
  S.scene.draw(x, t, S, S.st);
  if (S.dir === 'defeat') otTriumph(x, S, S.scene.swap[1] - .08);
  if (!warp) return;
  c.save();
  if (S.flip > .01) c.filter = 'grayscale(1) invert(' + clamp01(S.flip).toFixed(3) + ')';
  swirl(c, x, warp.twist, warp.pull, warp.x, warp.y);
  c.restore();
}

// ---------- tier bodies ----------
const OT_EMBER = SCENES.red.pal;

// Flare's outer flare: a tongue of fire at (x, y) licking out along ang.
const OT_TONGUE = mixPal(FLARE_HOT, SCENES.orange.pal, .3);
function otTongue(c, x, y, ang, s, ph, a) {
  if (a <= .004 || s <= .02) return;
  c.save(); c.translate(x, y); c.rotate(ang + Math.PI / 2);
  paintFire(c, { x:0, y:0, s, t:ph, wob:.9, curl:1.4, stretch:.3, a }, OT_TONGUE);
  c.restore();
}

// Solar's orbits: two loops of plasma crossed in an X round the flame, like
// the reveal's prominences, each with knots of light running round it. The
// half behind the flame is drawn first (back), the rest over it. o.brk (0-1)
// unravels a loop outward from where it snapped (o.at); o.pull (0-1) draws
// what is left of it into o.to.
function otOrbit(c, o, back) {
  const N = 72, X = o.x ?? MS_CX, Y = o.y ?? MS_CY - 2, cs = Math.cos(o.tilt), sn = Math.sin(o.tilt), heat = o.heat ?? 1;
  const pt = a => {
    const w = 1 + (o.wob || 0) * Math.sin(3 * a + o.t * 9 + (o.ph || 0)), u = o.rx * w * Math.cos(a), v = o.ry * w * Math.sin(a);
    let p = [X + u * cs - v * sn, Y + u * sn + v * cs], al = o.a ?? 1;
    if (o.brk) {
      const d = Math.abs(Math.atan2(Math.sin(a - o.at), Math.cos(a - o.at))) / Math.PI, free = smooth(o.brk, .6 * d, .6 * d + .4);
      p = outward(p, 74 * free * (1.15 - .4 * d), X, Y); p[1] += 26 * free * free; al *= 1 - free;
    }
    if (o.pull) {
      const s = (a % MS_TAU) / MS_TAU, f = in3(seg(o.pull, .3 * s, .3 * s + .7));
      p = otBez(p, o.to, 30, f); al *= 1 - seg(f, .75, 1);
    }
    return [p, al];
  };
  const stroke = (run, al) => {
    if (run.length < 2 || al <= .01) return;
    trace(c, run, false);
    c.lineWidth = 9; c.strokeStyle = rgba('255,150,30', .13 * al * heat); c.stroke();
    c.lineWidth = 3.4; c.strokeStyle = rgba('255,206,70', Math.min(1, .5 * al * heat)); c.stroke();
    c.lineWidth = 1.3; c.strokeStyle = rgba('255,250,222', .92 * al); c.stroke();
  };
  c.lineCap = 'round'; c.lineJoin = 'round';
  // Runs of the loop at one brightness are stroked as one path, so the glow never beads.
  let run = [], level = -1, last = pt(0)[0];
  for (let j = 1; j <= N; j++) {
    const a = j / N * MS_TAU, [p, al] = pt(a), mine = (Math.sin(a - Math.PI / N) > 0) !== back;
    const q = mine ? Math.round(al * (back ? .55 : 1) * 12) : 0;
    if (q !== level) { stroke(run, level / 12); run = [last]; level = q; }
    run.push(p); last = p;
  }
  stroke(run, level / 12);
  for (const off of [0, Math.PI]) {
    const ka = ((o.spin + off) % MS_TAU + MS_TAU) % MS_TAU;
    if ((Math.sin(ka) > 0) === back) continue;
    const [K, kal] = pt(ka);
    glow(c, K[0], K[1], 7, '255,250,215', .9 * kal * (back ? .5 : 1)); glow(c, K[0], K[1], 2.2, '255,255,255', kal * (back ? .6 : 1));
  }
}

// Plasma's containment: dipole field lines looping pole to pole round the
// globe, current running along them. spin turns them about the vertical
// axis, bend knocks each one out of line, flow speeds the current.
function otField(c, t, { a = 1, spin = 0, bend = 0, flow = 1 } = {}) {
  if (a <= .004) return;
  const top = [MS_CX, MS_CY - 66], bot = [MS_CX, MS_CY + 47];
  c.lineCap = 'round';
  for (let k = 0; k < 6; k++) {
    const ang = spin + k / 6 * MS_TAU, w = (54 + 9 * (k % 3)) * Math.cos(ang), near = Math.sin(ang) > 0 ? 1 : .45;
    const kink = bend * Math.sin(t * (5 + k) + k * 2.1), al = a * near;
    c.beginPath(); c.moveTo(top[0], top[1]);
    c.bezierCurveTo(MS_CX + w * 1.3 + kink * 16, MS_CY - 48 + kink * 10, MS_CX + w * 1.3 - kink * 12, MS_CY + 34, bot[0], bot[1]);
    c.setLineDash([]);
    c.lineWidth = 5; c.strokeStyle = rgba('69,150,255', .12 * al); c.stroke();
    c.lineWidth = .9; c.strokeStyle = rgba('170,225,255', .5 * al); c.stroke();
    c.setLineDash([3, 10]); c.lineDashOffset = -t * 60 * flow - k * 4;
    c.lineWidth = 1.4; c.strokeStyle = rgba('235,250,255', .75 * al); c.stroke();
  }
  c.setLineDash([]);
  glow(c, top[0], top[1], 7, '170,225,255', .6 * a); glow(c, bot[0], bot[1], 7, '170,225,255', .5 * a);
}

// Plasma's settled globe; surge stretches the heart and its tendrils up and
// down, squeeze compresses the heart and pulls the tendrils in.
let OT_PLASMA_POLES = null;
function otPlasma(c, t, st, { surge = 0, squeeze = 0, s = 1 } = {}) {
  const sh = msShape(), n = sh.outer.length;
  OT_PLASMA_POLES ||= [0, sh.outer.reduce((m, p, i) => p[1] > sh.outer[m][1] ? i : m, 0)];
  const P = flamePts(sh.outer, { t, wob:.06 + .12 * surge, s });
  const tend = st.tend.map((d, k) => {
    const pole = OT_PLASMA_POLES[k % 2], i = Math.round(lerp(d.i, d.i + ((pole - d.i + n * 1.5) % n - n / 2), .75 * surge));
    return { ...d, i, amp:d.amp * (1 + 1.3 * surge) * (1 - .6 * squeeze), wan:d.wan * (1 + .6 * surge) * (1 - .7 * squeeze) };
  });
  const Q = flamePts(sh.inner, { s:s * (1 + .05 * Math.sin(t * 7)) * (1 - .4 * squeeze), sy:1 + .8 * surge, t, wob:.06 });
  plasmaBody(c, P, Q, t, { tend });
  return P;
}

// Nebula's settled cloud: wisps, body, dust and stars. Stars twinkle harder
// with `sense`.
function otStarLight(s, ph, i, sense) {
  return lerp(bell(((ph - s.at) % 1.7 + 1.7) % 1.7, 0, .5), .75 + .25 * Math.sin(ph * 9 + i), sense);
}

// Aurora's settled window, veil and outer ribbons.
function otAurora(c, t, set, { fast = t, veilH = 87, veilI = 1.1, veil = {}, open = [0, 0], lift = [0, 0], drift = [0, 0], ribA = [1, 1], body = 1, ribbons = true } = {}) {
  const P = flamePts(msShape().outer, { t, wob:.08 });
  c.globalCompositeOperation = 'lighter';
  glow(c, MS_CX, MS_CY, 80, '90,255,220', .12 * body);
  auroraVeil(c, P, fast, veilH, veilI, veil);
  if (ribbons) for (let i = 0; i < 2; i++) if (ribA[i] > .01) auroraRibbon(c, set.rib[i], i, fast, 1, 1, { open:open[i], lift:lift[i], drift:drift[i], alpha:ribA[i] });
  if (body > .004) {
    c.globalCompositeOperation = 'source-over';
    auroraBody(c, P, fast, body, body);
    c.globalCompositeOperation = 'lighter';
    auroraRim(c, P, body);
  }
  return P;
}

// Quasar's settled flame, disk and core.
function otQuasar(c, t, set, { wind = 0, escape = 0, ex = 0, wob = 0, diskA = 1, bodyA = 1, glowA = 1 } = {}) {
  const O = [MS_CX, MS_CY + 5];
  c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
  quasarDisk(c, t, set.disk, true, { wind, escape, alpha:diskA });
  glow(c, O[0], O[1], 42, '200,215,255', .9 * glowA); glow(c, O[0], O[1], 6, '255,255,255', Math.min(1, glowA));
  if (bodyA > .004) {
    c.globalCompositeOperation = 'source-over';
    c.save(); c.globalAlpha = bodyA;
    quasarBody(c, flamePts(msShape().outer, { s:1.12, t, wob:.06 + wob, curl:1.2 * wob }), t, set.core, clamp01(ex), 1);
    c.restore();
  }
  c.globalCompositeOperation = 'lighter';
  quasarDisk(c, t, set.disk, false, { wind, escape, alpha:diskA });
}

// Singularity's settled hole, stars and disk. k.tide stretches the horizon
// towards angle k.dir; k.peel drags it, side nearest first, into k.to.
function otSingularity(c, t, set, k) {
  const sh = msShape(), n = sh.outer.length, O = [MS_CX, HOLE_Y], C = [MS_CX, MS_CY + 4];
  singularityVignette(c, .72 * k.vig);
  c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.lineJoin = 'round';
  singularityStars(c, t, set.stars, k.lens, k.starA, { pull:k.pull, release:k.release });
  singularityFall(c, t, set.fall, true, 0, k.diskA);
  singularityDisk(c, t, set.disk, true, 1, { wind:k.wind, alpha:k.diskA });
  const S = flamePts(sh.outer, { t, wob:.04 + .03 * Math.sin(t * 2.3) + k.wob });
  for (let i = 0; i < n; i++) {
    const p = S[i], a = Math.atan2(p[1] - O[1], p[0] - O[0]), face = (1 + Math.cos(a - k.dir)) / 2;
    const d = 1 + k.warp * (.14 * Math.sin(2 * a + t * 4) + .06 * Math.sin(3 * a - t * 6)) + .24 * k.tide * face * face;
    let q = [O[0] + (p[0] - O[0]) * d, O[1] + (p[1] - O[1]) * d];
    if (k.peel) q = otBez(q, k.to, 46 + 20 * Math.sin(a * 2), in3(seg(k.peel, (1 - face) * .45, (1 - face) * .45 + .55)));
    S[i] = q;
  }
  if (k.horizon > .004) {
    // Through a layer, so the black of the horizon can fade with its rim.
    const x = layer(c, 'ot-horizon');
    singularityHorizon(x, S, C, t, k.born, k.e, k.halo);
    c.save(); c.globalCompositeOperation = 'source-over'; c.globalAlpha = k.horizon; blit(c, x); c.restore();
  }
  c.globalCompositeOperation = 'lighter';
  singularityDisk(c, t, set.disk, false, 1, { wind:k.wind, alpha:k.diskA });
  singularityFall(c, t, set.fall, false, 0, k.diskA);
  singularityDrift(c, t, set.drift, 0, k.diskA);
}

// ---------- the sixteen scenes ----------
// Per tier, a defeat and a victory: ms is the motion before the hold, swap
// the seconds over which the middle changes hands, roll the moment the
// counts change. draw(c, t, S, st) paints the frame; S carries the layout
// (hp, rp), the rival's state (hit, feed) and helpers.
const OT_SCENES = {
  // Ember. Defeat: it flickers on guard, a gust of the rival's heat bends it
  // flat and scatters its sparks, and it is beaten down to a coal that the
  // rival drinks the sparks from. Victory: a smothered flame suddenly
  // catches, drives a spray of sparks through the rival and lands with a
  // sharp orange flare.
  red: {
    defeat: {
      ms:2350, swap:[1.58, 2.08], roll:1.2,
      init:r => ({
        sparks:Array.from({ length:26 }, () => ({ u:(r() - .2) * 7, v:-1 - r() * 7, a:-.95 + r() * 1.1, sp:80 + r() * 110, at:.6 + r() * .62, d:r() * .3, sz:.7 + r() * .7 })),
        wind:Array.from({ length:9 }, () => ({ y:-62 + r() * 90, ph:r(), len:26 + r() * 30 }))
      }),
      draw(c, t, S, st) {
        const ph = S.phase + t, base = MS_CY + 42;
        const nerve = smooth(t, .12, .55) * (1 - smooth(t, 1.1, 1.4)), gust = smooth(t, .56, .78) * (1 - smooth(t, 1.12, 1.4));
        const jit = Math.sin(t * 37) * Math.sin(t * 23 + 1.3), shrink = in3(seg(t, 1, 1.4));
        const s = lerp(1 + .05 * nerve * jit, .19, shrink), gone = smooth(t, 2, 2.3);
        S.feed = smooth(t, 1.4, 1.85) * (1 - smooth(t, 2.1, 2.6));
        otAt(c, S.hp, () => {
          c.save(); otLean(c, -(.4 * gust + .07 * gust * Math.sin(t * 19) + .05 * nerve * Math.sin(t * 9)) * (1 - shrink), base);
          paintFire(c, { s, t:ph, y:base - 42 * s, sx:1 - .14 * gust, wob:.2 + .45 * nerve + .8 * gust, curl:1.3 * gust, stretch:.12 * nerve * Math.max(0, jit),
            a:(1 - gone) * (1 - .3 * gust * Math.max(0, jit)), heart:mix('255,255,240', '255,150,90', shrink) }, mixPal(OT_EMBER, EMBER_CHAR, .3 * shrink));
          c.restore();
          // What survives: a coal at the wick.
          c.globalCompositeOperation = 'lighter';
          ovalGlow(c, MS_CX, base - 6, 20, 9, 0, '255,64,36', .55 * smooth(t, 1.25, 1.45) * (1 - gone) * (.8 + .2 * Math.sin(t * 13)));
        });
        otRival(c, S);
        otAssault(c, S, smooth(t, .3, .6) * (1 - smooth(t, 1.2, 1.45)), [MS_CX - 30, MS_CY - 4]);
        c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
        // The gust: streaks of the rival's light tearing past the flame.
        const col = OT_RGB[S.rivalTier] || '255,140,90';
        for (const w of st.wind) {
          const x = MS_CX - 90 + ((t * 2.2 + w.ph) % 1) * 200, y = MS_CY + w.y + 6 * Math.sin(t * 7 + w.ph * 9);
          trace(c, curve(6, k => [x - w.len * (1 - k), y + 4 * Math.sin(k * 3 + w.ph * 5) * (1 - k)]), false);
          c.lineWidth = 1.1; c.strokeStyle = rgba(col, .55 * gust); c.stroke();
        }
        // Its sparks, flung away from the rival, then drawn into it.
        const R = otPt(S.rp, 0, 0);
        for (const p of st.sparks) {
          const age = t - p.at, pull = in3(seg(t, 1.32 + p.d, 1.9 + p.d));
          if (age <= 0 || pull >= 1) continue;
          const O = [MS_CX + p.u * MS_S, MS_CY + p.v * MS_S];
          const at = a => [O[0] + Math.cos(p.a) * p.sp * a + 40 * a * a, O[1] + Math.sin(p.a) * p.sp * a + 50 * a * a];
          lightTrace(c, [otMix(at(Math.max(0, age - .05)), R, Math.max(0, pull - .04)), otMix(at(age), R, pull)], '255,84,50',
            smooth(age, 0, .05) * (1 - .45 * seg(age, .3, .8)) * (1 - seg(pull, .8, 1)), p.sz, '255,214,180');
        }
      } },
    victory: {
      ms:2150, swap:[.82, 1.2], roll:.96,
      init:r => ({ sparks:Array.from({ length:28 }, () => ({ a:(r() - .5) * .9, sp:300 + r() * 220, at:.8 + r() * .16, life:.4 + r() * .3, sz:.8 + r() * .8 })),
        flare:Array.from({ length:10 }, () => ({ a:-Math.PI / 2 + (r() - .5) * 2.2, v:90 + r() * 70, d:r() * .08 })) }),
      draw(c, t, S, st) {
        const ph = S.phase + t, base = MS_CY + 42;
        S.hit = bell(t, .9, 1.38);
        otRival(c, S);
        const smother = 1 - smooth(t, .42, .5), cat = seg(t, .42, .74), pop = cat > 0 ? outBack(cat) : 0;
        const surge = bell(t, .46, .95), flare = out3(seg(t, 1.14, 1.26)) * (1 - inOut(seg(t, 1.28, 1.8)));
        const s = lerp(.72 + .04 * Math.sin(t * 17), 1, pop) * (1 + .06 * surge);
        otAt(c, S.hp, () => paintFire(c, { s, t:ph, y:base - 42 * s, wob:.2 + .5 * surge + .4 * flare, stretch:.22 * surge + .45 * flare, curl:.9 * flare + .5 * surge,
          core:mix(OT_EMBER.core, '255,236,170', Math.max(surge, flare)), a:.62 + .38 * (1 - smother) },
          mixPal(mixPal(EMBER_CHAR, OT_EMBER, 1 - .7 * smother), FLARE_HOT, .5 * flare)));
        c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
        // It catches: a hot flash.
        const C = otPt(S.hp, 0, 1);
        glow(c, C[0], C[1], 46 * S.hp.s + 30 * bell(t, .42, .7), '255,110,70', .75 * bell(t, .4, .72));
        // A burst of sparks driven through the rival.
        const O = otPt(OT_CHASE, 1.8, -3), R = otPt(OT_LEAD, 0, -1), aim = Math.atan2(R[1] - O[1], R[0] - O[0]);
        for (const p of st.sparks) {
          const age = t - p.at;
          if (age <= 0 || age >= p.life) continue;
          const at = a => { const d = p.sp * (a - .6 * a * a); return [O[0] + Math.cos(aim + p.a) * d, O[1] + Math.sin(aim + p.a) * d + 30 * a * a]; };
          lightTrace(c, [at(Math.max(0, age - .045)), at(age)], '255,90,50', (1 - age / p.life) ** 1.3, p.sz, '255,226,190');
        }
        // In the middle: a sharp orange flare.
        const fx = seg(t, 1.14, 1.62), L = otPt(OT_LEAD, 0, -1);
        if (fx > 0 && fx < 1) {
          glow(c, L[0], L[1], 30 + 70 * out3(fx), '255,150,50', .65 * (1 - fx));
          otRing(c, L[0], L[1], 14 + 72 * out3(fx), 1.6 * (1 - fx) + .3, '255,210,140', .75 * (1 - fx));
        }
        for (const p of st.flare) {
          const ts = t - 1.16 - p.d;
          if (ts <= 0 || ts >= .5) continue;
          const pos = k => [L[0] + Math.cos(p.a) * p.v * k, L[1] - 18 + Math.sin(p.a) * p.v * k + 80 * k * k];
          lightTrace(c, [pos(Math.max(0, ts - .05)), pos(ts)], '255,150,50', 1 - ts / .5, 1.2, '255,226,160');
        }
      } } },

  // Flare. Defeat: it throws up a bright flash and a crown of tongues of
  // fire round itself; the rival's heat tears them off one by one, side
  // nearest first, and the flame contracts into Ember. Victory: it draws in
  // heat until its heart is white, fires one concentrated flash at the rival,
  // and bursts out in the middle in a controlled ring of curved sparks.
  orange: {
    defeat: {
      ms:2450, swap:[1.6, 2.1], roll:1.18,
      init:r => {
        const toward = Math.atan2(OT_CHASE.y - MS_CY, OT_CHASE.x - MS_CX);
        return {
          tongues:Array.from({ length:9 }, (_, k) => {
            const ang = -Math.PI - .25 + k / 8 * (Math.PI + .5) + (r() - .5) * .12;
            const d = Math.abs(Math.atan2(Math.sin(ang - toward), Math.cos(ang - toward))) / Math.PI;
            return { ang, at:.66 + .42 * d + .05 * r(), spin:(r() - .5) * 2.4, v:60 + r() * 50, s:(k === 4 ? .42 : .3) + r() * .08 };
          }),
          embers:Array.from({ length:24 }, (_, i) => ({ k:i % 9, f:r(), d:r() * .35 }))
        };
      },
      draw(c, t, S, st) {
        const ph = S.phase + t;
        const defend = bell(t, .28, .8), flash = bell(t, .38, .6), shake = smooth(t, .6, .72) * (1 - smooth(t, 1.05, 1.25));
        const squeeze = bell(t, 1.05, 1.5), ember = smooth(t, 1.08, 1.42), swap = smooth(t, 1.42, 1.56);
        S.feed = smooth(t, 1.4, 1.85) * (1 - smooth(t, 2.15, 2.6));
        // Underneath: Ember, the flame it contracts into.
        S.low(c, swap);
        if (swap < 1) otAt(c, S.hp, () => {
          const s = (1 + .08 * defend) * (1 - .17 * squeeze), j = Math.sin(t * 41) * Math.sin(t * 27 + .6);
          const pose = { s, t:ph, y:MS_CY + 42 - 42 * s, sx:1 - .06 * shake * Math.abs(j), wob:lerp(.25 + .8 * defend + .7 * shake, .2, ember), curl:1.4 * defend + .9 * shake * j,
            stretch:.32 * defend + .1 * shake * Math.max(0, j), core:mix(mix('255,245,180', '255,253,230', defend), OT_EMBER.core, ember), a:1 - swap };
          // The outer flare, lit by its defence and torn off from the side the
          // rival hits, tongue by tongue; drawn first so the flame covers their roots.
          const on = smooth(t, .3, .48) * (1 + .4 * flash), P = flamePts(msShape().outer, pose);
          if (on > .004 && t < 1.7) for (const w of st.tongues) {
            const age = Math.max(0, t - w.at), k = age / .6;
            if (k >= 1) continue;
            const F = outward(flameFootpoint(P, w.ang, MS_CX, MS_CY), 2), d = w.v * out3(Math.min(1, age / .5));
            otTongue(c, F[0] + Math.cos(w.ang) * d + 30 * age, F[1] + Math.sin(w.ang) * d - 10 * age, w.ang + w.spin * age,
              w.s * on * (1 + .15 * Math.sin(t * 13 + w.ang * 5)) * (1 - .6 * k), ph * 1.3 + w.ang * 3, (1 - k) * Math.min(1, on));
          }
          paintFire(c, pose, mixPal(mixPal(SCENES.orange.pal, FLARE_HOT, .8 * defend), OT_EMBER, ember));
        });
        c.globalCompositeOperation = 'lighter';
        const fx = seg(t, .38, .7);
        if (fx > 0 && fx < 1) {
          glow(c, MS_CX, MS_CY - 8, 30 + 80 * out3(fx), '255,190,90', .6 * (1 - fx));
          otRing(c, MS_CX, MS_CY - 4, 16 + 74 * out3(fx), 1.5 * (1 - fx) + .3, '255,226,160', .7 * (1 - fx));
        }
        otRival(c, S);
        otAssault(c, S, smooth(t, .42, .68) * (1 - smooth(t, 1.12, 1.4)), [MS_CX - 34, MS_CY - 6]);
        // The torn flare, embers now, drawn into the rival.
        c.globalCompositeOperation = 'lighter';
        const R = otPt(S.rp, 0, 0);
        for (const e of st.embers) {
          const w = st.tongues[e.k], age = t - w.at - .1, pull = in3(seg(t, 1.3 + e.d, 1.85 + e.d));
          if (age <= 0 || pull >= 1) continue;
          const d = (60 + 50 * e.f) * out3(Math.min(1, age / .45)), q = otMix([MS_CX + Math.cos(w.ang) * d + 20 * age, MS_CY + Math.sin(w.ang) * d], R, pull);
          const a = smooth(age, 0, .1) * (1 - seg(pull, .8, 1));
          glow(c, q[0], q[1], 5, '255,140,50', .7 * a); glow(c, q[0], q[1], 1.6, '255,230,190', .9 * a);
        }
      } },
    victory: {
      ms:2250, swap:[.74, 1.08], roll:.8,
      init:r => ({ motes:Array.from({ length:16 }, () => ({ a:r() * MS_TAU, r:30 + r() * 26, d:r() * .25 })), sparks:SCENES.orange.init(r).sparks }),
      draw(c, t, S, st) {
        const ph = S.phase + t;
        S.hit = bell(t, .62, 1.12);
        otRival(c, S);
        const gather = smooth(t, .06, .58) * (1 - smooth(t, .6, .72)), surge = out3(seg(t, 1.02, 1.16)) * (1 - inOut(seg(t, 1.18, 1.75)));
        const after = smooth(t, 1.04, 1.12) * (1 - smooth(t, 1.3, 2.05));
        otAt(c, S.hp, () => {
          const s = (1 - .12 * gather) * (1 + .06 * surge);
          paintFire(c, { s, t:ph, y:MS_CY + 42 - 42 * s, wob:.25 + .15 * gather + .9 * surge, curl:1.6 * surge, stretch:.42 * surge,
            core:mix('255,245,180', '255,254,236', Math.max(gather, after)) }, mixPal(SCENES.orange.pal, FLARE_HOT, Math.max(gather, after)));
          // Heat drawn in from round it.
          c.globalCompositeOperation = 'lighter';
          for (const m of st.motes) {
            const k = seg(t, .06 + m.d, .5 + m.d);
            if (k <= 0 || k >= 1) continue;
            const r = m.r * (1 - in3(k)), a = m.a + k * 1.5;
            glow(c, MS_CX + Math.cos(a) * r, MS_CY + 6 + Math.sin(a) * r, 5, '255,170,70', .7 * Math.sin(Math.PI * k));
          }
          glow(c, MS_CX, MS_CY + 10, 18 + 10 * gather, '255,240,200', .8 * gather);
        });
        c.globalCompositeOperation = 'lighter';
        // The flash: one concentrated burst of heat straight at the rival.
        const fl = bell(t, .6, .78);
        if (fl) {
          const A = otPt(S.hp, .6, -3), B = otPt(S.rp, 0, -1), dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1, px = -dy / L, py = dx / L;
          const g = c.createLinearGradient(A[0], A[1], B[0], B[1]);
          g.addColorStop(0, rgba('255,252,230', .95 * fl)); g.addColorStop(1, rgba('255,150,50', .5 * fl));
          c.fillStyle = g; c.beginPath();
          c.moveTo(A[0] + px * 2, A[1] + py * 2); c.lineTo(B[0] + px * 16, B[1] + py * 16); c.lineTo(B[0] - px * 16, B[1] - py * 16); c.lineTo(A[0] - px * 2, A[1] - py * 2);
          c.closePath(); c.fill();
          glow(c, B[0], B[1], 50, '255,200,110', .7 * fl); glow(c, A[0], A[1], 20, '255,250,220', fl);
        }
        // In the middle the flare bursts out, under control.
        const f = seg(t, 1.02, 1.38);
        if (f > 0 && f < 1) {
          glow(c, MS_CX, MS_CY, 14 + out3(f) * 84, '255,170,60', .6 * (1 - f));
          otRing(c, MS_CX, MS_CY, 12 + out3(f) * 78, 1.6 * (1 - f) + .3, '255,220,150', .7 * (1 - f));
        }
        c.lineCap = 'round';
        for (const p of st.sparks) {
          const ts = t - 1.04 - p.d;
          if (ts <= 0 || ts >= p.life) continue;
          const at = k => { const a = p.a + p.bend * k; return [MS_CX + Math.cos(a) * p.v * k, MS_CY - 22 + Math.sin(a) * p.v * k + 70 * k * k]; };
          lightTrace(c, [at(Math.max(0, ts - .05)), at(ts)], '255,150,50', 1 - ts / p.life, 1.3, '255,215,140');
        }
      } } },

  // Solar. Defeat: its crossed orbits spin up on guard, are shoved out of
  // line and wobble, then snap one after the other and unravel; its corona
  // is thrown off as a shell, the gold drains out of it and Flare is left;
  // the broken loops stream into the rival. Victory: the loops fall into
  // step and race, building a field between them; light gathers where they
  // cross and is fired into the rival; in the middle they flare out wide and
  // settle round the flame.
  yellow: {
    defeat: {
      ms:3000, swap:[2.2, 2.72], roll:1.72,
      draw(c, t, S) {
        const ph = S.phase + t, rays = S.settled.rays, R = otPt(S.rp, 0, 0);
        const def = smooth(t, .2, .8), dis = smooth(t, .8, 1.5), drain = smooth(t, 1.72, 2.12), wild = dis * (1 - smooth(t, 1.5, 2));
        S.feed = smooth(t, 1.95, 2.45) * (1 - smooth(t, 2.6, 3));
        const spin = 2.2 * t + 4.2 * Math.max(0, t - .3) * def + 1.3 * wild * Math.sin(t * 6.3);
        const orbit = k => ({ t:ph, tilt:(k ? -.68 : .68) + (k ? -.24 : .36) * dis + .07 * wild * Math.sin(t * (8 + k * 3)), rx:64 * (1 + .06 * wild * Math.sin(t * 6 + k)), ry:19 * (1 + .35 * dis),
          x:MS_CX + 9 * dis, y:MS_CY - 2 + 4 * dis * (k ? 1 : -1), wob:.02 + .1 * wild, ph:k * 2, heat:1 + .8 * def,
          spin:spin * (k ? -1.07 : 1) + k * 2, brk:seg(t, k ? 1.5 : 1.76, k ? 2.05 : 2.3), at:Math.PI, pull:seg(t, 1.9 + .12 * k, 2.6 + .12 * k), to:R });
        const A = orbit(0), B = orbit(1);
        c.globalCompositeOperation = 'lighter';
        otOrbit(c, A, true); otOrbit(c, B, true);
        S.low(c, drain);
        if (drain < 1) otAt(c, S.hp, () => {
          c.globalCompositeOperation = 'source-over';
          const P = paintFire(c, { s:1 + .03 * def * Math.sin(t * 13), t:ph, wob:.12 + .25 * wild, curl:.4 * wild, a:1 - drain }, SCENES.yellow.pal);
          c.globalCompositeOperation = 'lighter'; solarShimmer(c, P, ph, (1 + 1.2 * def) * (1 - drain));
        });
        c.globalCompositeOperation = 'lighter';
        solarCorona(c, ph, 66 + 3 * Math.sin(t * 5), .4 * def * (1 - smooth(t, 1.58, 1.7)), rays);
        const shell = seg(t, 1.6, 2.3);
        solarCorona(c, ph, 66 + 110 * out3(shell), smooth(t, 1.58, 1.64) * (1 - shell) ** 1.5, rays);
        otOrbit(c, A, false); otOrbit(c, B, false);
        // A flash where each loop snaps.
        for (const [o, at] of [[B, 1.5], [A, 1.76]]) {
          const b = bell(t, at - .02, at + .32);
          if (!b) continue;
          const cs = Math.cos(o.tilt), sn = Math.sin(o.tilt), x = o.x - o.rx * cs, y = o.y - o.rx * sn;
          glow(c, x, y, 26, '255,236,160', .9 * b); glow(c, x, y, 6, '255,255,255', b);
        }
        otRival(c, S);
        otAssault(c, S, smooth(t, .48, .82) * (1 - smooth(t, 1.88, 2.15)), [MS_CX - 48, MS_CY - 6]);
      } },
    victory: {
      ms:2900, swap:[1.06, 1.46], roll:1.16,
      init:r => ({ off:[r() - .5, r() - .5].map(v => v * .9), ph:[r() * MS_TAU, r() * MS_TAU] }),
      draw(c, t, S, st) {
        const ph = S.phase + t, rays = S.settled.rays;
        S.hit = bell(t, 1.04, 1.5);
        otRival(c, S);
        const sync = inOut(seg(t, .08, .88)), field = smooth(t, .3, .9) * (1 - smooth(t, 1, 1.25)), grow = 1 + .4 * bell(t, 1.42, 2.15);
        const spin = 2.2 * t + 5.5 * smooth(t, .15, 1.05) + 1.6 * smooth(t, 1.05, 1.9);
        const orbit = k => ({ t:ph, tilt:(k ? -.68 : .68) + st.off[k] * (1 - sync), rx:64 * grow, ry:19 * grow, wob:.03 * (1 - sync),
          heat:1 + 1.2 * field + .6 * bell(t, .85, 1.1), spin:spin * (k ? -1 : 1) + lerp(st.ph[k], k * Math.PI, sync), a:.55 + .45 * smooth(t, 0, .4) });
        const A = orbit(0), B = orbit(1);
        otAt(c, S.hp, () => {
          c.globalCompositeOperation = 'lighter';
          // The field the synchronised loops build between them.
          ovalGlow(c, MS_CX, MS_CY - 2, 70 * grow, 34 * grow, 0, '255,214,90', .3 * field);
          otOrbit(c, A, true); otOrbit(c, B, true);
          c.globalCompositeOperation = 'source-over';
          const P = paintFire(c, { s:1 + .04 * field * Math.sin(t * 15), t:ph, wob:.12 }, mixPal(SCENES.yellow.pal, SOLAR_WHITE, .6 * field + .5 * bell(t, 1.4, 1.9)));
          c.globalCompositeOperation = 'lighter';
          solarShimmer(c, P, ph, 1 + field);
          climb(c, P, seg(t, 1.55, 2), '255,255,215', .7);
          otOrbit(c, A, false); otOrbit(c, B, false);
          // Light gathers where the loops cross, then into the heart.
          const cross = bell(t, .82, 1.06), k = seg(t, .9, 1.04);
          for (const [x, y] of [[28.4, 0], [-28.4, 0], [0, 23.8], [0, -23.8]]) glow(c, MS_CX + x * (1 - k), MS_CY - 2 + y * (1 - k), 10, '255,250,215', cross);
          glow(c, MS_CX, MS_CY - 2, 28, '255,250,220', bell(t, .95, 1.12));
        });
        c.globalCompositeOperation = 'lighter';
        // The impact: what gathered is fired into the rival.
        const shot = seg(t, .98, 1.12), A0 = otPt(S.hp, 0, -.3), B0 = otPt(S.rp, 0, 0);
        if (shot > 0 && shot < 1) for (let j = 0; j < 6; j++) {
          const q = otMix(A0, B0, in3(Math.max(0, shot - j * .05)));
          glow(c, q[0], q[1], 14 - j * 1.6, '255,236,150', (1 - j / 6) * .9); glow(c, q[0], q[1], 4, '255,255,255', j ? 0 : 1);
        }
        const im = seg(t, 1.1, 1.55);
        if (im > 0 && im < 1) {
          glow(c, B0[0], B0[1], 30 + 60 * out3(im), '255,226,110', .8 * (1 - im));
          otRing(c, B0[0], B0[1], 10 + 70 * out3(im), 2 * (1 - im) + .3, '255,244,190', .8 * (1 - im));
        }
        // In the middle the loops flare out to full size, a corona bursting round them.
        const cr = seg(t, 1.42, 2.1);
        solarCorona(c, ph, 40 + 60 * out3(cr), smooth(t, 1.42, 1.5) * (1 - cr), rays);
      } } },

  // Plasma. Defeat: its containment field lights up on guard; the charge
  // surges up and down the globe, the field lines twist out of line and
  // arcs crawl its rim; containment fails and the plasma discharges in two
  // vertical columns, leaving Solar, and the last arcs leap to the rival.
  // Victory: the heart compresses and charges as the field spins up; a
  // leader climbs from its tip, lightning comes straight down on the rival;
  // in the middle the globe expands to full charge and the field locks with
  // a pulse.
  blue: {
    defeat: {
      ms:3200, swap:[2.35, 2.88], roll:1.92,
      draw(c, t, S) {
        const ph = S.phase + t, set = S.settled, R = otPt(S.rp, 0, 0), brk = 1.72;
        const react = smooth(t, .3, .8), surge = smooth(t, .85, 1.65), gone = smooth(t, 1.78, 2.15), dc = bell(t, brk, brk + .42);
        S.feed = smooth(t, 2, 2.4) * (1 - smooth(t, 2.6, 3.1));
        S.low(c, smooth(t, 1.85, 2.2));
        if (gone < 1) {
          const L = layer(c, 'ot-plasma'), P = otPlasma(L, ph, set, { surge });
          c.save(); c.globalAlpha = 1 - gone;
          const b = (1 + .9 * bell(t, brk - .04, brk + .25)) * (chance(t, 11)() < .3 * surge * (1 - gone) ? .6 : 1);
          if (b !== 1) c.filter = 'brightness(' + b.toFixed(3) + ')';
          blit(c, L); c.restore();
          c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.lineJoin = 'round';
          // A column of charge climbing the axis.
          ovalGlow(c, MS_CX, MS_CY - 6, 18 + 8 * surge, 60, 0, '150,215,255', .35 * surge * (1 - gone));
          // Arcs crawl the rim, more as it destabilises.
          for (let k = 0; k < 4; k++) {
            const rand = chance(t, k * 23 + 7);
            if (rand() > .7 * (react + surge) * (1 - gone)) continue;
            const i = Math.floor(rand() * P.length), A = outward(P[i], 1), B = outward(P[(i + 6 + Math.floor(rand() * 14)) % P.length], 1);
            drawBolt(c, bolt(A, B, rand, .5, 3, -(6 + 10 * rand())), .5 + .5 * rand(), 1.2 * surge);
          }
        }
        c.globalCompositeOperation = 'lighter';
        // The field: lit on guard, twisted out of line, snapping as it fails.
        otField(c, ph, { a:(.35 + .65 * react) * (1 + 1.2 * bell(t, brk - .05, brk + .1)) * (1 - smooth(t, brk + .02, brk + .28)),
          spin:.4 * t + 1.1 * surge * Math.sin(t * 3), bend:1.3 * surge, flow:1 + 4 * surge });
        // The discharge: two columns of lightning, straight up and straight down.
        if (dc) {
          const tip = otPt(OT_LEAD, .5, -8.6), foot = otPt(OT_LEAD, 0, 6.3), lit = dc * (Math.sin(t * 80) > -.3 ? 1 : .4);
          for (const [A, B, w, seed] of [[tip, [tip[0] - 6, -8], 2.4, 5], [foot, [foot[0] + 8, MS_H - 40], 1.9, 9]]) {
            const rand = chance(t, seed), pts = bolt(A, [B[0] + (rand() - .5) * 26, B[1]], rand, .28, 5);
            drawBolt(c, pts, lit, 2.6 * dc, '245,252,255', '69,150,255', w);
            for (let b = 0; b < 3; b++) { const s0 = pts[6 + b * 7]; if (s0) drawBolt(c, bolt(s0, [s0[0] + (b % 2 ? 1 : -1) * (16 + rand() * 22), s0[1] + (A === tip ? -1 : 1) * (8 + rand() * 18)], rand, .45, 3), lit * .55); }
          }
          glow(c, MS_CX, MS_CY, 130, '110,185,255', .45 * dc); glow(c, MS_CX, MS_CY, 26, '235,250,255', .8 * dc);
          const br = seg(t, brk, brk + .4);
          otRing(c, MS_CX, MS_CY + 3, 14 + out3(br) * 130, 2 * (1 - br) + .4, '210,245,255', 1 - br);
        }
        // What is left of the charge leaps to the rival.
        for (let k = 0; k < 3; k++) {
          const rand = chance(t, k * 37 + 3), on = smooth(t, 1.95, 2.1) * (1 - smooth(t, 2.35, 2.6));
          if (rand() > .8 * on) continue;
          drawBolt(c, bolt(otPt(S.hp, -3 + rand() * 2, -3 + rand() * 5), R, rand, .4, 4, -20 - 20 * rand()), on * (.5 + .5 * rand()), 1);
        }
        otRival(c, S);
        otAssault(c, S, smooth(t, .45, .8) * (1 - smooth(t, 1.65, 1.85)), [MS_CX - 36, MS_CY]);
      } },
    victory: {
      ms:3000, swap:[1.26, 1.66], roll:1.04,
      init:r => ({ seed:1 + Math.floor(r() * 1e6), up:1 + Math.floor(r() * 1e6) }),
      draw(c, t, S, st) {
        const ph = S.phase + t, set = S.settled;
        S.hit = bell(t, .98, 1.55);
        otRival(c, S);
        const charge = smooth(t, .1, .8) * (1 - smooth(t, .95, 1.15)), full = bell(t, 1.64, 2.2), lock = seg(t, 2.02, 2.3);
        const spin = .4 * t + 6 * smooth(t, .1, 1.1) + 3 * smooth(t, 1.1, 2.05);
        otAt(c, S.hp, () => {
          c.save(); c.translate(MS_CX, MS_CY); c.scale(1 + .12 * full, 1 + .12 * full); c.translate(-MS_CX, -MS_CY);
          otPlasma(c, ph, set, { squeeze:charge, surge:.5 * full });
          c.restore();
          c.globalCompositeOperation = 'lighter';
          glow(c, MS_CX, MS_CY + 14, 30 + 20 * charge, '120,200,255', .6 * charge);
          otField(c, ph, { a:.35 + .55 * charge + .6 * bell(t, 2.0, 2.4), spin, bend:.4 * charge * (1 - lock), flow:1 + 5 * charge });
          // Locking in: one electric pulse round it.
          if (lock > 0 && lock < 1) otRing(c, MS_CX, MS_CY - 6, 30 + 90 * out3(lock), 1.6 * (1 - lock) + .3, '200,240,255', .9 * (1 - lock));
        });
        c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.lineJoin = 'round';
        // A leader climbs off its tip to a charge gathering over the rival...
        const sky = [MS_CX + 8, 22], tip = otPt(S.hp, .5, -8.6), up = seg(t, .72, .9), cloud = smooth(t, .76, .98) * (1 - smooth(t, 1.05, 1.4));
        glow(c, sky[0], sky[1], 20 + 24 * cloud, '69,140,255', .5 * cloud); glow(c, sky[0], sky[1], 5, '230,245,255', cloud * (.7 + .3 * Math.sin(t * 60)));
        if (up > 0 && t < 1.02) { const pts = bolt(tip, sky, seeded(st.up + Math.floor(t / .045)), .32, 5); drawBolt(c, pts.slice(0, Math.max(2, Math.ceil(up * pts.length))), .8); }
        // ...and the strike comes straight down on it.
        const ld = seg(t, .94, 1.02), ret = bell(t, 1, 1.34), top = otPt(S.rp, .4, -8.6);
        if (ld > 0 && t < 1.34) {
          const rand = seeded(st.seed), pts = bolt(sky, top, rand, .3, 5), split = 2.4 * ret;
          const lit = t < 1.02 ? .8 : ret * (Math.sin(t * 90) > -.4 ? 1 : .35);
          drawBolt(c, pts.slice(0, Math.max(2, Math.ceil(ld * pts.length))), lit, split, '245,252,255', '69,150,255', t < 1.02 ? 1 : 2.4);
          for (let b = 0; b < 3; b++) { const s0 = pts[6 + b * 6]; if (s0) drawBolt(c, bolt(s0, [s0[0] + (b % 2 ? 1 : -1) * (14 + rand() * 20), s0[1] + 10 + rand() * 18], rand, .45, 3), lit * .55, split); }
          glow(c, top[0], top[1], 50, '160,215,255', .85 * ret); glow(c, top[0], top[1], 9, '255,255,255', ret);
        }
        // In the middle: a burst as it reaches full charge, the outline splitting into colour.
        const b = seg(t, 1.62, 2);
        if (b > 0 && b < 1) {
          glow(c, MS_CX, MS_CY + 3, 30 + out3(b) * 110, '69,168,255', .42 * (1 - b));
          otRing(c, MS_CX, MS_CY + 3, 14 + out3(b) * 124, 1.8 * (1 - b) + .4, '210,245,255', 1 - b);
          const P = flamePts(msShape().outer, { t:ph, wob:.06 }), split = 3 * (1 - b);
          for (const [dx, col] of [[-split, '255,60,210'], [split, '40,255,240']]) { c.save(); c.translate(dx, 0); trace(c, P); c.lineWidth = 1.2; c.strokeStyle = rgba(col, .45 * (1 - b)); c.stroke(); c.restore(); }
        }
        if (t > 1.9) plasmaRim(c, flamePts(msShape().outer, { t:ph, wob:.06 }), t, [2.04, 2.1, 2.2, 2.33].map((at, k) => ({ at, i:k * 37 + 11, span:9 + k * 2, out:7 + k * 2, seed:st.seed + k })));
      } } },

  // Nebula. Defeat: its stars answer the rival's pull, twinkling hard; the
  // cloud is stretched towards it and thins, stars and dust are drawn off in
  // curving streams, the wisps go after them, and Plasma is left in the
  // middle of what remains. Victory: scattered dust and stars spiral in and
  // condense, the forming cloud sends out a luminous wave that sweeps the
  // rival aside, and the nebula expands into the middle, its stars flaring.
  purple: {
    defeat: {
      ms:3400, swap:[2.5, 3.02], roll:1.95,
      draw(c, t, S) {
        const ph = S.phase + t, set = S.settled, R = otPt(S.rp, 0, 0);
        const ux0 = R[0] - MS_CX, uy0 = R[1] - MS_CY, dl = Math.hypot(ux0, uy0) || 1, ux = ux0 / dl, uy = uy0 / dl;
        const sense = smooth(t, .2, .8), tide = smooth(t, .7, 1.6), steal = seg(t, 1.15, 2.5), thin = smooth(t, 1.5, 2.3);
        S.feed = smooth(t, 1.6, 2.3) * (1 - smooth(t, 2.7, 3.2));
        // Tidal: points on the side facing the rival are pulled hardest.
        const tidal = ([x, y], k = 1) => { const side = ((x - MS_CX) * ux + (y - MS_CY) * uy) / 60, d = tide * k * (8 + 16 * (side + 1)); return [x + ux * d, y + uy * d]; };
        S.low(c, smooth(t, 1.75, 2.35));
        c.globalCompositeOperation = 'lighter';
        glow(c, MS_CX, MS_CY + 3, 50 + 20 * tide, '190,140,255', .275 * (1 - thin));
        for (const [i, w] of set.wisps.entries()) {
          const a = w.a0 + w.sp * ph * 1.3 + 3.4, go = seg(steal, .15 + i * .05, .55 + i * .05);
          nebulaWisp(c, w, w.rest * (1 + .15 * tide), a, .55 * (1 - go) * (1 + .4 * sense), 1 + .6 * go);
          if (go <= 0 || go >= 1) continue;
          // The wisp's light streams off towards the rival.
          const H = tidal([MS_CX + Math.cos(a) * w.rest, MS_CY + Math.sin(a) * w.rest * .62]), pts = curve(18, k => otBez(H, R, 30 * Math.sin(i * 1.7), lerp(go * .6, go, k)));
          trace(c, pts, false); c.lineCap = 'round';
          c.lineWidth = w.wid * .9; c.strokeStyle = rgba(w.col, .1 * Math.sin(Math.PI * go)); c.stroke();
          c.lineWidth = w.wid * .3; c.strokeStyle = rgba(w.col, .22 * Math.sin(Math.PI * go)); c.stroke();
        }
        if (thin < 1) {
          // The body, stretched towards the rival and losing density.
          const L = layer(c, 'ot-neb');
          nebulaBody(L, flamePts(msShape().outer, { t:ph, wob:.05 + .3 * tide }), ph, set.blobs, 1);
          c.save(); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1 - thin;
          if (tide > .01) c.filter = 'blur(' + (5 * tide).toFixed(2) + 'px)';
          const ang = Math.atan2(uy, ux);
          c.translate(MS_CX + ux * 8 * tide, MS_CY + uy * 8 * tide); c.rotate(ang); c.scale(1 + .3 * tide, 1 - .08 * tide); c.rotate(-ang); c.translate(-MS_CX, -MS_CY);
          blit(c, L); c.restore();
          c.globalCompositeOperation = 'lighter';
        }
        for (const p of set.dust) {
          const f = in3(seg(steal, p.d * 1.6, p.d * 1.6 + .5));
          if (f >= 1) continue;
          const q = otBez(tidal(nebulaMote(p, ph), .6 + p.sz * .4), R, 24 * Math.sin(p.a0 * 3), f);
          nebulaDust(c, p, ph, q[0], q[1], (1 - seg(f, .8, 1)) * (1 - .5 * thin * (1 - f)));
        }
        c.lineCap = 'round';
        for (const [i, s] of set.stars.entries()) {
          const base = tidal([MS_CX + s.x, MS_CY + s.y], 1.3), f = i % 2 ? in3(seg(t, 1.2 + i * .07, 1.9 + i * .07)) : 0;
          if (f >= 1) continue;
          const q = otBez(base, R, -30, f), light = otStarLight(s, ph, i, sense) * (1 - seg(f, .8, 1)) * (i % 2 ? 1 : 1 - thin);
          if (f > .02) lightTrace(c, [otBez(base, R, -30, Math.max(0, f - .08)), q], '220,190,255', .6 * light, .8, '255,255,255');
          star(c, q[0], q[1], s.r * (1 + .6 * sense) * light, .9 * light);
        }
        otRival(c, S);
        otAssault(c, S, smooth(t, .4, .8) * (1 - smooth(t, 2, 2.4)), tidal([MS_CX - 40, MS_CY - 4]), -30);
      } },
    victory: {
      ms:3200, swap:[1.36, 1.8], roll:1.42,
      init:r => ({ ride:Array.from({ length:16 }, (_, i) => ({ a:-1.05 + i / 15 * 2.1 + .1 * Math.sin(i * 3), r:2 + r() * 2.5 })),
        motes:Array.from({ length:16 }, () => ({ u:(r() - .5) * 8, v:-6 + r() * 10, d:r() * .3, vy:(r() - .5) * 40 })),
        flare:Array.from({ length:5 }, (_, i) => ({ i, at:1.95 + i * .13 })) }),
      draw(c, t, S, st) {
        const set = S.settled;
        S.hit = bell(t, 1.1, 1.6);
        otRival(c, S);
        // The reveal's own convergence, from its scattered moment, quickened.
        const ti = .95 + 1.2 * Math.min(t, 1.25) + Math.max(0, t - 1.25);
        otAt(c, S.hp, () => SCENES.purple.draw(c, MS_LEAD + ti, set));
        c.globalCompositeOperation = 'lighter';
        // The luminous wave from the forming star field.
        const wv = seg(t, 1, 1.75), O = otPt(S.hp, 0, 0);
        if (wv > 0 && wv < 1) {
          const r = 10 + 300 * out3(wv), a = (1 - wv) ** 1.2;
          const g = c.createRadialGradient(O[0], O[1], Math.max(0, r - 36), O[0], O[1], r + 10);
          g.addColorStop(0, rgba('140,90,255', 0)); g.addColorStop(.7, rgba('190,140,255', .32 * a)); g.addColorStop(.92, rgba('235,215,255', .5 * a)); g.addColorStop(1, rgba('190,140,255', 0));
          c.fillStyle = g; c.beginPath(); c.arc(O[0], O[1], r + 10, 0, MS_TAU); c.fill();
          for (const p of st.ride) star(c, O[0] + Math.cos(p.a) * r, O[1] + Math.sin(p.a) * r * .8, p.r, .85 * a);
        }
        // The rival's light swept off in the wave.
        const R0 = otPt(OT_LEAD, 0, 0), col = OT_RGB[S.rivalTier] || '200,200,220';
        for (const m of st.motes) {
          const k = seg(t, 1.1 + m.d, 1.75 + m.d);
          if (k <= 0 || k >= 1) continue;
          const x = R0[0] + m.u * MS_S + 150 * out3(k), y = R0[1] + m.v * MS_S + m.vy * k;
          glow(c, x, y, 5, col, .6 * (1 - k)); glow(c, x, y, 1.5, '255,255,255', .8 * (1 - k));
        }
        // Settled in the middle, its stars flare one after another.
        for (const f of st.flare) {
          const s = set.stars[f.i], b = bell(t, f.at, f.at + .5);
          if (b) star(c, MS_CX + s.x, MS_CY + s.y, s.r * 2.4, b);
        }
        glow(c, MS_CX, MS_CY + 3, 70, '200,150,255', .35 * bell(t, 1.78, 2.4));
      } } },

  // Aurora. Defeat: its ribbons race round it on guard; a disturbance rolls
  // through the curtains from the rival's side, the bands part, try to close
  // and part again, then are dragged off towards the rival in broad streams
  // with the veil, and the window clears to Nebula. Victory: the ribbons
  // unfurl wide, sweep across the rival with a great curtain of light, then
  // converge round the flame in the middle in a surge, the veil standing
  // tall behind it.
  aurora: {
    defeat: {
      ms:3600, swap:[2.7, 3.22], roll:2.05,
      draw(c, t, S) {
        const ph = S.phase + t, set = S.settled, R = otPt(S.rp, 0, 0), toward = R[0] - MS_CX;
        const guard = smooth(t, .15, .7), dist = bell(t, .75, 1.8);
        const sep = .5 * smooth(t, .85, 1.3) - .3 * bell(t, 1.3, 1.75) + .8 * smooth(t, 1.62, 2.2);
        const drag = smooth(t, 1.65, 2.6), clear = smooth(t, 1.8, 2.4), fade = 1 - smooth(t, 2.2, 2.75);
        const fast = ph + .8 * Math.max(0, t - .15) * guard;
        S.feed = smooth(t, 2, 2.6) * (1 - smooth(t, 2.9, 3.4));
        S.low(c, smooth(t, 1.85, 2.45));
        const L = layer(c, 'ot-aur');
        otAurora(L, ph, set, { fast, veilH:87 + 30 * guard - 40 * drag, veilI:(1.1 + .4 * guard) * (1 - clear), veil:{ span:46 + 60 * drag, lift:20 * drag, drift:toward * .6 * drag },
          open:[sep, Math.max(0, sep - .1)], lift:[26 * drag, 12 * drag], drift:[toward * 1.1 * drag, toward * .8 * drag], ribA:[(1 + .5 * sep) * fade, (1 + .4 * sep) * fade], body:1 - clear });
        if (dist > .01) {
          // The disturbance: a ripple rolling through the curtains from the rival's side.
          const k = L.getTransform().a, front = lerp(40, 330, seg(t, .75, 1.8));
          for (let x = 0; x < MS_W; x += 4) {
            const b = Math.exp(-(((x + 2 - front) / 30) ** 2)) * dist;
            c.drawImage(L.canvas, x * k, 0, 4 * k, MS_H * k, x, -16 * b * Math.sin((x - front) * .06 + 1.2), 4, MS_H);
          }
          c.save(); c.globalCompositeOperation = 'lighter';
          ovalGlow(c, front, MS_CY - 30, 24, 86, 0, '170,255,235', .3 * dist);
          c.restore();
        } else blit(c, L);
        // The light it loses, streaming into the rival.
        c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
        const flow = bell(t, 1.75, 2.85);
        if (flow) for (let i = 0; i < 3; i++) {
          const A = [MS_CX + (i - 1) * 40, MS_CY - 40 + 22 * i], pts = curve(24, k => otBez(A, R, 40 - 30 * i, k)), h = 150 + 25 * i + 20 * Math.sin(t * 2 + i);
          for (const [w, al] of [[22, .05], [9, .12], [3, .3]]) { trace(c, pts, false); c.lineWidth = w; c.strokeStyle = hsla(h, 95, 65, al * flow); c.stroke(); }
        }
        otRival(c, S);
        otAssault(c, S, smooth(t, .45, .85) * (1 - smooth(t, 2.1, 2.5)), [MS_CX - 40, MS_CY - 10], -30);
      } },
    victory: {
      ms:3400, swap:[1.42, 1.86], roll:1.5,
      draw(c, t, S) {
        const ph = S.phase + t, set = S.settled;
        S.hit = bell(t, 1.02, 1.6);
        otRival(c, S);
        const spread = smooth(t, .1, .7), sweep = inOut(seg(t, .55, 1.4)), conv = smooth(t, 1.78, 2.15), surge = bell(t, 1.85, 2.6), stay = smooth(t, 2.1, 2.8);
        // Its own aurora: the window and veil at its slot; the small ribbons give way to the big ones.
        otAt(c, S.hp, () => otAurora(c, ph, set, { veilH:87 + 75 * surge + 20 * stay, veilI:1.1 + .7 * surge + .2 * stay, ribA:[1 - spread, 1 - spread], ribbons:spread < 1 }));
        c.globalCompositeOperation = 'lighter';
        // The ribbons, unfurled wide: swept across the rival, then folded round the flame.
        const drift = lerp(S.hp.x - MS_CX, 80, sweep) * (1 - conv);
        for (let i = 0; i < 4; i++) {
          const aura = i < 2, a = spread * (aura ? 1 : .85 * (1 - conv)) * (1 + .4 * bell(t, .5, 1.5));
          if (a <= .01) continue;
          auroraRibbon(c, set.rib[i], i, ph + i * .3, 1, aura ? 1 : 0, { open:lerp(.75 + .25 * spread, 0, conv), lift:(18 + 8 * i) * (1 - conv), drift:drift * (1 - .15 * i) + (i - 1.5) * 12 * (1 - conv), alpha:a });
        }
        // The luminous wave: a great curtain rolling across with the sweep.
        const cw = bell(t, .6, 1.5);
        if (cw) {
          const x0 = lerp(-80, 250, inOut(seg(t, .6, 1.5)));
          curtain(c, Math.max(0, x0), Math.min(MS_W, x0 + 160), x => 220 + 8 * Math.sin(x * .05 + t * 3),
            x => 160 * cw * Math.sin(Math.PI * seg(x, x0, x0 + 160)) * (.7 + .3 * Math.sin(x * .05 + t * 2)),
            x => cw * Math.sin(Math.PI * seg(x, x0, x0 + 160)) * (.6 + .4 * Math.sin(x * .07 - t * 3)), 140);
        }
        glow(c, MS_CX, MS_CY - 6, 160, '150,255,225', .5 * bell(t, 1.85, 2.35));
      } } },

  // Quasar. Defeat: it meets the rival with a surge of light and jets; its
  // disk spins up and it turns a jet on the rival, but the rival's attack
  // meets the jet and drives the clash back to its core while matter
  // escapes; at the core it detonates, the disk is blown off, the glare
  // clears to Aurora, and the rival captures what was flung out. Victory: its
  // core builds immense energy, a jet erupts into the rival with a cosmic
  // shockwave, it expands overexposed into the middle and settles with twin
  // jets and orbiting matter.
  quasar: {
    defeat: {
      ms:4000, swap:[3.05, 3.58], roll:2.42,
      init:r => ({ flung:Array.from({ length:90 }, (_, i) => ({ a:r() * MS_TAU, v:90 + r() * 120, d:r() * .3, sz:.6 + r() * 1.1, bend:(r() - .5) * 120, col:['225,232,255', '165,140,255', '140,170,255'][i % 3] })) }),
      draw(c, t, S, st) {
        const set = S.settled, boom = 2.36, R = otPt(S.rp, 0, 0), O = [MS_CX, MS_CY + 5];
        const ph = S.phase + t + 1.1 * Math.max(0, Math.min(t, 2.45) - .7) ** 2;
        const surge = bell(t, .3, .95), spinUp = smooth(t, .7, 1.9), unstable = smooth(t, 1.35, 2.25), gone = smooth(t, boom, boom + .3);
        const cut = chance(t, 3)() < .4 * unstable * (1 - gone) ? 1 : 0;
        const jetOn = smooth(t, .95, 1.15) * (1 - smooth(t, boom - .05, boom + .05)), X = otMix(R, O, lerp(.25, 1, inOut(seg(t, 1.2, boom))));
        S.feed = smooth(t, 2.5, 3) * (1 - smooth(t, 3.2, 3.7));
        S.low(c, smooth(t, boom + .05, boom + .55));
        const left = 1 - smooth(t, boom + .2, boom + .7);
        if (left > .004) {
          c.save();
          const b = (1 - .4 * cut) * (1 + 2 * bell(t, boom - .1, boom + .25));
          if (b !== 1) c.filter = 'brightness(' + b.toFixed(3) + ')';
          otQuasar(c, ph, set, { wind:.8 * spinUp, escape:.35 * unstable + .65 * smooth(t, boom, boom + .4), ex:.55 * surge + .5 * bell(t, boom - .2, boom + .2),
            wob:.25 * unstable, diskA:(1 + .6 * spinUp) * left, bodyA:1 - gone, glowA:(1 + 1.5 * surge) * (1 - gone) });
          c.restore();
        }
        c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
        // The surge: twin jets thrown out along its axis at the rival's approach.
        quasarJets(c, ph, 200 * surge, 6 * surge, { a:surge });
        otRival(c, S);
        // Its jet turned on the rival; the rival's attack meets it and drives it back.
        otAssault(c, S, smooth(t, .6, 1) * (1 - smooth(t, boom - .05, boom + .1)), jetOn > .01 ? X : [MS_CX - 40, MS_CY], -10);
        c.globalCompositeOperation = 'lighter';
        if (jetOn > .01) {
          otJet(c, O, X, 5.5 * jetOn * (1 - .3 * cut), ph, jetOn);
          glow(c, X[0], X[1], 18 + 8 * Math.sin(t * 31), '235,240,255', .9 * jetOn); glow(c, X[0], X[1], 5, '255,255,255', jetOn);
          const ax = Math.atan2(R[1] - O[1], R[0] - O[0]) + Math.PI / 2;
          for (let k = 0; k < 6; k++) {
            const rand = chance(t, k * 19 + 2), a = ax + (rand() < .5 ? 0 : Math.PI) + (rand() - .5) * .9, d = 8 + 26 * rand();
            lightTrace(c, [X, [X[0] + Math.cos(a) * d, X[1] + Math.sin(a) * d]], '205,212,255', .7 * jetOn * rand(), .8, '255,255,255');
          }
        }
        // The disruption: a blinding flash and a shockwave, its disk thrown off.
        const fl = bell(t, boom - .06, boom + .5);
        glow(c, O[0], O[1], 60 + 140 * seg(t, boom, boom + .5), '235,240,255', .85 * fl);
        const sw = seg(t, boom, boom + .75);
        if (sw > 0 && sw < 1) {
          otRing(c, O[0], O[1], 18 + 175 * out3(sw), 3.2 * (1 - sw) + .4, '235,240,255', .9 * (1 - sw) ** 2);
          otRing(c, O[0], O[1], (18 + 175 * out3(sw)) * .88, 9 * (1 - sw), '160,170,255', .18 * (1 - sw) ** 2);
        }
        // The energy it held, flung out, then captured by the rival.
        for (const p of st.flung) {
          const age = t - boom - p.d * .2, cap = in3(seg(t, boom + .25 + p.d, boom + .95 + p.d));
          if (age <= 0 || cap >= 1) continue;
          const out = k => { const e = 1 - Math.exp(-3 * Math.max(0, k)); return [O[0] + Math.cos(p.a) * p.v * e, O[1] + Math.sin(p.a) * p.v * .7 * e]; };
          lightTrace(c, [otBez(out(age - .04), R, p.bend, Math.max(0, cap - .05)), otBez(out(age), R, p.bend, cap)], p.col, (1 - seg(cap, .8, 1)) * smooth(age, 0, .05), p.sz, '255,255,255');
        }
      } },
    victory: {
      ms:3800, swap:[1.22, 1.76], roll:1.14,
      draw(c, t, S) {
        const set = S.settled, build = smooth(t, .05, .95), hold = 1 - .6 * bell(t, .88, 1.04);
        const ph = S.phase + t + .9 * Math.min(t, 1.2) ** 2;
        S.hit = bell(t, 1.06, 1.6);
        otRival(c, S);
        const land = seg(t, 1.72, 2.5), ex = .95 * (1 - out3(seg(t, 1.86, 2.6))) * smooth(t, 1.7, 1.8), hp = { ...S.hp, s:S.hp.s * (1 + .08 * bell(t, 1.72, 2.3)) };
        otAt(c, hp, () => {
          c.globalCompositeOperation = 'lighter';
          // Space round it bends: a thin lensed ring.
          otRing(c, MS_CX, MS_CY + 5, 62 + 6 * Math.sin(t * 9), 1, '200,210,255', .5 * build * (1 - land));
          otQuasar(c, ph, set, { wind:.6 * build * (1 - land), ex:Math.max(ex, .35 * build * hold * (1 - smooth(t, 1, 1.1))), diskA:1 + build * (1 - land), glowA:(1 + 1.6 * build * (1 - land)) * hold });
        });
        c.globalCompositeOperation = 'lighter';
        // The jet, straight into the rival.
        const jet = smooth(t, .98, 1.06) * (1 - smooth(t, 1.4, 1.6)), C = otPt(S.hp, 0, .7), B = otPt(S.rp, 0, 0);
        if (jet > .01) {
          otJet(c, C, otMix(C, B, seg(t, .98, 1.08)), 7 * jet, ph, jet, 900);
          glow(c, B[0], B[1], 44, '235,240,255', .85 * jet * smooth(t, 1.05, 1.1));
        }
        // The shockwave from the impact.
        const I = otPt(OT_LEAD, 0, 0), sw = seg(t, 1.08, 1.75);
        if (sw > 0 && sw < 1) {
          otRing(c, I[0], I[1], 14 + 160 * out3(sw), 3 * (1 - sw) + .4, '225,232,255', .9 * (1 - sw) ** 2);
          otRing(c, I[0], I[1], (14 + 160 * out3(sw)) * .86, 8 * (1 - sw), '150,140,255', .2 * (1 - sw) ** 2);
          glow(c, I[0], I[1], 60 + 60 * sw, '225,232,255', .5 * (1 - sw));
        }
        // Landed: twin jets along its axis, long then narrowing; a pulse; matter orbiting.
        const on = out3(seg(t, 2, 2.2)), off = seg(t, 2.6, 3.3);
        if (t > 1.95) quasarJets(c, ph, 40 + 250 * on, 7 * on * (1 - off), { knots:1 - off });
        glow(c, MS_CX, MS_CY, 150, '225,232,255', .45 * bell(t, 1.78, 2.3));
        const pr = seg(t, 2.2, 2.65);
        if (pr > 0 && pr < 1) otRing(c, MS_CX, MS_CY + 5, 20 + out3(pr) * 175, 2.2 * (1 - pr) + .4, '225,232,255', .9 * (1 - pr));
      } } },

  // Singularity. Defeat: it stays eerily still as the rival comes; space
  // round it starts to twist, its disk speeds up in uneven surges and light
  // bends harder round it; the horizon wobbles and stretches towards the
  // rival until a tidal stream tears the disk and halo off and the horizon
  // itself is peeled away into the rival, starlight snapping back behind the
  // wave, and Quasar, the energy it was built round, is left burning. Victory:
  // space round it bends the rival's light and draws its matter in, the core
  // deepens; at the moment the lead changes the world inverts, the rival is
  // flung out of the middle, and the Singularity glides in, unhurried, a
  // final ripple of warped space behind it.
  singularity: {
    defeat: {
      ms:4800, swap:[3.8, 4.32], roll:3.15, enter:.95,
      init:r => ({ tidal:Array.from({ length:170 }, () => ({ r0:48 + r() * 54, a0:r() * MS_TAU, sp:.85 + r() * .3, sz:.5 + r() * 1.1, rel:r(), bend:30 + r() * 50 })),
        jerk:[1.05, 1.42, 1.7, 1.98].map(a => a + r() * .1) }),
      warp(S, t) {
        const g = smooth(t, 2.1, 3) * (1 - smooth(t, 3.15, 3.7)), release = seg(t, 3.15, 3.9), wave = release > 0 && release < 1 ? (1 - release) * seg(release, 0, .1) : 0;
        if (g < .002 && !wave) return null;
        const front = 195 * out3(release), edge = Math.exp(-SWIRL_R / 46), taper = r => Math.max(0, (Math.exp(-r / 46) - edge) / (1 - edge));
        return { x:MS_CX, y:HOLE_Y, twist:r => 3.2 * g * taper(r),
          pull:r => 1 - .12 * g * taper(r) + .07 * wave * Math.exp(-(((r - front) / 16) ** 2)) * seg(SWIRL_R - r, 0, 20) };
      },
      draw(c, t, S, st) {
        const set = S.settled, ph = S.phase + t, R = otPt(S.rp, 0, 0), dir = Math.atan2(R[1] - HOLE_Y, R[0] - MS_CX);
        const unease = smooth(t, .9, 2.3), crack = smooth(t, 2.45, 3), tear = seg(t, 2.3, 3.35);
        let wind = .7 * unease;
        for (const j of st.jerk) wind += .22 * smooth(t, j, j + .12);   // it speeds up in uneven surges
        S.feed = smooth(t, 2.6, 3.4) * (1 - smooth(t, 3.8, 4.3));
        // Quasar, the energy under its outer identity, shows as that identity is pulled off.
        S.low(c, smooth(t, 2.7, 3.4));
        const flick = crack && chance(t, 17)() < .5 * crack ? .25 : 1;
        otSingularity(c, ph, set, { vig:1 - smooth(t, 2.9, 3.6), lens:58 + 26 * unease, starA:1 - smooth(t, 3.6, 4.3), pull:.6 * unease, release:seg(t, 3.15, 3.9),
          wind, warp:.6 * unease + .5 * crack, tide:unease + tear, dir, wob:.1 * unease, diskA:1 - smooth(t, 2.35, 2.95),
          horizon:1 - smooth(t, 3.05, 3.5), born:(1 - .7 * crack) * flick, e:1 - crack, halo:1 - smooth(t, 2.3, 2.9), peel:seg(t, 2.75, 3.45), to:R });
        // The disk and halo torn off in a tidal stream, curling into the rival.
        c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
        const col = OT_RGB[S.rivalTier] || '255,255,255';
        for (const p of st.tidal) {
          const rel = 2.3 + p.rel * .75, f = in3(seg(t, rel, rel + .8)), show = smooth(t, rel - .45, rel - .1);
          if (show <= 0 || f >= 1) continue;
          const a = p.a0 + (ph * 1.9 + wind * 5.5) * p.sp * Math.sqrt(60 / p.r0);
          const q = otBez(singularityPoint(p.r0, a), R, p.bend, f), q0 = otBez(singularityPoint(p.r0, a - .15 - .3 * f), R, p.bend, Math.max(0, f - .06));
          trace(c, [q0, q], false); c.lineWidth = p.sz * (1 + f);
          c.strokeStyle = rgba(mix('235,240,255', col, seg(f, .5, 1)), .85 * show * (1 - seg(f, .85, 1))); c.stroke();
        }
        otRival(c, S);
        otAssault(c, S, smooth(t, .7, 1.4) * (1 - smooth(t, 2.9, 3.3)), [MS_CX - 46, HOLE_Y - 4], -18);
      } },
    victory: {
      ms:4700, swap:[2.4, 3.5], roll:2.32,
      init:r => ({ pull:Array.from({ length:46 }, () => ({ u:(r() - .5) * 9, v:-7 + r() * 12, d:r() * .5, sz:.6 + r() * .9, dir:r() < .8 ? 1 : -1 })) }),
      // No lunge: it waits at the side, drags the rival towards itself, flings
      // it out at the event and glides into the middle.
      layout(S, t) {
        S.ha = seg(t, 0, .35); S.ra = 1;
        S.hp = otSlot(OT_CHASE, OT_LEAD, inOut(seg(t, 2.4, 3.5)));
        const drawn = in3(seg(t, 1.1, 2.3)), fling = seg(t, 2.3, 3.2);
        const pulled = { x:OT_LEAD.x - 34 * drawn, y:OT_LEAD.y + 4 * drawn, s:OT_LEAD.s * (1 - .12 * drawn) };
        S.rp = fling > 0 ? otSlot(pulled, OT_BEATEN, out3(fling), 64) : pulled;
        S.rrot = 1.1 * Math.sin(Math.PI * fling) * (1 - fling);
      },
      warp(S, t) {
        const g = smooth(t, .15, 2.2) * (1 - smooth(t, 2.3, 3)), ripple = seg(t, 3.4, 4.25), fin = ripple > 0 && ripple < 1;
        const wind = 2.6 * g + .8 * bell(t, 2.25, 2.6);
        if (wind < .002 && !fin) return null;
        // Space bends round it, not the hole itself: nothing turns inside its own horizon.
        const H = otPt(S.hp, 0, 9 / MS_S), sc = 70, edge = Math.exp(-SWIRL_R / sc), core = 66 * S.hp.s;
        const taper = r => Math.max(0, (Math.exp(-r / sc) - edge) / (1 - edge)) * smooth(r, core, core * 1.5);
        const front = 30 + 170 * out3(ripple), wave = fin ? (1 - ripple) * seg(ripple, 0, .1) : 0;
        return { x:H[0], y:H[1], twist:r => wind * taper(r) + .5 * wave * Math.exp(-(((r - front) / 22) ** 2)),
          pull:r => 1 - .22 * g * taper(r) + .08 * wave * Math.exp(-(((r - front) / 16) ** 2)) * seg(SWIRL_R - r, 0, 20) };
      },
      draw(c, t, S, st) {
        const event = 2.32, deepen = smooth(t, 1.1, 2.2) * (1 - smooth(t, 2.6, 3.4)), H = otPt(S.hp, 0, 9 / MS_S);
        S.hit = .5 * smooth(t, 1.2, 2.2) * (1 - smooth(t, 2.3, 2.5)) + bell(t, event - .05, event + .35);
        S.flip = bell(t, event - .02, event + .16);
        // The rival, its light smeared towards the singularity.
        const R = otPt(S.rp, 0, 0), dx = H[0] - R[0], dy = H[1] - R[1], dl = Math.hypot(dx, dy) || 1, smear = smooth(t, .8, 2.2) * (1 - smooth(t, 2.3, 2.6));
        for (let k = 3; k > 0; k--) if (smear > .01) otRival(c, S, { a:.22 * smear / k, dx:dx / dl * k * 10 * smear, dy:dy / dl * k * 10 * smear, comp:'lighter' });
        otRival(c, S);
        // Its matter drawn off, spiralling into the horizon.
        c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
        const col = OT_RGB[S.rivalTier] || '255,255,255';
        for (const p of st.pull) {
          const u = seg(t, 1.15 + p.d, 2.2 + p.d);
          if (u <= 0 || u >= 1) continue;
          const A = otPt(S.rp, p.u, p.v), r0 = Math.hypot(A[0] - H[0], A[1] - H[1]), a0 = Math.atan2(A[1] - H[1], A[0] - H[0]);
          const pos = k => { const e = in3(k), r = lerp(r0, 4, e), a = a0 + 2.6 * e * p.dir; return [H[0] + Math.cos(a) * r, H[1] + Math.sin(a) * r * lerp(1, .35, e)]; };
          lightTrace(c, [pos(Math.max(0, u - .06)), pos(u)], mix(col, '255,255,255', u), smooth(u, 0, .1) * (1 - seg(u, .85, 1)), p.sz, '255,255,255');
        }
        // The singularity, its core deepening and its disk racing.
        otFlame(c, 'singularity', t, S.hp);
        if (deepen > .01) otAt(c, S.hp, () => {
          singularityVignette(c, .45 * deepen);
          c.globalCompositeOperation = 'lighter';
          singularityDisk(c, S.phase + t, S.settled.disk, false, 1, { wind:2 * deepen, alpha:.7 * deepen });
        });
        // The event: a shockwave of white and its photon ring flaring.
        c.globalCompositeOperation = 'lighter';
        const sw = seg(t, event, event + .85);
        if (sw > 0 && sw < 1) {
          otRing(c, H[0], H[1], 12 + 180 * out3(sw), 3.5 * (1 - sw) + .5, '255,255,255', .9 * (1 - sw) ** 2);
          otRing(c, H[0], H[1], (12 + 180 * out3(sw)) * .9, 8 * (1 - sw), '200,215,255', .2 * (1 - sw) ** 2);
        }
        glow(c, H[0], H[1], 60, '255,255,255', .6 * bell(t, event - .05, event + .4));
        // Landed: the last light flares sideways across the horizon.
        const fl = bell(t, 3.3, 3.8);
        if (fl) {
          const g = c.createLinearGradient(MS_CX - 150, 0, MS_CX + 150, 0);
          g.addColorStop(0, 'rgba(200,215,255,0)'); g.addColorStop(.5, rgba('255,255,255', .8 * fl)); g.addColorStop(1, 'rgba(200,215,255,0)');
          c.fillStyle = g; c.fillRect(MS_CX - 150, HOLE_Y - .9, 300, 1.8);
        }
      } } }
};

// ---------- the player ----------
// A scene's state: its tiers, the settled milestone it continues, its seeded material.
function otState(dir, hero, rival) {
  const defeat = dir === 'defeat', heroTier = otTier(defeat ? hero.from : hero.to) || 'red', scene = OT_SCENES[heroTier][defeat ? 'defeat' : 'victory'];
  const milestone = SCENES[heroTier];
  const S = { dir:defeat ? 'defeat' : 'victory', scene, heroTier, heroLow:defeat ? otTier(hero.to) : heroTier, rivalTier:otTier(rival.from), rivalLow:otTier(rival.to),
    settled:initMilestoneScene(heroTier, milestone), phase:milestoneEndTime(milestone) - (milestone.lead ?? 0),
    hp:OT_LEAD, rp:OT_CHASE, ha:1, ra:1, rrot:0, hit:0, feed:0, flip:0, t:0 };
  S.st = scene.init?.(seeded(613 + TIER_ORDER.indexOf(heroTier) * 271 + (defeat ? 0 : 97))) ?? {};
  S.low = (c, a = 1) => otFlame(c, S.heroLow, S.t, S.hp, { a });
  return S;
}

function playOvertake(host, { dir = 'victory', hero, rival, reduced, onEnd } = {}) {
  const S = otState(dir, hero, rival), { scene, heroTier } = S, defeat = S.dir === 'defeat';
  const winner = defeat ? rival : hero, loser = defeat ? hero : rival, dropped = otTier(loser.to);
  const root = document.createElement('div');
  root.className = 'ms ms-ot ms-' + heroTier;
  root.setAttribute('role', 'img');
  const you = p => p.name === 'You';
  root.setAttribute('aria-label', winner.name + (you(winner) ? ' take' : ' takes') + ' the streak lead with ' + winner.to + '. ' + loser.name + (you(loser) ? ' drop' : ' drops') + ' to ' + (loser.to || 0) + '.');
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  root.append(canvas);
  const tag = (who, p, tier, count, down, sub, subAt) => {
    const el = document.createElement('div'), b = document.createElement('b'), n = document.createElement('span'), small = document.createElement('small');
    el.className = 'ot-tag'; el.setAttribute('aria-hidden', 'true'); n.className = 'ot-n';
    b.textContent = p.name; n.textContent = Math.max(p.from, p.to); small.textContent = sub;
    el.style.setProperty('--ink', OT_INK[tier] || '#c8ccd4');
    el.append(b, n, small); root.append(el);
    return { who, el, b, n, small, count, down, subAt, shown:null, w:0, sw:0 };
  };
  const { roll, swap } = scene, falls = (tier, p) => tier === otTier(p.from) && p.to ? '' : tier ? 'Drops to ' + TIER_LABEL[tier] : 'Streak over';
  const tags = [
    tag('hero', hero, heroTier, t => defeat ? Math.round(lerp(hero.from, hero.to, smooth(t, roll, roll + .5))) : t < roll ? hero.from : hero.to,
      defeat ? roll : Infinity, defeat ? falls(dropped, hero) : 'In the lead', defeat ? roll + .35 : swap[1]),
    tag('rival', rival, S.rivalTier, t => defeat ? rival.from : Math.round(lerp(rival.from, rival.to, smooth(t, roll + .45, roll + .95))),
      defeat ? Infinity : roll + .45, defeat ? 'In the lead' : S.rivalTier ? falls(dropped, rival) : '', defeat ? swap[1] : roll + .8)
  ];
  host.replaceChildren(root);
  const unit = root.clientWidth / MS_W || 1;
  // Widths at full size: the name and count scale with the tag, the line under them does not.
  for (const g of tags) { g.w = Math.max(g.b.offsetWidth, g.n.offsetWidth); g.sw = g.small.offsetWidth; }

  const anims = [];
  function place(g, t) {
    const p = g.who === 'hero' ? S.hp : S.rp, a = g.who === 'hero' ? S.ha : S.ra;
    const k = .6 + .4 * clamp01((p.s - .42) / .58), y = p.y + 42 * p.s + 3 + 5 * k, half = Math.max(g.w * k, g.sw) / 2 + 4;
    const x = Math.max(half, Math.min(MS_W - half, p.x));
    g.el.style.setProperty('--k', k.toFixed(3));
    g.el.style.transform = 'translate(' + (x * unit).toFixed(1) + 'px,' + (y * unit).toFixed(1) + 'px) translateX(-50%) scale(' + (k * unit).toFixed(3) + ')';
    g.el.style.opacity = a.toFixed(3);
    const n = g.count(t);
    if (n !== g.shown) {
      // A win pops the new count; a drop counts down through the colours.
      if (g.shown !== null && n > g.shown && !reducedNow) anims.push(g.n.animate([{ transform:'scale(1.5)', filter:'brightness(1.8)' }, { transform:'none', filter:'none' }], { duration:450, easing:'cubic-bezier(.3,1.5,.5,1)' }));
      g.shown = n; g.n.textContent = n; g.n.style.color = OT_INK[otTier(n)] || '#8f96a3';
    }
    g.el.classList.toggle('ot-down', t >= g.down);
    g.small.style.opacity = smooth(t, g.subAt, g.subAt + .3).toFixed(3);
    return { x, y, half, a };
  }
  // As the two pass each other, the beaten name gives way.
  function placeAll(t) {
    const [h, r] = tags.map(g => place(g, t)), lose = defeat ? 0 : 1, at = lose ? r : h;
    const hide = Math.abs(h.y - r.y) < 34 ? clamp01((h.half + r.half - Math.abs(h.x - r.x)) / 40) : 0;
    if (hide) tags[lose].el.style.opacity = (at.a * (1 - .85 * hide)).toFixed(3);
  }

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = canvas.height = Math.round(MS_W * dpr);
  const c = canvas.getContext('2d');
  const reducedNow = !c || (reduced ?? !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const ms = reducedNow ? OT_STILL_MS : scene.ms + OT_HOLD;
  const frameScene = { draw:(x, t) => otDraw(x, t, S) };
  const draw = t => {
    if (c) renderScene(c, dpr, frameScene, t);
    else { S.t = t; (scene.layout || otLayout)(S, t); }
    placeAll(t);
  };
  let raf = 0, timer = 0, start = null, faded = false, done = false;
  const fade = () => { faded = true; anims.push(root.animate([{ opacity:1 }, { opacity:0 }], { duration:OT_FADE, easing:'ease-in', fill:'forwards' })); };
  function stop() { done = true; cancelAnimationFrame(raf); clearTimeout(timer); for (const a of anims) a.cancel(); root.remove(); }
  function complete() { if (done) return; stop(); onEnd?.(); }
  function frame(now) {
    if (done || !root.isConnected) return stop();
    start ??= now;
    const t = (now - start) / 1000;
    if (t * 1000 >= ms) return complete();
    draw(t);
    if (!faded && t * 1000 >= ms - OT_FADE) fade();
    raf = requestAnimationFrame(frame);
  }
  if (reducedNow) {
    // The settled result: who leads, who dropped, nothing moving.
    draw(scene.ms / 1000 + .5);
    timer = setTimeout(() => { if (!done) { fade(); timer = setTimeout(complete, OT_FADE); } }, ms - OT_FADE);
  } else raf = requestAnimationFrame(frame);
  return { ms, stop };
}

if (typeof module !== 'undefined') module.exports = { OT_SCENES };
