// 実行環境（iOS / Android / Steam版PC / 開発用ブラウザ）ごとの違いをここに閉じ込める。
//
//   ios / android : Capacitor のネイティブアプリ。プラグインは window.Capacitor 経由で呼ぶ
//   desktop       : Electron（Steam 版）。desktop/preload.cjs が window.kakureDesktop を公開する
//   web           : 開発・テスト用のブラウザ

const cap = window.Capacitor;
const desktop = window.kakureDesktop;

export const kind = cap?.isNativePlatform?.() ? cap.getPlatform() : desktop ? 'desktop' : 'web';
export const isMobile = kind === 'ios' || kind === 'android';
export const isDesktop = kind === 'desktop';
// iOS は審査ガイドライン上アプリ側で終了できないので「終了」ボタンを出さない
export const canQuit = isDesktop || kind === 'android';

const plugin = (name) => (isMobile ? cap.registerPlugin(name) : null);
const Preferences = plugin('Preferences');
const Haptics = plugin('Haptics');
const App = plugin('App');

// ---------------------------------------------------------------- セーブ
// iOS の WebView の localStorage は OS に消されることがあるため、モバイルは Preferences、
// PC は Steam Cloud で同期できるよう Electron 側でファイルに保存する。

export async function readSave(key) {
  try {
    if (isMobile) return (await Preferences.get({ key })).value;
    if (isDesktop) return await desktop.readSave();
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function writeSave(key, value) {
  try {
    if (isMobile) await Preferences.set({ key, value });
    else if (isDesktop) await desktop.writeSave(value);
    else localStorage.setItem(key, value);
  } catch {
    // 保存できない環境ではセッション内だけで進行する
  }
}

// ---------------------------------------------------------------- 振動

let hapticsOn = true;
export function setHaptics(on) {
  hapticsOn = on;
}

const IMPACT = { light: 'LIGHT', medium: 'MEDIUM', heavy: 'HEAVY' };
export function vibrate(strength = 'light') {
  if (!Haptics || !hapticsOn) return;
  Haptics.impact({ style: IMPACT[strength] }).catch(() => {});
}

// ---------------------------------------------------------------- 実績

// Steam の実績 API 名と一致させる（Steamworks の管理画面で同じ名前で登録する）
export function unlockAchievement(id) {
  if (isDesktop) desktop.achievement(id).catch(() => {});
  // iOS（Game Center）/ Android（Play Games）は未対応。対応時はここにプラグイン呼び出しを足す。
}

// ---------------------------------------------------------------- アプリの状態

export function onPause(cb) {
  App?.addListener('pause', cb);
}

export function onBackButton(cb) {
  App?.addListener('backButton', cb);
}

export function quit() {
  if (isDesktop) desktop.quit();
  else if (kind === 'android') App.exitApp();
}

export async function isFullscreen() {
  return isDesktop ? desktop.isFullscreen() : false;
}

export function setFullscreen(on) {
  if (isDesktop) desktop.setFullscreen(on);
}
