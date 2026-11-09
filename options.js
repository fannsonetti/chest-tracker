const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let current, capturing = null, keySignature = '', historySignature = '', lobbySignature = '';
function tab(name) {
  if (!['settings','party','history','session','leaderboards'].includes(name)) name = 'settings';
  for (const section of document.querySelectorAll('main > section')) section.hidden = section.id !== name;
  for (const b of document.querySelectorAll('[data-tab]')) b.classList.toggle('active', b.dataset.tab === name);
}
for (const b of document.querySelectorAll('[data-tab]')) b.onclick = () => tab(b.dataset.tab);
tab(new URLSearchParams(location.search).get('tab'));
window.api.onOptionsTab(tab);
const configure = patch => window.api.configure(patch);
for (const id of ['countMode','compact','opacity','recaps','sound','odds','name']) {
  const el = $(id);
  el.addEventListener(el.type === 'range' ? 'input':'change', () => {
    const value = el.type === 'checkbox' ? el.checked : ['range','number'].includes(el.type) ? Number(el.value) : el.value;
    configure({ [id]:value });
  });
}
$('testSound').onclick = () => window.playTrackerClick();
$('createRoom').onclick = () => window.api.netHost();
$('refreshLobbies').onclick = () => window.api.browseLobbies();
let lobbies = { rooms:[], error:'' };
function renderLobbies() {
  const busy = current && current.net.status !== 'off';
  const signature = JSON.stringify([lobbies,busy]);
  if (signature === lobbySignature) return;
  lobbySignature = signature;
  $('lobbies').innerHTML = (lobbies.error ? '<p class="error">' + esc(lobbies.error) + '</p>' : '') +
    (lobbies.rooms.length ? lobbies.rooms.map((room, i) => '<div class="setting"><span>' + esc(room.name) + '<small>' + room.players + ' / 16 players</small></span><button data-room="' + i + '"' + (busy || room.players >= 16 ? ' disabled' : '') + '>Join</button></div>').join('') : lobbies.error ? '' : '<p class="status">' + (lobbies.loading ? 'Connecting to the hosted server…' : 'No public rooms yet. Create a room to start your squad.') + '</p>');
  for (const button of document.querySelectorAll('[data-room]')) button.onclick = () => window.api.netJoin(lobbies.rooms[Number(button.dataset.room)].id);
}
window.api.onLobbies(data => { lobbies = data; renderLobbies(); });
window.api.getLobbies().then(data => { lobbies = data; renderLobbies(); });
$('leave').onclick = () => window.api.netLeave();
$('endMatch').onclick = () => window.api.command('endMatch');
$('newSession').onclick = () => window.api.command('newSession');
$('quit').onclick = () => window.api.quit();
$('reset').onclick = () => { if (confirm('Reset counts? Your match history will be kept.')) window.api.command('reset'); };

