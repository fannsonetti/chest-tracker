const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TABS = ['settings','party','history','session','leaderboards','career'];
const MODES = ['Solo','Duo','Trio','Squads','All'];
const METRICS = [
  { key:'points', label:'Points', short:'Points', column:'points', sub:'total points' },
  { key:'chests', label:'Most chests', short:'Best', column:'chests', sub:'best match' },
  { key:'streaks', label:'Best streak', short:'Streak', column:'bestStreak', sub:'in a row' },
  { key:'avg', label:'Average', short:'Avg', column:'avg', sub:'per match' },
  { key:'played', label:'Matches', short:'Matches', column:'matches', sub:'played' }
];
const remember = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
const keep = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
let current, capturing = null, keySignature = '', historySignature = '', lobbySignature = '', boardSignature = '', careerSignature = '';
let boardMode = Number(remember('boardMode', 0)) || 0, boardMetric = remember('boardMetric', 'points');

function tab(name) {
  if (!TABS.includes(name)) name = 'settings';
  for (const section of document.querySelectorAll('main > section')) section.hidden = section.id !== name;
  for (const b of document.querySelectorAll('[data-tab]')) {
    b.classList.toggle('active', b.dataset.tab === name);
    b.setAttribute('aria-current', b.dataset.tab === name ? 'page' : 'false');
  }
  document.querySelector('main').scrollTop = 0;
}
for (const b of document.querySelectorAll('[data-tab]')) b.onclick = () => tab(b.dataset.tab);
tab(new URLSearchParams(location.search).get('tab'));
window.api.onOptionsTab(tab);

// ---------- Top bar ----------
$('tbMin').onclick = () => window.api.optionsWindow?.('minimize');
$('tbMax').onclick = () => window.api.optionsWindow?.('maximize');
$('tbClose').onclick = () => window.api.optionsWindow?.('close');
function renderTopbar() {
  const s = current?.s;
  if (!s?.cur) return;
  const cleared = s.cur.ended && s.cur.cleared;
  $('tbGame').textContent = gameLabel(s);
  const seconds = cleared ? 0 : Math.max(0, Math.floor(((s.cur.ended || Date.now()) - s.cur.start) / 1000));
  $('tbClock').textContent = String(Math.floor(seconds / 60)).padStart(2,'0') + ':' + String(seconds % 60).padStart(2,'0') + (cleared ? ' · ready' : s.cur.ended ? ' · ended' : '');
  $('tbClock').classList.toggle('ended', !!s.cur.ended);
}
setInterval(renderTopbar, 1000);

const configure = patch => window.api.configure(patch);
for (const id of ['compact','opacity','recaps','streakPopups','bestPopups','sound','odds','name']) {
  const el = $(id);
  el.addEventListener(el.type === 'range' ? 'input':'change', () => {
    const value = el.type === 'checkbox' ? el.checked : ['range','number'].includes(el.type) ? Number(el.value) : el.value;
    if (id === 'opacity') $('opacityValue').textContent = `${el.value}%`;
    configure({ [id]:value });
  });
}
for (const b of $('countMode').querySelectorAll('button')) b.onclick = () => configure({ countMode:b.dataset.value });
$('testSound').onclick = () => window.playTrackerClick();
$('createRoom').onclick = () => window.api.netHost();
$('refreshLobbies').onclick = () => window.api.browseLobbies();
$('leave').onclick = () => window.api.netLeave();
$('endMatch').onclick = () => window.api.command(current?.s?.cur?.ended ? 'newGame' : 'endMatch');
$('newSession').onclick = () => window.api.command('newSession');
$('quit').onclick = () => window.api.quit();
$('reset').onclick = () => { if (confirm('Reset counts? Your match history will be kept.')) window.api.command('reset'); };

