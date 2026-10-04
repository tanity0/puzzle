// 進行状況と設定の保存。プライベートブラウズ等で localStorage が使えなくても動くようにする。

const KEY = 'kakuresama.save.v1';

const defaults = () => ({
  cleared: {}, // { [sceneId]: { rank, time } }
  settings: { sound: true, scares: true },
});

export function load() {
  const def = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return def;
    const d = JSON.parse(raw);
    return { cleared: d.cleared || {}, settings: { ...def.settings, ...(d.settings || {}) } };
  } catch {
    return def;
  }
}

export function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // 保存できない環境ではセッション内だけで進行する
  }
}
