// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  main.js — bootstrap & game loop
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { tick, state, on } from './game.js';
import * as render3d from './render3d.js';
import * as input    from './input.js';
import * as ui       from './ui.js';

const diag = (m, cls) => { try { window.__diag && window.__diag(m, cls); } catch(e){} };

diag('main.js: all imports resolved', 'ok');

async function boot() {
  diag('boot(): start');
  const stage = document.getElementById('stage');
  const loadingEl = document.getElementById('loading');

  try {
    diag('render3d.init()...');
    await render3d.init(stage);
    diag('  render3d.init OK', 'ok');
  } catch (e) {
    diag('render3d.init FAILED: ' + (e && e.message || e), 'err');
    if (e && e.stack) diag(String(e.stack).slice(0, 300), 'err');
    return;
  }

  try {
    input.init();
    ui.init();
    diag('input+ui OK', 'ok');
  } catch (e) {
    diag('input/ui init FAILED: ' + (e && e.message || e), 'err');
    return;
  }

  on('hit', e => {
    render3d.triggerHitFlash(e.wx, e.z, e.h);
    render3d.triggerSwing(e.hitter === 0);
  });
  on('bounce', e => {
    render3d.triggerBounce(e.wx, e.z);
  });

  diag('all systems go, starting loop...', 'ok');
  loadingEl.classList.add('hidden');

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

boot().catch(e => {
  diag('boot() unhandled: ' + (e && e.message || e), 'err');
});