// ---------- Party ----------
let lobbies = { rooms:[], error:'' };
function renderLobbies() {
  const busy = current && current.net.status !== 'off';
  const signature = JSON.stringify([lobbies,busy]);
  if (signature === lobbySignature) return;
  lobbySignature = signature;
  const rows = lobbies.rooms.map((room, i) => `<div class="row lobby"><b>${esc(room.name)}</b>` +
    `<span class="cap"><span>${room.players} / 16 players</span><i style="--fill-pct:${Math.min(100, room.players / 16 * 100)}%"></i></span>` +
    `<button class="ghost" data-room="${i}"${busy || room.players >= 16 ? ' disabled' : ''}>${room.players >= 16 ? 'Full' : 'Join'}</button></div>`).join('');
  $('lobbies').innerHTML = (lobbies.error ? `<p class="error">${esc(lobbies.error)}</p>` : '') +
    `<div class="group">${rows || (lobbies.error ? '' : `<div class="empty">${lobbies.loading ? '<b>Connecting…</b>Reaching the hosted server.' : '<b>No public rooms yet</b>Create a room and your squad can join it here.'}</div>`)}</div>`;
  if (!rows && lobbies.error) $('lobbies').lastChild.remove();
  for (const button of document.querySelectorAll('[data-room]')) button.onclick = () => window.api.netJoin(lobbies.rooms[Number(button.dataset.room)].id);
}
window.api.onLobbies(data => { lobbies = data; renderLobbies(); });
window.api.getLobbies().then(data => { lobbies = data; renderLobbies(); });

// ---------- Updates ----------
function renderUpdate(update) {
  if (!update) return;
  $('update').textContent = update.message;
  $('updateCard').dataset.state = update.state;
  const downloading = update.state === 'downloading';
  $('updateBar').hidden = !downloading;
  $('updateBar').firstChild.style.width = `${downloading ? update.percent || 0 : 0}%`;
}

