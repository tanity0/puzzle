// 効果音と環境音はすべて Web Audio で合成する（音声素材ファイル不要）。
// iOS Safari はユーザー操作の中で unlock() を呼ぶまで音が出ない。

let ctx = null;
let master = null;
let enabled = true;
let amb = null;
let noiseBuf = null;

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
  }
  if (ctx.state === 'suspended') ctx.resume();
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

// 低いうなりと隙間風。ときどき遠くで鈴が鳴る。
export function startAmbience() {
  if (!ctx || amb) return;
  const t = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = 0.0001;
  out.gain.setTargetAtTime(0.6, t, 1.5);
  out.connect(master);

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

  amb = { out, srcs: [...tones, wind, lfo1, lfo2], timer: 0 };
  scheduleBell();
}

function scheduleBell() {
  if (!amb) return;
  amb.timer = setTimeout(() => {
    if (!amb) return;
    bell(0.05, 1200 + Math.random() * 500);
    scheduleBell();
  }, 15000 + Math.random() * 25000);
}

export function stopAmbience() {
  if (!amb) return;
  const a = amb;
  amb = null;
  clearTimeout(a.timer);
  a.out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4);
  setTimeout(() => {
    a.srcs.forEach((s) => { try { s.stop(); } catch { /* 停止済み */ } });
    a.out.disconnect();
  }, 2000);
}

// 金属的な非整数倍音で鈴・りんの音を作る
export function bell(vol = 0.2, f = 880) {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (const [ratio, amp] of [[1, 1], [2.76, 0.5], [5.4, 0.25], [8.9, 0.12]]) {
    const o = osc('sine', f * ratio);
    o.connect(envGain(t, vol * amp, 0.005, 2.8 / Math.sqrt(ratio)));
    o.start(t);
    o.stop(t + 3.2);
  }
}

export function found() {
  if (!ctx) return;
  bell(0.16, 1046.5);
  setTimeout(() => bell(0.12, 1568), 110);
}

export function miss() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = osc('sine', 110);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.25);
  o.connect(envGain(t, 0.35, 0.005, 0.3));
  o.start(t);
  o.stop(t + 0.4);
}

// 床板のきしみ
export function creak() {
  if (!ctx) return;
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
  if (!ctx) return;
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
