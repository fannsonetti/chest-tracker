const { app, BrowserWindow, globalShortcut, screen, ipcMain } = require('electron');
const path = require('path');
const net = require('net');
const os = require('os');

const W = 248;
const PORT = 47800;
let win;
let optionsWin;
let snapshot = null;
let updateStatus = { state:'checking', message:'Checking for updates…' };
function openOptions(tab = 'settings') {
  if (optionsWin && !optionsWin.isDestroyed()) {
    optionsWin.show(); optionsWin.focus(); optionsWin.webContents.send('optionsTab', tab); return;
  }
  optionsWin = new BrowserWindow({ width:820, height:760, minWidth:640, minHeight:580,
    title:'Chest Tracker · Options', backgroundColor:'#101217', autoHideMenuBar:true,
    webPreferences:{ preload:path.join(__dirname, 'preload.js'), contextIsolation:true, nodeIntegration:false } });
  optionsWin.loadFile(path.join(__dirname, 'options.html'), { query:{ tab } });
  optionsWin.on('closed', () => { optionsWin = null; registerKeys(); });
}
ipcMain.on('openOptions', (_, tab) => openOptions(tab));
ipcMain.on('snapshot', (_, data) => {
  snapshot = data;
  if (optionsWin && !optionsWin.isDestroyed()) optionsWin.webContents.send('snapshot', data);
});
ipcMain.handle('getSnapshot', () => ({ ...snapshot, update:updateStatus, version:app.getVersion() }));
ipcMain.on('configure', (_, data) => toUI('configure', data));
ipcMain.on('command', (_, data) => toUI('command', data));

function create() {
  const { workArea } = screen.getPrimaryDisplay();
  win = new BrowserWindow({
    width: W, height: 200,
    x: workArea.x + workArea.width - W - 12, y: workArea.y + 12,
    frame: false, transparent: true, alwaysOnTop: true, resizable: false,
    skipTaskbar: true, hasShadow: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  });
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  pinOnTop();
  // Some games and apps grab the topmost slot when focused; take it back.
  win.on('blur', pinOnTop);
  setInterval(pinOnTop, 3000);
  win.loadFile(path.join(__dirname, 'index.html'));
}
function pinOnTop() {
  if (!win || win.isDestroyed()) return;
  win.setAlwaysOnTop(true, 'screen-saver');
  win.moveTop();
}

const toUI = (ch, data) => { if (win && !win.isDestroyed()) win.webContents.send(ch, data); };

// Resize to fit content. Keep the edge nearest the screen side fixed,
// so the overlay grows/shrinks away from the corner it sits in.
ipcMain.on('resize', (_, size) => {
  if (!win) return;
  const w = Math.max(60, Math.ceil(size.w)), h = Math.max(30, Math.ceil(size.h));
  const b = win.getBounds();
  if (b.width === w && b.height === h) return;
  const { workArea } = screen.getDisplayMatching(b);
  const anchorRight = b.x + b.width / 2 > workArea.x + workArea.width / 2;
  win.setBounds({ x: anchorRight ? b.x + b.width - w : b.x, y: b.y, width: w, height: h });
});
ipcMain.on('quit', () => app.quit());

// ---------- Global hotkeys (work while the game is focused) ----------
let keys = {};
function registerKeys() {
  globalShortcut.unregisterAll();
  const result = {};
  for (const [action, accel] of Object.entries(keys)) {
    if (!accel) { result[action] = true; continue; }
    try { result[action] = globalShortcut.register(accel, () => toUI('action', action)); }
    catch (e) { result[action] = false; }
  }
  return result;
}
ipcMain.handle('setKeys', (_, k) => { keys = Object.assign({}, k); return registerKeys(); });
ipcMain.on('pauseKeys', () => globalShortcut.unregisterAll());
ipcMain.on('resumeKeys', () => registerKeys());