// ---------- Main render ----------
function render(data) {
  if (!data?.s) return;
  current = data;
  const { s, net, session, keys, keyOk } = data;
  for (const id of ['compact','opacity','recaps','streakPopups','bestPopups','sound','odds','name']) {
    const el = $(id);
    if (document.activeElement === el) continue;
    if (el.type === 'checkbox') el.checked = !!s[id]; else el.value = s[id] ?? '';
  }
  for (const b of $('countMode').querySelectorAll('button')) {
    b.classList.toggle('active', b.dataset.value === s.countMode);
    b.setAttribute('aria-checked', b.dataset.value === s.countMode);
  }
  $('opacityValue').textContent = `${s.opacity}%`;
  if (!$('statToggles').children.length) {
    for (const [key, label, hint] of [['chests','CTG','Chests this game, personal and team.'],['cpm','CPM','Chests per match, over games of 3+ minutes and 5+ chests.'],['token','Token chance','Shared chance of a token, from the odds below.']]) {
      const row = document.createElement('label'); row.className = 'row';
      row.innerHTML = `<span>Show ${esc(label)}<small>${esc(hint)}</small></span><input type="checkbox" class="switch" data-stat="${key}">`;
      row.lastChild.onchange = e => configure({ show:{ [key]:e.target.checked } });
      $('statToggles').appendChild(row);
    }
  }
  for (const el of document.querySelectorAll('[data-stat]')) el.checked = !!s.show[el.dataset.stat];
  const sig = JSON.stringify([s.keys, keyOk]);
  if (sig !== keySignature && !capturing) {
    keySignature = sig;
    $('keys').innerHTML = keys.map(k => `<div class="row"><span>${esc(k.label)}</span><button class="key${s.keys[k.a] ? '' : ' none'}" data-key="${k.a}">${esc(s.keys[k.a] || 'Not set')}</button></div>`).join('');
    for (const b of document.querySelectorAll('[data-key]')) b.onclick = () => {
      cancelCapture(); capturing = b.dataset.key; b.textContent = 'Press a shortcut…'; b.classList.add('wait'); window.api.pauseKeys();
    };
    $('keyError').textContent = keys.filter(k => keyOk[k.a] === false).map(k => `${k.label} is unavailable. Choose another binding.`).join(' ');
  }

  const linked = ['host','client'].includes(net.status), connecting = net.status === 'connecting';
  $('createRoom').disabled = linked || connecting;
  renderLobbies();
  $('leaveRow').hidden = !linked && !connecting;
  $('partyDot').hidden = !linked;
  $('connPill').textContent = linked ? (net.status === 'host' ? 'Hosting' : 'Connected') : connecting ? 'Connecting' : 'Offline';
  $('connPill').className = 'pill' + (linked ? ' on' : connecting ? ' wait' : '');
  $('reset').disabled = net.status !== 'off';
  $('endMatch').disabled = net.status === 'client' || connecting;
  $('endMatch').textContent = s.cur?.ended ? 'New game' : 'End match';
  $('hostNote').textContent = net.status === 'client' ? 'The host ends the match and starts the next one for everyone.' : s.cur?.ended ? 'The match is over. Start a new game when everyone is ready.' : 'End the match to show everyone’s recap. The next game starts on the first chest or New game.';
  $('connection').innerHTML = net.error ? `<p class="error">${esc(net.error)}</p>` : '';
  $('players').innerHTML = linked ? '<h2>In this room</h2><div class="group"><table class="table"><tr><th>Player</th><th>Opened this game</th></tr>' +
    net.players.slice().sort((a,b)=>b.chests-a.chests).map(p => `<tr${p.id === s.id ? ' class="me"' : ''}><td>${esc(p.name)}${p.id === s.id ? '<span class="you">YOU</span>' : ''}</td><td class="num-strong">${p.chests}</td></tr>`).join('') + '</table></div>' : '';
  $('sessionStats').innerHTML = session.map(([label,value]) => `<div class="stat"><span>${esc(label)}</span><b>${esc(value)}</b></div>`).join('');

  const history = JSON.stringify([s.history, s.id]);
  if (history !== historySignature) {
    historySignature = history; boardSignature = '';
    $('historyRows').innerHTML = s.history.length ? '<div class="group"><table class="table history"><tr><th>Match</th><th>Players</th><th>You</th><th>Team</th><th>Recap</th></tr>' +
      s.history.filter(countedMatch).reverse().map(m => `<tr><td class="num-strong">#${m.n}<div class="dimmed">${esc(when(m.end))}</div></td><td class="dimmed">${(m.recap || []).length || 1}</td><td class="num-strong">${m.chests}</td><td>${m.teamChests}</td><td>${awardBadges(m, s.id)}<details><summary>View full recap</summary>${recapDetails({ ...m, start:m.timelineStart || m.start, teamChests:m.recapTeamTotal ?? m.teamChests })}</details></td></tr>`).join('') + '</table></div>'
      : '<div class="group"><div class="empty"><b>No completed matches yet</b>End a match with F8 and it shows up here.</div></div>';
  }
  // Lifetime counts change with every chest, so Your stats has its own signature.
  const career = JSON.stringify([history, s.chests, s.teamChests]);
  if (career !== careerSignature) { careerSignature = career; renderCareer(s.history, s.id, s); }
  // Leaderboards also read games your party shared that you were not in.
  renderLeaderboards(s.history.concat(s.shared || []), s.id);
  renderTopbar();
  renderUpdate(data.update);
  if (data.version) $('version').textContent = `Version ${data.version}`;
}
// Your awards in a saved game: first or last chest, and your best streak.
function awardBadges(m, selfId) {
  const h = matchHighlights(m), mine = id => id && id === selfId;
  const badges = [];
  if (mine(h.first?.id)) badges.push('<span class="badge first">First chest</span>');
  if (mine(h.last?.id)) badges.push('<span class="badge last">Last chest</span>');
  const streak = (m.recap || []).length > 1 ? Number((m.recap || []).find(p => p.id === selfId)?.bestStreak) || 0 : 0;
  if (streak >= MIN_STREAK) badges.push(`<span class="badge streak">Streak ${streak}</span>`);
  if (m.synced) badges.push('<span class="badge synced" title="Filled in from a party member\'s relay-signed result">Synced</span>');
  return badges.length ? `<div class="badges">${badges.join('')}</div>` : '';
}
function when(ts) {
  if (!ts) return '';
  const d = new Date(ts), now = new Date();
  const hm = d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
  return d.toDateString() === now.toDateString() ? 'Today ' + hm : d.toLocaleDateString([], { month:'short', day:'numeric' }) + ' ' + hm;
}
function cancelCapture() {
  if (!capturing) return;
  capturing = null; keySignature = ''; window.api.resumeKeys(); if (current) render(current);
}