function render(data) {
  if (!data?.s) return;
  current = data;
  const { s, net, session, keys, keyOk } = data;
  for (const id of ['countMode','compact','opacity','recaps','sound','odds','name']) {
    const el = $(id);
    if (document.activeElement === el) continue;
    if (el.type === 'checkbox') el.checked = !!s[id]; else el.value = s[id] ?? '';
  }
  $('opacityValue').textContent = `${s.opacity}%`;
  if (!$('statToggles').children.length) {
    for (const [key, label] of [['chests','CTG'],['cpm','CPM'],['token','Token chance']]) {
      const row = document.createElement('label'); row.className = 'setting';
      row.innerHTML = `<span>${label}</span><input type="checkbox" data-stat="${key}">`;
      row.lastChild.onchange = e => configure({ show:{ [key]:e.target.checked } });
      $('statToggles').appendChild(row);
    }
  }
  for (const el of document.querySelectorAll('[data-stat]')) el.checked = !!s.show[el.dataset.stat];
  const sig = JSON.stringify([s.keys, keyOk]);
  if (sig !== keySignature && !capturing) {
    keySignature = sig;
    $('keys').innerHTML = keys.map(k => `<div class="setting"><span>${esc(k.label)}</span><button class="key" data-key="${k.a}">${esc(s.keys[k.a] || 'None')}</button></div>`).join('');
    for (const b of document.querySelectorAll('[data-key]')) b.onclick = () => {
      cancelCapture(); capturing = b.dataset.key; b.textContent = 'Press a shortcut…'; b.classList.add('wait'); window.api.pauseKeys();
    };
    $('keyError').textContent = keys.filter(k => keyOk[k.a] === false).map(k => `${k.label} is unavailable. Choose another binding.`).join(' ');
  }
  const linked = ['host','client'].includes(net.status), connecting = net.status === 'connecting';
  $('createRoom').disabled = linked || connecting;
  renderLobbies();
  $('leave').hidden = !linked && !connecting;
  $('reset').disabled = net.status !== 'off';
  $('endMatch').disabled = net.status === 'client' || connecting;
  $('hostNote').textContent = net.status === 'client' ? 'The host ends the match for everyone.' : 'End the match to show everyone’s recap and start the next match.';
  $('connection').innerHTML = (net.error ? `<p class="error">${esc(net.error)}</p>` : '') +
    (linked ? `<p>${net.status === 'host' ? 'You are hosting':'Connected'} · Hosted server</p>` : connecting ? '<p>Connecting…</p>' : '<p class="status">Disconnected</p>');
  $('players').innerHTML = linked ? '<table><tr><th>Player</th><th>Opened</th></tr>' + net.players.map(p => `<tr><td>${esc(p.name)}</td><td>${p.chests}</td></tr>`).join('') + '</table>' : '';
  $('sessionStats').innerHTML = session.map(([label,value]) => `<div class="stat"><span>${esc(label)}</span><b>${esc(value)}</b></div>`).join('');
  const history = JSON.stringify(s.history);
  if (history !== historySignature) {
    historySignature = history;
    renderLeaderboards(s.history);
    $('historyRows').innerHTML = s.history.length ? '<table><tr><th>Match</th><th>Personal</th><th>Team</th><th>Recap</th></tr>' + s.history.slice().reverse().map(m => `<tr><td>${m.n}</td><td>${m.chests}</td><td>${m.teamChests}</td><td>${'<details><summary>View full recap</summary>' + recapDetails({ ...m, start:m.timelineStart || m.start, teamChests:m.recapTeamTotal ?? m.teamChests }) + '</details>'}</td></tr>`).join('') + '</table>' : '<p>No completed matches yet.</p>';
  }
  if (data.update) $('update').textContent = data.update.message;
  if (data.version) $('version').textContent = `Chest Tracker ${data.version}`;
}
function cancelCapture() {
  if (!capturing) return;
  capturing = null; keySignature = ''; window.api.resumeKeys(); if (current) render(current);
}
function renderLeaderboards(history) {
  const list = (players, metric) => players.length ? '<div class="board-list">' + players.map(p => {
    const rank = players.findIndex(q => q[metric] === p[metric]) + 1;
    return `<div class="board-row"><span class="rank">${rank}</span><span class="player">${esc(p.name)}</span><b>${p[metric]}</b></div>`;
  }).join('') + '</div>' : '<p class="empty-record">No records yet. Complete a match to set one.</p>';
  $('leaderboardRows').innerHTML = matchLeaderboards(history).map(board => `<article><div class="board-heading"><h2>${['Solo','Duo','Trio','Squads'][board.size-1]}</h2><span class="badge">${board.size} PLAYER${board.size > 1 ? 'S' : ''}</span></div><h3 class="board-label">Most chests · single match</h3>${list(board.chests,'chests')}<h3 class="board-label">Best opening streak</h3>${board.size === 1 ? '<p class="empty-record">Unavailable in solo lobbies. Join another player to start a streak.</p>' : list(board.streaks,'bestStreak')}</article>`).join('');
}
window.addEventListener('blur', cancelCapture);
document.addEventListener('keydown', e => {
  if (!capturing) return;
  e.preventDefault();
  if (e.key === 'Escape') return cancelCapture();
  let key;
  if (['Backspace','Delete'].includes(e.key)) key = '';
  else {
    const code = e.code;
    let base = /^Key[A-Z]$/.test(code) ? code.slice(3) : /^Digit\d$/.test(code) ? code.slice(5) : /^F\d{1,2}$/.test(code) ? code : /^Numpad\d$/.test(code) ? 'num' + code.slice(6) :
      ({NumpadAdd:'numadd',NumpadSubtract:'numsub',NumpadMultiply:'nummult',NumpadDivide:'numdiv',NumpadDecimal:'numdec',Space:'Space',Home:'Home',End:'End',PageUp:'PageUp',PageDown:'PageDown',ArrowUp:'Up',ArrowDown:'Down',ArrowLeft:'Left',ArrowRight:'Right',Insert:'Insert',Minus:'-',Equal:'='})[code];
    if (!base) return;
    key = [e.ctrlKey && 'Ctrl',e.altKey && 'Alt',e.shiftKey && 'Shift',e.metaKey && 'Super',base].filter(Boolean).join('+');
  }
  const patch = { [capturing]:key };
  for (const [action,value] of Object.entries(current.s.keys)) if (action !== capturing && value === key && key) patch[action] = '';
  configure({ keys:patch }); cancelCapture();
});
window.api.onSnapshot(render);
window.api.onUpdate(data => { $('update').textContent = data.message; });
window.api.getSnapshot().then(render);
