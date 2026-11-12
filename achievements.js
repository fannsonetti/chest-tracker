'use strict';

// The gauge and the crest are drawn at popup size. The score and captions
// sit above the art as live text, so they stay sharp and announce once.
const PERSONAL_BEST_ART = `
  <svg class="achievement-art" viewBox="0 0 360 248" aria-hidden="true">
    <defs>
      <radialGradient id="best-shadow">
        <stop offset="0" stop-color="#18100a" stop-opacity=".98"/>
        <stop offset=".57" stop-color="#18100a" stop-opacity=".9"/>
        <stop offset="1" stop-color="#18100a" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="best-metal" x1=".16" y1=".91" x2=".85" y2=".09" gradientUnits="objectBoundingBox">
        <stop stop-color="#916330"/>
        <stop offset=".48" stop-color="#e6b66b"/>
        <stop offset=".78" stop-color="#ffe5a9"/>
        <stop offset="1" stop-color="#fff8dc"/>
      </linearGradient>
      <linearGradient id="best-edge" x2="0" y2="1">
        <stop stop-color="#ffda92"/>
        <stop offset="1" stop-color="#99652c" stop-opacity=".25"/>
      </linearGradient>
      <linearGradient id="best-current" x1=".08" y1="1" x2=".9" y2="0">
        <stop stop-color="#b5712d" stop-opacity="0"/>
        <stop offset=".56" stop-color="#efaf55" stop-opacity=".56"/>
        <stop offset="1" stop-color="#ffebad"/>
      </linearGradient>
      <radialGradient id="best-impact-light">
        <stop stop-color="#fff5d6" stop-opacity=".95"/>
        <stop offset=".38" stop-color="#ffd083" stop-opacity=".5"/>
        <stop offset="1" stop-color="#f0ad50" stop-opacity="0"/>
      </radialGradient>
      <path id="best-mark-outline" d="M134 94l44-46 39-15-12 39-15 17 4-25-37 26Z"/>
    </defs>
    <g class="achievement-backlight">
      <ellipse class="achievement-shadow" cx="180" cy="129" rx="164" ry="119" fill="url(#best-shadow)"/>
    </g>
    <g class="best-calibration" fill="none">
      <path class="best-trace" pathLength="1" d="M58 149c1-57 43-104 99-115m62 5c38 10 68 33 79 64m7 20c4 26-4 48-16 65" stroke="url(#best-edge)" stroke-width="1.2" stroke-dasharray="1"/>
      <path d="M68 146c3-53 42-91 88-103m73 8c30 10 54 28 65 52m2 23c3 20-3 38-12 52" stroke="#d9a560" stroke-opacity=".28"/>
      <path d="M58 147h8m-6-21 5 1m1-21 7 3m4-23 7 4m5-22 6 6m13-23 4 7m16-17 3 7m16-13 2 8m97 13-3 5m21 6-4 5m22 13-5 4m21 11-6 3m13 21-7 1m8 16-7-1m3 19-7-3m0 19-7-5" stroke="#f5cf8d" stroke-opacity=".57"/>
      <path d="M56 154h7m83-119 10-2m140 67 2 5m-9 83 4-5" stroke="#ffe0a4" stroke-width="2"/>
    </g>
    <g class="best-threshold" fill="none">
      <g class="best-threshold-left">
        <path d="M66 99h82l7-4 6 7 6-3h13" stroke="#dbab65" stroke-width="1.2"/>
        <path d="M72 95v8m10-7v4m8-4v4m8-4v4m8-4v4" stroke="#e6bd67" stroke-opacity=".6"/>
        <path d="M147 99l8-4 6 7 6-3h13" stroke="#fff0be" stroke-width="1.35"/>
      </g>
      <g class="best-threshold-right">
        <path d="M180 99h6l6-3 5 5 8-2h84" stroke="#edbb72" stroke-width="1.2"/>
        <path d="M180 99h6l6-3 5 5 8-2h9" stroke="#fff0be" stroke-width="1.35"/>
        <path d="M271 96v5m7-5v5m7-7v9" stroke="#e6bd67" stroke-opacity=".6"/>
      </g>
    </g>
    <g class="best-rise" fill="none" stroke="url(#best-current)">
      <path d="M90 149l64-68 33-23" stroke-width="2"/>
      <path d="M105 150l29-31m-11 21 47-50 28-20" stroke-width=".8"/>
    </g>
    <use class="best-ghost" href="#best-mark-outline" fill="none" stroke="#ffd68f"/>
    <g class="best-mark">
      <use href="#best-mark-outline" fill="url(#best-metal)" stroke="#ffdf9a" stroke-width=".75"/>
      <path d="m178 48 39-15-23 31-37 26-23 4Z" fill="#ffde9b" fill-opacity=".54"/>
      <path d="m217 33-23 31-4 25 15-17Z" fill="#a56c32" fill-opacity=".68"/>
      <path d="m134 94 53-49 30-12-23 31" fill="none" stroke="#fff4cc" stroke-opacity=".85"/>
      <path d="m170 101 19-18-3 12-11 7Z" fill="url(#best-metal)" stroke="#f3c177" stroke-width=".65"/>
      <path d="m177 108 6-6 4 2-6 4Z" fill="#e3b66f"/>
    </g>
    <g class="best-pulse">
      <ellipse cx="181" cy="96" rx="65" ry="28" fill="url(#best-impact-light)"/>
      <path d="M151 97h21l10-4 10 3h17l-16 3h-12l-11-1Z" fill="#fff2c8"/>
    </g>
    <g fill="#ffda8d">
      <path class="best-shard" style="--dx:-39px;--dy:-16px;--spin:-62deg" d="m169 96 7-3-3 6Z"/>
      <path class="best-shard" style="--dx:-23px;--dy:20px;--spin:54deg" d="m171 100 3-2 2 5-5 1Z"/>
      <path class="best-shard" style="--dx:19px;--dy:-33px;--spin:83deg" d="m183 95 3-4 2 4-3 3Z"/>
      <path class="best-shard" style="--dx:51px;--dy:-19px;--spin:-37deg" d="m187 96 8-1-3 4Z"/>
      <path class="best-shard" style="--dx:34px;--dy:19px;--spin:76deg" d="m184 99 4 1-1 4-4-1Z"/>
    </g>
    <g class="best-signature" fill="none" stroke="#e6bd67">
      <path d="M51 201h17l11 11m202 0 11-11h17" stroke-opacity=".68"/>
      <path d="M53 205h11m232 0h11" stroke-opacity=".32"/>
      <path d="m76 212 3-3 3 3-3 3Zm202 0 3-3 3 3-3 3Z" fill="#e6bd67" stroke="none"/>
    </g>
  </svg>`;

