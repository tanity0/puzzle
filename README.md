# かくれさま —朧屋敷の神隠し—

和風ホラーのアイテム探しゲーム（ヒドゥンオブジェクト）です。ブラウザで動くので、iPhone の Safari でも遊べます（ホーム画面に追加すると全画面アプリとして起動します）。

> 祖母・千代が消えた。手帳の最後の頁には、震える字でこう書かれていた。
> 『かくれさまに とられたものを ぜんぶ見つけなさい』

## 遊び方

- 下（横画面では右）の一覧にある物を、絵の中から探してタップ
- ピンチ／ホイールで拡大、ドラッグで移動
- **お札**：ヒント。探し物の場所を照らす（最大3枚、45秒で1枚回復）
- **怨（おん）ゲージ**：何もない所をタップするとたまる。5回たまると「かくれさま」が現れ、タイムが10秒増える
- 赤枠のアイテムは **物語アイテム**。見つけると祖母の秘密が少しずつ明かされる
- 懐中電灯の夜は、指（マウス）の周りしか見えない
- クリア時間・見誤り・お札の使用数で S〜C の評価

驚かし演出（顔が出る）と音は、設定でオフにできます。

## 起動方法

ES モジュールと `fetch` を使っているため、`index.html` を直接開くのではなく、ローカルサーバー経由で開いてください。

```sh
python3 -m http.server 8000
# → http://localhost:8000/          ゲーム
# → http://localhost:8000/editor.html シーンエディタ
```

ビルドは不要です。

### iPhone で遊ぶ

1. GitHub の Settings → Pages → Source を **GitHub Actions** にする（初回のみ）
2. `main` ブランチに push すると `.github/workflows/pages.yml` が自動で公開する
3. iPhone の Safari で公開 URL を開き、共有 → **ホーム画面に追加**

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
index.html            ゲーム本体
editor.html           シーンエディタ
css/                  スタイル
js/main.js            画面遷移・ゲーム進行
js/viewport.js        パン／ピンチズーム／タップ判定
js/hit.js             当たり判定（ゲームとエディタで共有）
js/audio.js           効果音・環境音（Web Audio で合成、音声ファイル不要）
js/storage.js         セーブデータ
js/editor.js          シーンエディタ
scenes/               各夜のデータと背景画
docs/ART_GUIDE.md     GPT 用プロンプト集と作画手順
tools/smoke-test.mjs  自動プレイテスト（Playwright）
tools/make-icons.mjs  アイコン PNG の書き出し
```

## テスト

```sh
python3 -m http.server 8765 &
node tools/smoke-test.mjs /tmp/shots   # PC・スマホ横・スマホ縦で1周クリアし、エディタも確認
```

Playwright が必要です（`npm i -D playwright`）。
