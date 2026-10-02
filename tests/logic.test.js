import test from 'node:test';
import assert from 'node:assert/strict';

import { COURT, SHOTS, SERVES, PHYS_DT, HUMAN, CPU } from '../js/config.js';
import * as Score from '../js/score.js';
import { createBall, solveShot, launch, predict, stepBall, inServiceBox, inCourt } from '../js/physics.js';
import { state, input, step, startMatch, on } from '../js/match.js';

// ── スコア ─────────────────────────────────
test('ゲームの基本進行 (40-0 から取って1ゲーム)', () => {
  const s = Score.createScore(6, HUMAN);
  for (let i = 0; i < 3; i++) Score.addPoint(s, HUMAN);
  assert.deepEqual(Score.pointLabels(s), ['40', '0']);
  const r = Score.addPoint(s, HUMAN);
  assert.equal(r.game, HUMAN);
  assert.deepEqual(s.games, [1, 0]);
  assert.equal(Score.server(s), CPU);
});

test('デュースとアドバンテージ', () => {
  const s = Score.createScore(6, HUMAN);
  for (let i = 0; i < 3; i++) { Score.addPoint(s, 0); Score.addPoint(s, 1); }
  assert.equal(Score.callText(s), 'デュース');
  Score.addPoint(s, 1);
  assert.deepEqual(Score.pointLabels(s), ['40', 'Ad']);
  Score.addPoint(s, 0);
  assert.equal(Score.callText(s), 'デュース');
  Score.addPoint(s, 0);
  const r = Score.addPoint(s, 0);
  assert.equal(r.game, 0);
});

test('サーブサイドはポイント合計の偶奇', () => {
  const s = Score.createScore(6, HUMAN);
  assert.equal(Score.serveSide(s), 'deuce');
  Score.addPoint(s, 0);
  assert.equal(Score.serveSide(s), 'ad');
});

test('1ゲームマッチは1ゲームで終了', () => {
  const s = Score.createScore(1, HUMAN);
  let r;
  for (let i = 0; i < 4; i++) r = Score.addPoint(s, CPU);
  assert.equal(r.match, CPU);
});

test('6-6 でタイブレーク、サーバー交代は 1,2,2,...', () => {
  const s = Score.createScore(6, HUMAN);
  const winGame = p => { for (let i = 0; i < 4; i++) Score.addPoint(s, p); };
  for (let i = 0; i < 6; i++) { winGame(0); winGame(1); }
  assert.equal(s.tiebreak, true);
  const first = Score.server(s);
  const seq = [];
  for (let i = 0; i < 5; i++) { seq.push(Score.server(s)); Score.addPoint(s, i % 2); }
  assert.deepEqual(seq, [first, 1 - first, 1 - first, first, first]);
});

test('タイブレークは7点先取かつ2点差', () => {
  const s = Score.createScore(3, HUMAN);
  const winGame = p => { for (let i = 0; i < 4; i++) Score.addPoint(s, p); };
  for (let i = 0; i < 3; i++) { winGame(0); winGame(1); }
  assert.equal(s.tiebreak, true);
  for (let i = 0; i < 6; i++) { Score.addPoint(s, 0); Score.addPoint(s, 1); }
  assert.equal(Score.addPoint(s, 0).match, null);
  assert.equal(Score.addPoint(s, 0).match, 0);
  assert.deepEqual(s.games, [4, 3]);
});

test('4-4 では終わらず 5-3 で 3ゲーム先取マッチは…', () => {
  const s = Score.createScore(3, HUMAN);
  const winGame = p => { let r; for (let i = 0; i < 4; i++) r = Score.addPoint(s, p); return r; };
  winGame(0); winGame(0);
  assert.equal(winGame(0).match, 0);   // 3-0
});

// ── 物理 ───────────────────────────────────
function flyUntilBounce(b) {
  for (let i = 0; i < 2000; i++) {
    const ev = stepBall(b, PHYS_DT);
    if (ev === 'bounce' || ev === 'net') return ev;
  }
  return null;
}

