import * as store from './storage.js';
import * as sfx from './audio.js';
import * as platform from './platform.js';
import { Viewport } from './viewport.js';
import { bbox, hitTest, svgEl } from './hit.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const PREVIEW = params.has('preview');

const HINT_MAX = 3; // お札の最大枚数
const HINT_RECHARGE = 45; // 1枚回復するまでの秒数
const GRUDGE_MAX = 5; // 見誤りがこの回数たまると「かくれさま」が現れる
const GRUDGE_DECAY = 6; // 怨念が1つ減るまでの秒数
const SCARE_PENALTY = 10; // 驚かし時のタイム加算（秒）
const TAP_TOLERANCE = 14; // 画面上のpx。指で押しやすくする余白

const ENDING = ['— 終 —'];
const TO_BE_CONTINUED = ['（つづく）', '次の夜は、まだ準備中です。'];

// 各夜のクリアで解除される実績。ID は Steam の実績 API 名と揃える。
const ACHIEVEMENTS = {
  clear: (id) => `CLEAR_${id.toUpperCase()}`, // CLEAR_CH1 〜 CLEAR_CH6
  rankS: 'RANK_S', // S 評価をとる
  noHint: 'NO_HINT', // お札を使わずにクリア
  noMiss: 'NO_MISS', // 見誤りなしでクリア
  scared: 'FOUND_BY_KAKURESAMA', // かくれさまに見つかる
};

const save = await store.load();
sfx.setEnabled(save.settings.sound);
platform.setHaptics(save.settings.haptics);
document.documentElement.dataset.platform = platform.kind;

function achieve(id) {
  if (PREVIEW || save.achievements[id]) return;
  save.achievements[id] = true;
  store.save(save);
  platform.unlockAchievement(id);
}

const ui = {
  app: $('#app'),
  stageWrap: $('#stage-wrap'),
  stage: $('#stage'),
  content: $('#content'),
  img: $('#scene-img'),
  overlay: $('#overlay'),
  flashlight: $('#flashlight'),
  fx: $('#fx'),
  toast: $('#toast'),
  list: $('#item-list'),
  remain: $('#remain'),
  time: $('#play-time'),
  grudge: $('.grudge'),
  grudgeFill: $('#grudge-fill'),
  hintBtn: $('#btn-hint'),
  hintCount: $('#hint-count'),
  scare: $('#scare'),
  menu: $('#menu'),
};

let meta = { title: 'かくれさま', scenes: [] };
let game = null;

const vp = new Viewport(ui.stage, ui.content, {
  onTap: (ip, sp) => game?.tap(ip, sp),
  onPointer: (sp) => game?.moveLight(sp),
});

// ---------------------------------------------------------------- 汎用

const rand = (a, b) => a + Math.random() * (b - a);

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function fmtTime(sec) {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const KANJI = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
const kanjiNum = (n) => (n <= 10 ? KANJI[n] : String(n));

function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
}

