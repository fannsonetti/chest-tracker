const { app, BrowserWindow, globalShortcut, screen, ipcMain } = require('electron');
const path = require('path');

const W = 248;
let win;
let optionsWin;
// Popups (match recap, streak broken) are a second HUD-styled overlay docked
// under the MiniHUD (or above it when there is no room). They never take focus.
const POPUP_W = 272, POPUP_GAP = 8;
let popupWin, popupReady = false, popupAbove = false, pendingPopups = [];
function placePopup(height) {
  if (!popupWin || popupWin.isDestroyed() || !win) return;
  const hud = win.getBounds();
  const { workArea } = screen.getDisplayMatching(hud);
  const h = Math.max(40, Math.min(workArea.height - 16, Math.ceil(height || popupWin.getBounds().height)));
  const anchorRight = hud.x + hud.width / 2 > workArea.x + workArea.width / 2;
  let x = anchorRight ? hud.x + hud.width - POPUP_W : hud.x;
  x = Math.max(workArea.x + 4, Math.min(workArea.x + workArea.width - POPUP_W - 4, x));
  popupAbove = hud.y + hud.height + POPUP_GAP + h > workArea.y + workArea.height;
  const y = popupAbove ? Math.max(workArea.y, hud.y - POPUP_GAP - h) : hud.y + hud.height + POPUP_GAP;
  popupWin.setBounds({ x, y, width:POPUP_W, height:h });
}
function openPopup(item) {
  if (popupWin && !popupWin.isDestroyed()) {
    if (popupReady) popupWin.webContents.send('popup', item); else pendingPopups.push(item);
    placePopup(); if (!popupWin.isVisible()) popupWin.showInactive();
    popupWin.setAlwaysOnTop(true, 'screen-saver');
    return;
  }
  pendingPopups = [item]; popupReady = false;
  popupWin = new BrowserWindow({ width:POPUP_W, height:120, show:false,
    frame:false, transparent:true, alwaysOnTop:true, resizable:false, focusable:false,
    skipTaskbar:true, hasShadow:false, title:'Chest Tracker · Popup',
    webPreferences:{ preload:path.join(__dirname,'preload.js'), contextIsolation:true, nodeIntegration:false } });
  popupWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen:true });
  popupWin.loadFile(path.join(__dirname, 'popup.html'));
  popupWin.once('ready-to-show', () => {
    if (!popupWin || popupWin.isDestroyed()) return;
    placePopup(); popupWin.setAlwaysOnTop(true, 'screen-saver'); popupWin.showInactive();
  });
  popupWin.on('closed', () => { popupWin = null; popupReady = false; pendingPopups = []; });
}
const fromPopup = event => event.sender === popupWin?.webContents;
ipcMain.on('showPopup', (event, item) => { if (event.sender === win?.webContents && item && typeof item === 'object') openPopup(item); });
ipcMain.handle('getPopups', event => {
  if (!fromPopup(event)) return [];
  popupReady = true; const items = pendingPopups; pendingPopups = []; return items;
});
ipcMain.on('popupResize', (event, size) => { if (fromPopup(event)) placePopup(size?.h); });
ipcMain.on('closePopup', event => { if (fromPopup(event)) popupWin.hide(); });
let snapshot = null;
let updateStatus = { state:'checking', message:'Checking for updates…' };
function openOptions(tab = 'settings') {
  if (optionsWin && !optionsWin.isDestroyed()) {
    optionsWin.show(); optionsWin.focus(); optionsWin.webContents.send('optionsTab', tab); return;
  }
  optionsWin = new BrowserWindow({ width:820, height:760, minWidth:640, minHeight:580,
    title:'Chest Tracker · Options', backgroundColor:'#101217', autoHideMenuBar:true,
    webPreferences:{ preload:path.join(__dirname, 'preload.js'), contextIsolation:true, nodeIntegration:false, autoplayPolicy:'no-user-gesture-required' } });
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
    // Never take focus: clicking the HUD mid-game must not pull focus from the game.
    focusable: false, skipTaskbar: true, hasShadow: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), autoplayPolicy:'no-user-gesture-required' }
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
  if (popupWin && !popupWin.isDestroyed() && popupWin.isVisible()) placePopup();
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

// All squad traffic and public lobby discovery use the fixed hosted server.
const { HostedConnection } = require('./hosted-connection');
let lobbySnapshot = { rooms:[], error:'' };
const hosted = new HostedConnection({
  onNet:data => toUI('net', data),
  onLobbies:data => {
    lobbySnapshot = data;
    if (optionsWin && !optionsWin.isDestroyed()) optionsWin.webContents.send('lobbies', data);
  },
  onMatchEnd:data => toUI('matchEnd', data),
  onMatchStart:data => toUI('matchStart', data)
});
ipcMain.handle('getLobbies', () => { hosted.browse(); return lobbySnapshot; });
ipcMain.on('browseLobbies', () => hosted.browse());
ipcMain.on('netState', (_, p) => hosted.state(p));
ipcMain.on('netHost', () => hosted.create());
ipcMain.on('netJoin', (_, id) => hosted.join(id));
ipcMain.on('netLeave', () => hosted.leave());
ipcMain.on('netEndMatch', () => hosted.endMatch());
ipcMain.on('netNewMatch', () => hosted.newMatch());

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
app.on('will-quit', () => { globalShortcut.unregisterAll(); hosted.close(); });
app.on('window-all-closed', () => app.quit());
