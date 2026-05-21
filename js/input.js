// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  input.js — touch stick, shot buttons, keyboard
//  All UI is in DOM elements (#stick, .sb buttons).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { setStick, requestSwing, state } from './game.js';

const STICK_RADIUS = 60;      // half of #stick CSS size (120px)
const KNOB_RANGE   = 36;      // max distance knob travels

let stickEl, knobEl;
let stickActiveId = null;     // touch identifier for stick
let stickCenterX = 0, stickCenterY = 0;
let stickDx = 0, stickDy = 0;

// Multi-touch identifiers held by each button to support simultaneous press
const buttonTouches = new Map();   // touchId → buttonId

function setKnob(dx, dy) {
  knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  // dx/dy as normalized -1..1
  const nx = dx / KNOB_RANGE;
  const ny = dy / KNOB_RANGE;
  stickDx = nx;
  stickDy = ny;
  setStick(true, nx, ny);
}

function resetStick() {
  knobEl.style.transform = 'translate(-50%, -50%)';
  stickDx = 0; stickDy = 0;
  setStick(false, 0, 0);
  stickEl.classList.remove('active');
}

function onStickStart(clientX, clientY, id) {
  if (state.phase !== 'playing') return;
  const r = stickEl.getBoundingClientRect();
  stickCenterX = r.left + r.width / 2;
  stickCenterY = r.top + r.height / 2;
  stickActiveId = id;
  stickEl.classList.add('active');
  onStickMove(clientX, clientY, id);
}
function onStickMove(clientX, clientY, id) {
  if (stickActiveId !== id) return;
  let dx = clientX - stickCenterX;
  let dy = clientY - stickCenterY;
  const dist = Math.hypot(dx, dy);
  if (dist > KNOB_RANGE) {
    dx = dx * KNOB_RANGE / dist;
    dy = dy * KNOB_RANGE / dist;
  }
  setKnob(dx, dy);
}
function onStickEnd(id) {
  if (stickActiveId !== id) return;
  stickActiveId = null;
  resetStick();
}

const SHOT_BUTTONS = ['lob', 'topspin', 'slice', 'flat'];

function hookButton(btnId) {
  const el = document.getElementById('sb-' + btnId);
  if (!el) return;
  const press = () => {
    if (state.phase !== 'playing') return;
    el.classList.add('pressed');
    requestSwing(btnId);
  };
  const release = () => el.classList.remove('pressed');

  el.addEventListener('touchstart', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      buttonTouches.set(t.identifier, btnId);
      press();
    }
  }, { passive: false });
  el.addEventListener('touchend', e => {
    e.preventDefault();
    for (const t of e.changedTouches) buttonTouches.delete(t.identifier);
    release();
  }, { passive: false });
  el.addEventListener('touchcancel', e => {
    for (const t of e.changedTouches) buttonTouches.delete(t.identifier);
    release();
  });

  el.addEventListener('mousedown', e => { e.preventDefault(); press(); });
  el.addEventListener('mouseup',   release);
  el.addEventListener('mouseleave',release);
}

export function init() {
  stickEl = document.getElementById('stick');
  knobEl  = document.getElementById('knob');

  // Stick touch
  stickEl.addEventListener('touchstart', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (stickActiveId === null) onStickStart(t.clientX, t.clientY, t.identifier);
    }
  }, { passive: false });
  stickEl.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) onStickMove(t.clientX, t.clientY, t.identifier);
  }, { passive: false });
  stickEl.addEventListener('touchend', e => {
    e.preventDefault();
    for (const t of e.changedTouches) onStickEnd(t.identifier);
  }, { passive: false });
  stickEl.addEventListener('touchcancel', e => {
    for (const t of e.changedTouches) onStickEnd(t.identifier);
  });

  // Stick mouse
  stickEl.addEventListener('mousedown', e => {
    e.preventDefault();
    onStickStart(e.clientX, e.clientY, 'mouse');
    const move = (ev) => onStickMove(ev.clientX, ev.clientY, 'mouse');
    const up   = ()    => {
      onStickEnd('mouse');
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup',   up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup',   up);
  });

  // Buttons
  SHOT_BUTTONS.forEach(hookButton);

  // Keyboard
  const keys = {};
  document.addEventListener('keydown', e => {
    if (state.phase !== 'playing') return;
    if (e.code === 'Space') { e.preventDefault(); requestSwing('flat'); }
    if (e.code === 'KeyZ')  requestSwing('topspin');
    if (e.code === 'KeyX')  requestSwing('slice');
    if (e.code === 'KeyC')  requestSwing('lob');
    keys[e.code] = true;
    updateKeyboardStick(keys);
  });
  document.addEventListener('keyup', e => {
    keys[e.code] = false;
    updateKeyboardStick(keys);
  });
}

function updateKeyboardStick(keys) {
  let nx = 0, ny = 0;
  if (keys['ArrowLeft'])  nx = -1;
  if (keys['ArrowRight']) nx = +1;
  if (keys['ArrowUp'])    ny = -1;
  if (keys['ArrowDown'])  ny = +1;
  if (nx === 0 && ny === 0 && stickActiveId === null) {
    setStick(false, 0, 0);
  } else if (stickActiveId === null) {
    setStick(true, nx, ny);
  }
}
