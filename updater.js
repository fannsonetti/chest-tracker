// Fully automatic updates: check at launch and every 30 minutes, download in
// the background, then install silently (no setup wizard) and relaunch as soon
// as the tracker is idle. If it never gets idle, the update installs silently
// when the app quits.
const CHECK_MS = 30 * 60 * 1000, IDLE_POLL_MS = 60 * 1000;
function startUpdater(app, send, canRestart = () => true, timers = { setInterval, clearInterval }) {
  if (!app.isPackaged || process.env.PORTABLE_EXECUTABLE_FILE) {
    send({ state: 'manual', message: 'Automatic updates require the installed version.' });
    return null;
  }
  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  let ready = null, waiting = null, checking = false;
  const check = () => {
    if (ready || checking) return;
    checking = true;
    autoUpdater.checkForUpdates().catch(() => {}).finally(() => { checking = false; });
  };
  const install = () => {
    if (!canRestart()) return false;
    send({ state: 'installing', message: `Installing ${ready}…` });
    // isSilent: no installer UI; isForceRunAfter: relaunch when done.
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
    return true;
  };
  autoUpdater.on('checking-for-update', () => { if (!ready) send({ state: 'checking', message: 'Checking for updates…' }); });
  autoUpdater.on('update-not-available', () => send({ state: 'current', message: 'You have the latest version.', checkedAt: Date.now() }));
  autoUpdater.on('update-available', info => send({ state: 'downloading', message: `Downloading ${info.version}…`, version: info.version, percent: 0 }));
  autoUpdater.on('download-progress', p => send({ state: 'downloading', message: `Downloading update · ${Math.round(p.percent)}%`, percent: Math.round(p.percent) }));
  autoUpdater.on('error', () => { if (!ready) send({ state: 'error', message: 'Update check failed. Retrying automatically.' }); });
  autoUpdater.on('update-downloaded', info => {
    ready = info?.version || 'the update';
    if (install()) return;
    send({ state: 'ready', message: `${ready} is ready. It installs automatically when you are idle or quit.`, version: ready });
    waiting = timers.setInterval(() => { if (install()) timers.clearInterval(waiting); }, IDLE_POLL_MS);
  });
  check();
  const periodic = timers.setInterval(check, CHECK_MS);
  periodic.unref?.();
  return { check };
}
module.exports = { startUpdater, CHECK_MS, IDLE_POLL_MS };
