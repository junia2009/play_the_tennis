// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  audio.js — 効果音（WebAudio で合成。音声ファイル不要）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let ctx = null, master = null, noiseBuf = null;
let enabled = true;

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export function setEnabled(v) { enabled = v; }
export function isEnabled() { return enabled; }

function ok() { return enabled && ctx && ctx.state === 'running'; }

function noise(dur, freq, q, gain, t0 = 0) {
  const t = ctx.currentTime + t0;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur + 0.02);
}

function tone(freq, dur, gain, type = 'sine', t0 = 0, endFreq) {
  const t = ctx.currentTime + t0;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

export function hit(power = 1, far = false) {
  if (!ok()) return;
  const v = far ? 0.45 : 1;
  noise(0.08, 1800 + power * 900, 1.2, 0.9 * v);
  tone(420 + power * 80, 0.09, 0.35 * v, 'triangle', 0, 180);
}

export function bounce(far = false) {
  if (!ok()) return;
  const v = far ? 0.35 : 0.8;
  tone(190, 0.08, 0.4 * v, 'sine', 0, 90);
  noise(0.05, 900, 1, 0.25 * v);
}

export function net() {
  if (!ok()) return;
  noise(0.18, 400, 0.8, 0.6);
}

export function whiff() {
  if (!ok()) return;
  noise(0.15, 2500, 0.6, 0.25);
}

export function point(good) {
  if (!ok()) return;
  if (good) { tone(660, 0.12, 0.25, 'sine'); tone(990, 0.2, 0.22, 'sine', 0.1); }
  else { tone(330, 0.18, 0.22, 'sine'); tone(247, 0.25, 0.2, 'sine', 0.12); }
  // 観客の拍手っぽいノイズ
  for (let i = 0; i < 14; i++) noise(0.05, 2000 + Math.random() * 2000, 2, 0.08 + Math.random() * 0.08, 0.15 + Math.random() * 0.9);
}

export function fault() {
  if (!ok()) return;
  tone(520, 0.25, 0.18, 'square', 0, 500);
}

export function click() {
  if (!ok()) return;
  tone(880, 0.05, 0.12, 'triangle');
}

export function win() {
  if (!ok()) return;
  [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.3, 0.22, 'triangle', i * 0.13));
}