// ---------- Leaderboards ----------
const CROWN = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 5l3 2 3-4 3 4 3-2-1.5 7h-9zM4 14h8"/></svg>';
// Points only count relay-signed results. Signatures are checked in the main
// process and cached by signature and signed data.
const proofs = new Map();
let verifying = false;
const proofKey = p => p && typeof p.sig === 'string' && typeof p.data === 'string' ? p.sig + '\n' + p.data : null;
function verifiedResults(history, selfId) {
  const missing = history.map(m => m.proof).filter(p => proofKey(p) && !proofs.has(proofKey(p)));
  if (missing.length && !verifying && window.api.verifyProofs) {
    verifying = true;
    window.api.verifyProofs(missing).then(results => missing.forEach((p, i) => proofs.set(proofKey(p), results?.[i] || null)))
      .catch(() => {}).finally(() => { verifying = false; renderLeaderboards(history, selfId); });
  }
  return match => proofs.get(proofKey(match.proof)) || null;
}
// Points are fractional (0.25 per chest); boards show the nearest whole point.
const cell = (key, value) => key === 'points' ? Math.round(value).toLocaleString() : value;
function renderLeaderboards(history, selfId) {
  const boards = matchLeaderboards(history, verifiedResults(history, selfId));
  // Default to the busiest squad size the first time.
  if (!remember('boardMode', null) && boards.some(b => b.matches)) boardMode = boards.reduce((best, b, i) => b.matches > boards[best].matches ? i : best, 0);
  const board = boards[boardMode] || boards[0];
  const solo = board.size === 1;
  if (solo && boardMetric === 'streaks') boardMetric = 'chests';
  const signature = JSON.stringify([boardMode, boardMetric, selfId, boards]);
  if (signature === boardSignature) return;
  boardSignature = signature;

  $('boardMode').innerHTML = boards.map((b, i) => `<button role="tab" data-mode="${i}" aria-selected="${i === boardMode}" class="${i === boardMode ? 'active' : ''}">${MODES[i]}<small>${b.matches}</small></button>`).join('');
  $('boardMetric').innerHTML = METRICS.map(m => `<button role="radio" data-metric="${m.key}" aria-checked="${m.key === boardMetric}" class="${m.key === boardMetric ? 'active' : ''}"${solo && m.key === 'streaks' ? ' disabled title="Solo lobbies have no streaks"' : ''}>${m.label}</button>`).join('');
  for (const b of $('boardMode').querySelectorAll('button')) b.onclick = () => { boardMode = Number(b.dataset.mode); keep('boardMode', boardMode); renderLeaderboards(history, selfId); };
  for (const b of $('boardMetric').querySelectorAll('button')) b.onclick = () => { boardMetric = b.dataset.metric; keep('boardMetric', boardMetric); renderLeaderboards(history, selfId); };

  const metric = METRICS.find(m => m.key === boardMetric) || METRICS[0];
  const list = board[metric.key];
  const rankOf = p => list.findIndex(q => q[metric.column] === p[metric.column]) + 1;
  const name = p => esc(p.name) + (p.id === selfId ? '<span class="you">YOU</span>' : '');
  if (!list.length) {
    $('podium').innerHTML = '';
    $('leaderboardRows').innerHTML = `<div class="group"><div class="empty"><b>No ${MODES[boardMode].toLowerCase()} records yet</b>${board.matches ? 'Nobody has set this record yet.' : board.size ? `Finish a ${board.size}-player match to set one.` : 'Finish a match to set one.'}</div></div>`;
    return;
  }
  const place = (p, n) => p
    ? `<div class="place p${n}">${n === 1 ? CROWN : ''}<span class="who">${esc(p.id === selfId ? 'You' : p.name)}</span><span class="val">${cell(metric.column, p[metric.column])}</span><span class="sub">${metric.sub}</span><div class="step">${n}</div></div>`
    : `<div class="place p${n} empty-place"><span class="who">Open spot</span><span class="val">–</span><span class="sub">&nbsp;</span><div class="step">${n}</div></div>`;
  $('podium').innerHTML = `<div class="podium">${place(list[1], 2)}${place(list[0], 1)}${place(list[2], 3)}</div><div class="podium-base"></div>`;

  const columns = [['points','Points'], ['chests','Best'], ...(solo ? [] : [['bestStreak','Streak']]), ['avg','Avg'], ['matches','Matches'], ['total','Total']];
  $('leaderboardRows').innerHTML = '<div class="group"><table class="table board"><tr><th>Player</th>' +
    columns.map(([key, label]) => `<th class="${key === metric.column ? 'sorted' : ''}">${label}</th>`).join('') + '</tr>' +
    list.map(p => { const r = rankOf(p); return `<tr${p.id === selfId ? ' class="me"' : ''}><td><span class="rank r${r}">${r}</span>${name(p)}</td>` +
      columns.map(([key]) => `<td class="${key === metric.column ? 'sorted' : 'dimmed'}">${key === 'bestStreak' && !p[key] ? '–' : cell(key, p[key])}</td>`).join('') + '</tr>'; }).join('') +
    '</table></div>';
}