// ---------- Party link: one player hosts, others join by IP ----------
// Newline-delimited JSON over TCP. Host relays the full roster to everyone.
let mode = null;            // null | 'host' | 'client'
let server = null, sock = null;
const peers = new Map();    // host: socket -> player
const { OpeningStreaks } = require('./match');
const streaks = new OpeningStreaks();
let matchEndedAt = 0;
let me = { id: '', name: '', chests: 0, teamChests: 0 };

const cleanPlayer = (p) => ({
  id: String((p && p.id) || '').slice(0, 32),
  name: String((p && p.name) || 'Player').slice(0, 20),
  chests: Math.max(0, Math.min(9999, Math.floor(+(p && p.chests) || 0))),
  teamChests: Math.max(0, Math.min(9999, Math.floor(+(p && p.teamChests) || 0))),
  matchStart: Math.max(0, Number(p && p.matchStart) || 0),
  streak: Math.max(0, Math.min(99999, Math.floor(+(p && p.streak) || 0))),
  bestStreak: Math.max(0, Math.min(99999, Math.floor(+(p && p.bestStreak) || 0))),
});

function lineReader(socket, onMsg) {
  let buf = '';
  socket.setEncoding('utf8');
  socket.on('data', (d) => {
    buf += d;
    if (buf.length > 65536) return socket.destroy();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      try { onMsg(JSON.parse(line)); } catch (e) {}
    }
  });
}
const write = (socket, msg) => { try { socket.write(JSON.stringify(msg) + '\n'); } catch (e) {} };

let relay = null, relayRole = null;
function relaySend(msg) { if (relay && relay.readyState === 1) relay.send(JSON.stringify(msg)); }
ipcMain.on('relayConnect', (_, config) => {
  leave();
  let url;
  try { url = new URL(config.url); } catch { return toUI('net', { status:'off', error:'Enter a valid relay URL.' }); }
  const directServer = ['85.220.66.209', '192.168.0.57'].includes(url.hostname) && url.port === '47800';
  if (url.protocol !== 'wss:' && !(url.protocol === 'ws:' && (directServer || ['localhost', '127.0.0.1'].includes(url.hostname))))
    return toUI('net', { status:'off', error:'Use the default server or a wss:// relay URL.' });
  const WebSocket = require('ws');
  const connection = relay = new WebSocket(url.href, { handshakeTimeout:8000, maxPayload:65536 });
  toUI('net', { status:'connecting', players:[] });
  connection.on('open', () => relaySend({ t:config.create ? 'create' : 'join', code:config.code, p:me }));
  connection.on('message', raw => {
    if (relay !== connection) return;
    try {
      const msg = JSON.parse(raw);
      if (msg.t === 'roster') {
        relayRole = msg.role; mode = msg.role;
        toUI('net', { status:mode, players:msg.players.map(cleanPlayer), code:msg.code, hosted:true });
      } else if (msg.t === 'matchEnd') toUI('matchEnd', msg);
      else if (msg.t === 'error') leave(msg.error);
    } catch {}
  });
  connection.on('error', () => { if (relay === connection) leave('Could not connect to the relay.'); });
  connection.on('close', () => { if (relay === connection) leave('The hosted party closed.'); });
});
ipcMain.on('netEndMatch', () => {
  if (mode !== 'host') return;
  if (relay) return relaySend({ t:'endMatch' });
  if (Date.now() - matchEndedAt < 1500) return;
  const msg = { t:'matchEnd', id:require('crypto').randomUUID(), end:Date.now(), players:streaks.recap([me, ...peers.values()]) };
  matchEndedAt = msg.end;
  for (const c of peers.keys()) write(c, msg);
  me = { ...me, chests:0, teamChests:0, matchStart:msg.end };
  for (const [c,p] of peers) peers.set(c, { ...p, chests:0, teamChests:0, matchStart:msg.end });
  streaks.reset();
  for (const p of [me,...peers.values()]) streaks.observe(p.id, 0);
  toUI('matchEnd', msg);
});

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces()))
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  return out;
}