test('各ショットは狙った地点付近に落ち、ネットを越える', () => {
  for (const [name, cfg] of Object.entries(SHOTS)) {
    for (const from of [{ x: 1, y: 1.0, z: 11.5 }, { x: -3, y: 0.5, z: 8 }, { x: 0, y: 2.4, z: 5 }]) {
      const target = { x: -2, z: -9 };
      const b = createBall();
      const { vel } = solveShot(from, target, cfg);
      launch(b, from, vel, cfg);
      const ev = flyUntilBounce(b);
      assert.equal(ev, 'bounce', `${name} from ${JSON.stringify(from)} should clear net`);
      assert.ok(Math.abs(b.pos.x - target.x) < 0.15, `${name} x ${b.pos.x}`);
      assert.ok(Math.abs(b.pos.z - target.z) < 0.25, `${name} z ${b.pos.z}`);
    }
  }
});

test('サーブはサービスボックスに入る（誤差なし）', () => {
  for (const [name, cfg] of Object.entries(SERVES)) {
    const from = { x: 0.8, y: 2.85, z: COURT.halfL };
    const target = { x: -2, z: -5.6 };
    const opt = { ...cfg, ax: cfg.curve ? -3.2 : 0 };
    const b = createBall();
    const { vel } = solveShot(from, target, opt);
    launch(b, from, vel, opt);
    assert.equal(flyUntilBounce(b), 'bounce', name);
    assert.ok(inServiceBox(b.pos.x, b.pos.z, -1, -1), `${name} at ${b.pos.x},${b.pos.z}`);
  }
});

test('低い弾道はネットに掛かる', () => {
  const b = createBall();
  launch(b, { x: 0, y: 0.8, z: 10 }, { x: 0, y: 1, z: -25 }, { spin: 0 });
  assert.equal(flyUntilBounce(b), 'net');
  assert.ok(b.pos.z > 0);
});

test('コート判定', () => {
  assert.equal(inCourt(4.1, -11.8, -1), true);
  assert.equal(inCourt(4.3, -5, -1), false);
  assert.equal(inCourt(0, -12.1, -1), false);
  assert.equal(inCourt(0, 3, -1), false);
});

test('predict は最初のバウンドを返す', () => {
  const b = createBall();
  const from = { x: 0, y: 1, z: 11 };
  const { vel } = solveShot(from, { x: 1, z: -8 }, SHOTS.topspin);
  launch(b, from, vel, SHOTS.topspin);
  const tr = predict(b, 4, 1);
  const bounce = tr.find(s => s.bounce);
  assert.ok(Math.abs(bounce.z + 8) < 0.3);
});

// ── 試合シミュレーション ─────────────────────
// 人間側をボットで操作し、試合が最後まで進むことを確認する
function botHuman() {
  if (state.phase === 'serve' && state.serve.server === HUMAN) {
    if (state.serve.stage === 'ready' && state.serve.t === 0) input.shot = 'topspin';
    const b = state.ball;
    if (state.serve.stage === 'toss' && b.vel.y < 0 && b.pos.y < 2.9) input.shot = 'topspin';
  } else if (state.phase === 'rally' && state.rally.lastHitter === CPU && !state.players[HUMAN].pending) {
    input.shot = ['flat', 'topspin', 'slice'][Math.floor(Math.random() * 3)];
  }
}

for (const diff of ['easy', 'normal', 'hard']) {
  test(`試合が完走する (${diff})`, () => {
    let over = null;
    const reasons = {};
    let hits = 0;
    on('matchOver', e => { over = e; });
    on('point', e => { reasons[e.reason] = (reasons[e.reason] || 0) + 1; });
    on('hit', () => { hits++; });
    startMatch({ diff, format: 'g3', assist: true });
    let t = 0;
    while (state.phase !== 'over' && t < 60 * 60) {
      botHuman();
      step(PHYS_DT);
      t += PHYS_DT;
    }
    assert.equal(state.phase, 'over', `match did not finish (t=${t.toFixed(0)}s)`);
    assert.ok(over);
    const pts = state.stats.points[0] + state.stats.points[1];
    const rally = hits / pts;
    console.log(`  [${diff}] winner=${over.winner === 0 ? 'HUMAN' : 'CPU'} games=${state.score.games} points=${state.stats.points} hits/pt=${rally.toFixed(2)} longest=${state.stats.longestRally} reasons=${JSON.stringify(reasons)} time=${t.toFixed(0)}s`);
    assert.ok(rally > 1.5, 'rallies should happen');
  });
}