// ---------- Your stats ----------
function renderCareer(history, selfId, s) {
  const c = careerStats(history, selfId);
  const stat = (label, value, hint = '', cls = '') => `<div class="stat ${cls}"><span>${label}</span><b>${value}</b>${hint ? `<small>${hint}</small>` : ''}</div>`;
  // Lifetime counts include the game in progress and everything since the last reset.
  const lifetime = '<h2>Lifetime</h2><div class="summary">' +
    stat('Lifetime chests', s.chests || 0, 'every chest you opened', 'lead') +
    stat('Lifetime team chests', s.teamChests || 0, 'yours plus your teammates’', 'lead') + '</div>';
  if (!c.matches) {
    $('careerRows').innerHTML = lifetime + '<h2>Matches</h2><div class="group"><div class="empty"><b>No matches yet</b>Your totals, bests and recent form appear after your first completed match.</div></div>';
    return;
  }
  let html = lifetime + '<h2>Saved matches</h2><div class="summary">' +
    stat('Chests opened', c.chests, `across ${c.matches} match${c.matches === 1 ? '' : 'es'}`, 'lead') +
    stat('Best match', c.best) + stat('Average', c.avg, 'per match') +
    stat('Best streak', c.streak || '–', 'squad matches') + stat('Per minute', c.perMin || '–') +
    stat('Most opened', c.mvps, 'squad matches led') + stat('Team share', c.share + '%', 'of team chests') + '</div>';

  const recent = c.recent;
  const max = Math.max(1, ...recent.map(m => m.chests));
  const w = 600, h = 140, gap = 6, bw = (w - gap * (recent.length - 1)) / Math.max(recent.length, 1);
  const avgY = h - (recent.reduce((n, m) => n + m.chests, 0) / recent.length) / max * (h - 6);
  const bars = recent.map((m, i) => {
    const bh = Math.max(2, m.chests / max * (h - 6));
    return `<rect class="bar${m.mvp ? ' mvp' : ''}" x="${(i * (bw + gap)).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${Math.min(bw, 44).toFixed(1)}" height="${bh.toFixed(1)}" rx="2"><title>Match #${m.n}: ${m.chests} chests${m.mvp ? ' · most opened' : ''}</title></rect>`;
  }).join('');
  html += `<h2>Recent form</h2><div class="group"><div class="chart"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Chests in your last ${recent.length} matches">${bars}<path class="avg" d="M0 ${avgY.toFixed(1)}H${w}"/></svg></div>` +
    `<div class="chart-legend"><span>Last ${recent.length} match${recent.length === 1 ? '' : 'es'} · dashed line is the average</span><span><i></i>Chests <i class="gold"></i>Most opened</span></div></div>`;

  html += '<h2>By lobby size</h2><div class="group"><table class="table"><tr><th>Mode</th><th>Matches</th><th>Chests</th><th>Best</th><th>Avg</th><th>Streak</th><th>Most opened</th></tr>' +
    c.modes.map(m => `<tr><td>${MODES[m.size - 1]}</td>` + (m.matches
      ? `<td>${m.matches}</td><td class="num-strong">${m.chests}</td><td>${m.best}</td><td>${m.avg}</td><td>${m.size > 1 ? m.streak || '–' : '–'}</td><td>${m.size > 1 ? m.mvps : '–'}</td>`
      : '<td class="dimmed" colspan="6">No matches</td>') + '</tr>').join('') + '</table></div>';
  $('careerRows').innerHTML = html;
}

// ---------- Shortcut capture ----------
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
window.api.onUpdate(renderUpdate);
window.api.getSnapshot().then(render);
