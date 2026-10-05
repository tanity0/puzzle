# 販売までの手順（App Store・Google Play・Steam）

アプリの中身は 1 つ（`www/`）で、それを包む外側が 2 種類あります。

| 販売先 | 包み方 | 作るもの |
|---|---|---|
| App Store（iPhone / iPad） | Capacitor（`ios/`） | Xcode でビルドした .ipa |
| Google Play（Android） | Capacitor（`android/`） | Android Studio でビルドした .aab |
| Steam（Windows / macOS） | Electron（`desktop/`） | `npm run dist:desktop` でできるフォルダ |

信頼度の表記は [ASSETS.md](ASSETS.md) と同じです（一次＝公式で確認、二次＝検索結果の要約・解説サイトで確認）。

---

## 1. 最初に用意するもの

| もの | 費用 | 信頼度 |
|---|---|---|
| Apple Developer Program | **年 99 米ドル** | 二次（90%） |
| Google Play Console（デベロッパー登録） | **25 米ドル（1 回のみ）** | 二次（90%） |
| Steamworks（Steam Direct） | **1 タイトルにつき 100 米ドル**（売上が一定額を超えると返金される仕組み） | 二次（85%） |
| Mac（Xcode が動くもの） | iOS 版のビルドと提出に必須 | 一次（Apple の仕様） |
| プライバシーポリシーのページ | 3 ストアとも URL の登録を求められる（GitHub Pages 等の無料ホスティングで可） | 二次（85%） |

> ⚠️ **Google Play の個人アカウントの注意**：2023 年 11 月 13 日以降に作った個人アカウントは、**12 人以上のテスターで 14 日間連続のクローズドテスト**をしないと製品版を公開できません。法人アカウントは対象外です（信頼度：二次・85%）。テスター集めに時間がかかるので早めに始めてください。

### アプリ ID を決める（一度公開すると変更できない）

今は仮に `com.tanity0.kakuresama` にしています。自分のドメインや名前で決め直す場合は、**公開する前に**次の 3 か所を書き換えてから `npx cap add` をやり直してください。

- `capacitor.config.json` の `appId`
- `package.json` の `build.appId`
- Android の `applicationId`（`android/app/build.gradle`）と Java のパッケージ名、iOS の Bundle Identifier（Xcode の Signing 画面）

---

## 2. 開発中の確認

```sh
npm install
npm run serve          # http://localhost:8000/  ブラウザで確認（開発用）
npm run desktop        # PC 版をウィンドウで起動
npm run android        # Android Studio を開く（実機・エミュレーターで実行）
npm run ios            # Xcode を開く（Mac のみ）
npm test               # 自動プレイテスト
```

ゲームのファイル（`js/`・`css/`・`requests/` など）を変更したら、`npm run sync` で iOS / Android のプロジェクトへ反映します。

---

## 3. App Store

1. 素材をそろえる：アイコン原画（`resources/`）→ `npm run assets`
2. `npm run ios` で Xcode を開く
3. Signing & Capabilities で Team（自分の Apple Developer アカウント）を選ぶ
4. バージョン番号を設定する（General → Version / Build）
5. Product → Archive → Distribute App → App Store Connect
6. App Store Connect で：
   - スクリーンショット（iPhone 6.9" と iPad 13"、横向き）、説明文、キーワード
   - 年齢区分の質問票（ホラー表現の頻度。本作は 13+ の見込み）
   - 価格（有料アプリにするなら「有料アプリ契約」と銀行・税の情報が必要）
   - プライバシーの質問（データを集めていないので「データの収集なし」）
7. 審査に提出

設定済みのもの：横画面固定（iPhone・iPad とも）、ステータスバー非表示、輸出コンプライアンス（暗号化なし）。

> iPad の横画面固定のために `UIRequiresFullScreen` を有効にしています。iPadOS 26 以降の新しいウィンドウ機能との関係で、審査で指摘される可能性があります（信頼度：推定・50%）。指摘された場合は、縦画面でも崩れない画面構成になっているので、iPad だけ縦向きも許可すれば対応できます。

## 4. Google Play

1. 素材をそろえる → `npm run assets`
2. `npm run android` で Android Studio を開く
3. Build → Generate Signed App Bundle → **Android App Bundle（.aab）** を作る
   - アップロード鍵（.jks）を作成して**厳重に保管**する。なくすと更新できなくなる（Play App Signing を使えば再発行の手続きは可能）
4. Play Console で：
   - ストアの掲載情報（アイコン 512px、フィーチャーグラフィック 1024×500、スクリーンショット）
   - コンテンツのレーティング（IARC の質問票）
   - データ セーフティ（データを集めていない旨）
   - ターゲット層（13 歳以上を推奨）
5. クローズドテスト（個人アカウントは 12 人 × 14 日）→ 製品版へ

設定済みのもの：横画面固定、ゲームとしての登録（`appCategory="game"`。Android 16 以降の大画面端末で向きの固定が外されるのを避ける）、ナビゲーションバー等の非表示。

## 5. Steam

1. Steamworks で Steam Direct の手数料を払い、**App ID** を受け取る
2. `desktop/config.cjs` の `steamAppId` を受け取った App ID に書き換える
3. 実績（[ASSETS.md の C-3](ASSETS.md#c-3-steam) の 10 個）を、同じ API 名で Steamworks に登録する
4. **Steam Cloud（Auto-Cloud）** を設定する：

   | OS | ルート | サブディレクトリ | ファイル |
   |---|---|---|---|
   | Windows | `WinAppDataRoaming` | `Kakuresama` | `save.json` |
   | macOS | `MacAppSupport` | `Kakuresama` | `save.json` |

   （セーブは `desktop/config.cjs` の `saveFolder` に保存されます。リリース後は変えないでください）
5. ビルド：Windows 機で `npm run dist:desktop` → `dist/win-unpacked/`、Mac で同じく → `dist/mac-universal/`（GitHub Actions の「PC版ビルド」でも同じものが成果物としてダウンロードできます）
6. SteamPipe（Steamworks SDK の `steamcmd` / ContentBuilder）でそのフォルダをアップロードし、起動オプションに実行ファイル（`Kakuresama.exe` / `Kakuresama.app`）を指定する
7. ストアページ（カプセル画像・スクリーンショット・説明文・年齢区分）を作り、Valve の審査に出す

> macOS 版は、Apple の公証（notarization）をしておかないと起動時に警告が出ることがあります。Apple Developer Program のアカウントがあれば electron-builder で自動化できます（信頼度：推定・70%）。

### Steam Deck について

いまはタッチとマウスで操作するゲームです。Steam Deck の「認証済み（Verified）」には、**タッチ操作以外（コントローラー）ですべての操作ができること**が求められます。タッチだけでは認められません（信頼度：二次・80%）。必要なら次の段階でコントローラー操作（スティックでカーソルを動かし、ボタンでタップ）を追加します。

---

## 6. 価格と売り方（未決定）

| 方式 | 内容 |
|---|---|
| 買い切り | 全 6 夜を有料で販売（実装の追加なし） |
| 無料＋解放 | 第一夜を無料にし、第二夜以降をアプリ内課金で解放（App Store / Google Play の課金の実装が必要。Steam は体験版を別に用意） |

決まったら、それに合わせて実装します。
