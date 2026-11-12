const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// The popup's scripts in one shared scope, as the page loads them, with a
// stand-in AudioContext that records what each cue schedules and flags what
// real Web Audio would reject or play wrong.
function popupScope() {
  const log = { errors:[], starts:[], stops:[] };
  class Param {
    constructor() { this.value = 0; this.last = -Infinity; }
    check(v, t, exp) {
      if (!Number.isFinite(v) || !Number.isFinite(t)) log.errors.push('non-finite value ' + v + ' at ' + t);
      if (exp && v <= 0) log.errors.push('exponential ramp to ' + v);
      if (t < this.last - 1e-9) log.errors.push('automation out of order: ' + t + ' after ' + this.last);
      this.last = t;
    }
    setValueAtTime(v, t) { this.check(v, t); }
    linearRampToValueAtTime(v, t) { this.check(v, t); }
    exponentialRampToValueAtTime(v, t) { this.check(v, t, true); }
    setTargetAtTime() {}
    cancelScheduledValues() {}
  }
  const PARAMS = ['frequency', 'detune', 'gain', 'Q', 'pan', 'playbackRate', 'threshold', 'knee', 'ratio', 'attack', 'release'];
  class Node {
    constructor() { for (const k of PARAMS) this[k] = new Param(); }
    connect(n) { return n; }
    disconnect() {}
    start(t) { log.starts.push(t); }
    stop(t) { if (t !== undefined) log.stops.push(t); }
  }
  class AudioContext {
    constructor() { this.currentTime = 0; this.sampleRate = 8000; this.state = 'running'; this.destination = new Node(); }
    createBuffer(ch, len) { const data = Array.from({ length:ch }, () => new Float32Array(len)); return { getChannelData:i => data[i] }; }
    resume() { return Promise.resolve(); }
    suspend() { return Promise.resolve(); }
  }
  for (const m of ['Gain', 'Oscillator', 'BufferSource', 'BiquadFilter', 'StereoPanner', 'WaveShaper', 'Convolver', 'DynamicsCompressor']) AudioContext.prototype['create' + m] = () => new Node();
  const scope = vm.createContext({ console, AudioContext, setTimeout:() => 0, clearTimeout() {} });
  for (const file of ['match.js', 'milestones.js', 'streak-deaths.js', 'streak-overtakes.js', 'achievements.js', 'notification-sounds.js']) {
    vm.runInContext(fs.readFileSync(file, 'utf8'), scope, { filename:file });
  }
  const run = (cue, length) => {
    log.errors = []; log.starts = []; log.stops = [];
    const stop = scope.notificationSound(cue);
    assert.equal(typeof stop, 'function', JSON.stringify(cue) + ' played nothing');
    assert.deepEqual(log.errors, [], JSON.stringify(cue));
    const t0 = Math.min(...log.starts), end = Math.max(...log.stops) - t0;
    assert.ok(end <= length + .1, JSON.stringify(cue) + ' runs ' + end.toFixed(2) + 's, past its scene (' + length + 's)');
    stop();
    return log.starts.length + ':' + log.starts.map(t => (t - t0).toFixed(3)).join(',');
  };
  return { scope, run, get: name => vm.runInContext(name, scope) };
}

test('every notification has its own cue that fits inside its scene', () => {
  const { run, get } = popupScope();
  const TIERS = get('TIER_ORDER'), SCENES = get('SCENES'), DEATHS = get('DEATH_SCENES'), OT = get('OT_SCENES'), TIER_MIN = get('TIER_MIN');
  const prints = new Map();
  const add = (label, print) => { assert.ok(!prints.has(print), label + ' sounds the same as ' + prints.get(print)); prints.set(print, label); };
  for (const tier of TIERS) {
    add('milestone ' + tier, run({ type:'milestone', tier }, (SCENES[tier].ms + get('MS_HOLD')) / 1000));
    add('death ' + tier, run({ type:'death', tier }, DEATHS[tier].ms / 1000));
    const n = TIER_MIN[tier] + 1, rival = { name:'Rival', from:n, to:get('droppedStreak')(n) };
    add('defeat ' + tier, run({ type:'overtake', dir:'defeat', hero:{ name:'You', from:n, to:get('droppedStreak')(n) }, rival:{ name:'Rival', from:n + 1, to:n + 1 } }, (OT[tier].defeat.ms + get('OT_HOLD')) / 1000));
    add('victory ' + tier, run({ type:'overtake', dir:'victory', hero:{ name:'You', from:n, to:n + 1 }, rival }, (OT[tier].victory.ms + get('OT_HOLD')) / 1000));
  }
  add('personal best', run({ type:'achievement' }, get('PERSONAL_BEST_TIMING').ms / 1000));
  add('leaderboard record', run({ type:'achievement', record:true }, get('LEADERBOARD_RECORD_TIMING').ms / 1000));
  assert.equal(prints.size, 34);
});

test('without the scenes (the HUD) only a death tries to play', () => {
  const log = [];
  const scope = vm.createContext({ console:{ warn:m => log.push(m) }, setTimeout:() => 0, clearTimeout() {} });
  vm.runInContext(fs.readFileSync('notification-sounds.js', 'utf8'), scope);
  assert.equal(scope.notificationSound({ type:'milestone', tier:'red' }), undefined);
  assert.equal(scope.notificationSound({ type:'death', tier:'red' }), undefined);   // no AudioContext here: it warns rather than throws
  assert.match(log[0], /Could not play notification sound/);
});
