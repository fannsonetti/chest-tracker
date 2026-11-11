(() => {
  // Audio elements are created after the page loads, not during it: six
  // preloading <audio> elements held the load event (and the HUD) back ~270ms.
  let clicks = null, next = 0;
  const warm = () => {
    if (clicks) return clicks;
    clicks = Array.from({length:6}, () => {
      const audio = new Audio('click.wav');
      audio.preload = 'auto'; audio.volume = 0.65;
      return audio;
    });
    return clicks;
  };
  const later = () => setTimeout(warm, 1500);
  if (document.readyState === 'complete') later(); else window.addEventListener('load', later, { once:true });
  // A falling tone when your own streak is lost (taken or run out).
  window.playStreakLost = () => {
    try {
      const ctx = new AudioContext(), t = ctx.currentTime;
      const out = ctx.createGain(); out.gain.value = 0.9;
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 1600;
      filter.connect(out); out.connect(ctx.destination);
      [[523, 262, 0.12, 'sine'], [784, 392, 0.04, 'triangle']].forEach(([from, to, level, type]) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(from, t);
        osc.frequency.exponentialRampToValueAtTime(to, t + 0.45);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(level, t + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
        osc.connect(gain); gain.connect(filter);
        osc.start(t); osc.stop(t + 0.6);
      });
      setTimeout(() => ctx.close(), 1200);
    } catch (error) { console.warn('Could not play streak sound:', error.message); }
  };
  window.playTrackerClick = () => {
    const list = warm();
    const audio = list[next++ % list.length];
    audio.currentTime = 0;
    audio.play().catch(error => console.warn('Could not play chest click:', error.message));
  };
})();
