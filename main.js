const { app, BrowserWindow, globalShortcut, screen, ipcMain } = require('electron');
const path = require('path');

// A second launch just exits; the running copy keeps its HUD and party.
if (!app.requestSingleInstanceLock()) { app.exit(0); return; }
let quitting = false;
app.on('before-quit', () => { quitting = true; });

const W = 248;
let win;
let optionsWin;
// Popups are a second HUD-styled overlay that never takes focus. A streak
// popup sits at the top middle of the HUD's screen; a match recap sits in the
// middle. The popup page reports its kind and content size.
// STREAK_TOP is where a pill's panel sits; the window starts `pad` above it
// to leave room for glow and effects (popup.js), never above the screen.
const POPUP_W = 300, STREAK_TOP = 72;
let popupWin, popupReady = false, pendingPopups = [], popupKind = 'recap', popupSize = { w:POPUP_W, h:120 }, popupPad = 0;
const ICON = path.join(__dirname, 'icon.png');
function placePopup(size) {
  if (!popupWin || popupWin.isDestroyed() || !win) return;
  if (size?.kind) popupKind = size.kind;
  if (Number.isFinite(size?.w) && Number.isFinite(size?.h)) popupSize = { w:size.w, h:size.h };
  if (size && 'pad' in size) popupPad = Math.max(0, Math.min(200, Number(size.pad) || 0));
  const { workArea } = screen.getDisplayMatching(win.getBounds());
  const w = Math.max(80, Math.min(workArea.width - 16, Math.ceil(popupSize.w)));
  const h = Math.max(40, Math.min(workArea.height - 16, Math.ceil(popupSize.h)));
  const x = Math.round(workArea.x + (workArea.width - w) / 2);
  const y = popupKind !== 'recap' ? workArea.y + Math.max(0, STREAK_TOP - popupPad) : Math.round(workArea.y + (workArea.height - h) / 2);
  popupWin.setBounds({ x, y, width:w, height:h });
}
function openPopup(item) {
  if (popupWin && !popupWin.isDestroyed()) {
    if (popupReady) popupWin.webContents.send('popup', item); else pendingPopups.push(item);
    // A hidden popup is shown once the page reports its new size and kind.
    if (popupWin.isVisible()) popupWin.setAlwaysOnTop(true, 'screen-saver');
    return;
  }
  pendingPopups = [item]; popupReady = false; popupKind = item.kind;
  popupWin = new BrowserWindow({ icon:ICON, width:POPUP_W, height:120, show:false,
    frame:false, transparent:true, alwaysOnTop:true, resizable:false, focusable:false,
    skipTaskbar:true, hasShadow:false, title:'Chest Tracker · Popup',
    // Keep timers running while hidden, so a popup queued behind another one
    // still shows on time.
    webPreferences:{ preload:path.join(__dirname,'preload.js'), contextIsolation:true, nodeIntegration:false, spellcheck:false, backgroundThrottling:false, autoplayPolicy:'no-user-gesture-required' } });
  popupWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen:true });
  popupWin.loadFile(path.join(__dirname, 'popup.html'));
  popupWin.on('closed', () => { popupWin = null; popupReady = false; pendingPopups = []; });
}
const fromPopup = event => event.sender === popupWin?.webContents;
ipcMain.on('showPopup', (event, item) => { if (event.sender === win?.webContents && item && typeof item === 'object') openPopup(item); });
ipcMain.handle('getPopups', event => {
  if (!fromPopup(event)) return [];
  popupReady = true; const items = pendingPopups; pendingPopups = []; return items;
});
ipcMain.on('popupResize', (event, size) => {
  if (!fromPopup(event) || !size || typeof size !== 'object') return;
  placePopup(size);
  // The streak pill shows mid-game: let the mouse pass through it so hovering
  // never pulls focus from the game. Recaps show after a game and stay clickable.
  popupWin.setIgnoreMouseEvents(popupKind !== 'recap');
  if (!popupWin.isVisible()) { popupWin.setAlwaysOnTop(true, 'screen-saver'); popupWin.showInactive(); }
});
ipcMain.on('closePopup', event => { if (fromPopup(event)) popupWin.hide(); });
// The HUD zeroes the ended game once its recap has finished showing.
ipcMain.on('recapDone', event => { if (fromPopup(event)) toUI('recapDone'); });
let snapshot = null;
let updateStatus = { state:'checking', message:'Checking for updates…' };
// The options window is built hidden shortly after boot and only hidden when
// closed, so opening it is instant instead of a fresh page load each time.
function buildOptions(tab = 'settings') {
  // Frameless: options.html draws its own MiniHUD-style top bar.
  optionsWin = new BrowserWindow({ icon:ICON, width:900, height:760, minWidth:680, minHeight:560, show:false, frame:false,
    title:'Chest Tracker · Options', backgroundColor:'#0c0d10', autoHideMenuBar:true,
    webPreferences:{ preload:path.join(__dirname, 'preload.js'), contextIsolation:true, nodeIntegration:false, spellcheck:false, autoplayPolicy:'no-user-gesture-required' } });
  optionsWin.loadFile(path.join(__dirname, 'options.html'), { query:{ tab } });
  optionsWin.on('close', e => { if (!quitting) { e.preventDefault(); optionsWin.hide(); } });
  optionsWin.on('hide', () => registerKeys());
  optionsWin.on('closed', () => { optionsWin = null; registerKeys(); });
}
function openOptions(tab = 'settings') {
  if (!optionsWin || optionsWin.isDestroyed()) buildOptions(tab);
  const w = optionsWin;
  const reveal = () => { if (w.isDestroyed()) return; w.webContents.send('optionsTab', tab); w.show(); w.focus(); };
  if (w.webContents.isLoading()) w.webContents.once('did-finish-load', reveal); else reveal();
}
ipcMain.on('openOptions', (_, tab) => openOptions(tab));
ipcMain.on('optionsWindow', (event, action) => {
  const w = optionsWin;
  if (!w || w.isDestroyed() || event.sender !== w.webContents) return;
  if (action === 'minimize') w.minimize();
  else if (action === 'maximize') w.isMaximized() ? w.unmaximize() : w.maximize();
  else if (action === 'close') w.close();
});
// While a game is in progress the MiniHUD ignores the mouse entirely, so the
// cursor passes through to the game instead of hovering the overlay.
ipcMain.on('clickThrough', (event, on) => { if (event.sender === win?.webContents) win.setIgnoreMouseEvents(on === true); });
// Updates install only while nothing is at stake: not in a party and no count
// change for a few minutes.
let lastCounts = null, lastCountChange = Date.now();
const IDLE_MS = 3 * 60 * 1000;
const updateIdle = () => snapshot?.net?.status === 'off' && Date.now() - lastCountChange > IDLE_MS;
ipcMain.on('snapshot', (_, data) => {
  const counts = JSON.stringify([data?.s?.chests, data?.s?.teamChests, data?.s?.cur?.chests, data?.s?.cur?.teamChests]);
  if (lastCounts !== null && counts !== lastCounts) lastCountChange = Date.now();
  lastCounts = counts;
  snapshot = data;
  if (optionsWin && !optionsWin.isDestroyed()) optionsWin.webContents.send('snapshot', data);
});
ipcMain.handle('getSnapshot', () => ({ ...snapshot, update:updateStatus, version:app.getVersion() }));
ipcMain.on('configure', (_, data) => toUI('configure', data));
ipcMain.on('command', (_, data) => toUI('command', data));

