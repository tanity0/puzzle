// `npx cap add ios|android` で作り直したネイティブプロジェクトに、ゲーム用の設定を入れ直す。
// 何度実行しても同じ結果になる。  node tools/patch-native.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const cap = JSON.parse(readFileSync(`${root}capacitor.config.json`, 'utf8'));
const pkgPath = cap.appId.replace(/\./g, '/');

function edit(rel, fn) {
  const file = root + rel;
  if (!existsSync(file)) return console.log(`skip: ${rel}`);
  const before = readFileSync(file, 'utf8');
  const after = fn(before);
  if (after !== before) writeFileSync(file, after);
  console.log(`${after !== before ? 'patched' : 'ok'}: ${rel}`);
}

// ---------------------------------------------------------------- Android

edit('android/app/src/main/AndroidManifest.xml', (s) => {
  // 横持ち固定。appCategory="game" はタブレット等の向き強制解除（Android 16〜）の対象外にするため
  if (!s.includes('android:screenOrientation')) {
    s = s.replace('android:name=".MainActivity"', 'android:name=".MainActivity"\n            android:screenOrientation="sensorLandscape"');
  }
  if (!s.includes('android:appCategory')) {
    s = s.replace('<application', '<application\n        android:appCategory="game"');
  }
  return s;
});

edit(`android/app/src/main/java/${pkgPath}/MainActivity.java`, () => `package ${cap.appId};

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // ステータスバーとナビゲーションバーを隠して全画面で遊べるようにする（端からスワイプで一時表示）
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (!hasFocus) return;
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.hide(WindowInsetsCompat.Type.systemBars());
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }
}
`);

// ---------------------------------------------------------------- iOS

const LANDSCAPE = `<array>
		<string>UIInterfaceOrientationLandscapeLeft</string>
		<string>UIInterfaceOrientationLandscapeRight</string>
	</array>`;

function plistSet(s, key, valueXml) {
  const re = new RegExp(`(<key>${key}</key>\\s*)(<array>[\\s\\S]*?</array>|<true/>|<false/>|<string>[^<]*</string>)`);
  if (re.test(s)) return s.replace(re, `$1${valueXml}`);
  return s.replace(/<\/dict>\s*<\/plist>\s*$/, `\t<key>${key}</key>\n\t${valueXml}\n</dict>\n</plist>\n`);
}

edit('ios/App/App/Info.plist', (s) => {
  s = plistSet(s, 'UISupportedInterfaceOrientations', LANDSCAPE);
  s = plistSet(s, 'UISupportedInterfaceOrientations~ipad', LANDSCAPE);
  s = plistSet(s, 'UIRequiresFullScreen', '<true/>'); // iPad でも横固定にする
  s = plistSet(s, 'UIStatusBarHidden', '<true/>');
  s = plistSet(s, 'UIViewControllerBasedStatusBarAppearance', '<false/>');
  s = plistSet(s, 'ITSAppUsesNonExemptEncryption', '<false/>'); // 暗号化機能なし（輸出コンプライアンス）
  return s;
});
