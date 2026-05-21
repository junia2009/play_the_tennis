// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  main.js — bootstrap & game loop
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { tick, state, on } from './game.js';
import * as render3d from './render3d.js';
import * as input    from './input.js';
import * as ui       from './ui.js';

async function boot() {
  const stage = document.getElementById('stage');
  const loadingEl = document.getElementById('loading');

  try {
    await render3d.init(stage);
  } catch (e) {
    loadingEl.textContent = 'ERROR LOADING 3D';
    loadingEl.style.color = '#ef5350';
    console.error(e);
    return;
  }

  input.init();
  ui.init();

  // Hook game events → 3D effects
  on('hit', e => {
    render3d.triggerHitFlash(e.wx, e.z, e.h);
    render3d.triggerSwing(e.hitter === 0);
  });
  on('bounce', e => {
    render3d.triggerBounce(e.wx, e.z);
  });

  loadingEl.classList.add('hidden');

  // Game loop: fixed-timestep physics, but visual smoothing via render3d's clock
  const FIXED_DT_MS = 16.667;
  let acc = 0;
  let last = performance.now();

  function loop(t) {
    const elapsed = Math.min(t - last, 100);
    last = t;
    acc += elapsed;
    while (acc >= FIXED_DT_MS) {
      tick(FIXED_DT_MS);
      acc -= FIXED_DT_MS;
    }
    ui.syncHud();
    render3d.frame();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

boot();
