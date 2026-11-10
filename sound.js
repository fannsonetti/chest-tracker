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
  window.playTrackerClick = () => {
    const list = warm();
    const audio = list[next++ % list.length];
    audio.currentTime = 0;
    audio.play().catch(error => console.warn('Could not play chest click:', error.message));
  };
})();