async function loadJSON(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${url} (${r.status})`);
  return r.json();
}

function loadImage(img, src) {
  return new Promise((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`画像を読み込めません: ${src}`));
    img.src = src;
  });
}

let toastTimer = 0;
function toast(text, ms = 2200, story = false) {
  ui.toast.textContent = text;
  ui.toast.classList.toggle('story', story);
  ui.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('show'), ms);
}

function ripple(sp) {
  const el = document.createElement('span');
  el.className = 'ripple';
  el.style.left = `${sp.x}px`;
  el.style.top = `${sp.y}px`;
  ui.fx.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

function flicker() {
  ui.stageWrap.classList.remove('flicker');
  void ui.stageWrap.offsetWidth;
  ui.stageWrap.classList.add('flicker');
  setTimeout(() => ui.stageWrap.classList.remove('flicker'), 1000);
}

function shadowPass() {
  const el = document.createElement('div');
  el.className = 'shade';
  ui.fx.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

// 一定間隔でランダムに起こる怪異
function ambientEvent() {
  const r = Math.random();
  if (r < 0.3) flicker();
  else if (r < 0.55) sfx.creak();
  else if (r < 0.8) (save.settings.scares ? shadowPass : flicker)();
  else sfx.bell(0.05, 1500);
}

function jumpscare() {
  const full = save.settings.scares;
  ui.scare.classList.toggle('soft', !full);
  ui.scare.classList.add('show');
  if (full) {
    ui.app.classList.add('shake');
    sfx.scare();
  } else {
    sfx.miss();
  }
  return new Promise((resolve) => {
    setTimeout(() => {
      ui.scare.classList.remove('show', 'soft');
      ui.app.classList.remove('shake');
    }, 1150);
    setTimeout(resolve, 1600);
  });
}

// ---------------------------------------------------------------- ストーリー

function typewrite(el, text, done) {
  let n = 0;
  el.textContent = '';
  const id = setInterval(() => {
    n++;
    el.textContent = text.slice(0, n);
    if (n >= text.length) finish();
  }, 55);
  function finish() {
    clearInterval(id);
    el.textContent = text;
    done();
  }
  return { finish };
}

function playStory(lines, title = '') {
  return new Promise((resolve) => {
    if (!lines?.length) return resolve();
    show('screen-story');
    const screen = $('#screen-story');
    const textEl = $('#story-text');
    const skip = $('#btn-story-skip');
    $('#story-title').textContent = title;
    let i = 0;
    let typing = null;

    const next = () => {
      if (typing) return typing.finish();
      if (i >= lines.length) return end();
      typing = typewrite(textEl, lines[i++], () => { typing = null; });
    };
    const onTap = () => { sfx.unlock(); sfx.page(); next(); };
    const onSkip = (e) => { e.stopPropagation(); end(); };
    function end() {
      screen.removeEventListener('click', onTap);
      skip.removeEventListener('click', onSkip);
      if (typing) typing.finish();
      resolve();
    }
    screen.addEventListener('click', onTap);
    skip.addEventListener('click', onSkip);
    next();
  });
}

// ---------------------------------------------------------------- ゲーム本体

// 候補アイテムから今回探すものを選ぶ。story / always のものは必ず入る。
function pickTargets(scene) {
  const items = scene.items || [];
  const must = items.filter((it) => it.story || it.always);
  const rest = shuffle(items.filter((it) => !(it.story || it.always)));
  const n = Math.min(items.length, scene.pick || items.length);
  const chosen = [...must, ...rest.slice(0, Math.max(0, n - must.length))];
  return [...shuffle(chosen.filter((it) => !it.story)), ...chosen.filter((it) => it.story)];
}

class Game {
  constructor(scene, onFinish) {
    this.scene = scene;
    this.onFinish = onFinish;
    this.targets = pickTargets(scene);
    this.found = new Set();
    this.misses = 0;
    this.hints = 0;
    this.penalty = 0;
    this.grudge = 0;
    this.grudgeTimer = 0;
    this.ofuda = HINT_MAX;
    this.recharge = 0;
    this.elapsed = 0;
    this.last = performance.now();
    this.paused = false;
    this.locked = true;
    this.done = false;
    this.nextEvent = rand(18, 35);
    this.hintEl = null;
  }

  async start(src) {
    ui.overlay.innerHTML = '';
    ui.fx.innerHTML = '';
    await loadImage(ui.img, src);
    if (this.done) return;
    const w = this.scene.width || ui.img.naturalWidth;
    const h = this.scene.height || ui.img.naturalHeight;
    this.strokeW = Math.max(w, h) / 320;
    ui.overlay.setAttribute('viewBox', `0 0 ${w} ${h}`);
    vp.setSize(w, h);
    vp.locked = false;
    this.renderList();
    ui.stageWrap.classList.toggle('dark', !!this.scene.flashlight);
    if (this.scene.flashlight) {
      const r = vp.rect();
      ui.flashlight.style.setProperty('--lr', `${Math.round(Math.min(r.width, r.height) * 0.28)}px`);
      this.moveLight({ x: r.width / 2, y: r.height / 2 });
    }
    this.last = performance.now();
    this.locked = false;
    this.updateHud();
    this.timer = setInterval(() => this.tick(), 200);
  }

  renderList() {
    ui.list.innerHTML = '';
    for (const t of this.targets) {
      const li = document.createElement('li');
      li.textContent = t.name;
      li.dataset.id = t.id;
      if (t.story) li.classList.add('story');
      ui.list.appendChild(li);
    }
  }

  tick() {
    const now = performance.now();
    const dt = (now - this.last) / 1000;
    this.last = now;
    if (this.paused || this.done) return;
    this.elapsed += dt;
    if (this.grudge > 0 && (this.grudgeTimer += dt) >= GRUDGE_DECAY) {
      this.grudgeTimer = 0;
      this.grudge--;
    }
    if (this.ofuda < HINT_MAX && (this.recharge += dt / HINT_RECHARGE) >= 1) {
      this.recharge = 0;
      this.ofuda++;
    }
    if ((this.nextEvent -= dt) <= 0) {
      this.nextEvent = rand(20, 45);
      ambientEvent();
    }
    this.updateHud();
  }

  updateHud() {
    ui.time.textContent = fmtTime(this.elapsed + this.penalty);
    ui.grudgeFill.style.width = `${(this.grudge / GRUDGE_MAX) * 100}%`;
    ui.grudge.classList.toggle('hot', this.grudge >= GRUDGE_MAX - 1);
    ui.hintCount.textContent = `×${this.ofuda}`;
    ui.hintBtn.classList.toggle('empty', this.ofuda === 0);
    ui.hintBtn.style.setProperty('--p', this.ofuda < HINT_MAX ? this.recharge.toFixed(3) : 0);
    ui.remain.textContent = `残り ${this.targets.length - this.found.size}`;
  }

  tap(ip, sp) {
    sfx.unlock();
    if (this.locked || this.done || this.paused) return;
    this.moveLight(sp);
    const tol = TAP_TOLERANCE / vp.scale;
    const hit = this.targets.find((t) => !this.found.has(t.id) && hitTest(t, ip.x, ip.y, tol));
    if (hit) return this.onFound(hit);
    // 見つけ済みのものを触っただけなら見誤りにしない
    if (this.targets.some((t) => this.found.has(t.id) && hitTest(t, ip.x, ip.y, tol))) return;
    this.onMiss(sp);
  }

  onFound(t) {
    this.found.add(t.id);
    sfx.found();
    platform.vibrate('light');
    this.mark(t);
    ui.list.querySelector(`[data-id="${CSS.escape(t.id)}"]`)?.classList.add('found');
    if (this.hintEl?.dataset.id === t.id) this.clearHint();
    if (t.text) toast(t.text, 5000, !!t.story);
    this.updateHud();
    if (this.found.size === this.targets.length) this.finish();
  }

  mark(t) {
    const b = bbox(t);
    const pad = Math.max(b.w, b.h) * 0.12 + this.strokeW * 2;
    const rx = b.w / 2 + pad;
    const ry = b.h / 2 + pad;
    // 楕円周の近似（ラマヌジャン）で描画アニメ用の破線長を決める
    const len = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
    ui.overlay.appendChild(svgEl('ellipse', {
      class: 'mark',
      cx: b.x + b.w / 2,
      cy: b.y + b.h / 2,
      rx,
      ry,
      'stroke-width': this.strokeW,
      'stroke-dasharray': len,
      'stroke-dashoffset': len,
      transform: `rotate(-8 ${b.x + b.w / 2} ${b.y + b.h / 2})`,
    }));
  }

  onMiss(sp) {
    sfx.miss();
    platform.vibrate('medium');
    ripple(sp);
    this.misses++;
    this.grudge++;
    this.grudgeTimer = 0;
    this.updateHud();
    if (this.grudge >= GRUDGE_MAX) this.scare();
  }

  async scare() {
    this.grudge = 0;
    this.penalty += SCARE_PENALTY;
    this.locked = true;
    platform.vibrate('heavy');
    achieve(ACHIEVEMENTS.scared);
    await jumpscare();
    if (!this.done) this.locked = false;
    this.updateHud();
  }

  hint() {
    sfx.unlock();
    if (this.locked || this.done || this.paused) return;
    if (this.ofuda <= 0) {
      ui.hintBtn.classList.remove('deny');
      void ui.hintBtn.offsetWidth;
      ui.hintBtn.classList.add('deny');
      toast('お札が足りない……', 1500);
      return;
    }
    const rest = this.targets.filter((t) => !this.found.has(t.id));
    if (!rest.length) return;
    const t = rest[Math.floor(Math.random() * rest.length)];
    this.ofuda--;
    this.hints++;
    sfx.hint();
    this.clearHint();
    const b = bbox(t);
    const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    this.hintEl = svgEl('circle', {
      class: 'hint',
      cx: c.x,
      cy: c.y,
      r: Math.max(b.w, b.h) / 2 + this.strokeW * 10,
      'stroke-width': this.strokeW * 1.5,
    });
    this.hintEl.dataset.id = t.id;
    ui.overlay.appendChild(this.hintEl);
    vp.centerOn(c.x, c.y);
    if (this.scene.flashlight) this.moveLight(vp.toStage(c));
    this.hintTimer = setTimeout(() => this.clearHint(), 6000);
    this.updateHud();
  }

  clearHint() {
    clearTimeout(this.hintTimer);
    this.hintEl?.remove();
    this.hintEl = null;
  }

  moveLight(sp) {
    if (!this.scene.flashlight) return;
    ui.flashlight.style.setProperty('--lx', `${sp.x}px`);
    ui.flashlight.style.setProperty('--ly', `${sp.y}px`);
  }

  setPaused(p) {
    this.paused = p;
  }

  finish() {
    this.done = true;
    this.locked = true;
    clearInterval(this.timer);
    this.clearHint();
    const time = this.elapsed + this.penalty;
    const per = (time + this.hints * 15 + this.misses * 2) / this.targets.length;
    const rank = per <= 9 ? 'S' : per <= 16 ? 'A' : per <= 28 ? 'B' : 'C';
    setTimeout(() => this.onFinish({ time, misses: this.misses, hints: this.hints, rank }), 1400);
  }

  destroy() {
    this.done = true;
    clearInterval(this.timer);
    this.clearHint();
  }
}

// ---------------------------------------------------------------- 進行

const isPlayable = (s) => !!(s && s.image && s.items?.length);
const isUnlocked = (i) => i === 0 || params.has('unlock') || !!save.cleared[meta.scenes[i - 1]?.id];
const RANKS = 'CBAS';

function nextPlayable(i) {
  const n = i + 1;
  return n < meta.scenes.length && isPlayable(meta.scenes[n]) ? n : -1;
}

// scene.json の "bgm": { "src": "bgm.m4a", "loopStart": 秒, "loopEnd": 秒 }（パスは各夜のフォルダから）
const bgmOf = (scene) => (scene.bgm?.src ? { ...scene.bgm, src: (scene.base || '') + scene.bgm.src } : null);

async function runScene(i) {
  const scene = meta.scenes[i];
  sfx.unlock();
  sfx.playBgm(bgmOf(scene), { synth: true });
  await playStory(scene.intro, scene.title);
  startPlay(scene, scene.base + scene.image, i);
}

function startPlay(scene, src, index) {
  game?.destroy();
  show('screen-play');
  $('#play-title').textContent = scene.title || '';
  sfx.playBgm(bgmOf(scene), { synth: true });
  const g = new Game(scene, (res) => onClear(scene, index, res, src));
  game = g;
  g.start(src).catch((err) => {
    console.error(err);
    alert(err.message);
    if (!PREVIEW) openSelect();
  });
}

function onClear(scene, index, res, src) {
  sfx.stopBgm();
  sfx.clear();
  if (index >= 0) {
    const prev = save.cleared[scene.id];
    const better = !prev
      || RANKS.indexOf(res.rank) > RANKS.indexOf(prev.rank)
      || (res.rank === prev.rank && res.time < prev.time);
    if (better) save.cleared[scene.id] = { rank: res.rank, time: Math.round(res.time) };
    store.save(save);
    achieve(ACHIEVEMENTS.clear(scene.id));
    if (res.rank === 'S') achieve(ACHIEVEMENTS.rankS);
    if (res.hints === 0) achieve(ACHIEVEMENTS.noHint);
    if (res.misses === 0) achieve(ACHIEVEMENTS.noMiss);
  }
  $('#result-title').textContent = scene.title || '';
  $('#result-rank').textContent = res.rank;
  $('#result-time').textContent = fmtTime(res.time);
  $('#result-miss').textContent = `${res.misses} 回`;
  $('#result-hint').textContent = `${res.hints} 枚`;
  show('screen-result');

  const next = $('#btn-next');
  next.hidden = index < 0;
  next.onclick = async () => {
    await playStory(scene.outro, scene.title);
    const ni = nextPlayable(index);
    if (ni >= 0) return runScene(ni);
    await playStory(index === meta.scenes.length - 1 ? ENDING : TO_BE_CONTINUED);
    show('screen-title');
    refreshTitle();
  };
  $('#btn-retry').onclick = () => startPlay(scene, src, index);
  $('#btn-result-select').hidden = index < 0;
  $('#btn-result-select').onclick = openSelect;
}

function openSelect() {
  game?.destroy();
  game = null;
  sfx.playBgm(meta.audio?.bgm?.title);
  const ul = $('#night-list');
  ul.innerHTML = '';
  meta.scenes.forEach((s, i) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'night';
    const playable = isPlayable(s);
    const unlocked = isUnlocked(i);
    const rec = save.cleared[s.id];
    btn.disabled = !playable || !unlocked;
    if (playable && unlocked) {
      // 背景画をそのままサムネイルに使う
      btn.classList.add('has-thumb');
      btn.style.backgroundImage = `linear-gradient(90deg, rgba(14, 11, 9, 0.96) 35%, rgba(14, 11, 9, 0.55)), url("${s.base}${s.image}")`;
    }
    const n = document.createElement('span');
    n.className = 'n';
    n.textContent = kanjiNum(i + 1);
    const t = document.createElement('span');
    t.className = 't';
    t.textContent = unlocked ? s.title : '？？？';
    const r = document.createElement('span');
    r.className = 'r';
    if (!playable) r.textContent = '準備中';
    else if (!unlocked) r.textContent = '封印';
    else if (rec) {
      r.textContent = `評価 ${rec.rank}・${fmtTime(rec.time)}`;
      r.classList.add('rank');
    } else r.textContent = '未踏';
    btn.append(n, t, r);
    btn.onclick = () => runScene(i);
    li.appendChild(btn);
    ul.appendChild(li);
  });
  show('screen-select');
}

function refreshTitle() {
  const started = meta.scenes.some((s) => save.cleared[s.id]);
  $('#btn-start').textContent = started ? 'つづきから' : 'はじめる';
}

function startFromTitle() {
  sfx.unlock();
  const idx = meta.scenes.findIndex((s, i) => isPlayable(s) && isUnlocked(i) && !save.cleared[s.id]);
  const fallback = meta.scenes.findIndex(isPlayable);
  const i = idx >= 0 ? idx : fallback;
  if (i < 0) return alert('遊べるシーンがありません。scenes/ を確認してください。');
  runScene(i);
}

// ---------------------------------------------------------------- メニュー

function openMenu(inGame) {
  ui.menu.classList.toggle('in-title', !inGame);
  $('#menu-title').textContent = inGame ? '中断' : '設定';
  $('#opt-sound').checked = save.settings.sound;
  $('#opt-scares').checked = save.settings.scares;
  $('#opt-haptics').checked = save.settings.haptics;
  $('#opt-fullscreen').checked = save.settings.fullscreen;
  game?.setPaused(true);
  ui.menu.hidden = false;
}

function closeMenu() {
  ui.menu.hidden = true;
  game?.setPaused(false);
}

function wire() {
  $('#btn-start').onclick = startFromTitle;
  // タイトル画面を最初に触ったときにタイトル BGM を鳴らし始める
  $('#screen-title').addEventListener('pointerdown', () => {
    sfx.unlock();
    sfx.playBgm(meta.audio?.bgm?.title);
  });
  $('#btn-select').onclick = () => { sfx.unlock(); openSelect(); };
  $('#btn-settings').onclick = () => openMenu(false);
  $('#btn-select-back').onclick = () => { show('screen-title'); refreshTitle(); };
  $('#btn-pause').onclick = () => openMenu(true);
  $('#btn-hint').onclick = () => game?.hint();
  $('#btn-zoom-in').onclick = () => vp.zoomBy(1.4);
  $('#btn-zoom-out').onclick = () => vp.zoomBy(1 / 1.4);

  $('#btn-resume').onclick = closeMenu;
  $('#btn-menu-close').onclick = closeMenu;
  $('#btn-restart').onclick = () => {
    const g = game;
    closeMenu();
    if (g) startPlay(g.scene, ui.img.getAttribute('src'), PREVIEW ? -1 : meta.scenes.indexOf(g.scene));
  };
  $('#btn-quit').onclick = () => {
    closeMenu();
    if (PREVIEW) return;
    openSelect();
  };
  $('#btn-reset').onclick = () => {
    if (!confirm('クリア記録をすべて消します。よろしいですか？')) return;
    save.cleared = {};
    store.save(save);
    refreshTitle();
  };
  $('#opt-sound').onchange = (e) => {
    save.settings.sound = e.target.checked;
    sfx.setEnabled(save.settings.sound);
    store.save(save);
  };
  $('#opt-scares').onchange = (e) => {
    save.settings.scares = e.target.checked;
    store.save(save);
  };
  $('#opt-haptics').onchange = (e) => {
    save.settings.haptics = e.target.checked;
    platform.setHaptics(save.settings.haptics);
    store.save(save);
  };
  $('#opt-fullscreen').onchange = (e) => setFullscreen(e.target.checked);
  $('#btn-quit-app').hidden = !platform.canQuit;
  $('#btn-quit-app').onclick = () => platform.quit();

  // PC：キーボード操作
  document.addEventListener('keydown', onKey);
  // Android：戻るボタン
  platform.onBackButton(onBack);
  platform.onPause(() => {
    if (game && !game.done && ui.menu.hidden) openMenu(true);
  });

  // iOS Safari のページズームを抑止
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game && !game.done && ui.menu.hidden) openMenu(true);
  });
}

function setFullscreen(on) {
  save.settings.fullscreen = on;
  store.save(save);
  platform.setFullscreen(on);
}

function activeScreen() {
  return document.querySelector('.screen.active')?.id;
}

function onKey(e) {
  if (e.repeat) return;
  if (e.key === 'F11' || (e.key === 'Enter' && e.altKey)) {
    e.preventDefault();
    setFullscreen(!save.settings.fullscreen);
    return;
  }
  if (e.key === 'Escape') return onBack();
  if (!ui.menu.hidden || activeScreen() !== 'screen-play') return;
  const k = e.key.toLowerCase();
  if (k === 'h') game?.hint();
  else if (k === '+' || k === '=' || k === ';') vp.zoomBy(1.4);
  else if (k === '-') vp.zoomBy(1 / 1.4);
}

// Esc / Android の戻るボタン：メニューを閉じる → 中断メニュー → 前の画面へ
function onBack() {
  if (!ui.menu.hidden) return closeMenu();
  const screen = activeScreen();
  if (screen === 'screen-play') return openMenu(true);
  if (screen === 'screen-select') {
    show('screen-title');
    return refreshTitle();
  }
  if (screen === 'screen-result') return openSelect();
  if (screen === 'screen-title' && platform.kind === 'android') platform.quit();
}

// ---------------------------------------------------------------- 起動

// 驚かし画像（scenes/index.json の "scare"）があれば SVG の顔の代わりに使う
function loadScareImage(src) {
  const img = new Image();
  img.className = 'scare-img';
  img.alt = '';
  img.onload = () => ui.scare.insertBefore(img, ui.scare.querySelector('.whisper'));
  img.src = src;
}

// エディタの「テストプレイ」から開かれた場合：シーンと画像を postMessage で受け取る
function bootPreview() {
  $('#screen-title').classList.remove('active');
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || e.data?.type !== 'kakure-preview') return;
    const { scene, image } = e.data;
    const src = URL.createObjectURL(image);
    startPlay(scene, src, -1);
  });
  window.opener?.postMessage({ type: 'kakure-preview-ready' }, location.origin);
}

async function boot() {
  wire();
  if (PREVIEW) return bootPreview();
  if (platform.isDesktop) platform.setFullscreen(save.settings.fullscreen);
  try {
    const idx = await loadJSON('scenes/index.json');
    const scenes = await Promise.all(idx.scenes.map(async (id) => {
      try {
        const s = await loadJSON(`scenes/${id}/scene.json`);
        return { ...s, id: s.id || id, base: `scenes/${id}/` };
      } catch (err) {
        console.warn(err);
        return null;
      }
    }));
    meta = { ...idx, scenes: scenes.filter(Boolean) };
    if (idx.scare) loadScareImage(idx.scare);
    if (idx.titleImage) $('#screen-title').style.setProperty('--title-image', `url("${idx.titleImage}")`);
    sfx.configure(idx.audio?.se);
  } catch (err) {
    console.error(err);
    const el = $('#boot-error');
    el.hidden = false;
    el.textContent = 'シーンデータを読み込めませんでした。index.html を直接開いている場合は、'
      + 'ローカルサーバー経由で開いてください（例: python3 -m http.server）。';
  }
  refreshTitle();
}

boot();
