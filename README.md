# かくれさま —朧屋敷の神隠し—

和風ホラーのアイテム探しゲーム（ヒドゥンオブジェクト）です。**横持ち専用**で、次のストアで販売するアプリとして作っています。

| 販売先 | 端末 | 仕組み |
|---|---|---|
| App Store | iPhone / iPad | Capacitor（`ios/`） |
| Google Play | Android スマホ・タブレット | Capacitor（`android/`） |
| Steam | Windows / macOS | Electron（`desktop/`） |

ゲーム本体（`index.html`・`js/`・`css/`・`scenes/`）は 3 つで共通です。

> 祖母・千代が消えた。手帳の最後の頁には、震える字でこう書かれていた。
> 『かくれさまに とられたものを ぜんぶ見つけなさい』

## ドキュメント

- **[docs/ASSETS.md](docs/ASSETS.md) — 必要な素材と規格（背景画・アイコン・ストア画像・BGM・効果音）**
- [docs/ART_GUIDE.md](docs/ART_GUIDE.md) — GPT で背景画を作るためのプロンプト集と手順
- [docs/RELEASE.md](docs/RELEASE.md) — 各ストアで販売するまでの手順

## 遊び方

- 一覧にある物を、絵の中から探してタップ（クリック）
- ピンチ／マウスホイールで拡大、ドラッグで移動
- **お札**：ヒント。探し物の場所を照らす（最大3枚、45秒で1枚回復）
- **怨（おん）ゲージ**：何もない所をタップするとたまる。5回たまると「かくれさま」が現れ、タイムが10秒増える
- 赤枠のアイテムは **物語アイテム**。見つけると祖母の秘密が少しずつ明かされる
- 懐中電灯の夜は、指（マウス）の周りしか見えない
- クリア時間・見誤り・お札の使用数で S〜C の評価

驚かし演出（顔が出る）・音・振動（スマホ）・フルスクリーン（PC）は設定で切り替えられます。
PC ではキーボードも使えます（H：ヒント、＋／－：拡大縮小、Esc：メニュー、F11：フルスクリーン）。

## 開発

Node.js 22 以上が必要です。

```sh
npm install
npm run serve      # http://localhost:8000/  ゲーム（ブラウザで確認）
                   # http://localhost:8000/editor.html  シーンエディタ
npm run desktop    # PC 版を起動
npm run android    # Android Studio で開く
npm run ios        # Xcode で開く（Mac のみ）
npm test           # 自動プレイテスト
```

オンラインのテスト版は `node tools/build-web-preview.mjs` で `dist/web-preview/` に作り、Claude の公開ページ（Artifact）として出しています（フォントは Google Fonts から読む版）。

`npm run build` でアプリに入れるファイルが `www/` にまとまります（フォントも同梱）。ゲームを変更したら `npm run sync` で iOS / Android に反映してください。

## 新しい夜（ステージ）の作り方

背景は **GPT で描き、シーンエディタで当たり判定を付けます**。詳しいプロンプトと手順は [docs/ART_GUIDE.md](docs/ART_GUIDE.md) にあります。

1. `docs/ART_GUIDE.md` のプロンプトで背景画を生成し、`scenes/ch2/bg.webp` などに置く
2. `editor.html` を開き、「サーバー上のシーンを開く」で `ch2` を選ぶ
3. 絵の中の小物を囲んで名前を付ける
4. 「テストプレイ」で確認 → 「scene.json を保存」で `scenes/ch2/scene.json` を上書き

第二夜〜終夜の物語文はすでに `scene.json` に入っているので、画像と当たり判定を足すだけで遊べるようになります。新しい夜を増やすときは `scenes/index.json` に ID を追加してください。

### scene.json の形式

```jsonc
{
  "id": "ch2",
  "title": "第二夜　土間と台所",
  "image": "bg.webp",          // scenes/ch2/ からの相対パス
  "width": 1536, "height": 1024, // 画像のピクセルサイズ（エディタが自動で入れる）
  "pick": 10,                  // 1回のプレイで出題する数（候補からランダム）
  "flashlight": false,         // true で懐中電灯モード
  "intro": ["導入の文…"],       // 1要素＝1画面
  "outro": ["締めの文…"],
  "items": [
    { "id": "doll", "name": "日本人形", "shape": "rect", "coords": [604, 424, 52, 104] },
    { "id": "bell", "name": "鈴", "shape": "circle", "coords": [300, 215, 18] },
    { "id": "kasa", "name": "番傘", "shape": "poly", "coords": [110, 288, 136, 302, 116, 524] },
    { "id": "photo", "name": "古い写真", "shape": "rect", "coords": [1384, 686, 74, 70],
      "story": true, "text": "見つけた時に出す一文" }  // story は必ず出題される
  ]
}
```

座標はすべて画像のピクセル単位です（rect: `[x, y, 幅, 高さ]` / circle: `[中心x, 中心y, 半径]` / poly: `[x1, y1, x2, y2, …]`）。

## ファイル構成

```
index.html                 ゲーム本体（3 ストア共通）
editor.html                シーンエディタ（開発用。アプリには入らない）
css/  js/  scenes/         ゲームのコードとデータ
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
npm test                                  # PC・スマホ・タブレットの横画面で1周クリアし、エディタも確認
xvfb-run -a node tools/electron-smoke.mjs # PC 版（Electron）の起動確認（Linux）
```

GitHub Actions では、これに加えて Android・iOS（シミュレーター）・PC 版（Windows / macOS / Linux）のビルドが通るかを確認しています。
