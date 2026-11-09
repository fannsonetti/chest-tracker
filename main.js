const { app, BrowserWindow, globalShortcut, screen, ipcMain } = require('electron');
const path = require('path');

const W = 248;
let win;
let optionsWin;
let recapWin, recapSnapshot;
function openRecap(data) {
  recapSnapshot = data;
  const { workArea } = screen.getDisplayMatching(win.getBounds());
  const width = Math.min(680, workArea.width - 32), height = Math.min(800, workArea.height - 32);
  const bounds = {width,height,x:workArea.x + Math.round((workArea.width-width)/2),y:workArea.y + Math.round((workArea.height-height)/2)};
  if (recapWin && !recapWin.isDestroyed()) {
    recapWin.setBounds(bounds); recapWin.webContents.send('recap', data); recapWin.show(); recapWin.focus(); return;
  }
  recapWin = new BrowserWindow({ ...bounds, title:'Chest Tracker · Match summary', backgroundColor:'#101217',
    autoHideMenuBar:true, alwaysOnTop:true, show:false,
    webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false} });
  recapWin.loadFile(path.join(__dirname,'recap.html'));
  recapWin.once('ready-to-show', () => { if (recapWin && !recapWin.isDestroyed()) { recapWin.setAlwaysOnTop(true,'screen-saver'); recapWin.show(); recapWin.focus(); } });
  recapWin.on('closed', () => { recapWin = null; recapSnapshot = null; });
}
ipcMain.on('showRecap', (event, data) => { if (event.sender === win?.webContents) openRecap(data); });
ipcMain.handle('getRecap', event => event.sender === recapWin?.webContents ? recapSnapshot : null);
ipcMain.on('closeRecap', event => { if (event.sender === recapWin?.webContents) recapWin.close(); });
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
    skipTaskbar: true, hasShadow: false,
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
  onMatchEnd:data => toUI('matchEnd', data)
});
ipcMain.handle('getLobbies', () => { hosted.browse(); return lobbySnapshot; });
ipcMain.on('browseLobbies', () => hosted.browse());
ipcMain.on('netState', (_, p) => hosted.state(p));
ipcMain.on('netHost', () => hosted.create());
ipcMain.on('netJoin', (_, id) => hosted.join(id));
ipcMain.on('netLeave', () => hosted.leave());
ipcMain.on('netEndMatch', () => hosted.endMatch());

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