const LEADERBOARD_RECORD_ART = `
  <svg class="achievement-art" viewBox="0 0 360 248" aria-hidden="true">
    <defs>
      <radialGradient id="record-shadow">
        <stop stop-color="#221408"/>
        <stop offset=".54" stop-color="#1c1007" stop-opacity=".95"/>
        <stop offset="1" stop-color="#120b06" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="record-radiance">
        <stop stop-color="#ffe49b" stop-opacity=".29"/>
        <stop offset=".46" stop-color="#d4953c" stop-opacity=".14"/>
        <stop offset="1" stop-color="#b76a22" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="record-gold" x1=".12" y1="0" x2=".68" y2="1">
        <stop stop-color="#fff2b7"/>
        <stop offset=".32" stop-color="#f2c46c"/>
        <stop offset=".52" stop-color="#b17732"/>
        <stop offset=".58" stop-color="#ffd987"/>
        <stop offset="1" stop-color="#975c25"/>
      </linearGradient>
      <linearGradient id="record-bevel" x2="0" y2="1">
        <stop stop-color="#fff5cb"/>
        <stop offset=".48" stop-color="#dba14c"/>
        <stop offset="1" stop-color="#f4c570"/>
      </linearGradient>
      <linearGradient id="record-inlay" x2="0" y2="1">
        <stop stop-color="#3d220e"/>
        <stop offset="1" stop-color="#6c431d"/>
      </linearGradient>
      <radialGradient id="record-impact-light">
        <stop stop-color="#fff5cb"/>
        <stop offset=".26" stop-color="#ffe39a" stop-opacity=".73"/>
        <stop offset="1" stop-color="#f7b84e" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="record-sheen">
        <stop stop-color="#fff2b5" stop-opacity="0"/>
        <stop offset=".5" stop-color="#fff9e3"/>
        <stop offset="1" stop-color="#fff2b5" stop-opacity="0"/>
      </linearGradient>
      <g id="record-wing-art">
        <path d="M149 71h-28l-19-15H55l16 13h26l21 16h29Z" fill="url(#record-gold)" stroke="#f3c671" stroke-width=".65"/>
        <path d="M147 89h-32L93 72H39l19 14h30l22 17h37Z" fill="url(#record-gold)" stroke="#f3c671" stroke-width=".65"/>
        <path d="M149 107h-43L84 90H58l19 14 8 1 17 14h57Z" fill="url(#record-gold)" stroke="#d29b50" stroke-width=".65"/>
        <path d="M55 56h47l19 15h28M39 72h54l22 17h32M58 90h26l22 17h43" fill="none" stroke="#fff0b4" stroke-opacity=".77"/>
        <path d="m77 63 22 1 21 15h20M62 80h29l22 17h25m-54 2 20 15h43" fill="none" stroke="#654019" stroke-opacity=".76"/>
      </g>
      <path id="record-crest-outline" pathLength="1" d="M136 32l23 16 21-31 21 31 23-16-7 42-9 10-28 28-28-28-9-10Z"/>
      <clipPath id="record-crest-mask"><use href="#record-crest-outline"/></clipPath>
      <clipPath id="record-sweep-aperture"><path d="M12 92l72-38h192l72 38-71 40H83Z"/></clipPath>
    </defs>
    <g class="achievement-backlight">
      <ellipse class="achievement-shadow" cx="180" cy="128" rx="180" ry="124" fill="url(#record-shadow)"/>
      <ellipse cx="180" cy="76" rx="145" ry="73" fill="url(#record-radiance)"/>
    </g>
    <g class="record-rails" fill="none" stroke="#e3b465">
      <path class="record-trace" pathLength="1" stroke-dasharray="1" d="M28 101h25l24 17h45m116 0h45l24-17h25M59 140h29l18-13h33m82 0h33l18 13h29M112 45l17-16h26m50 0h26l17 16" stroke-opacity=".72"/>
      <path d="M63 147h29l9-6m158 0 9 6h29M83 197h24m146 0h24" stroke-opacity=".38"/>
      <path d="M75 161h24m162 0h24" stroke-opacity=".58"/>
      <path d="m66 161 4-4 4 4-4 4Zm220 0 4-4 4 4-4 4Z" fill="#d49d4b" stroke="#ffdf99" stroke-width=".7"/>
    </g>
    <use class="record-wire" href="#record-crest-outline" fill="none" stroke="#f8ce7d" stroke-dasharray="1"/>
    <g class="record-sides">
      <g class="record-wing" style="--wing-offset:-27px"><use href="#record-wing-art"/></g>
      <g class="record-wing" style="--wing-offset:27px"><use href="#record-wing-art" transform="translate(360 0) scale(-1 1)"/></g>
    </g>
    <g class="record-crest">
      <use href="#record-crest-outline" fill="url(#record-gold)" stroke="url(#record-bevel)" stroke-width="1.4"/>
      <path d="M180 18v92l-27-27-9-10-7-39 22 17Z" fill="#ffdf95" fill-opacity=".34"/>
      <path d="m146 45 14 12 20-28 20 28 14-12-5 25-8 8h-42l-8-8Z" fill="url(#record-inlay)" stroke="#ffe1a0" stroke-width=".75"/>
      <path d="m180 39 13 19-13 16-13-16Z" fill="url(#record-bevel)"/>
      <path d="M180 39v35l-13-16Z" fill="#ffe4a1"/>
      <path d="m180 45 8 13-8 10-8-10Z" fill="url(#record-gold)" stroke="#ffefba" stroke-width=".65"/>
      <path d="M155 85h50l-25 24Z" fill="url(#record-inlay)" stroke="#f0bb62" stroke-width=".9"/>
      <path d="M162 88h36m-32 4h28m-24 4h20m-15 4h10" fill="none" stroke="#f7d58d" stroke-opacity=".63"/>
      <g clip-path="url(#record-crest-mask)">
        <path class="record-foil" d="M136 115h24l64-100h-24Z" fill="url(#record-sheen)"/>
      </g>
    </g>
    <g class="record-plinth" fill="none" stroke="#e6bd67">
      <path d="M66 219h49l11 7h108l11-7h49" stroke-opacity=".75"/>
      <path d="M102 223h11l11 7h112l11-7h11" stroke-opacity=".34"/>
      <path d="M145 234h25l10 5 10-5h25" stroke-opacity=".78"/>
      <path d="m175 233 5-4 5 4-5 4Z" fill="#f2cd80" stroke="none"/>
    </g>
    <g class="record-impact">
      <ellipse cx="180" cy="91" rx="166" ry="31" fill="url(#record-impact-light)"/>
      <path d="M12 92l105-1 56-3 7-6 7 6 56 3 105 1-105 2-56 2-7 6-7-6-56-2Z" fill="url(#record-sheen)"/>
    </g>
    <g clip-path="url(#record-sweep-aperture)">
      <g class="record-sweep">
        <path d="M123 134h45l64-83h-45Z" fill="url(#record-sheen)" opacity=".62"/>
        <path d="M147 134h5l64-83h-5Z" fill="#fff5cf" opacity=".85"/>
      </g>
    </g>
  </svg>`;

