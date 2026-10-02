// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  input.js — タッチ（フローティングスティック + ショットボタン）とキーボード
//  スティック: 画面左側のどこを触ってもそこが中心になる
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { input } from './match.js';

const RANGE = 48;           // スティックの最大移動距離(px)

let zone, base, knob;
let stickId = null, cx = 0, cy = 0;
let stick = { x: 0, y: 0 };
const keys = new Set();
let onAnyPress = () => {};

export function init({ onPress } = {}) {
  if (onPress) onAnyPress = onPress;
  zone = document.getElementById('stickZone');
  base = document.getElementById('stickBase');
  knob = document.getElementById('stickKnob');

  zone.addEventListener('pointerdown', e => {
    if (stickId !== null) return;
    e.preventDefault();
    stickId = e.pointerId;
    zone.setPointerCapture?.(e.pointerId);
    const r = zone.getBoundingClientRect();
    cx = e.clientX; cy = e.clientY;
    base.style.left = (cx - r.left) + 'px';
    base.style.top = (cy - r.top) + 'px';
    base.classList.add('active');
    moveStick(e.clientX, e.clientY);
    onAnyPress();
  });
  zone.addEventListener('pointermove', e => {
    if (e.pointerId !== stickId) return;
    e.preventDefault();
    moveStick(e.clientX, e.clientY);
  });
  const end = e => {
    if (e.pointerId !== stickId) return;
    stickId = null;
    stick = { x: 0, y: 0 };
    knob.style.transform = 'translate(-50%,-50%)';
    base.classList.remove('active');
    sync();
  };
  zone.addEventListener('pointerup', end);
  zone.addEventListener('pointercancel', end);
  zone.addEventListener('lostpointercapture', end);

  for (const btn of document.querySelectorAll('[data-shot]')) {
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      e.stopPropagation();
      btn.classList.add('pressed');
      input.shot = btn.dataset.shot;
      onAnyPress();
      navigator.vibrate?.(8);
    });
    const up = () => btn.classList.remove('pressed');
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('pointerleave', up);
  }

  // iOS の長押しメニュー・ダブルタップズーム対策
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });

  const SHOT_KEYS = {
    Space: 'flat', KeyJ: 'flat', KeyK: 'topspin', KeyL: 'slice', KeyI: 'lob',
    KeyZ: 'topspin', KeyX: 'slice', KeyC: 'lob', KeyV: 'flat',
  };
  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    if (SHOT_KEYS[e.code]) {
      input.shot = SHOT_KEYS[e.code];
      e.preventDefault();
      onAnyPress();
      flashButton(SHOT_KEYS[e.code]);
    }
    keys.add(e.code);
    sync();
  });
  window.addEventListener('keyup', e => { keys.delete(e.code); sync(); });
  window.addEventListener('blur', () => { keys.clear(); sync(); });
}

function flashButton(type) {
  const b = document.querySelector(`[data-shot="${type}"]`);
  if (!b) return;
  b.classList.add('pressed');
  setTimeout(() => b.classList.remove('pressed'), 120);
}

function moveStick(x, y) {
  let dx = x - cx, dy = y - cy;
  const d = Math.hypot(dx, dy);
  if (d > RANGE) {
    // 指が大きく動いたら中心を追従させる
    const over = d - RANGE;
    cx += dx / d * over; cy += dy / d * over;
    const r = zone.getBoundingClientRect();
    base.style.left = (cx - r.left) + 'px';
    base.style.top = (cy - r.top) + 'px';
    dx = x - cx; dy = y - cy;
  }
  knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  stick = { x: dx / RANGE, y: dy / RANGE };
  sync();
}

function sync() {
  let kx = 0, ky = 0;
  if (keys.has('ArrowLeft') || keys.has('KeyA')) kx -= 1;
  if (keys.has('ArrowRight') || keys.has('KeyD')) kx += 1;
  if (keys.has('ArrowUp') || keys.has('KeyW')) ky -= 1;
  if (keys.has('ArrowDown') || keys.has('KeyS')) ky += 1;
  if (kx || ky) {
    const m = Math.hypot(kx, ky);
    input.mx = kx / m; input.my = ky / m;
  } else {
    input.mx = stick.x; input.my = stick.y;
  }
}

export function reset() {
  stickId = null;
  stick = { x: 0, y: 0 };
  keys.clear();
  if (knob) knob.style.transform = 'translate(-50%,-50%)';
  base?.classList.remove('active');
  sync();
}
