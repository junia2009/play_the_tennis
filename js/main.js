// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  main.js — 起動とメインループ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { PHYS_DT, HUMAN } from './config.js';
import { state, step, on } from './match.js';
import * as view from './render/scene.js';
import * as input from './input.js';
import * as ui from './ui.js';
import * as audio from './audio.js';

let hitStop = 0;

function boot() {
  view.init(document.getElementById('stage'));
  input.init({ onPress: () => audio.unlock() });
  ui.init();

  on('hit', e => {
    const strong = e.grade === 'perfect' || e.type === 'smash';
    view.flashAt(e.pos, strong || e.speed > 24);
    view.setTrail(e.serve ? 'flat' : e.type);
    audio.hit(Math.min(1.5, e.speed / 20) + (strong ? 0.4 : 0), e.who !== HUMAN);
    if (e.who === HUMAN) {
      if (strong) { hitStop = 0.07; view.shake(0.09); }
      else if (e.grade === 'good') view.shake(0.03);
      if (e.grade) ui.showGrade(e.grade, e.type);
    }
  });
  on('reserve', () => { if (state.aim) view.showAimAt(state.aim.x, state.aim.z); });
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
    // ヒットストップ中はロジックを止める
    if (hitStop > 0) hitStop -= dt;
    else acc += dt;
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
