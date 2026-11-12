'use strict';
// Redesigned notification sounds. Every cue is synthesised here with Web
// Audio and scheduled on its scene's own timeline: the anchors come from the
// scene data (SCENES lead/at/title/ms, DEATH_SCENES ms, OT_SCENES
// ms/swap/roll, the achievement timings), and the moments in between mirror
// the times in each scene's draw code, named in the comments beside them.
// The original sounds (sound.js, hypeSound in popup.js) are untouched: with
// Legacy Notification Sounds on, the callers play those instead of these.
//
// notificationSound({ type, tier, dir, hero, rival, record, gain }) starts a
// cue and returns stop(). type is milestone | death | overtake | achievement.
// One AudioContext and one reverb are shared by every cue; starting a cue
// fades out the one before, so rapid notifications never pile up.
(() => {
  let ctx = null, bus = null, room = null, noiseBuf = null, playing = null, idle = 0, noiseAt = 0;
  const FLOOR = 1e-4;
  // Seeded like milestones.js, so a cue sounds the same on every replay.
  function rand(seed) {
    let s = seed % 2147483646 + 1;
    const next = () => (s = s * 16807 % 2147483647) / 2147483647;
    next(); next(); next();
    return next;
  }
  const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;

  function setup() {
    clearTimeout(idle);
    if (ctx && ctx.state !== 'closed') { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
    ctx = new AudioContext();
    // Master: a gentle top cut against brittle highs, then a soft limiter so
    // layered peaks never clip.
    const air = ctx.createBiquadFilter(); air.type = 'highshelf'; air.frequency.value = 6500; air.gain.value = -4;
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -12; limit.knee.value = 6; limit.ratio.value = 8; limit.attack.value = .002; limit.release.value = .2;
    bus = ctx.createGain(); bus.gain.value = .6;
    bus.connect(air); air.connect(limit); limit.connect(ctx.destination);
    // A short dark room: enough space to bloom, gone within a second.
    const rate = ctx.sampleRate, len = Math.round(rate * 1.5), ir = ctx.createBuffer(2, len, rate), r = rand(7);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (r() * 2 - 1) * (1 - i / len) ** 4.5; }
    room = ctx.createConvolver(); room.buffer = ir;
    const dark = ctx.createBiquadFilter(); dark.type = 'lowpass'; dark.frequency.value = 4500;
    room.connect(dark); dark.connect(bus);
    noiseBuf = ctx.createBuffer(1, rate * 2, rate);
    const n = noiseBuf.getChannelData(0), nr = rand(11);
    for (let i = 0; i < n.length; i++) n[i] = nr() * 2 - 1;
  }

  // ---------- the voice: one cue's layers on one timeline ----------
  // Times are seconds on the scene's clock. A value is a number or points
  // [[t, v], ...], ramped exponentially (linearly for pan and detune).
  function voice(gain) {
    const out = ctx.createGain(), wet = ctx.createGain(), t0 = ctx.currentTime + .03, sources = [];
    out.gain.value = wet.gain.value = gain;
    out.connect(bus); wet.connect(room);
    let end = 0, done = false;
    const T = t => t0 + Math.max(0, t);
    function auto(param, pts, lin) {
      if (!Array.isArray(pts)) { param.value = pts; return; }
      param.setValueAtTime(pts[0][1], T(pts[0][0]));
      for (let i = 1; i < pts.length; i++) {
        const [t, x] = pts[i], prev = pts[i - 1][1];
        if (lin || x <= 0 || prev <= 0) param.linearRampToValueAtTime(x, T(t)); else param.exponentialRampToValueAtTime(x, T(t));
      }
    }
    const span = amp => [amp[0][0], amp.at(-1)[0] + .05];
    function source(node, [a, b], offset) { node.start(T(a), offset); node.stop(T(b)); sources.push(node); end = Math.max(end, b); return node; }
    function lfo(rate, depth, param, when) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      auto(o.frequency, rate); auto(g.gain, depth);
      o.connect(g); g.connect(param);
      source(o, when);
    }
    function filter(type, f, q) {
      const node = ctx.createBiquadFilter(); node.type = type; node.Q.value = q; auto(node.frequency, f);
      return node;
    }
    // src -> [drive] -> [hp] [lp] [bp] -> amp -> [tremolo] -> pan -> out (+ room send)
    function chain(src, o) {
      const when = span(o.amp);
      let node = src;
      const link = next => { node.connect(next); node = next; };
      if (o.drive) {
        const ws = ctx.createWaveShaper(), k = o.drive, curve = new Float32Array(1024);
        for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(k * x) / Math.tanh(k); }
        ws.curve = curve; link(ws);
      }
      if (o.hp) link(filter('highpass', o.hp, .7));
      if (o.lp) link(filter('lowpass', o.lp, o.q ?? .7));
      if (o.bp) link(filter('bandpass', o.bp, o.q ?? 1));
      const amp = ctx.createGain(); amp.gain.value = 0; auto(amp.gain, o.amp); link(amp);
      if (o.trem) {
        const tg = ctx.createGain(), depth = o.trem[1] / 2;
        tg.gain.value = 1 - depth; lfo(o.trem[0], depth, tg.gain, when); link(tg);
      }
      const pan = ctx.createStereoPanner();
      auto(pan.pan, o.pan ?? 0, true);
      if (o.orbit) lfo(o.orbit[0], o.orbit[1], pan.pan, when);
      link(pan);
      pan.connect(out);
      if (o.rev) { const send = ctx.createGain(); send.gain.value = o.rev; pan.connect(send); send.connect(wet); }
      return when;
    }
    const v = {
      // An oscillator. f: Hz; cents: detune; vib: [rate, cents]; fm: [ratio, depth in Hz].
      tone(o) {
        const s = ctx.createOscillator(); s.type = o.type || 'sine';
        auto(s.frequency, o.f);
        if (o.cents !== undefined) auto(s.detune, o.cents, true);
        const when = chain(s, o);
        if (o.vib) lfo(o.vib[0], o.vib[1], s.detune, when);
        if (o.fm) {
          const base = Array.isArray(o.f) ? o.f : [[when[0], o.f]];
          lfo(base.map(([t, f]) => [t, f * o.fm[0]]), o.fm[1], s.frequency, when);
        }
        source(s, when);
      },
      // Filtered noise: give it hp, lp or bp (with q).
      noise(o) {
        const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
        // Each layer reads its own stretch of the buffer, so copies panned apart stay apart.
        source(s, chain(s, o), (noiseAt = (noiseAt + .618034) % 1) * 1.9);
      },
      // Several tones as one: spread across the field, each a few cents apart;
      // bend scales every note's pitch over time ([[t, ratio], ...]).
      chord(freqs, o) {
        freqs.forEach((f, i) => {
          const side = freqs.length > 1 ? i / (freqs.length - 1) * 2 - 1 : 0;
          v.tone({ ...o, f:o.bend ? o.bend.map(([t, k]) => [t, f * k]) : f, cents:(o.detune ?? 4) * (i % 2 ? 1 : -1), pan:o.pan ?? side * (o.spread ?? .5) });
        });
      },
      // A short pitched strike.
      ping(at, f, peak, decay, o = {}) { v.tone({ ...o, f, amp:env(at, peak, o.attack ?? .004, decay) }); },
      // A metallic strike: FM with an inharmonic ratio, its brightness decaying with it.
      bell(at, f, peak, decay, ratio, o = {}) {
        v.tone({ ...o, f, fm:[ratio, [[at, f * (o.bright ?? 1.6)], [at + decay, f * .02]]], amp:env(at, peak, .003, decay) });
      },
      // A body hit: a sine falling in pitch.
      thump(at, from, to, peak, decay) { v.tone({ f:[[at, from], [at + decay, to]], amp:env(at, peak, .004, decay) }); },
      // Dry grains: crackles, sparks, static. level(t) shapes their loudness.
      crackle(from, to, n, peak, seed, o = {}) {
        const r = rand(seed), [lo, hi] = o.band ?? [1800, 5200];
        for (let i = 0; i < n; i++) {
          const t = from + (to - from) * (i + r()) / n, k = o.level ? clamp01(o.level(t)) : 1;
          if (k <= .02) continue;
          v.noise({ amp:env(t, peak * k * (.5 + r() * .5), .001, .008 + r() * .02), bp:lo + (hi - lo) * r(), q:o.q ?? 2.5, pan:(r() * 2 - 1) * (o.width ?? .7), rev:o.rev });
        }
      },
      stop() {
        if (done) return;
        done = true;
        const now = ctx.currentTime;
        for (const g of [out.gain, wet.gain]) { g.cancelScheduledValues(now); g.setTargetAtTime(0, now, .04); }
        setTimeout(dispose, 400);
      }
    };
    function dispose() {
      done = true;
      for (const s of sources) { try { s.stop(); } catch {} }
      out.disconnect(); wet.disconnect();
      if (playing === v) { playing = null; idle = setTimeout(() => { if (!playing && ctx.state === 'running') ctx.suspend().catch(() => {}); }, 4000); }
    }
    v.finish = () => setTimeout(() => { if (!done) dispose(); }, (t0 - ctx.currentTime + end + 1.6) * 1000);
    return v;
  }
  // An envelope: silence, a rise over a, a hold, a decay over d.
  const env = (at, peak, a, d, hold = 0) => [[at, FLOOR], [at + a, peak], ...(hold ? [[at + a + hold, peak]] : []), [at + a + hold + d, FLOOR]];

  // ---------- tier identities ----------
  // Each flame has its own chord and timbre, richer the higher it burns.
  const ID = {
    red:         { chord:[220, 330], wave:'triangle' },
    orange:      { chord:[262, 330, 392], wave:'triangle' },
    yellow:      { chord:[294, 370, 440, 587], wave:'sine' },
    blue:        { chord:[165, 330, 494, 659], wave:'sawtooth' },
    purple:      { chord:[175, 262, 330, 440, 494], wave:'sine' },
    aurora:      { chord:[196, 294, 370, 440, 587], wave:'triangle' },
    quasar:      { chord:[110, 165, 220, 277, 330, 440], wave:'sawtooth' },
    singularity: { chord:[73.4, 147, 220, 294, 440, 659], wave:'sine' }
  };

  // ---------- milestones ----------
  // sc is the scene (SCENES[tier]): lead is the held flame of the tier
  // below, at the moment the flame lands, title the name, ms the reveal.
  const MILESTONE = {
    // Ember: a struck spark, the flame catching with a warm breath, three embers rising.
    red(v, { at, ms }) {
      v.noise({ amp:env(0, .2, .002, .05), bp:[[0, 2500], [.05, 6500]], q:1.3 });                       // the spark (0-.12)
      v.noise({ amp:env(.04, .13, at - .04, .45), bp:[[.04, 300], [at, 950], [at + .45, 380]], q:.9, rev:.2 }); // it swells into a flame
      v.thump(at, 120, 70, .12, .25);
      v.chord(ID.red.chord, { type:'triangle', amp:env(at, .075, .02, .75), lp:1500, rev:.25 });
      v.crackle(at + .05, ms, 10, .055, 3, { level:t => 1 - .7 * (t - at) / (ms - at) });
      [.5, .63, .76].forEach((d, i) => v.ping(d + .06, [880, 1109, 1319][i], .022, .4, { rev:.45, pan:(i - 1) * .45 }));  // three embers (.5 + i*.13)
    },
    // Flare: a sharper strike, heat rushing up, a bright flash and a landing.
    orange(v, { lead:L, at, ms }) {
      v.noise({ amp:env(L, .24, .001, .06), hp:3200 });
      v.thump(L, 260, 120, .06, .07);
      v.noise({ amp:env(L + .05, .16, at - L - .07, .06), bp:[[L + .05, 400], [at, 2800]], q:1.1 });    // it reddens and surges (.08-.42)
      v.tone({ type:'sawtooth', f:[[L, 131], [at, 262]], amp:env(L + .05, .04, at - L - .05, .12), lp:[[L, 300], [at, 2200]] });
      v.noise({ amp:env(at - .05, .18, .03, .42), bp:[[at - .05, 6500], [at + .4, 1300]], q:.8, rev:.3 }); // the flash (.48-.78)
      v.thump(at, 130, 55, .2, .3);
      v.chord([...ID.orange.chord, 523], { type:'triangle', amp:env(at, .06, .006, 1), lp:[[at, 4200], [at + .8, 1200]], rev:.3 });
      v.crackle(at, at + .75, 9, .05, 5, { band:[2600, 6000], level:t => 1 - (t - at) / .8 });            // curved sparks (.5+)
    },
    // Solar: a breath, ignition, two prominences looping out in an X, a pulse as they meet.
    yellow(v, { lead:L, at, title }) {
      const I = L + .34;                                                                                     // ignites (.32-.46)
      v.noise({ amp:env(L, .1, .34, .1), lp:[[L, 300], [I, 1700]], rev:.2 });
      v.tone({ f:[[L, 147], [I, 294]], amp:env(L, .07, .34, .4) });
      v.thump(I, 160, 70, .15, .3);
      v.noise({ amp:env(I, .13, .01, .5), bp:[[I, 3200], [I + .5, 900]], q:.7, rev:.4 });                 // the corona bursts out
      v.chord(ID.yellow.chord.slice(0, 3), { amp:env(at, .05, .05, 1.5, .3), lp:2600, rev:.35 });
      // The prominences (.6+p.d to 1.65+p.d): one loops left to right, one right to left.
      for (const [k, dir] of [[0, -1], [1, 1]]) {
        const a = L + .6 + k * .1, b = a + 1, f = [587, 740][k], pan = [[a, .85 * dir], [b, -.85 * dir]];
        v.tone({ f:[[a, f], [(a + b) / 2, f * 1.12], [b, f]], amp:env(a, .03, .45, .55), pan, vib:[5, 7], rev:.4 });
        v.noise({ amp:env(a, .045, .5, .5), bp:[[a, 700], [(a + b) / 2, 2700], [b, 800]], q:5, pan, rev:.3 });
      }
      const P = L + 1.1;                                                                                      // the golden pulse (1.1-1.55)
      v.thump(P, 150, 110, .1, .5);
      v.chord([294, 440, 587], { amp:env(P, .045, .03, .9), lp:[[P, 3600], [P + .6, 1200]], rev:.4 });
      v.bell(title, 1175, .028, 1.2, 3.01, { rev:.5, pan:.2 });
      v.bell(title + .09, 1480, .02, 1.1, 3.01, { rev:.5, pan:-.2 });
    },
    // Plasma: a hum charging, a strike from above, the front crackling down,
    // a controlled discharge and one sharp pulse.
    blue(v, { lead:L, at, title, ms }) {
      const S = L + .46;                                                                                       // the strike (.46-.52)
      v.tone({ type:'sawtooth', f:[[L, 55], [S, 110], [at, 123]], amp:[[L, FLOOR], [S, .06], [at - .02, .075], [at, FLOOR]],
        lp:[[L, 200], [S, 1400], [at, 2600]], q:4, trem:[[[L, 25], [at, 60]], .5] });
      v.tone({ type:'square', f:[[L, 110], [at, 247]], amp:[[L, FLOOR], [at - .02, .02], [at, FLOOR]], lp:[[L, 300], [at, 1800]] });
      v.crackle(L + .15, S, 6, .03, 9, { band:[3000, 7000], level:t => (t - L) / .46 });                   // streamers off the tip
      v.noise({ amp:env(S, .26, .001, .05), hp:1500 });
      v.ping(S, 2900, .05, .04, { type:'triangle' });
      [.52, .6, .67, .76, .84].forEach((k, i) => v.noise({ amp:env(L + k, .12 - i * .015, .001, .03), hp:2000 }));  // the return stroke flickers (.48-.86)
      for (const s of [-1, 1]) v.noise({ amp:env(L + .5, .045, .3, .2), bp:[[L + .5, 1800], [at, 4400]], q:3, pan:.55 * s }); // the front runs down both sides (.5-1)
      v.thump(at, 110, 40, .22, .35);                                                                         // the burst
      v.noise({ amp:env(at, .16, .002, .25), bp:[[at, 5200], [at + .25, 800]], q:.7, rev:.3 });
      v.chord(ID.blue.chord.slice(1).concat(988), { type:'sawtooth', amp:env(at, .035, .005, .9), lp:[[at, 6000], [at + .5, 900]], q:3, rev:.35, spread:.6 });
      v.bell(title, 1319, .032, .5, 2.01, { pan:.1 });
      v.crackle(at + .15, ms, 7, .02, 13, { band:[3000, 7000], level:t => 1 - (t - at) / (ms - at) });        // arcs keep crackling
    },
    // Nebula: dust thrown wide, a slow lydian swell as it spirals back in,
    // a few faint stars, a layered bloom as the cloud condenses.
    purple(v, { lead:L, at, ms }) {
      for (const s of [-1, 1]) v.noise({ amp:env(L, .06, .03, .5), bp:[[L, 1500], [L + .5, 500]], q:1, pan:[[L, 0], [L + .5, .9 * s]], rev:.5 }); // flung out (0-.45)
      v.chord(ID.purple.chord, { amp:[[L + .2, FLOOR], [at, .028], [ms + .9, FLOOR]], lp:[[L + .2, 400], [L + 1.3, 900], [at + .2, 2600]], rev:.6, spread:.8, detune:7 }); // spirals in (.2-1.75)
      v.tone({ f:87, amp:[[L + .4, FLOOR], [at, .05], [ms + .8, FLOOR]] });
      v.noise({ amp:[[L + .2, FLOOR], [at, .022], [ms, FLOOR]], bp:[[L + .2, 600], [at, 1900], [ms, 1100]], q:8, orbit:[.4, .6], rev:.6 });
      const r = rand(17), stars = [1397, 1760, 2093, 2637, 2794];
      for (let i = 0; i < 7; i++) v.ping(L + .45 + i * (ms - L - .7) / 7 + r() * .15, stars[Math.floor(r() * 5)], .01, .6, { rev:.7, pan:r() * 1.6 - .8 });
      v.chord([349, 523, 659, 880], { amp:env(at - .1, .026, .25, 1.4), lp:3000, rev:.6 });               // it condenses (1.3-1.95)
    },
    // Aurora: two ribbons of tone gliding as the curtains fold round the
    // flame, wind in the sky, then the window opens and the veil rises.
    aurora(v, { lead:L, at, ms }) {
      for (const [a, b, c, s] of [[294, 330, 370, -1], [392, 440, 494, 1]]) {
        v.tone({ type:'sawtooth', f:[[L + .1, a], [L + .9, b], [at, c]], amp:[[L + .1, FLOOR], [at - .1, .024], [at + .3, .016], [ms + .6, FLOOR]],
          lp:[[L + .1, 500], [L + .7, 1500], [L + 1.2, 800], [at, 2400], [ms, 1200]], q:6, pan:[[L + .1, .7 * s], [at, -.3 * s], [ms, .5 * s]], vib:[.4, 6], rev:.6 });
      }
      v.noise({ amp:[[L + .1, FLOOR], [at, .024], [ms, FLOOR]], bp:[[L + .1, 2000], [at, 3500], [ms, 2500]], q:4, orbit:[.35, .7], rev:.5 });
      v.noise({ amp:env(at - .3, .07, .28, .2), bp:[[at - .3, 600], [at, 3000]], q:1 });                  // the loops snap together (1.6-1.85)
      v.thump(at, 98, 70, .08, .5);
      v.chord(ID.aurora.chord, { type:'triangle', amp:env(at, .04, .06, 1.6, .3), lp:[[at, 1500], [at + .5, 3800], [ms, 1800]], rev:.6, spread:.7, detune:6 });
      v.tone({ f:[[at, 587], [at + .5, 880]], amp:env(at, .018, .3, 1.2), rev:.7 });                    // the veil rises (1.64-2.1)
    },
    // Quasar: drawn in to a point, a low engine and a whirr orbiting faster
    // and faster, twin jets, then the core blows out with a long, controlled tail.
    quasar(v, { lead:L, at, title, ms }) {
      const P = L + .36, D = L + .15;                                                                          // a point (0-.36); the disk spins up (.15-1.35)
      v.noise({ amp:env(L, .09, .34, .03), lp:[[L, 400], [P, 4000]] });
      v.tone({ f:[[L, 440], [P, 110]], amp:env(L, .045, .3, .1) });
      v.chord([55, 82.5], { type:'sawtooth', amp:[[D, FLOOR], [at - .07, .07], [at - .01, FLOOR]], lp:[[D, 120], [at - .05, 900]], drive:1.5, spread:.2 });
      const spin = { trem:[[[D, 3], [at, 26]], .9], orbit:[[[D, .8], [at, 7]], .8] };
      v.noise({ amp:[[D, FLOOR], [at - .06, .08], [at, FLOOR]], bp:[[D, 500], [at, 2300]], q:3, ...spin });
      v.tone({ type:'triangle', f:[[D, 220], [at, 880]], amp:[[D, FLOOR], [at - .06, .03], [at, FLOOR]], ...spin });
      for (const s of [-1, 1]) v.noise({ amp:env(L + .8, .05, .45, .05), bp:[[L + .8, 2000], [at, 5200]], q:2, pan:.85 * s }); // the jets (.8-1.3)
      v.thump(at, 80, 32, .26, .6);                                                                           // the core blows out
      v.noise({ amp:env(at, .22, .002, .5), lp:[[at, 9000], [at + .5, 600]], rev:.5 });
      v.chord([...ID.quasar.chord, 554], { type:'sawtooth', amp:env(at, .024, .01, 1.5), lp:[[at, 5200], [at + 1, 700]], q:1.5, rev:.5, spread:.8, detune:9 });
      v.bell(at, 880, .035, 1.4, 1.41, { rev:.6 });
      v.noise({ amp:env(at + .05, .045, .1, .6), bp:[[at, 3000], [at + .7, 1200]], q:2, orbit:[2, 1], rev:.6 });  // the pulse scatters the disk (1.32-1.95)
      v.tone({ f:440, amp:[[at + .4, FLOOR], [title, .013], [ms + .6, FLOOR]], trem:[4, .6], orbit:[.8, .6], rev:.6 }); // matter keeps orbiting
    },
    // Singularity: two low tones beating, a cluster bending down and dark,
    // a held breath of silence, then a pulse that rises instead of falling;
    // the matter that pours in is drawn from out of tune into a pure chord.
    singularity(v, { lead:L, at:E, title, ms }) {
      const W = L + .1, Q = E - .2;                                                                            // winds in (.1-1.14); a point (.95-1.14)
      v.tone({ f:[[W, 73.4], [Q, 61]], amp:[[W, FLOOR], [Q - .1, .06], [Q, FLOOR]] });
      v.tone({ f:[[W, 75.2], [Q, 58]], amp:[[W, FLOOR], [Q - .1, .06], [Q, FLOOR]] });
      [[523, .5], [587, .42], [698, .34], [784, .27]].forEach(([f, k], i) => v.tone({ type:'sawtooth', f:[[W, f], [Q, f * k]],
        amp:[[W, FLOOR], [W + .5, .013], [Q, FLOOR]], lp:[[W, 3000], [Q, 250]], q:2, vib:[[[W, 6], [Q, .5]], 25], pan:[[W, i % 2 ? .8 : -.8], [Q, 0]], rev:.4 }));
      v.noise({ amp:[[W, FLOOR], [Q, .07], [Q + .03, FLOOR]], lp:[[W, 80], [Q, 220]] });
      v.noise({ amp:[[E - .09, FLOOR], [E - .003, .03], [E, FLOOR]], hp:2500 });                              // the last light drawn in
      v.tone({ f:[[E, 45], [E + .7, 82]], amp:env(E, .22, .004, .9) });                                     // it inverts (1.14)
      v.tone({ type:'triangle', f:[[E, 1200], [E + .05, 140]], amp:env(E, .07, .002, .12) });
      for (const s of [-1, 1]) v.noise({ amp:env(E, .09, .01, .7), bp:[[E, 200], [E + .7, 4000]], q:1.4, pan:[[E, 0], [E + .7, .9 * s]], rev:.4 }); // the shockwave (1.14-1.85)
      const M = L + 1.3, settle = L + 2.25;                                                                    // matter pours in (1.3-2.25)
      ID.singularity.chord.slice(1).forEach((f, i) => v.tone({ f, cents:[[M, (i % 2 ? 1 : -1) * (35 + 8 * i)], [settle, 0]],
        amp:[[M, FLOOR], [L + 2, .017], [ms + .5, FLOOR]], lp:[[M, 900], [settle, 3500]], pan:(i / 4 - .5) * 1.2, rev:.6 }));
      v.noise({ amp:[[L + 1.45, FLOOR], [L + 2.2, .035], [ms, FLOOR]], bp:[[L + 1.45, 900], [L + 2.4, 2500]], q:4,
        trem:[[[L + 1.45, 14], [ms, 4]], .7], orbit:[[[L + 1.45, 3], [ms, .6]], .7], rev:.5 });             // the disk races (1.45-2.4)
      v.bell(L + 1.95, 147, .05, 2, 1.41, { rev:.6 });                                                     // the hole stretches into a flame (1.95-2.65)
      v.thump(title, 62, 45, .09, .8);
      v.bell(title, 1760, .016, 1.3, 2.76, { rev:.6 });
    }
  };

  // ---------- deaths ----------
  // Times are the death scene's own (DEATH_SCENES; it holds the settled
  // milestone for DEATH_LEAD first). Every cue ends inside its scene's ms.
  const DEATH = {
    // Ember cools to char and crumbles: the crackle weakens, a soft hiss, the last ember goes out.
    red(v) {
      v.crackle(.1, 1.3, 13, .05, 21, { level:t => 1.1 - (t - .1) / 1.3 });
      v.noise({ amp:env(.2, .04, .5, .8), hp:[[.2, 6000], [1.5, 2000]], rev:.2 });                           // cooling (.24-1.25)
      v.tone({ type:'triangle', f:[[.18, 330], [1.5, 220]], amp:env(.18, .035, .1, 1.3), lp:[[.18, 1500], [1.5, 400]] });
      const r = rand(23);
      for (let i = 0; i < 5; i++) v.noise({ amp:env(.42 + i * .07 + r() * .03, .045, .001, .02), bp:1200, q:3, pan:r() - .5 });   // fissures (.42-.76)
      for (let i = 0; i < 6; i++) v.ping(.9 + i * .095 + r() * .03, 700 - i * 60, .022, .12, { type:'triangle', pan:r() * .8 - .4 }); // it breaks from the tip down (.9-1.46)
      v.noise({ amp:env(1.62, .06, .01, .35), lp:[[1.62, 2500], [2, 300]] });                               // out (1.62-2.17)
      v.tone({ f:[[1.62, 220], [2.1, 110]], amp:env(1.62, .035, .01, .5), lp:600 });
    },
    // Flare surges, three tongues tear off its tip, then it gutters out.
    orange(v) {
      v.noise({ amp:env(.05, .09, .25, .1), bp:[[.05, 600], [.3, 2600]], q:1 });
      v.chord(ID.orange.chord, { type:'triangle', bend:[[.05, 1], [.3, 1.06], [.86, 1.06], [1.25, .5]], amp:[[.05, FLOOR], [.3, .045], [.86, .04], [1.3, FLOOR]], lp:[[.05, 1500], [.4, 3500], [.9, 2500], [1.3, 300]] });
      for (const [at, side] of [[.31, -1], [.47, 1], [.63, -1]]) {                                             // FLARE_LICKS
        v.noise({ amp:env(at, .13, .005, .16), bp:[[at, 3600], [at + .16, 700]], q:1.2, pan:.6 * side });
        v.thump(at, 230, 140, .035, .08);
      }
      v.crackle(.52, .9, 6, .04, 31, { band:[2600, 6000] });                                                  // sparks spat off the tip
      v.noise({ amp:env(.9, .028, .05, .6), hp:3000, rev:.2 });                                              // a thread of smoke
    },
    // Solar's two orbits drift out of step and fail one after the other,
    // it falls in on itself, fractures in a flash, and its light fades.
    yellow(v) {
      for (const [k, f, fail] of [[0, 587, 1.02], [1, 740, 1.3]]) {
        v.tone({ f:[[.2, f], [fail - .02, f * (1 + .05 * (k ? -1 : 1))], [fail + .25, f * .6]], amp:[[.2, FLOOR], [.45, .028], [fail, .03], [fail + .3, FLOOR]],
          vib:[[[.2, 4], [fail, 9]], [[.2, 4], [fail, 40]]], orbit:[[[.2, .6], [fail, 1.4]], .7], rev:.35 });
        v.noise({ amp:env(fail, .1, .002, .14), bp:[[fail, 4200], [fail + .14, 1200]], q:2, pan:k ? .5 : -.5 }); // each loop snaps
        v.ping(fail, f * 2.76, .025, .3, { pan:k ? .5 : -.5 });
      }
      v.noise({ amp:[[1.28, FLOOR], [1.85, .09], [1.87, FLOOR]], lp:[[1.28, 500], [1.85, 5000]] });           // it falls in (1.28-1.92)
      v.tone({ f:[[1.1, 294], [1.85, 587]], amp:[[1.1, FLOOR], [1.84, .04], [1.87, FLOOR]] });               // swelling white (.98-1.72)
      v.thump(1.87, 140, 50, .17, .4);                                                                         // the flash
      v.noise({ amp:env(1.87, .13, .002, .3), bp:[[1.87, 5000], [2.2, 1500]], q:.8, rev:.4 });
      [1175, 1661, 2349].forEach((f, i) => v.bell(1.88 + i * .02, f, .02, .9, 2.76, { pan:(i - 1) * .5, rev:.5 }));
      v.noise({ amp:env(1.9, .045, .15, .8), bp:[[1.9, 2500], [2.9, 600]], q:1.5, orbit:[1.2, .8], rev:.5 }); // the corona thrown off (1.9-2.9)
      v.chord([147, 220, 294], { bend:[[1.9, 1], [2.9, .94]], amp:env(1.9, .03, .05, .95), lp:[[1.9, 2000], [2.9, 400]], rev:.5 });
    },
    // Plasma's hum turns unstable, arcs crawl it, containment ruptures, a little static lingers.
    blue(v) {
      const R = 1.62;                                                                                             // PLASMA_RUPTURE
      v.tone({ type:'sawtooth', f:[[.1, 110], [R, 165]], amp:[[.1, FLOOR], [.4, .05], [R - .01, .07], [R + .015, FLOOR]], lp:[[.1, 1200], [R, 2600]], q:5, drive:2,
        trem:[[[.24, 8], [R, 32]], .6], vib:[[[.24, 5], [R, 13]], [[.24, 6], [R, 60]]] }); // browning out (.24-1.53)
      v.crackle(.8, R, 14, .04, 37, { band:[2500, 7000], level:t => .3 + (t - .8) / .8 });                // arcs crawl its rim
      const r = rand(41);
      for (let i = 0; i < 6; i++) v.noise({ amp:env(1.56 + r() * .24, .09, .001, .04), hp:1800, pan:r() * 1.6 - .8 }); // bolts leap off (1.56-1.8)
      v.thump(R, 120, 38, .22, .4);                                                                             // containment ruptures
      v.noise({ amp:env(R, .2, .001, .3), bp:[[R, 6000], [R + .3, 700]], q:.7, rev:.35 });
      v.chord([330, 494, 659], { type:'sawtooth', bend:[[R, 1], [R + .6, .5]], amp:env(R, .03, .004, .6), lp:[[R, 5000], [R + .6, 500]], q:4, rev:.3 });
      v.tone({ f:[[1.75, 330], [2.7, 55]], amp:env(1.75, .025, .02, .9), lp:900 });                          // powering down
      v.crackle(1.9, 3.2, 9, .022, 43, { band:[3000, 7000], level:t => 1 - (t - 1.9) / 1.3 });               // static lingers (1.9-3.2)
    },
    // Nebula's harmonics detune and thin one by one, its dust drifts apart, the stars go out.
    purple(v) {
      ID.purple.chord.forEach((f, i) => v.tone({ f, cents:[[.2, 0], [2.6, (i % 2 ? 1 : -1) * (20 + 10 * i)]], amp:[[.1, FLOOR], [.35, .026], [.6 + i * .3, .02], [2 + i * .35, FLOOR]],
        lp:[[.3, 2400], [2.6, 500]], pan:(i / 4 - .5) * 1.4, rev:.6 }));                                    // it loses cohesion (.41-2.5)
      for (const s of [-1, 1]) v.noise({ amp:[[.5, FLOOR], [1.4, .035], [2.6, FLOOR]], bp:[[.5, 1200], [2.6, 500]], q:1.5, pan:[[.5, .1 * s], [2.6, .95 * s]], rev:.6 }); // the dust drifts apart
      [1760, 1568, 1397, 1175, 1047].forEach((f, i) => v.ping(2.17 + i * .18, f, .013 - i * .0015, .5, { rev:.7, pan:(i % 2 ? .6 : -.6) }));  // the stars go out (2.17+i*.18)
      v.noise({ amp:[[2.3, FLOOR], [2.8, .018], [4, FLOOR]], lp:[[2.3, 1500], [4, 300]], rev:.7 });           // gone (2.72-4.01)
      v.tone({ f:[[.3, 87], [3.5, 73]], amp:[[.3, FLOOR], [1, .035], [3.6, FLOOR]] });
    },
    // Aurora's ribbons race, the window shears into rising strips, the ribbons
    // part one cut at a time, each part stepping down, and the sky dims.
    aurora(v, st) {
      for (const [a, s] of [[294, -1], [392, 1]]) v.tone({ type:'sawtooth', f:[[.1, a], [1.4, a * 1.12], [2.4, a * .75], [3.6, a * .5]],
        amp:[[.1, FLOOR], [.5, .022], [1.5, .024], [4.2, FLOOR]], lp:[[.1, 1200], [1.4, 2600], [4.2, 400]], q:6, pan:[[.1, .7 * s], [4, -.4 * s]],
        trem:[[[.3, 1], [1.5, 6]], .5], vib:[[[.3, .5], [1.5, 4]], 12], rev:.6 });                     // racing (.3-1.5), then falling
      const r = rand(53);
      for (let j = 0; j < 12; j++) v.noise({ amp:env(.95 + .62 * j / 11, .022, .04, .25), bp:[[.95 + .62 * j / 11, 900 + j * 120], [1.3 + .62 * j / 11, 2200 + j * 150]], q:5, pan:(j / 11 - .5) * 1.2, rev:.4 }); // strips lift away (.95-1.57)
      const cuts = st?.breaks?.flatMap(b => b.cuts.map(c => c.at)) ?? [1.6, 1.85, 2.1, 2.3, 2.5, 2.7, 2.9, 3.1];
      cuts.sort((a, b) => a - b).forEach((at, i) => {                                                         // the ribbons part, cut by cut
        v.noise({ amp:env(at, .04, .002, .05), bp:2600, q:3, pan:r() * 1.4 - .7 });
        v.tone({ type:'triangle', f:[[at, ID.aurora.chord[4 - i % 5] * 2], [at + .5, ID.aurora.chord[4 - i % 5]]], amp:env(at, .014, .01, .6), rev:.6, pan:r() - .5 });
      });
      v.chord([196, 294, 370], { amp:[[2.1, FLOOR], [2.6, .02], [4.3, FLOOR]], bend:[[2.1, 1], [4.3, .89]], lp:[[2.1, 2000], [4.3, 300]], rev:.7 }); // the sky dims (2.13-4.27)
    },
    // Quasar browns out in stutters, throws one last pair of jets, they sink
    // back into the core, it implodes to nothing and its matter flies loose.
    quasar(v) {
      // The stutter follows the scene's own seeded 45ms flicker (chance() in streak-deaths.js).
      const gate = [[.05, FLOOR], [.27, .06]];
      for (let k = 6; k * .045 < 2.6; k++) {
        const t = k * .045, cut = rand(k * 7919 + 3)() < .32 * smooth(t, .3, 1.2) * (1 - smooth(t, 2.2, 2.6));
        const level = cut ? .012 : .06 * (1 - .55 * smooth(t, .95, 2.7));
        gate.push([t + .003, level], [t + .042, level]);
      }
      gate.push([2.75, FLOOR]);
      v.chord([55, 82.5, 110], { type:'sawtooth', amp:gate, lp:[[.05, 900], [2.7, 250]], drive:1.6, spread:.3 });
      v.noise({ amp:gate.map(([t, a]) => [t, a * .9]), bp:[[.05, 2000], [1.86, 900]], q:3, trem:[[[.27, 20], [1.86, 6]], .8], orbit:[[[.27, 6], [1.86, 1.5]], .8] }); // the engine winds down (.27-1.86)
      v.thump(1.29, 90, 45, .18, .35);                                                                        // one last pair of jets (1.29-1.58)
      for (const s of [-1, 1]) v.noise({ amp:[[1.29, FLOOR], [1.36, .08], [1.62, .06], [2.6, FLOOR]], bp:[[1.29, 5000], [2.05, 2500], [2.7, 600]], q:2, pan:.85 * s, rev:.3 });
      v.noise({ amp:[[2.1, FLOOR], [2.7, .1], [2.72, FLOOR]], lp:[[2.1, 300], [2.7, 3500]] });               // drawn back in (2.05-2.7)
      v.tone({ f:[[2.1, 440], [2.7, 110]], amp:[[2.1, FLOOR], [2.69, .04], [2.72, FLOOR]] });
      v.thump(2.72, 70, 32, .2, .5);                                                                          // gone
      v.crackle(2.75, 3.9, 10, .03, 59, { band:[1500, 4500], width:1, rev:.5, level:t => 1 - (t - 2.75) / 1.2 }); // its matter flies loose (2.1-3.86)
      v.chord([220, 277, 330], { bend:[[2.75, 1], [4, .7]], amp:env(2.75, .02, .05, 1.3), lp:1500, rev:.6 });
    },
    // Singularity winds space up, compresses everything to a pinprick, then
    // an unnatural silence, and the horizon is erased by a rebounding wave.
    singularity(v) {
      const H = 3.69, C = 3.34;                                                                                   // HORIZON_LOSS; the pinprick (3.34-3.48)
      v.tone({ f:[[.25, 73.4], [C, 98]], amp:[[.25, FLOOR], [1, .05], [C - .01, .06], [C, FLOOR]] });
      v.tone({ f:[[.25, 75.4], [C, 104]], amp:[[.25, FLOOR], [1, .05], [C - .01, .06], [C, FLOOR]] });
      [440, 523, 659, 784].forEach((f, i) => v.tone({ type:'sawtooth', f:[[.25, f], [2.43, f * 1.15], [C, f * .3]], amp:[[.25, FLOOR], [1, .011], [2.6, .014], [C, FLOOR]],
        lp:[[.25, 2500], [1.83, 1500], [C, 150]], q:3, vib:[[[.25, 1], [2.43, 9]], 30], pan:[[.25, i % 2 ? .9 : -.9], [C, 0]], rev:.4 })); // space winds up (.25-2.43), collapses (1.83-3.56)
      v.noise({ amp:[[1.83, FLOOR], [C - .01, .08], [C, FLOOR]], lp:[[1.83, 120], [C, 300]] });
      v.tone({ f:4186, amp:[[C, FLOOR], [C + .02, .006], [C + .14, FLOOR]] });                                // a pinprick, then nothing
      v.tone({ f:[[H, 38], [H + 1, 76]], amp:env(H, .22, .004, 1.1) });                                         // erased: the pulse rebounds
      v.tone({ type:'triangle', f:[[H, 900], [H + .04, 120]], amp:env(H, .05, .002, .1) });
      for (const s of [-1, 1]) v.noise({ amp:env(H, .08, .02, 1.3), bp:[[H, 150], [5.11, 5000]], q:1.2, pan:[[H, 0], [5.11, .95 * s]], rev:.5 }); // the wavefront (3.69-5.11)
      ID.singularity.chord.slice(2).forEach((f, i) => v.tone({ f, cents:[[H, 0], [5.1, (i % 2 ? 1 : -1) * 50]], amp:[[H + .1, FLOOR], [H + .5, .01], [5.1, FLOOR]], pan:(i / 3 - .5) * 1.4, rev:.6 }));
    }
  };
  const smooth = (t, a, b) => { const p = clamp01((t - a) / (b - a)); return p * p * (3 - 2 * p); };

  // ---------- overtakes ----------
  // A tier's character as a texture over [a, b], rising in intensity.
  // unstable: on the defending side, wavering under the rival's pressure.
  function texture(v, tier, a, b, unstable) {
    const rise = t => (t - a) / (b - a), wob = unstable ? 4 : 1;
    switch (tier) {
      case 'red': case 'orange':
        return v.crackle(a, b, tier === 'red' ? 12 : 16, .045, 61, { band:tier === 'red' ? [1800, 4500] : [2400, 6000], level:t => .3 + rise(t) });
      case 'yellow':
        for (const [f, d] of [[587, .8], [740, -.8]]) v.tone({ f, amp:env(a, .022, b - a, .1), orbit:[[[a, 1], [b, unstable ? 2.5 : 4]], d], vib:[5, 6 * wob], rev:.4 });
        return;
      case 'blue':
        v.tone({ type:'sawtooth', f:[[a, 82], [b, 123]], amp:env(a, .04, b - a, .05), lp:[[a, 400], [b, 2200]], q:4, trem:[[[a, 20], [b, 50]], .5], vib:[9, 5 * wob] });
        return v.crackle(a, b, 10, .035, 67, { band:[3000, 7000], level:rise });
      case 'purple': {
        v.noise({ amp:env(a, .025, b - a, .2), bp:[[a, 700], [b, 2000]], q:8, orbit:[.5, .7], rev:.6 });
        const r = rand(71);
        for (let i = 0; i < 5; i++) v.ping(a + (b - a) * (i + r()) / 5, [1397, 1760, 2093][i % 3], .01, .5, { rev:.7, pan:r() - .5, vib:unstable ? [7, 30] : undefined });
        return;
      }
      case 'aurora':
        return v.tone({ type:'sawtooth', f:[[a, 392], [b, 440]], amp:env(a, .025, b - a, .15), lp:[[a, 600], [(a + b) / 2, 2000], [b, 1000]], q:7, orbit:[.6, .8], vib:[.5 * wob, 8 * wob], rev:.6 });
      case 'quasar':
        v.noise({ amp:env(a, .06, b - a, .05), bp:[[a, 600], [b, 2400]], q:3, trem:[[[a, 3], [b, 24]], .9], orbit:[[[a, 1], [b, 7]], .8] });
        return v.tone({ type:'sawtooth', f:55, amp:env(a, .05, b - a, .05), lp:[[a, 150], [b, 800]], drive:1.5 });
      case 'singularity':
        v.tone({ f:73.4, amp:env(a, .05, b - a, .1) });
        v.tone({ f:unstable ? 76 : 74.6, amp:env(a, .05, b - a, .1) });
        return [523, 659].forEach((f, i) => v.tone({ f:[[a, f], [b, f * (unstable ? .7 : 1.3)]], amp:env(a, .012, b - a, .1), lp:[[a, 3000], [b, 600]], pan:i ? .7 : -.7, rev:.5 }));
    }
  }
  // Defeat: threat, resistance, the hit and fracture, regression to the tier below.
  function defeat(v, { tier, low, rival }, { ms, swap:[sw, sw1], roll }) {
    const id = ID[tier], rid = ID[rival] || ID.red, root = id.chord[id.chord.length > 2 ? 1 : 0];
    // The rival closes in from the left (OT_CHASE), louder and nearer.
    v.noise({ amp:env(0, .06, roll * .92, .08), bp:[[0, 400], [roll, 2300]], q:1.5, pan:[[0, -.8], [roll, -.1]] });
    v.tone({ type:rid.wave, f:rid.chord[0] * 2, amp:env(.1, .02, roll - .1, .1), lp:[[0, 600], [roll, 2400]], pan:[[0, -.7], [roll, -.2]], vib:[6, 10] });
    // Your tier holds, straining: its chord under a tightening tremolo, a semitone grinding against it.
    v.chord(id.chord, { type:id.wave, amp:[[0, FLOOR], [.25, .026], [roll, .034], [roll + .04, FLOOR]], lp:1800, trem:[[[0, 3], [roll, 14]], .5], vib:[[[0, 4], [roll, 9]], [[0, 3], [roll, 22]]] });
    v.tone({ f:root * 2 * 1.0595, amp:env(roll * .3, .016, roll * .7, .05), pan:-.3 });
    texture(v, tier, .1, roll, true);
    // The hit: the lead lost, its chord fracturing, each note falling at its own rate.
    v.thump(roll, 115, 45, .2, .35);
    v.noise({ amp:env(roll, .17, .002, .3), bp:[[roll, 4200], [roll + .3, 600]], q:.8, rev:.3 });
    id.chord.forEach((f, i) => v.tone({ type:id.wave, f:[[roll, f], [sw, f * (.5 + .08 * i)]], amp:env(roll, .026, .01, sw - roll + .2), lp:[[roll, 2600], [sw, 300]], pan:(i / Math.max(1, id.chord.length - 1) - .5) * .8 }));
    // Regression: the tier below takes over, quieter (none when Ember ends).
    if (low) v.chord(ID[low].chord, { type:ID[low].wave, amp:env(sw, .024, .3, ms - sw + .8, .2), lp:1600, rev:.4 });
    else v.crackle(sw, ms, 5, .025, 73, { band:[1500, 3500], level:t => 1 - (t - sw) / (ms - sw) });
    // The rival takes the middle: one short accent.
    v.chord(rid.chord.slice(-3).map(f => f * 2), { type:'triangle', amp:env(sw1, .028, .005, .5), lp:3200, rev:.3, spread:.3 });
  }
  // Victory: pursuit, breakthrough, the middle claimed, a flourish that settles.
  function victory(v, { tier, rival }, { ms, swap:[sw, sw1], roll }) {
    const id = ID[tier], rid = ID[rival] || ID.red, notes = id.chord.filter(f => f >= 140);
    // Pursuit: pulses on your chord, each nearer the last, climbing as you close in.
    for (let t = .05, gap = .3, i = 0; t < roll - .05; t += gap, gap = Math.max(.07, gap * .8), i++) {
      v.ping(t, notes[i % notes.length] * (1 + .5 * t / roll), .012 + .02 * t / roll, .16, { type:id.wave === 'sawtooth' ? 'triangle' : id.wave, lp:3000, pan:-.6 + .6 * t / roll });
    }
    v.noise({ amp:env(0, .07, roll - .02, .04), bp:[[0, 500], [roll, 3200]], q:1.2, pan:[[0, -.6], [roll, 0]] });
    texture(v, tier, 0, roll, false);
    // Breakthrough: the lead changes hands; the rival is knocked out to the right (OT_BEATEN).
    v.thump(roll, 150, 60, .2, .3);
    v.noise({ amp:env(roll - .03, .19, .03, .25), bp:[[roll, 1500], [roll + .25, 5200]], q:.8 });
    v.tone({ type:rid.wave, f:[[roll, rid.chord[0] * 2], [Math.max(sw1, roll + .2), rid.chord[0]]], amp:env(roll, .026, .01, Math.max(.2, sw1 - roll)), pan:[[roll, 0], [sw1, .8]], lp:1600 });
    // Victory: your chord fills the middle; the swap settles it.
    v.chord(id.chord, { type:id.wave, amp:env(roll, .04, .03, ms - roll + .9, .3), lp:[[roll, 1500], [sw1, 4000], [ms, 2000]], rev:.4, spread:.6 });
    v.thump(sw1, 110, 70, .08, .3);
    // Resolution: a short rising flourish, then it rings out.
    notes.slice(-3).forEach((f, i) => v.ping(sw1 + .08 + i * .07, f * 2, .026, .55, { type:'triangle', rev:.5, pan:(i - 1) * .3 }));
  }

  // ---------- achievements ----------
  // Personal Best: progress rising toward the old mark, tension at the line, a crisp break, an uplifting resolve.
  function personalBest(v, { impact:I, exit:X, ms }) {
    I /= 1000; X /= 1000; ms /= 1000;
    v.tone({ type:'triangle', f:[[.06, 220], [I, 440]], amp:env(.06, .035, I - .1, .05), lp:[[.06, 600], [I, 2600]] });   // the trace draws (.06-.82)
    v.noise({ amp:env(.39, .05, I - .4, .02), bp:[[.39, 1200], [I, 5200]], q:2 });                                   // the old best shows (.39); the mark rises to it
    v.tone({ f:466, amp:env(.39, .014, I - .4, .03), trem:[[[.39, 4], [I, 16]], .6], pan:.2 });                        // tension: a note just short of the line
    v.thump(I, 160, 70, .17, .25);                                                                                       // the threshold breaks
    v.noise({ amp:env(I, .15, .001, .1), hp:2600 });
    v.chord([523, 659, 784], { type:'triangle', amp:env(I, .042, .004, .8), lp:[[I, 5000], [I + .6, 1500]], rev:.35, spread:.6 });
    const r = rand(83);
    for (let i = 0; i < 5; i++) v.ping(I + .03 + i * .06 + r() * .03, 2093 + r() * 1400, .01, .2, { pan:r() * 1.6 - .8, rev:.4 }); // the shards (impact, 620ms)
    [523, 659, 784, 1047].forEach((f, i) => v.ping(I + .16 + i * .075, f, .026, .6, { type:'triangle', rev:.45, pan:(i - 1.5) * .25 })); // the title (impact+150)
    v.chord([262, 392, 523, 659], { amp:env(I + .4, .016, .3, 1.5), lp:2200, rev:.5 });
    v.noise({ amp:env(X, .03, (ms - X) * .7, (ms - X) * .3), bp:[[X, 900], [ms, 4500]], q:1.2, pan:[[X, -.4], [ms, .7]] }); // off with the breakthrough's direction
  }
  // Leaderboard Record: a deliberate opening, golden bells building, the sweep
  // meeting the impact, a brass flourish, a long refined ring.
  function leaderboardRecord(v, { impact:I, exit:X, ms }) {
    I /= 1000; X /= 1000; ms /= 1000;
    v.thump(0, 70, 50, .07, .7);
    v.chord([110, 165], { type:'sawtooth', amp:env(0, .03, .9, .5), lp:[[0, 200], [.93, 900], [1.4, 400]], q:1.2, spread:.4 }); // the backlight (0-.93)
    [[.21, 440], [.5, 554], [.78, 659], [1.06, 880]].forEach(([t, f], i) => v.bell(t, f, .018 + i * .004, 1.1, 3.5, { rev:.5, pan:(i % 2 ? .4 : -.4), bright:1.2 })); // rails and trace (.18-1.1)
    v.noise({ amp:env(.42, .03, I - .44, .03), bp:[[.42, 2500], [I, 7000]], q:3, trem:[[[.42, 6], [I, 18]], .5] });        // the wires charge (.42-impact)
    v.noise({ amp:env(I - .285, .07, .285, .285), bp:[[I - .285, 1200], [I, 3500], [I + .285, 1500]], q:1.5, pan:[[I - .285, -.95], [I + .285, .95]] }); // the sweep, centred on impact
    v.thump(I, 110, 40, .22, .5);                                                                                      // claimed
    v.noise({ amp:env(I, .14, .002, .2), bp:[[I, 6000], [I + .2, 1500]], q:.7, rev:.3 });
    v.chord([110, 220, 277, 330, 440], { type:'sawtooth', amp:env(I, .026, .01, 1.6, .15), lp:[[I, 4200], [I + 1.2, 800]], q:1.2, rev:.45, spread:.7 });
    v.bell(I, 880, .038, 2.2, 3.5, { rev:.6 });
    v.bell(I + .01, 1319, .022, 1.8, 3.5, { rev:.6, pan:.3 });
    [[.095, 440], [.21, 554], [.245, 659], [.36, 880]].forEach(([d, f], i) => v.tone({ type:'sawtooth', f, amp:env(I + d, .024, .01, i === 3 ? .9 : .22), lp:[[I + d, 3200], [I + d + .4, 1000]], q:2, rev:.4 })); // plinth, unit, title
    v.noise({ amp:env(I + .755, .022, .325, .325), bp:[[I + .755, 5000], [I + 1.4, 8000]], q:4, pan:[[I + .755, -.6], [I + 1.4, .6]], rev:.4 }); // the foil glints
    v.bell(I + .8, 1760, .01, 1.5, 3.5, { rev:.7 });
    v.chord([220, 330, 554], { amp:env(X, .016, .1, ms - X - .15), lp:[[X, 1800], [ms, 400]], rev:.6 });                      // it closes
    v.noise({ amp:env(X, .025, (ms - X) * .5, (ms - X) * .5), bp:[[X, 3000], [ms, 800]], q:1 });
  }

  // ---------- routing ----------
  // Scene data comes from the scene scripts, where this window loads them
  // (top-level consts, so looked up by name; the popup's CSP rules out eval).
  function build(cue) {
    if (cue.type === 'milestone') {
      const sc = typeof SCENES !== 'undefined' ? SCENES[cue.tier] : undefined, play = MILESTONE[cue.tier];
      return sc && play && (v => play(v, { lead:0, ...sc, ms:sc.ms / 1000 }));
    }
    if (cue.type === 'death') {
      // Aurora's ribbons part at seeded times: rebuild its state from the scene's own seed (playStreakDeath).
      const play = DEATH[cue.tier], st = cue.tier === 'aurora' && typeof DEATH_SCENES !== 'undefined'
        ? DEATH_SCENES.aurora.init(rand(309 + TIER_ORDER.indexOf('aurora') * 727)) : null;
      return play && (v => play(v, st));
    }
    if (cue.type === 'overtake') {
      const scenes = typeof OT_SCENES !== 'undefined' ? OT_SCENES : null, tierOf = typeof otTier !== 'undefined' ? otTier : null;
      if (!scenes || !tierOf || !cue.hero || !cue.rival) return;
      const lost = cue.dir === 'defeat', tier = tierOf(lost ? cue.hero.from : cue.hero.to) || 'red', sc = scenes[tier]?.[lost ? 'defeat' : 'victory'];
      if (!sc) return;
      const opts = { tier, low:lost ? tierOf(cue.hero.to) : null, rival:tierOf(cue.rival.from) }, t = { ...sc, ms:sc.ms / 1000 };
      return v => (lost ? defeat : victory)(v, opts, t);
    }
    if (cue.type === 'achievement') {
      const timing = typeof PERSONAL_BEST_TIMING === 'undefined' ? null : cue.record ? LEADERBOARD_RECORD_TIMING : PERSONAL_BEST_TIMING;
      return timing && (v => (cue.record ? leaderboardRecord : personalBest)(v, timing));
    }
  }
  // The mix: trims that even out perceived loudness across cues (measured as
  // the loudest 400ms of each), so no tier reads as more important by volume.
  const TRIM = { 'milestone:red':1.4, 'milestone:quasar':.85, 'death:red':3.5, 'death:aurora':2.5, 'death:purple':1.2, 'achievement:best':1.4 };
  function notificationSound(cue = {}) {
    try {
      const make = build(cue);
      if (!make) return;
      setup();
      playing?.stop();
      const v = voice((cue.gain ?? 1) * (TRIM[cue.type + ':' + (cue.tier || (cue.record ? 'record' : 'best'))] ?? 1));
      make(v);
      v.finish();
      playing = v;
      return v.stop;
    } catch (error) { console.warn('Could not play notification sound:', error.message); }
  }
  globalThis.notificationSound = notificationSound;
  if (typeof module !== 'undefined') module.exports = { notificationSound, MILESTONE, DEATH, ID };
})();
