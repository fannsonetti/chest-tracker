(() => {
  const clicks = Array.from({length:6}, () => {
    const audio = new Audio('click.wav');
    audio.preload = 'auto'; audio.volume = 0.65;
    return audio;
  });
  let next = 0;
  window.playTrackerClick = () => {
    const audio = clicks[next++ % clicks.length];
    audio.currentTime = 0;
    audio.play().catch(error => console.warn('Could not play chest click:', error.message));
  };
})();
