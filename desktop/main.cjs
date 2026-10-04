// PC（Steam）版のエントリーポイント。www/ のゲームを app:// プロトコルで読み込む。
const { app, BrowserWindow, Menu, ipcMain, net, protocol, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const config = require('./config.cjs');

const WWW = path.join(__dirname, '..', 'www');
const SAVE_DIR = path.join(app.getPath('appData'), config.saveFolder);
const SAVE_FILE = path.join(SAVE_DIR, 'save.json');

app.setPath('userData', SAVE_DIR);

// fetch や ES モジュールを file:// で使うと制限があるため、専用スキームで配信する
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

// ---------------------------------------------------------------- Steam

let steam = null;
function initSteam() {
  try {
    const steamworks = require('steamworks.js');
    steam = steamworks.init(config.steamAppId);
    steamworks.electronEnableSteamOverlay();
  } catch (err) {
    // Steam クライアントが起動していない開発環境などでは実績なしで動かす
    console.warn(`Steam を初期化できませんでした: ${err.message}`);
  }
}

// ---------------------------------------------------------------- セーブ（Steam Cloud の対象ファイル）

ipcMain.handle('save:read', async () => {
  try {
    return await fs.promises.readFile(SAVE_FILE, 'utf8');
  } catch {
    return null;
  }
});

ipcMain.handle('save:write', async (_e, data) => {
  if (typeof data !== 'string') return;
  await fs.promises.mkdir(SAVE_DIR, { recursive: true });
  // 書き込み途中で落ちても壊れないよう、一時ファイルに書いてから置き換える
  const tmp = `${SAVE_FILE}.tmp`;
  await fs.promises.writeFile(tmp, data, 'utf8');
  await fs.promises.rename(tmp, SAVE_FILE);
});

ipcMain.handle('achievement', (_e, id) => {
  if (!steam || typeof id !== 'string') return false;
  return steam.achievement.activate(id);
});

ipcMain.handle('fullscreen:get', (e) => BrowserWindow.fromWebContents(e.sender)?.isFullScreen() ?? false);
ipcMain.handle('fullscreen:set', (e, on) => BrowserWindow.fromWebContents(e.sender)?.setFullScreen(!!on));
ipcMain.handle('quit', () => app.quit());

// ---------------------------------------------------------------- ウィンドウ

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1280,
    minHeight: 720,
    backgroundColor: '#0b0908',
    title: 'かくれさま',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.once('ready-to-show', () => win.show());
  // 外部ページへの遷移・新しいウィンドウは開かない
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://')) e.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.loadURL('app://game/index.html');
}

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const { pathname } = new URL(req.url);
    const file = path.normalize(path.join(WWW, decodeURIComponent(pathname)));
    if (!file.startsWith(WWW)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'"],
      },
    });
  });
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
  initSteam();
  createWindow();
});

app.on('window-all-closed', () => app.quit());
