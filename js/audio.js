// BGM と効果音。音声ファイル（docs/ASSETS.md の規格）があればそれを鳴らし、
// 無いものは Web Audio で合成した仮の音で代用する。
// iOS はユーザー操作の中で unlock() を呼ぶまで音が出ない。

let ctx = null;
let master = null;
let enabled = true;
let bgm = null;
let noiseBuf = null;
let seFiles = {}; // { found: 'assets/audio/se_found.m4a', ... }
const loading = new Map(); // url -> Promise<AudioBuffer|null>
const decoded = new Map(); // url -> AudioBuffer

const VOLUME = 0.9;

export function setEnabled(v) {
  enabled = v;
  if (master) master.gain.setTargetAtTime(v ? VOLUME : 0, ctx.currentTime, 0.05);
}

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = enabled ? VOLUME : 0;
    master.connect(ctx.destination);
    Object.values(seFiles).forEach(load);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

// scenes/index.json の "audio.se" を登録する
export function configure(se = {}) {
  seFiles = se;
  if (ctx) Object.values(seFiles).forEach(load);
}

function load(url) {
  if (!loading.has(url)) {
    loading.set(url, fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(url))))
      .then((b) => ctx.decodeAudioData(b))
      .then((buf) => { decoded.set(url, buf); return buf; })
      .catch((err) => { console.warn('音声を読み込めません:', err.message); return null; }));
  }
  return loading.get(url);
}

// 効果音ファイルがあれば鳴らして true を返す
function playFile(name, vol = 1) {
  const buf = ctx && decoded.get(seFiles[name]);
  if (!buf) return false;
  const src = ctx.createBufferSource();
  const g = ctx.createGain();
  g.gain.value = vol;
  src.buffer = buf;
  src.connect(g).connect(master);
  src.start();
  return true;
}

function noise() {
  if (!noiseBuf) {
    const len = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  return src;
}

function envGain(t, peak, attack, decay, dest = master) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(dest);
  return g;
}

function osc(type, freq) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  return o;
}

// ---------------------------------------------------------------- BGM

// def: { src, loopStart?, loopEnd?, volume? }。def が無く synth なら合成の環境音（うなりと隙間風）。
export function playBgm(def, { synth = false } = {}) {
  if (!ctx) return;
  const key = def?.src || (synth ? 'synth' : null);
  if (bgm?.key === key) return;
  stopBgm();
  if (!key) return;
  const out = ctx.createGain();
  out.gain.value = 0.0001;
  out.gain.setTargetAtTime(def?.volume ?? 0.6, ctx.currentTime, 1.0);
  out.connect(master);
  const cur = { key, out, srcs: [], timer: 0 };
  bgm = cur;
  if (key === 'synth') return synthAmbience(cur);
  load(def.src).then((buf) => {
    if (bgm !== cur) return;
    if (!buf) return synthAmbience(cur);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    if (def.loopEnd) {
      src.loopStart = def.loopStart || 0;
      src.loopEnd = def.loopEnd;
    }
    src.connect(out);
    src.start();
    cur.srcs.push(src);
  });
}

export function stopBgm() {
  if (!bgm) return;
  const cur = bgm;
  bgm = null;
  clearTimeout(cur.timer);
  cur.out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4);
  setTimeout(() => {
    cur.srcs.forEach((s) => { try { s.stop(); } catch { /* 停止済み */ } });
    cur.out.disconnect();
  }, 2000);
}

// 低いうなりと隙間風。ときどき遠くで鈴が鳴る。
function synthAmbience(cur) {
  const t = ctx.currentTime;
  const out = cur.out;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 320;
  const drone = ctx.createGain();
  drone.gain.value = 0.12;
  lp.connect(drone).connect(out);
  const tones = [osc('sine', 55), osc('triangle', 55.4), osc('sine', 77.8)];
  tones.forEach((o) => { o.connect(lp); o.start(t); });

  const wind = noise();
  wind.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 500;
  bp.Q.value = 0.8;
  const windGain = ctx.createGain();
  windGain.gain.value = 0.05;
  wind.connect(bp).connect(windGain).connect(out);
  wind.start(t);

  const lfo1 = osc('sine', 0.08);
  const lfo1Depth = ctx.createGain();
  lfo1Depth.gain.value = 300;
  lfo1.connect(lfo1Depth).connect(bp.frequency);
  lfo1.start(t);
  const lfo2 = osc('sine', 0.05);
  const lfo2Depth = ctx.createGain();
  lfo2Depth.gain.value = 0.035;
  lfo2.connect(lfo2Depth).connect(windGain.gain);
  lfo2.start(t);

  cur.srcs.push(...tones, wind, lfo1, lfo2);
  const scheduleBell = () => {
    cur.timer = setTimeout(() => {
      if (bgm !== cur) return;
      bell(0.05, 1200 + Math.random() * 500);
      scheduleBell();
    }, 15000 + Math.random() * 25000);
  };
  scheduleBell();
}

// ---------------------------------------------------------------- 効果音

// 金属的な非整数倍音で鈴・りんの音を作る
export function bell(vol = 0.2, f = 880) {
  if (!ctx || playFile('bell', vol * 4)) return;
  const t = ctx.currentTime;
  for (const [ratio, amp] of [[1, 1], [2.76, 0.5], [5.4, 0.25], [8.9, 0.12]]) {
    const o = osc('sine', f * ratio);
    o.connect(envGain(t, vol * amp, 0.005, 2.8 / Math.sqrt(ratio)));
    o.start(t);
    o.stop(t + 3.2);
  }
}

export function found() {
  if (!ctx || playFile('found')) return;
  bell(0.16, 1046.5);
  setTimeout(() => bell(0.12, 1568), 110);
}

export function miss() {
  if (!ctx || playFile('miss')) return;
  const t = ctx.currentTime;
  const o = osc('sine', 110);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.25);
  o.connect(envGain(t, 0.35, 0.005, 0.3));
  o.start(t);
  o.stop(t + 0.4);
}

// 床板のきしみ
export function creak() {
  if (!ctx || playFile('creak')) return;
  const t = ctx.currentTime;
  const o = osc('sawtooth', 90 + Math.random() * 40);
  const wobble = osc('sine', 7);
  const depth = ctx.createGain();
  depth.gain.value = 25;
  wobble.connect(depth).connect(o.frequency);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 700;
  bp.Q.value = 6;
  o.connect(bp).connect(envGain(t, 0.08, 0.2, 1.0));
  o.start(t);
  wobble.start(t);
  o.stop(t + 1.3);
  wobble.stop(t + 1.3);
}

// 驚かし用の金切り声
export function scare() {
  if (!ctx || playFile('scare')) return;
  const t = ctx.currentTime;
  const n = noise();
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 900;
  n.connect(hp).connect(envGain(t, 0.5, 0.01, 1.2));
  n.start(t);
  n.stop(t + 1.4);
  for (const [type, f0, f1] of [['sawtooth', 1400, 220], ['square', 1480, 230]]) {
    const o = osc(type, f0);
    o.frequency.exponentialRampToValueAtTime(f1, t + 1.0);
    o.connect(envGain(t, 0.18, 0.01, 1.1));
    o.start(t);
    o.stop(t + 1.3);
  }
}

export function hint() {
  if (!ctx || playFile('hint')) return;
  bell(0.15, 660);
}

export function clear() {
  if (!ctx || playFile('clear')) return;
  [784, 988, 1175].forEach((f, i) => setTimeout(() => bell(0.12, f), i * 180));
}

// ストーリーの頁送り（ファイルが無ければ無音）
export function page() {
  if (ctx) playFile('page', 0.6);
}
