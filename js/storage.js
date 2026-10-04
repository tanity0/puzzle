// 進行状況と設定の保存。保存先は platform.js が環境ごとに選ぶ。

import { readSave, writeSave } from './platform.js';

const KEY = 'kakuresama.save.v1';

const defaults = () => ({
  cleared: {}, // { [sceneId]: { rank, time } }
  achievements: {}, // { [id]: true }
  settings: { sound: true, scares: true, haptics: true, fullscreen: true },
});

export async function load() {
  const def = defaults();
  try {
    const raw = await readSave(KEY);
    if (!raw) return def;
    const d = JSON.parse(raw);
    return {
      cleared: d.cleared || {},
      achievements: d.achievements || {},
      settings: { ...def.settings, ...(d.settings || {}) },
    };
  } catch {
    return def;
  }
}

export function save(data) {
  return writeSave(KEY, JSON.stringify(data));
}