// The HUD reopens where you last dragged it, if that spot is still on a screen.
const hudFile = () => path.join(app.getPath('userData'), 'hud-position.json');
function savedHudBounds() {
  try {
    const b = JSON.parse(require('fs').readFileSync(hudFile(), 'utf8'));
    if (![b.x, b.y, b.width].every(Number.isFinite)) return null;
    const { workArea:a } = screen.getDisplayMatching({ x:b.x, y:b.y, width:b.width, height:40 });
    const visible = b.x + b.width > a.x + 20 && b.x < a.x + a.width - 20 && b.y >= a.y - 10 && b.y < a.y + a.height - 20;
    return visible ? b : null;
  } catch { return null; }
}
function create() {
  const { workArea } = screen.getPrimaryDisplay();
  const saved = savedHudBounds();
  win = new BrowserWindow({
    icon: ICON, width: saved?.width || W, height: 200,
    x: saved ? saved.x : workArea.x + workArea.width - W - 12, y: saved ? saved.y : workArea.y + 12,
    frame: false, transparent: true, alwaysOnTop: true, resizable: false, show: false,
    // Never take focus: clicking the HUD mid-game must not pull focus from the game.
    focusable: false, skipTaskbar: true, hasShadow: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), spellcheck:false, backgroundThrottling:false, autoplayPolicy:'no-user-gesture-required' }
  });
  // Show once painted (no empty transparent frame), without taking focus.
  win.once('ready-to-show', () => { win.showInactive(); pinOnTop(); });
  // Width is saved too, so the edge the HUD grows from lands in the same place.
  win.on('moved', () => {
    const { x, y, width } = win.getBounds();
    try { require('fs').writeFileSync(hudFile(), JSON.stringify({ x, y, width })); } catch {}
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
// Holding a key counts once: auto-repeats are dropped, so every chest needs
// its own press.
let keys = {};
const holds = new (require('./match').HoldFilter)();
function registerKeys() {
  globalShortcut.unregisterAll();
  const result = {};
  for (const [action, accel] of Object.entries(keys)) {
    if (!accel) { result[action] = true; continue; }
    try { result[action] = globalShortcut.register(accel, () => holds.press(action, () => toUI('action', action))); }
    catch (e) { result[action] = false; }
  }
  return result;
}
ipcMain.handle('setKeys', (_, k) => { keys = Object.assign({}, k); return registerKeys(); });
ipcMain.on('pauseKeys', () => globalShortcut.unregisterAll());
ipcMain.on('resumeKeys', () => registerKeys());

// All squad traffic and public lobby discovery use the fixed hosted server.
// Loaded on first use so `ws` stays off the startup path.
let lobbySnapshot = { rooms:[], error:'' };
let hostedConnection = null;
const hosted = new Proxy({}, { get:(_, key) => {
  if (!hostedConnection) hostedConnection = makeHosted();
  const value = hostedConnection[key];
  return typeof value === 'function' ? value.bind(hostedConnection) : value;
} });
const makeHosted = () => new (require('./hosted-connection').HostedConnection)({
  onNet:data => toUI('net', data),
  onLobbies:data => {
    lobbySnapshot = data;
    if (optionsWin && !optionsWin.isDestroyed()) optionsWin.webContents.send('lobbies', data);
  },
  onMatchEnd:data => toUI('matchEnd', data),
  onMatchStart:data => toUI('matchStart', data),
  onShared:data => toUI('shared', data)
});
// Leaderboard points only count relay-signed results; returns each signed
// result, or null where the signature does not check out.
ipcMain.handle('verifyProofs', (_, proofs) => Array.isArray(proofs) ? proofs.slice(0, 1000).map(p => require('./proof').verifyResult(p)) : []);
ipcMain.handle('getLobbies', () => { hosted.browse(); return lobbySnapshot; });
ipcMain.on('browseLobbies', () => hosted.browse());
ipcMain.on('netState', (_, p) => hosted.state(p));
ipcMain.on('netHost', () => hosted.create());
ipcMain.on('netJoin', (_, id) => hosted.join(id));
ipcMain.on('netLeave', () => hosted.leave());
ipcMain.on('netKick', (_, id) => hosted.kick(id));
ipcMain.on('netEndMatch', () => hosted.endMatch());
ipcMain.on('netNewMatch', (_, opened) => hosted.newMatch(opened === true));
ipcMain.on('netShare', (_, proofs) => hosted.share(proofs));

app.whenReady().then(() => {
  create();
  win.webContents.once('did-finish-load', () => {
    const launchedAt = Date.now();
    require('./updater').startUpdater(app, data => {
      updateStatus = data; toUI('update', data);
      if (optionsWin && !optionsWin.isDestroyed()) optionsWin.webContents.send('update', data);
    }, () => snapshot?.net?.status === 'off' && (lastCountChange <= launchedAt || updateIdle()));
    setTimeout(() => { if (!optionsWin) buildOptions(); }, 2500);
  });
});
app.on('will-quit', () => { globalShortcut.unregisterAll(); hostedConnection?.close(); });
app.on('window-all-closed', () => app.quit());
