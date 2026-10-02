// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  main.js — 起動とメインループ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { PHYS_DT, HUMAN } from './config.js';
import { state, step, on } from './match.js';
import * as view from './render/scene.js';
import * as input from './input.js';
import * as ui from './ui.js';
import * as audio from './audio.js';

function boot() {
  view.init(document.getElementById('stage'));
  input.init({ onPress: () => audio.unlock() });
  ui.init();

  on('hit', e => {
    view.flashAt(e.pos, e.type === 'smash' || e.speed > 24);
    audio.hit(Math.min(1.5, e.speed / 20), e.who !== HUMAN);
  });
  on('bounce', e => { view.bounceAt(e.x, e.z); audio.bounce(e.z < 0); });
  on('net', () => audio.net());
  on('netcord', () => audio.net());
  on('whiff', () => audio.whiff());
  on('fault', () => audio.fault());
  on('point', e => audio.point(e.winner === HUMAN));
  on('matchStart', () => view.snapCamera(state));

  document.getElementById('loading').remove();

  let last = performance.now();
  let acc = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += dt;
    let n = 0;
    while (acc >= PHYS_DT && n < 24) { step(PHYS_DT); acc -= PHYS_DT; n++; }
    if (n === 24) acc = 0;
    ui.syncHud();
    view.render(state, dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

try {
  boot();
} catch (e) {
  const el = document.getElementById('loading');
  if (el) el.innerHTML = `<p>起動に失敗しました</p><pre>${String(e && e.message || e)}</pre><button onclick="location.reload()">再読み込み</button>`;
  throw e;
}
