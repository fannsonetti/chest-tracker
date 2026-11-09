function startUpdater(app, send, canRestart = () => true) {
  if (!app.isPackaged || process.env.PORTABLE_EXECUTABLE_FILE) {
    send({ state: 'manual', message: 'Automatic updates require the installed version.' });
    return;
  }
  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => send({ state: 'checking', message: 'Checking for updates…' }));
  autoUpdater.on('update-not-available', () => send({ state: 'current', message: 'You have the latest version.' }));
  autoUpdater.on('update-available', info => send({ state: 'downloading', message: `Downloading ${info.version}…` }));
  autoUpdater.on('download-progress', p => send({ state: 'downloading', message: `Downloading update · ${Math.round(p.percent)}%` }));
  autoUpdater.on('error', () => send({ state: 'error', message: 'Update check failed. You can keep playing; we’ll retry next launch.' }));
  autoUpdater.on('update-downloaded', () => {
    if (canRestart()) {
      send({ state: 'ready', message: 'Update downloaded. Restarting…' });
      autoUpdater.quitAndInstall(false, true);
    } else send({ state:'ready', message:'Update downloaded. It will install when you quit.' });
  });
  autoUpdater.checkForUpdatesAndNotify().catch(() => {});
}
module.exports = { startUpdater };
