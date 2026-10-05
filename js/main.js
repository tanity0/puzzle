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

// 実績。ID は Steam の実績 API 名と揃える。
const ACHIEVEMENTS = {
  clear: (id) => `CLEAR_${id.toUpperCase()}`, // 依頼の除霊：CLEAR_001 など
  allTraces: 'ALL_TRACES', // 痕跡をすべて見つけて除霊
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
  traceList: $('#trace-list'),
  traceCount: $('#trace-count'),
  exorciseBtn: $('#btn-exorcise'),
  letter: $('#letter'),
  letterBtn: $('#btn-letter'),
  time: $('#play-time'),
  grudge: $('.grudge'),
  grudgeFill: $('#grudge-fill'),
  hintBtn: $('#btn-hint'),
  hintCount: $('#hint-count'),
  scare: $('#scare'),
  menu: $('#menu'),
};

let meta = { title: 'かくれさま', requests: [] };
let game = null;

const vp = new Viewport(ui.stage, ui.content, {
  onTap: (ip, sp) => game?.tap(ip, sp),
  onPointer: (sp) => game?.moveLight(sp),
});

// ---------------------------------------------------------------- 汎用

const rand = (a, b) => a + Math.random() * (b - a);

function fmtTime(sec) {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

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

// ---------------------------------------------------------------- 文章（導入・鑑定結果）

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

// ---------------------------------------------------------------- 依頼文（写真の上に重ねる）

function renderLetter(req) {
  $('#letter-no').textContent = `依頼 No.${req.id}`;
  $('#letter-title').textContent = `「${req.title || ''}」`;
  $('#letter-client').textContent = req.client ? `依頼者：${req.client}` : '';
  const body = $('#letter-body');
  body.innerHTML = '';
  // 空行で段落を分ける
  let para = null;
  for (const line of req.letter || []) {
    if (!line.trim()) {
      para = null;
      continue;
    }
    if (!para) {
      para = document.createElement('p');
      body.appendChild(para);
    } else para.appendChild(document.createElement('br'));
    para.appendChild(document.createTextNode(line));
  }
}

function setLetter(open) {
  ui.letter.classList.toggle('open', open);
  ui.letterBtn.setAttribute('aria-pressed', String(open));
  if (open) ui.letter.scrollTop = 0;
}

// ---------------------------------------------------------------- 調査（ゲーム本体）

class Game {
  constructor(req, onFinish) {
    this.req = req;
    this.onFinish = onFinish;
    const items = req.items || [];
    this.core = items.find((it) => it.core) || null;
    this.traces = items.filter((it) => !it.core);
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
    this.started = false; // 最初に依頼文を閉じた時から時間を数える
    this.locked = true;
    this.done = false;
    this.exorcising = false; // 「祓」で核を指定する状態
    this.nextEvent = rand(18, 35);
    this.hintEl = null;
  }

  async start(src) {
    ui.overlay.innerHTML = '';
    ui.fx.innerHTML = '';
    ui.stageWrap.classList.remove('purified', 'exorcise');
    await loadImage(ui.img, src);
    if (this.done) return;
    const w = this.req.width || ui.img.naturalWidth;
    const h = this.req.height || ui.img.naturalHeight;
    this.strokeW = Math.max(w, h) / 320;
    ui.overlay.setAttribute('viewBox', `0 0 ${w} ${h}`);
    vp.setSize(w, h);
    vp.locked = false;
    this.renderTraces();
    ui.stageWrap.classList.toggle('dark', !!this.req.flashlight);
    if (this.req.flashlight) {
      const r = vp.rect();
      ui.flashlight.style.setProperty('--lr', `${Math.round(Math.min(r.width, r.height) * 0.28)}px`);
      this.moveLight({ x: r.width / 2, y: r.height / 2 });
    }
    renderLetter(this.req);
    setLetter(true);
    this.last = performance.now();
    this.locked = false;
    this.updateHud();
    this.timer = setInterval(() => this.tick(), 200);
  }

  // 依頼文を閉じたら調査開始
  letterClosed() {
    this.started = true;
  }

  renderTraces() {
    ui.traceList.innerHTML = '';
    for (const t of this.traces) {
      if (!this.found.has(t.id)) continue;
      const li = document.createElement('li');
      li.textContent = t.name;
      ui.traceList.appendChild(li);
    }
  }

  tick() {
    const now = performance.now();
    const dt = (now - this.last) / 1000;
    this.last = now;
    if (this.paused || this.done || !this.started) return;
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
    ui.traceCount.textContent = `痕跡 ${this.found.size} / ${this.traces.length}`;
    ui.exorciseBtn.setAttribute('aria-pressed', String(this.exorcising));
    ui.stageWrap.classList.toggle('exorcise', this.exorcising);
  }

  tap(ip, sp) {
    sfx.unlock();
    if (this.locked || this.done || this.paused) return;
    if (!this.started) this.started = true;
    this.moveLight(sp);
    const tol = TAP_TOLERANCE / vp.scale;
    const onCore = this.core && hitTest(this.core, ip.x, ip.y, tol);

    if (this.exorcising) {
      this.exorcising = false;
      if (onCore) return this.exorcise();
      return this.backlash(sp);
    }

    const hit = this.traces.find((t) => !this.found.has(t.id) && hitTest(t, ip.x, ip.y, tol));
    if (hit) return this.onFound(hit);
    if (onCore) {
      // 核に触れただけでは祓えない。「祓」で指定して初めて除霊になる
      flicker();
      toast(this.core.text || '……ここから、強い霊気を感じる。', 2600, true);
      return;
    }
    // 見つけ済みの痕跡を触っただけなら見誤りにしない
    if (this.traces.some((t) => this.found.has(t.id) && hitTest(t, ip.x, ip.y, tol))) return;
    this.onMiss(sp);
  }

  onFound(t) {
    this.found.add(t.id);
    sfx.found();
    platform.vibrate('light');
    this.mark(t);
    this.renderTraces();
    if (this.hintEl?.dataset.id === t.id) this.clearHint();
    if (t.text) toast(t.text, 5000, true);
    this.updateHud();
  }

  mark(t, cls = 'mark') {
    const b = bbox(t);
    const pad = Math.max(b.w, b.h) * 0.12 + this.strokeW * 2;
    const rx = b.w / 2 + pad;
    const ry = b.h / 2 + pad;
    // 楕円周の近似（ラマヌジャン）で描画アニメ用の破線長を決める
    const len = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
    ui.overlay.appendChild(svgEl('ellipse', {
      class: cls,
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

  // 「祓」で核以外を指した：霊が反撃する
  async backlash(sp) {
    ripple(sp);
    this.misses++;
    this.updateHud();
    toast('違う。……気づかれた。', 1800, true);
    await this.scare();
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

  toggleExorcise() {
    sfx.unlock();
    if (this.locked || this.done || this.paused) return;
    if (!this.core) return toast('この写真には、祓うべき核が見当たらない。', 2000);
    this.exorcising = !this.exorcising;
    if (this.exorcising) {
      setLetter(false);
      this.started = true;
      toast('霊障の核を指してください。外すと霊が反撃します。', 2600);
    }
    this.updateHud();
  }

  // 除霊：核に札を貼り、写真が静まる
  exorcise() {
    this.done = true;
    this.locked = true;
    this.exorcising = false;
    this.updateHud();
    vp.locked = true;
    clearInterval(this.timer);
    this.clearHint();
    sfx.exorcise();
    platform.vibrate('heavy');
    const b = bbox(this.core);
    const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    vp.centerOn(c.x, c.y);
    const size = Math.max(b.w, b.h) * 0.9;
    const seal = svgEl('g', { class: 'seal-mark', transform: `translate(${c.x} ${c.y})` });
    seal.appendChild(svgEl('rect', { x: -size * 0.28, y: -size * 0.6, width: size * 0.56, height: size * 1.2, class: 'seal-paper' }));
    const t = svgEl('text', { class: 'seal-text', 'font-size': size * 0.4, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
    t.textContent = '祓';
    seal.appendChild(t);
    seal.appendChild(svgEl('circle', { class: 'seal-glow', r: size * 0.9 }));
    ui.overlay.appendChild(seal);
    ui.stageWrap.classList.add('purified');
    setTimeout(() => toast(this.req.exorcised || '霊障は祓われた。', 3200, true), 900);

    const time = this.elapsed + this.penalty;
    const all = this.found.size === this.traces.length;
    // 痕跡を全部見つけていなければ評価は B まで
    const score = (time + this.hints * 10 + this.misses * 3) / (this.traces.length + 1);
    let rank = score <= 12 ? 'S' : score <= 20 ? 'A' : 'B';
    if (!all) rank = this.found.size * 2 >= this.traces.length ? 'B' : 'C';
    setTimeout(() => this.onFinish({
      time, misses: this.misses, hints: this.hints, rank, found: this.found.size, total: this.traces.length, all,
    }), 4200);
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
    // 残っている痕跡を照らす。痕跡を見つけ尽くしたら核を照らす
    const rest = this.traces.filter((t) => !this.found.has(t.id));
    const t = rest.length ? rest[Math.floor(Math.random() * rest.length)] : this.core;
    if (!t) return;
    setLetter(false);
    this.started = true;
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
    if (this.req.flashlight) this.moveLight(vp.toStage(c));
    this.hintTimer = setTimeout(() => this.clearHint(), 6000);
    this.updateHud();
  }

  clearHint() {
    clearTimeout(this.hintTimer);
    this.hintEl?.remove();
    this.hintEl = null;
  }

  moveLight(sp) {
    if (!this.req.flashlight) return;
    ui.flashlight.style.setProperty('--lx', `${sp.x}px`);
    ui.flashlight.style.setProperty('--ly', `${sp.y}px`);
  }

  setPaused(p) {
    this.paused = p;
  }

  destroy() {
    this.done = true;
    clearInterval(this.timer);
    this.clearHint();
  }
}

// ---------------------------------------------------------------- 進行

const isPlayable = (r) => !!(r && r.image && r.items?.some((it) => it.core));
const isUnlocked = (i) => i === 0 || params.has('unlock') || !!save.cleared[meta.requests[i - 1]?.id];
const RANKS = 'CBAS';

// request.json の "bgm": { "src": "bgm.m4a", "loopStart": 秒, "loopEnd": 秒 }（パスは依頼のフォルダから）
const bgmOf = (req) => (req.bgm?.src ? { ...req.bgm, src: (req.base || '') + req.bgm.src } : null);

function openRequest(i) {
  const req = meta.requests[i];
  sfx.unlock();
  if (!save.read[req.id]) {
    save.read[req.id] = true;
    store.save(save);
  }
  startPlay(req, req.base + req.image, i);
}

function startPlay(req, src, index) {
  game?.destroy();
  show('screen-play');
  $('#play-title').textContent = `No.${req.id}「${req.title || ''}」`;
  sfx.playBgm(bgmOf(req), { synth: true });
  const g = new Game(req, (res) => onClear(req, index, res, src));
  game = g;
  g.start(src).catch((err) => {
    console.error(err);
    alert(err.message);
    if (!PREVIEW) openInbox();
  });
}

function onClear(req, index, res, src) {
  sfx.stopBgm();
  sfx.clear();
  if (index >= 0) {
    const prev = save.cleared[req.id];
    const better = !prev
      || RANKS.indexOf(res.rank) > RANKS.indexOf(prev.rank)
      || (res.rank === prev.rank && res.time < prev.time);
    if (better) save.cleared[req.id] = { rank: res.rank, time: Math.round(res.time), all: res.all };
    store.save(save);
    achieve(ACHIEVEMENTS.clear(req.id));
    if (res.all) achieve(ACHIEVEMENTS.allTraces);
    if (res.rank === 'S') achieve(ACHIEVEMENTS.rankS);
    if (res.hints === 0) achieve(ACHIEVEMENTS.noHint);
    if (res.misses === 0) achieve(ACHIEVEMENTS.noMiss);
  }
  $('#result-title').textContent = `依頼 No.${req.id}「${req.title || ''}」 除霊完了`;
  $('#result-rank').textContent = res.rank;
  $('#result-time').textContent = fmtTime(res.time);
  $('#result-traces').textContent = `${res.found} / ${res.total}`;
  $('#result-miss').textContent = `${res.misses} 回`;
  $('#result-hint').textContent = `${res.hints} 枚`;
  show('screen-result');

  // 鑑定結果（後日談）。痕跡を全部見つけていれば真相が加わる
  $('#btn-next').onclick = async () => {
    const lines = [...(req.epilogue || []), ...(res.all ? req.truth || [] : [])];
    await playStory(lines, `依頼 No.${req.id} 鑑定結果`);
    if (index < 0) return show('screen-result');
    const ni = index + 1;
    if (ni < meta.requests.length && isPlayable(meta.requests[ni]) && !save.read[meta.requests[ni].id]) {
      toast('新しい依頼が届いています', 2600);
    }
    openInbox();
  };
  $('#btn-retry').onclick = () => startPlay(req, src, index);
  $('#btn-result-inbox').hidden = index < 0;
  $('#btn-result-inbox').onclick = openInbox;
}

function openInbox() {
  game?.destroy();
  game = null;
  sfx.playBgm(meta.audio?.bgm?.title);
  const ul = $('#request-list');
  ul.innerHTML = '';
  meta.requests.forEach((r, i) => {
    const playable = isPlayable(r);
    const unlocked = isUnlocked(i);
    if (!unlocked) return; // まだ届いていない依頼は出さない
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'request';
    btn.disabled = !playable;
    const rec = save.cleared[r.id];
    const no = document.createElement('span');
    no.className = 'request-no';
    no.textContent = `No.${r.id}`;
    const t = document.createElement('span');
    t.className = 'request-title';
    t.textContent = `「${r.title || ''}」`;
    const c = document.createElement('span');
    c.className = 'request-client';
    c.textContent = r.client || '';
    const st = document.createElement('span');
    st.className = 'request-status';
    if (!playable) st.textContent = '準備中';
    else if (rec) {
      st.textContent = `除霊済・評価 ${rec.rank}`;
      st.classList.add('done');
    } else if (save.read[r.id]) st.textContent = '調査中';
    else {
      st.textContent = '未読';
      st.classList.add('new');
    }
    btn.append(no, t, c, st);
    btn.onclick = () => openRequest(i);
    li.appendChild(btn);
    ul.appendChild(li);
  });
  show('screen-inbox');
}

async function startFromTitle() {
  sfx.unlock();
  const first = !Object.keys(save.cleared).length && !Object.keys(save.read).length;
  if (first && meta.prologue?.length) await playStory(meta.prologue, meta.title);
  openInbox();
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
  $('#btn-settings').onclick = () => openMenu(false);
  $('#btn-inbox-back').onclick = () => show('screen-title');
  $('#btn-pause').onclick = () => openMenu(true);
  $('#btn-hint').onclick = () => game?.hint();
  $('#btn-exorcise').onclick = () => game?.toggleExorcise();
  $('#btn-letter').onclick = () => toggleLetter();
  $('#btn-letter-close').onclick = () => toggleLetter(false);
  $('#btn-zoom-in').onclick = () => vp.zoomBy(1.4);
  $('#btn-zoom-out').onclick = () => vp.zoomBy(1 / 1.4);

  $('#btn-resume').onclick = closeMenu;
  $('#btn-menu-close').onclick = closeMenu;
  $('#btn-restart').onclick = () => {
    const g = game;
    closeMenu();
    if (g) startPlay(g.req, ui.img.getAttribute('src'), PREVIEW ? -1 : meta.requests.indexOf(g.req));
  };
  $('#btn-quit').onclick = () => {
    closeMenu();
    if (PREVIEW) return;
    openInbox();
  };
  $('#btn-reset').onclick = () => {
    if (!confirm('除霊の記録をすべて消します。よろしいですか？')) return;
    save.cleared = {};
    save.read = {};
    store.save(save);
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

function toggleLetter(open = !ui.letter.classList.contains('open')) {
  if (!game || game.done) return;
  setLetter(open);
  if (!open) game.letterClosed();
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
  else if (k === 'l') toggleLetter();
  else if (k === 'e') game?.toggleExorcise();
  else if (k === '+' || k === '=' || k === ';') vp.zoomBy(1.4);
  else if (k === '-') vp.zoomBy(1 / 1.4);
}

// Esc / Android の戻るボタン：メニューを閉じる → 中断メニュー → 前の画面へ
function onBack() {
  if (!ui.menu.hidden) return closeMenu();
  const screen = activeScreen();
  if (screen === 'screen-play') {
    if (game?.exorcising) return game.toggleExorcise();
    if (ui.letter.classList.contains('open') && game && !game.done) return toggleLetter(false);
    return openMenu(true);
  }
  if (screen === 'screen-inbox') return show('screen-title');
  if (screen === 'screen-result') return openInbox();
  if (screen === 'screen-title' && platform.kind === 'android') platform.quit();
}

// ---------------------------------------------------------------- 起動

// 驚かし画像（requests/index.json の "scare"）があれば SVG の顔の代わりに使う
function loadScareImage(src) {
  const img = new Image();
  img.className = 'scare-img';
  img.alt = '';
  img.onload = () => ui.scare.insertBefore(img, ui.scare.querySelector('.whisper'));
  img.src = src;
}

// エディタの「テストプレイ」から開かれた場合：依頼データと画像を postMessage で受け取る
function bootPreview() {
  $('#screen-title').classList.remove('active');
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || e.data?.type !== 'kakure-preview') return;
    const { request, image } = e.data;
    const src = URL.createObjectURL(image);
    startPlay(request, src, -1);
  });
  window.opener?.postMessage({ type: 'kakure-preview-ready' }, location.origin);
}

async function boot() {
  wire();
  if (PREVIEW) return bootPreview();
  if (platform.isDesktop) platform.setFullscreen(save.settings.fullscreen);
  try {
    const idx = await loadJSON('requests/index.json');
    const requests = await Promise.all(idx.requests.map(async (id) => {
      try {
        const r = await loadJSON(`requests/${id}/request.json`);
        return { ...r, id: r.id || id, base: `requests/${id}/` };
      } catch (err) {
        console.warn(err);
        return null;
      }
    }));
    meta = { ...idx, requests: requests.filter(Boolean) };
    if (idx.subtitle) $('#subtitle').textContent = idx.subtitle;
    if (idx.scare) loadScareImage(idx.scare);
    if (idx.titleImage) $('#screen-title').style.setProperty('--title-image', `url("${idx.titleImage}")`);
    sfx.configure(idx.audio?.se);
  } catch (err) {
    console.error(err);
    const el = $('#boot-error');
    el.hidden = false;
    el.textContent = '依頼データを読み込めませんでした。index.html を直接開いている場合は、'
      + 'ローカルサーバー経由で開いてください（例: npm run serve）。';
  }
}

boot();
