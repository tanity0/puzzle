// PC（Steam）版の設定。
module.exports = {
  // Steamworks で発行される App ID。未取得の間は Valve のテスト用 App（480 = Spacewar）。
  // 取得したらここを書き換える（環境変数 STEAM_APP_ID でも上書きできる）。
  steamAppId: Number(process.env.STEAM_APP_ID || 480),
  // セーブの保存先フォルダ名（%APPDATA% / ~/Library/Application Support の下）。
  // Steam Auto-Cloud の設定と一致させるため、一度リリースしたら変えないこと。
  saveFolder: 'Kakuresama',
};
