# かくれさま —写真除霊の依頼簿—

和風ホラーの探索ゲームです。プレイヤーは、写真を通して遠隔で霊を祓う除霊師。全国から届く「最近おかしなことが続く。これが原因では？」という写真と依頼文を読み、写真に潜む **霊障の核** を特定して祓います。

**横持ち専用**で、次のストアで販売するアプリとして作っています。

| 販売先 | 端末 | 仕組み |
|---|---|---|
| App Store | iPhone / iPad | Capacitor（`ios/`） |
| Google Play | Android スマホ・タブレット | Capacitor（`android/`） |
| Steam | Windows / macOS | Electron（`desktop/`） |

ゲーム本体（`index.html`・`js/`・`css/`・`requests/`）は 3 つで共通です。

## ドキュメント

- **[docs/ASSETS.md](docs/ASSETS.md) — 必要な素材と規格（依頼の写真・アイコン・ストア画像・BGM・効果音）**
- [docs/ART_GUIDE.md](docs/ART_GUIDE.md) — 依頼の作り方（異常の設計、GPT のプロンプト、当たり判定）
- [docs/RELEASE.md](docs/RELEASE.md) — 各ストアで販売するまでの手順

## 遊び方

1. **依頼箱** から依頼を開く。写真の左半分に **依頼文** が重なって表示される
2. 依頼文を閉じて写真を調べる（「依頼文」ボタンでいつでも再表示できる）
3. 写真の異常＝**痕跡** を見つけると、所見が出る（見つけなくても除霊はできる）
4. **「祓」** を押してから **霊障の核** を指すと除霊。外すと霊が反撃する
5. 除霊後、**鑑定結果** が届く。痕跡を全部見つけていれば、隠された **真相** まで読める

- ピンチ／マウスホイールで拡大、ドラッグで移動
- **お札**：ヒント。まだ見つけていない痕跡を照らす（痕跡を見つけ尽くしたら核を照らす）。最大 3 枚、45 秒で 1 枚回復
- **怨（おん）ゲージ**：何もない所をタップするとたまる。5 回たまると霊が現れ、タイムが 10 秒増える
- 懐中電灯モードの依頼は、指（マウス）の周りしか見えない
- 評価は S〜C。痕跡を全部見つけないと B までしか取れない

驚かし演出（顔が出る）・音・振動（スマホ）・フルスクリーン（PC）は設定で切り替えられます。
PC ではキーボードも使えます（L：依頼文、E：祓、H：ヒント、＋／－：拡大縮小、Esc：メニュー、F11：フルスクリーン）。

## 開発

Node.js 22 以上が必要です。

```sh
npm install
npm run serve      # http://localhost:8000/  ゲーム（ブラウザで確認）
                   # http://localhost:8000/editor.html  依頼エディタ
npm run desktop    # PC 版を起動
npm run android    # Android Studio で開く
npm run ios        # Xcode で開く（Mac のみ）
npm test           # 自動プレイテスト
```

オンラインのテスト版は `node tools/build-web-preview.mjs` で `dist/web-preview/` に作り、Claude の公開ページ（Artifact）として出しています（フォントは Google Fonts から読む版）。

`npm run build` でアプリに入れるファイルが `www/` にまとまります（フォントも同梱）。ゲームを変更したら `npm run sync` で iOS / Android に反映してください。

## 新しい依頼の作り方

依頼 1 件 ＝ **写真 1 枚 ＋ 依頼文 ＋ 当たり判定（核 1 つと痕跡 4〜6 個）** です。詳しくは [docs/ART_GUIDE.md](docs/ART_GUIDE.md) を見てください。

1. 異常（核と痕跡）と依頼文を先に設計する
2. GPT で写真を作り、`requests/002/photo.webp` などに置く
3. `requests/index.json` の `"requests"` に依頼番号を足す
4. `editor.html` で当たり判定・依頼文・鑑定結果を入力し、「request.json を保存」

依頼 No.001「祖母の家」は、仮の SVG 写真（`requests/001/photo.svg`）で遊べる状態になっています。

### request.json の形式

```jsonc
{
  "id": "001",
  "title": "祖母の家",
  "client": "長野県・32歳女性",
  "letter": ["依頼文の 1 行目", "2 行目", "", "空行で段落を分ける"],
  "image": "photo.webp",            // requests/001/ からの相対パス
  "width": 3072, "height": 2048,    // 写真のピクセルサイズ（エディタが自動で入れる）
  "flashlight": false,              // true で懐中電灯モード
  "exorcised": "除霊した瞬間に出る一文",
  "epilogue": ["鑑定結果（1 要素＝1 画面）"],
  "truth": ["痕跡を全部見つけた時だけ続けて出る真相"],
  "items": [
    { "id": "tv", "name": "テレビに映る顔", "shape": "rect", "coords": [912, 620, 122, 106],
      "core": true, "text": "核に触れた時の一文" },          // 核は 1 つだけ
    { "id": "eye", "name": "障子の隙間の目", "shape": "rect", "coords": [262, 366, 30, 34],
      "text": "見つけた時の所見" }                           // core が無いものは痕跡
  ]
}
```

座標はすべて写真のピクセル単位です（rect: `[x, y, 幅, 高さ]` / circle: `[中心x, 中心y, 半径]` / poly: `[x1, y1, x2, y2, …]`）。

## ファイル構成

```
index.html                 ゲーム本体（3 ストア共通）
editor.html                依頼エディタ（開発用。アプリには入らない）
css/  js/  requests/       ゲームのコードと依頼データ
  js/main.js               画面遷移・ゲーム進行
  js/viewport.js           パン／ピンチズーム／タップ判定
  js/hit.js                当たり判定（ゲームとエディタで共有）
  js/audio.js              BGM・効果音（ファイルが無ければ合成音）
  js/platform.js           iOS / Android / PC の違い（セーブ・振動・実績・終了など）
  js/storage.js            セーブデータ
assets/                    タイトル画・驚かし画像・音（任意素材）
resources/                 アイコン・起動画面の原画（npm run assets で各サイズを生成）
ios/  android/             Capacitor のネイティブプロジェクト
desktop/                   Electron（Steam 版）のメインプロセス
capacitor.config.json      アプリ ID・名前
docs/                      素材の規格・作画ガイド・販売手順
tools/build-www.mjs        アプリに入れるファイルを www/ にまとめる
tools/patch-native.mjs     ネイティブプロジェクトの設定（横画面固定など）
tools/smoke-test.mjs       自動プレイテスト
tools/electron-smoke.mjs   PC 版の起動テスト
```

## テスト

```sh
npm test                                  # PC・スマホ・タブレットの横画面で依頼を1件除霊し、エディタも確認
xvfb-run -a node tools/electron-smoke.mjs # PC 版（Electron）の起動確認（Linux）
```

GitHub Actions では、これに加えて Android・iOS（シミュレーター）・PC 版（Windows / macOS / Linux）のビルドが通るかを確認しています。