const ACHIEVEMENT_EASE = 'cubic-bezier(.16, 1, .3, 1)';
const ACHIEVEMENT_REVEAL = [{ opacity:0 }, { opacity:1 }];
const PERSONAL_BEST_TIMING = { impact:940, exit:3270, ms:3730 };
const LEADERBOARD_RECORD_TIMING = { impact:1350, exit:4170, ms:4810 };

function animatePersonalBest(track, { impact, exit, ms }) {
  track('.achievement-backlight', ACHIEVEMENT_REVEAL, 0, 520);
  track('.best-calibration', ACHIEVEMENT_REVEAL, 50, 740);
  track('.best-trace', [{ strokeDashoffset:1 }, { strokeDashoffset:0 }], 60, 760, 'ease-out');
  track('.best-threshold', [{ opacity:0, transform:'scaleX(.12)' }, { opacity:1, transform:'none' }], 135, 495);
  track('.achievement-previous', [{ opacity:0, transform:'translateY(-3px)' }, { opacity:1, transform:'none' }], 390, 330);
  track('.best-ghost', [
    { opacity:0, transform:'translate(-20px, 24px)' }, { opacity:.62, transform:'none', offset:.81 }, { opacity:0, transform:'none' }
  ], 285, impact + 120 - 285, 'linear');
  track('.best-rise', [
    { opacity:0, transform:'translate(-29px, 32px)' }, { opacity:.78, transform:'none' }
  ], 325, impact - 325, 'cubic-bezier(.55, .02, .84, .53)');
  track('.best-rise', [{ opacity:.78 }, { opacity:.36 }], impact, 490, 'ease-out', 'forwards');

  track('.best-threshold-left', [
    { transform:'none' }, { transform:'translate(-16px, 5px) rotate(-3deg)', offset:.54 },
    { transform:'translate(-11px, 4px) rotate(-1.5deg)' }
  ], impact, 490, 'ease-out');
  track('.best-threshold-right', [
    { transform:'none' }, { transform:'translate(17px, -6px) rotate(-2deg)', offset:.54 },
    { transform:'translate(12px, -4px) rotate(-1deg)' }
  ], impact, 490, 'ease-out');
  track('.best-mark', [
    { opacity:0, transform:'translate(-20px, 25px) scale(.81)' },
    { opacity:1, transform:'translate(3px, -4px) scale(1.045)', offset:.48 }, { opacity:1, transform:'none' }
  ], impact - 25, 415, 'ease-out');
  track('.best-pulse', [{ opacity:0 }, { opacity:.9, offset:.12 }, { opacity:0 }], impact - 22, 490, 'linear');
  track('.best-shard', [
    { opacity:0, transform:'none' }, { opacity:.95, offset:.17 },
    { opacity:0, transform:'translate(var(--dx), var(--dy)) rotate(var(--spin)) scale(.5)' }
  ], impact, 620, 'ease-out');
  track('.achievement-score', [
    { opacity:0, clipPath:'inset(100% -14px -10px)', transform:'translate(-9px, 17px) skewY(-6deg)' },
    { opacity:1, clipPath:'inset(-12px)', transform:'translateY(-4px) skewY(-2deg)', offset:.58 },
    { opacity:1, clipPath:'inset(-12px)', transform:'none' }
  ], impact, 480, 'ease-out');
  track('.achievement-unit, .best-signature', ACHIEVEMENT_REVEAL, impact + 180, 380);
  track('.achievement-title', [
    { clipPath:'inset(-10px 81% -10px -10px)', transform:'translateX(-7px)', opacity:0 },
    { clipPath:'inset(-10px)', transform:'none', opacity:1 }
  ], impact + 150, 510);

  // Follow the direction of the breakthrough on the way off-screen.
  track('.achievement-content', [
    { clipPath:'polygon(-12% -10%, 110% -10%, 110% 110%, -12% 110%)', transform:'none' },
    { clipPath:'polygon(104% -10%, 120% -10%, 120% 110%, 65% 110%)', transform:'translate(11px, -7px)' }
  ], exit, ms - exit, 'cubic-bezier(.55, .05, .92, .76)', 'forwards');
}

