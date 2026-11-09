function renderRecap(match) {
  if (!match) return;
  document.getElementById('matchLabel').textContent = match.n ? 'Match ' + match.n + ' complete' : 'Match complete';
  document.getElementById('total').textContent = match.teamChests;
  const summary = document.getElementById('summary');
  summary.innerHTML = recapDetails(match);
  window.scrollTo(0,0);
}
document.getElementById('close').onclick = () => window.api.closeRecap();
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' || (e.key === 'Enter' && e.target === document.body)) window.api.closeRecap();
});
window.api.onRecap(renderRecap);
window.api.getRecap().then(renderRecap);