function broadcastRoster() {
  const players = streaks.live([me, ...peers.values()]);
  for (const s of peers.keys()) write(s, { t: 'roster', players });
  toUI('net', { status: 'host', players, addresses: lanAddresses(), port: PORT });
}

function leave(reason) {
  streaks.reset(); matchEndedAt = 0;
  if (relay) { const old = relay; relay = null; old.close(); relayRole = null; }
  if (server) { for (const s of peers.keys()) s.destroy(); server.close(); server = null; }
  if (sock) { sock.removeAllListeners('close'); sock.destroy(); sock = null; }
  peers.clear();
  mode = null;
  toUI('net', { status: 'off', players: [], error: reason || '' });
}

ipcMain.on('netState', (_, p) => {
  me = cleanPlayer(p);
  if (relay) { relaySend({ t:'state', p:me }); return; }
  if (mode === 'host') { streaks.observe(me.id, me.chests); broadcastRoster(); }
  else if (mode === 'client' && sock) write(sock, { t: 'state', p: me });
});

ipcMain.on('netHost', () => {
  leave();
  server = net.createServer((c) => {
    if (peers.size >= 15) return c.destroy();
    c.on('error', () => {});
    c.on('close', () => { if (peers.delete(c)) broadcastRoster(); });
    lineReader(c, (msg) => {
      if (msg && msg.t === 'state') {
        const p = cleanPlayer(msg.p), previous = peers.get(c);
        if (previous) p.id = previous.id;
        else if (!p.id || p.id === me.id || [...peers.values()].some(q => q.id === p.id)) return c.destroy();
        if (matchEndedAt && p.matchStart < matchEndedAt) return;
        streaks.observe(p.id, p.chests);
        peers.set(c, p); broadcastRoster();
      }
    });
  });
  server.on('error', (e) => leave(e.code === 'EADDRINUSE' ? 'Port ' + PORT + ' is already in use' : 'Could not host: ' + e.code));
  server.listen(PORT, () => { mode = 'host'; streaks.observe(me.id, me.chests); broadcastRoster(); });
});

ipcMain.on('netJoin', (_, addr) => {
  leave();
  const m = String(addr || '').trim().match(/^([^\s:]+)(?::(\d{1,5}))?$/);
  if (!m) return toUI('net', { status: 'off', players: [], error: 'Enter the host address, e.g. 192.168.1.20' });
  const host = m[1], port = +(m[2] || PORT);
  toUI('net', { status: 'connecting', players: [] });
  sock = net.connect({ host, port });
  sock.setTimeout(6000);
  sock.on('timeout', () => { if (mode !== 'client') leave('No answer from ' + host); });
  sock.on('connect', () => { sock.setTimeout(0); mode = 'client'; write(sock, { t: 'state', p: me }); });
  sock.on('error', (e) => { if (mode !== 'client') leave('Could not reach ' + host + (e.code ? ' (' + e.code + ')' : '')); });
  sock.on('close', () => { sock = null; leave(mode === 'client' ? 'Host closed the party' : undefined); });
  lineReader(sock, (msg) => {
    if (msg && msg.t === 'matchEnd') toUI('matchEnd', msg);
    if (msg && msg.t === 'roster' && Array.isArray(msg.players))
      toUI('net', { status: 'client', host, players: msg.players.slice(0, 16).map(cleanPlayer) });
  });
});

ipcMain.on('netLeave', () => leave());

app.whenReady().then(() => {
  create();
  win.webContents.once('did-finish-load', () => {
    const initialCounts = snapshot?.s?.chests;
    require('./updater').startUpdater(app, data => {
      updateStatus = data; toUI('update', data);
      if (optionsWin && !optionsWin.isDestroyed()) optionsWin.webContents.send('update', data);
    }, () => snapshot?.net?.status === 'off' && snapshot?.s?.chests === initialCounts);
  });
});
app.on('will-quit', () => { globalShortcut.unregisterAll(); leave(); });
app.on('window-all-closed', () => app.quit());