function animateLeaderboardRecord(track, { impact, exit, ms }) {
  track('.achievement-backlight', ACHIEVEMENT_REVEAL, 0, 930, 'ease-in-out');
  track('.record-rails', ACHIEVEMENT_REVEAL, 180, 800, 'ease-out');
  track('.record-trace', [{ strokeDashoffset:1 }, { strokeDashoffset:0 }], 210, 890, 'ease-in-out');
  track('.record-wire', [
    { opacity:0, strokeDashoffset:1 }, { opacity:.74, strokeDashoffset:0, offset:.78 }, { opacity:0, strokeDashoffset:0 }
  ], 420, impact + 200 - 420, 'linear');
  track('.record-wing', [
    { opacity:0, transform:'translateX(var(--wing-offset)) scaleX(.74)' },
    { opacity:.88, transform:'translateX(0) scaleX(1)', offset:.72 }, { opacity:1, transform:'none' }
  ], impact - 350, 545, 'cubic-bezier(.44, .03, .23, 1)');
  track('.record-crest', [
    { opacity:0, transform:'translateY(9px) scale(.83)' },
    { opacity:1, transform:'translateY(-2px) scale(1.045)', offset:.54 }, { opacity:1, transform:'none' }
  ], impact - 135, 440, 'ease-out');
  track('.record-plinth', [
    { opacity:0, transform:'scaleX(.28)' }, { opacity:1, transform:'none' }
  ], impact + 95, 500);

  // The sweep reaches the centre on the same beat that unlocks the score.
  track('.record-sweep', [
    { opacity:0, transform:'translateX(-205px)' }, { opacity:.94, offset:.5, transform:'translateX(0)' },
    { opacity:0, transform:'translateX(205px)' }
  ], impact - 285, 570, 'linear');
  track('.record-impact', [{ opacity:0 }, { opacity:.94, offset:.12 }, { opacity:0 }], impact - 55, 470, 'linear');
  track('.achievement-value', [
    { opacity:0, clipPath:'inset(-12px 100% -12px -12px)', transform:'translateX(-8px) scale(.97)' },
    { opacity:.9, clipPath:'inset(-12px 30% -12px -12px)', transform:'translateX(-2px) scale(1.04)', offset:.24 },
    { opacity:1, clipPath:'inset(-12px)', transform:'scale(1.075)', offset:.54 },
    { opacity:1, clipPath:'inset(-12px)', transform:'none' }
  ], impact - 15, 360, 'ease-out');
  track('.achievement-unit', ACHIEVEMENT_REVEAL, impact + 210, 330);
  track('.achievement-title', [
    { clipPath:'inset(-10px 49%)', opacity:0, transform:'translateY(5px)' },
    { clipPath:'inset(-10px)', opacity:1, transform:'none' }
  ], impact + 245, 605, 'cubic-bezier(.2, .7, .22, 1)');
  track('.record-foil', [
    { opacity:0, transform:'translateX(-65px)' }, { opacity:.45, offset:.5, transform:'translateX(0)' },
    { opacity:0, transform:'translateX(65px)' }
  ], impact + 755, 650, 'linear');

  track('.record-sides, .record-plinth', [
    { opacity:1, transform:'scaleX(1)' }, { opacity:0, transform:'scaleX(.08)' }
  ], exit, ms - exit - 90, 'cubic-bezier(.58, .03, .76, .92)', 'forwards');
  track('.record-rails', [{ opacity:1 }, { opacity:0 }], exit + 60, 390, 'ease-in', 'forwards');
  track('.achievement-copy', [
    { opacity:1, transform:'none' }, { opacity:0, transform:'translateY(-7px)' }
  ], exit + 140, ms - exit - 140, 'ease-in', 'forwards');
}

function playAchievement(host, { record, n, best }, { onImpact, onEnd } = {}) {
  const title = record ? 'Leaderboard Record' : 'Personal Best';
  const format = value => typeof value === 'number' ? value.toLocaleString() : String(value ?? '');
  const score = format(n), unit = Number(n) === 1 ? 'chest' : 'chests';
  const previous = record ? '' : format(best);
  const root = document.createElement('div');
  root.className = 'achievement' + (record ? ' achievement-record' : '');
  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', `${title}, ${score} ${unit}${previous ? ', previous best ' + previous : ''}`);
  root.innerHTML = `<div class="achievement-content">
    ${record ? LEADERBOARD_RECORD_ART : PERSONAL_BEST_ART}
    <div class="achievement-copy">
      ${previous ? '<div class="achievement-previous">Previous <strong></strong></div>' : ''}
      <div class="achievement-score"><span class="achievement-value"></span></div>
      <div class="achievement-unit">${unit}</div>
      <div class="achievement-title">${title}</div>
    </div>
  </div>`;
  const value = root.querySelector('.achievement-value');
  value.textContent = score;
  value.style.setProperty('--digits', Math.max(1, score.length));
  if (previous) root.querySelector('.achievement-previous strong').textContent = previous;
  host.replaceChildren(root);

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const timing = record ? LEADERBOARD_RECORD_TIMING : PERSONAL_BEST_TIMING;
  const ms = reduced ? 2800 : timing.ms;
  const fadeAt = reduced ? ms - 240 : timing.exit + (record ? 185 : 65);
  const animations = [];
  let stopped = false, stopSound;
  const animate = (element, frames, delay, duration, easing = ACHIEVEMENT_EASE, fill = 'both') => {
    const animation = element.animate(frames, { delay, duration, easing, fill });
    animations.push(animation);
    return animation;
  };
  const track = (selector, ...options) => {
    for (const element of root.querySelectorAll(selector)) animate(element, ...options);
  };
  const after = (animation, callback) => animation.finished.then(() => { if (!stopped) callback(); }, () => {});
  const fade = animate(root, [{ opacity:1 }, { opacity:1, offset:fadeAt / ms }, { opacity:0 }], 0, ms, 'linear');

  if (reduced) stopSound = onImpact?.();
  else {
    (record ? animateLeaderboardRecord : animatePersonalBest)(track, timing);
    if (onImpact) {
      // The chime has a 50 ms lead-in. Use the same clock as the artwork.
      const cue = new Animation(new KeyframeEffect(null, [], timing.impact - 50), document.timeline);
      animations.push(cue);
      cue.play();
      after(cue, () => { stopSound = onImpact(); });
    }
  }
  if (onEnd) after(fade, onEnd);
  return {
    stop() {
      stopped = true;
      for (const animation of animations) animation.cancel();
      stopSound?.();
      root.remove();
    }
  };
}
