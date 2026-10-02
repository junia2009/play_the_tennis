// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  match.js — 試合進行（サーブ・ラリー・判定・CPU・移動補助）
//  three.js に依存しない。1ステップ = PHYS_DT 秒
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import {
  COURT, PHYS_DT, HUMAN, CPU, SHOTS, SERVES, PLAYER, DIFFICULTY, MATCH_FORMATS,
  clamp, gauss,
} from './config.js';
import {
  createBall, stepBall, solveShot, launch, predict, predictBounce, inCourt, inServiceBox,
} from './physics.js';
import * as Score from './score.js';

// ── イベント ───────────────────────────────────
const listeners = {};
export function on(ev, fn) { (listeners[ev] ||= []).push(fn); }
function emit(ev, data) { for (const fn of listeners[ev] || []) fn(data); }

// ── 入力（input.js から書き込む） ─────────────────
export const input = { mx: 0, my: 0, shot: null };

// ── 状態 ───────────────────────────────────────
function createPlayer(id) {
  const side = id === HUMAN ? 1 : -1;      // 自分のコートの z 符号
  return {
    id, side,
    facing: -side,                          // 向いている z 方向
    rightX: side,                           // 利き手（右手）側の x 方向
    pos: { x: 0, z: side * (COURT.halfL + 0.5) },
    vel: { x: 0, z: 0 },
    pending: null,          // 予約中のショット { type, t0 }
    aimStick: null,         // 予約中に入力された狙い { x, y }
    plan: null,             // 移動目標 { x, z, t }
    planAt: 0,              // CPU: この時刻になったら移動目標を計算
    prep: false,            // 打つ構え（ラケットを引く）
    anim: { name: 'idle', t: 0, hand: 'fh' },
    recover: { x: 0, z: side * (COURT.halfL + 0.5) },
  };
}

export const state = {
  phase: 'title',           // title | serve | rally | between | over
  paused: false,
  time: 0,
  settings: { diff: 'normal', format: 'g3', assist: true },
  score: null,
  ball: createBall(),
  ballVisible: false,
  players: [createPlayer(HUMAN), createPlayer(CPU)],
  serve: null,              // { server, receiver, side, boxX, second, stage, t, type, q }
  rally: null,              // { lastHitter, bounces, isServe, netcord, hits, touched }
  between: null,            // { t, next }
  hint: '',
  landing: null,            // 相手ボールの予測バウンド地点
  aim: null,                // プレイヤーの狙い（表示用）
  stats: null,
  lastPoint: null,
};

const rand = Math.random;
const randIn = (a, b) => a + (b - a) * rand();
const diff = () => DIFFICULTY[state.settings.diff];

// ── 試合開始 / 終了 ─────────────────────────────
export function startMatch(settings) {
  Object.assign(state.settings, settings || {});
  const games = MATCH_FORMATS[state.settings.format].games;
  state.score = Score.createScore(games, rand() < 0.5 ? HUMAN : CPU);
  state.players = [createPlayer(HUMAN), createPlayer(CPU)];
  state.stats = {
    points: [0, 0], aces: [0, 0], doubleFaults: [0, 0],
    winners: [0, 0], errors: [0, 0], longestRally: 0,
  };
  state.time = 0;
  state.paused = false;
  input.shot = null;
  setupServe(false);
  emit('matchStart', {});
}

export function quitToTitle() {
  state.phase = 'title';
  state.paused = false;
  state.ballVisible = false;
  state.landing = null;
  state.aim = null;
}

export function setPaused(v) {
  if (state.phase === 'title' || state.phase === 'over') return;
  state.paused = v;
  input.shot = null;
}

// ── サーブ準備 ────────────────────────────────
function setupServe(second) {
  const sc = state.score;
  const server = Score.server(sc);
  const receiver = 1 - server;
  const side = Score.serveSide(sc);
  const sp = state.players[server], rp = state.players[receiver];
  const sideSign = side === 'deuce' ? 1 : -1;
  const serverX = sp.rightX * sideSign * 0.8;
  const boxX = -Math.sign(serverX);

  sp.pos = { x: serverX, z: sp.side * (COURT.halfL + 0.25) };
  rp.pos = { x: boxX * 2.3, z: rp.side * (COURT.halfL + 0.7) };
  for (const p of state.players) {
    p.vel = { x: 0, z: 0 };
    p.pending = null; p.aimStick = null; p.plan = null; p.prep = false;
    p.anim = { name: 'idle', t: 0, hand: 'fh' };
  }

  state.serve = { server, receiver, side, boxX, second, stage: 'ready', t: 0, type: 'flat', q: 1 };
  state.rally = null;
  state.phase = 'serve';
  state.landing = null;
  state.aim = null;
  state.ballVisible = true;
  holdBallAtHand();
  input.shot = null;

  emit('serveReady', { server, second });
}

function holdBallAtHand() {
  const sp = state.players[state.serve.server];
  const b = state.ball;
  b.pos = { x: sp.pos.x + sp.rightX * -0.25, y: 1.0, z: sp.pos.z + sp.facing * 0.25 };
  b.vel = { x: 0, y: 0, z: 0 };
  b.spin = 0; b.ax = 0; b.rolling = false;
}

function startToss(type) {
  const sv = state.serve;
  const sp = state.players[sv.server];
  sv.stage = 'toss';
  sv.t = 0;
  sv.type = type;
  const b = state.ball;
  b.pos = { x: sp.pos.x + sp.rightX * 0.3, y: 1.55, z: sp.pos.z + sp.facing * 0.35 };
  b.vel = { x: 0, y: 5.6, z: 0 };
  b.spin = 0; b.ax = 0; b.rolling = false; b.bounceH = 0.7; b.bounceV = 0.6;
  sp.anim = { name: 'toss', t: 0, hand: 'serve' };
  emit('toss', { who: sv.server });
}

function strikeServe(q) {
  const sv = state.serve;
  const sp = state.players[sv.server];
  const rp = state.players[sv.receiver];
  const cfg = SERVES[sv.type];
  const isHuman = sv.server === HUMAN;
  const b = state.ball;

  let tx, tz;
  const boxCenter = sv.boxX * COURT.halfW / 2;
  if (isHuman) {
    tx = boxCenter + input.mx * 1.7;
    tz = rp.side * (COURT.service - 0.85 + input.my * -0.4);
  } else {
    tx = sv.boxX * randIn(0.45, COURT.halfW - 0.45);
    tz = rp.side * randIn(COURT.service - 2.2, COURT.service - 0.55);
  }
  tx = sv.boxX * clamp(tx * sv.boxX, 0.2, COURT.halfW - 0.2);

  const errMul = isHuman ? 1 : diff().err;
  const sigma = cfg.err * errMul * (1 + (1 - q) * 2.0) * (sv.second ? 0.8 : 1);
  tx += gauss(rand) * sigma;
  tz += gauss(rand) * sigma * 0.9;

  const pace = (0.86 + 0.18 * q) * (isHuman ? 1 : diff().pace);
  const curve = cfg.curve ? -sp.rightX * 3.2 : 0;
  const from = { ...b.pos };
  const opt = { speed: cfg.speed * pace, spin: cfg.spin, clearance: cfg.clearance, ax: curve };
  const { vel } = solveShot(from, { x: tx, z: tz }, opt);
  vel.y += gauss(rand) * 0.25 * (1 - q) * (sv.second ? 0.5 : 1);
  launch(b, from, vel, { ...opt, bounceH: 0.78, bounceV: 0.68 });

  sv.stage = 'flight';
  state.phase = 'rally';
  state.rally = { lastHitter: sv.server, bounces: 0, isServe: true, netcord: false, hits: 1, t: 0 };
  sp.anim = { name: 'serve', t: 0, hand: 'serve' };
  onBallStruck(sv.server);
  emit('hit', { who: sv.server, type: sv.type, serve: true, speed: Math.hypot(vel.x, vel.z, vel.y), pos: { ...from } });
}

// ── ラリー：打球 ────────────────────────────────
function handFor(p, ball) {
  if (ball.pos.y > 2.15) return 'overhead';
  const dx = (ball.pos.x - p.pos.x) * p.rightX;
  return dx >= -0.1 ? 'fh' : 'bh';
}

// p がいま打てる位置にボールがあるか。front: 体の前方距離
function reachInfo(p) {
  const b = state.ball, r = state.rally;
  if (!r || r.lastHitter === p.id) return null;
  if (r.isServe && r.bounces === 0) return null;     // サーブはノーバウンドで返せない
  if (b.rolling) return null;
  if (b.pos.z * p.side < -0.2) return null;
  if (b.vel.z * p.side <= 0) return null;            // こちらに向かっていない
  const dx = b.pos.x - p.pos.x;
  const front = (b.pos.z - p.pos.z) * p.facing;
  const y = b.pos.y;
  return {
    dx, front, y,
    inside: Math.abs(dx) <= (p.id === HUMAN ? PLAYER.reachX : diff().reach) && front <= PLAYER.reachFront && front >= -PLAYER.reachBack
      && y >= PLAYER.minHitY && y <= PLAYER.maxHitY,
    late: front < -PLAYER.reachBack,
  };
}

function strikeRally(p, type, quality) {
  const b = state.ball;
  const r = state.rally;
  const opp = state.players[1 - p.id];
  const isHuman = p.id === HUMAN;
  const hand = handFor(p, b);
  const volley = r.bounces === 0;

  let shotType = type;
  const overhead = hand === 'overhead' && type !== 'lob';
  let cfg = { ...SHOTS[shotType] };
  if (overhead) cfg = { ...SHOTS.flat, speed: 25, clearance: 0.15, err: 0.9 };
  if (volley && !overhead) cfg = { ...cfg, speed: cfg.speed * 0.85 };

  // 狙い
  let tx, depth;
  if (isHuman) {
    ({ tx, depth } = humanAim(p, shotType));
  } else {
    ({ tx, depth } = cpuAim(p, opp, shotType));
  }
  const tz = -p.side * depth;

  // 誤差
  const ballSpeed = Math.hypot(b.vel.x, b.vel.z);
  const speedFactor = clamp(Math.sqrt(ballSpeed / 17), 0.8, 1.4);
  // 当たりの良さ（人間のみ演出に使う）
  const grade = quality.charge >= 0.75 && quality.pos >= 0.85 && quality.height === 1 ? 'perfect'
    : quality.charge >= 0.35 && quality.pos >= 0.6 ? 'good' : 'poor';
  const errMul = isHuman ? PLAYER.humanErr * (grade === 'perfect' ? 0.6 : 1) : diff().err;
  const fatigue = 1 + Math.min(r.hits, 30) * 0.04;   // ラリーが続くほどミスが出やすい
  const sigma = cfg.err * errMul * fatigue * speedFactor * (1.55 - 0.6 * quality.charge) * (1 + (1 - quality.pos) * 1.3) * quality.height;
  const ex = gauss(rand) * sigma;
  const ez = gauss(rand) * sigma * 0.9;

  const pace = (0.80 + 0.26 * quality.charge) * (0.75 + 0.25 * quality.pos)
    * (isHuman ? (grade === 'perfect' ? 1.15 : 1) : diff().pace);
  const from = { x: b.pos.x, y: b.pos.y, z: b.pos.z };
  const opt = { speed: cfg.speed * pace, spin: cfg.spin, clearance: cfg.clearance };
  const { vel } = solveShot(from, { x: tx + ex, z: tz + ez }, opt);
  vel.y += gauss(rand) * 0.35 * (1 - quality.pos) * (shotType === 'lob' ? 0.3 : 1);
  launch(b, from, vel, { ...opt, bounceH: cfg.bounceH, bounceV: cfg.bounceV });

  r.lastHitter = p.id;
  r.bounces = 0;
  r.isServe = false;
  r.netcord = false;
  r.hits++;
  r.t = 0;
  p.pending = null;
  p.aimStick = null;
  p.prep = false;
  p.anim = { name: 'swing', t: 0, hand: volley && hand !== 'overhead' ? 'v' + hand : hand };
  onBallStruck(p.id);
  emit('hit', { who: p.id, type: overhead ? 'smash' : shotType, serve: false, speed: Math.hypot(vel.x, vel.z), pos: from, volley, grade: isHuman ? grade : null });
}

// プレイヤーの狙い。予約中に入れたスティックの向きで決まる（入力なしなら相手の逆サイド深く）
export function humanAim(p, type) {
  const cfg = SHOTS[type];
  const opp = state.players[1 - p.id];
  const a = p.aimStick;
  let tx, depth;
  if (a) {
    tx = clamp(a.x, -1, 1) * PLAYER.aimMaxX;
    depth = cfg.depth - clamp(a.y, -1, 1) * 2.2;
  } else {
    const away = Math.abs(opp.pos.x) > 0.3 ? -Math.sign(opp.pos.x) : -(Math.sign(p.pos.x) || 1);
    tx = away * 1.9;
    depth = cfg.depth;
  }
  if (type === 'lob') depth = Math.max(depth, 9.2);
  return { tx, depth: clamp(depth, 4.5, 11.3) };
}

function cpuAim(p, opp, type) {
  const d = diff();
  const m = d.aimMargin;
  let tx, depth;
  if (rand() < d.kindRatio) {
    tx = opp.pos.x * 0.6 + randIn(-1, 1);
    depth = randIn(7.0, 9.5);
  } else {
    const away = -Math.sign(opp.pos.x - 0.0001 * p.side) || 1;
    tx = away * randIn(0.6, COURT.halfW - m);
    depth = randIn(7.8, COURT.halfL - m);
  }
  if (opp.pos.z * opp.side < 6 && type !== 'lob') {
    // ネットに出てきた相手にはパッシング
    tx = Math.sign(tx || 1) * randIn(COURT.halfW - m - 0.6, COURT.halfW - m);
    depth = randIn(8.5, COURT.halfL - m);
  }
  if (type === 'lob') depth = randIn(9.5, COURT.halfL - m * 0.8);
  return { tx, depth };
}

function shotQuality(p, info, charge) {
  const lat = Math.abs(info.dx);
  const run = Math.hypot(p.vel.x, p.vel.z);
  const pos = 1 - clamp((lat - 1.0) / 0.8, 0, 0.9) - clamp(Math.abs(info.front - 0.15) - 0.45, 0, 0.3)
    - clamp((run - 2.0) / 6, 0, 0.45);
  const y = info.y;
  const height = y < 0.25 ? 1.5 : y > 2.4 ? 1.25 : 1;
  return { charge: clamp(charge, 0, 1), pos: clamp(pos, 0.05, 1), height };
}

// 打った直後の共通処理：相手の移動計画をリセット
function onBallStruck(hitter) {
  const opp = state.players[1 - hitter];
  const me = state.players[hitter];
  opp.plan = null;
  opp.prep = false;
  opp.planAt = state.time + (opp.id === CPU ? diff().react : 0);
  me.plan = null;
  state.landing = null;
  if (opp.id === HUMAN) {
    const lb = predictBounce(state.ball);
    if (lb) state.landing = { x: lb.x, z: lb.z };
  }
  // 打った側のリカバリー位置
  if (me.id === CPU) {
    const netRush = diff().net && me.pos.z * me.side < 7.5 && rand() < 0.6;
    me.recover = netRush
      ? { x: clamp(state.ball.pos.x * 0.4, -2, 2), z: me.side * 3.2 }
      : { x: clamp(state.ball.pos.x * 0.25, -1.2, 1.2), z: me.side * (COURT.halfL + 0.7) };
  }
}

// ── 打点の予測（移動計画） ────────────────────────
export function planIntercept(p, ball, rally, maxSpeed = PLAYER.maxSpeed) {
  const tr = predict(ball, 3.5, 2);
  const allowVolley = !(rally.isServe && rally.bounces === 0) && Math.abs(p.pos.z) < 6.5;
  const prefDepth = COURT.halfL + 0.8;
  let best = null, bestCost = Infinity, last = null;

  for (const s of tr) {
    if (s.net) return null;
    const zz = s.z * p.side;
    if (zz < 0.4) continue;
    const nb = rally.bounces + s.bounces;
    if (nb >= 2) break;
    if (nb === 0) {
      // ネット際ならボレー
      if (allowVolley && s.y > 0.35 && s.y < 2.5 && zz >= Math.abs(p.pos.z) - 0.4) { best = s; break; }
      continue;
    }
    last = s;
    if (s.y < 0.3 || s.y > 2.4 || zz > COURT.halfL + 4.5) continue;
    const pos = standPos(p, s);
    const travel = Math.hypot(pos.x - p.pos.x, pos.z - p.pos.z) / maxSpeed + 0.12;
    const cost = Math.abs(zz - prefDepth) * 0.5
      + Math.max(0, s.y - 1.3) * 1.2 + Math.max(0, 0.6 - s.y) * 2
      + Math.max(0, travel - s.t) * 6;
    if (cost < bestCost) { bestCost = cost; best = s; }
  }
  const hit = best || last;
  if (!hit) return null;
  const pos = standPos(p, hit);
  return { x: pos.x, z: pos.z, t: hit.t, y: hit.y, bx: hit.x, bz: hit.z };
}

function standPos(p, s) {
  const fhX = s.x - p.rightX * PLAYER.idealOffset;
  const bhX = s.x + p.rightX * PLAYER.idealOffset;
  const x = Math.abs(fhX - p.pos.x) <= Math.abs(bhX - p.pos.x) + 0.5 ? fhX : bhX;
  return { x, z: s.z - p.facing * 0.15 };
}

// ── 移動 ────────────────────────────────────────
function moveToward(p, tx, tz, maxSpeed, dt, arriveR = 0.06) {
  const dx = tx - p.pos.x, dz = tz - p.pos.z;
  const d = Math.hypot(dx, dz);
  let vx = 0, vz = 0;
  if (d > arriveR) {
    // 到着時に止まれるように減速
    const sp = Math.min(maxSpeed, Math.sqrt(2 * PLAYER.accel * 0.6 * d));
    vx = dx / d * sp; vz = dz / d * sp;
  }
  accelTo(p, vx, vz, dt);
}

function accelTo(p, vx, vz, dt) {
  const ddx = vx - p.vel.x, ddz = vz - p.vel.z;
  const dd = Math.hypot(ddx, ddz);
  const maxDv = PLAYER.accel * dt;
  if (dd > maxDv) { p.vel.x += ddx / dd * maxDv; p.vel.z += ddz / dd * maxDv; }
  else { p.vel.x = vx; p.vel.z = vz; }
  p.pos.x += p.vel.x * dt;
  p.pos.z += p.vel.z * dt;
}

function clampPlayer(p) {
  p.pos.x = clamp(p.pos.x, -7.5, 7.5);
  const zz = clamp(p.pos.z * p.side, 0.7, COURT.halfL + 5.5);
  p.pos.z = zz * p.side;
}

// ── 人間プレイヤー ──────────────────────────────
function updateHuman(dt) {
  const p = state.players[HUMAN];
  const shot = input.shot;
  input.shot = null;
  const mag = Math.hypot(input.mx, input.my);

  // サーブ時
  if (state.phase === 'serve' && state.serve.server === HUMAN) {
    const sv = state.serve;
    if (sv.stage === 'ready') {
      const sign = Math.sign(p.pos.x) || 1;
      p.pos.x = sign * clamp((p.pos.x + input.mx * 3.0 * dt) * sign, 0.25, 3.2);
      p.vel.x = 0; p.vel.z = 0;
      holdBallAtHand();
      if (shot) startToss(shot);
    } else if (sv.stage === 'toss' && shot) {
      const y = state.ball.pos.y;
      const q = clamp(1 - Math.abs(y - 2.85) / 0.95, 0, 1);
      strikeServe(q);
    }
    return;
  }
  if (state.phase === 'serve') {
    // レシーブ待ち：少しだけ動ける
    accelTo(p, input.mx * 2.5, input.my * 2.5, dt);
    clampPlayer(p);
    return;
  }
  if (state.phase !== 'rally') {
    accelTo(p, 0, 0, dt);
    return;
  }

  const r = state.rally;
  const incoming = r.lastHitter === CPU;

  const assist = state.settings.assist;
  const stickNow = mag > 0.3 ? { x: input.mx / Math.max(1, mag), y: input.my / Math.max(1, mag) } : null;

  // ショット予約（予約し直しで種類だけ変更）
  if (shot && incoming) {
    const t0 = p.pending ? p.pending.t0 : state.time;
    p.pending = { type: shot, t0 };
    if (!assist || !p.aimStick) p.aimStick = stickNow;
    emit('reserve', { type: shot });
  }
  // 狙いの更新：補助ONなら予約後のスティックは狙い専用。OFFなら打つ瞬間の向き
  if (p.pending) {
    if (assist) { if (stickNow) p.aimStick = stickNow; }
    else p.aimStick = stickNow;
  }

  // 移動
  const swingSlow = p.anim.name === 'swing' && p.anim.t < 0.3 ? 0.45 : 1;
  if (assist && p.pending && incoming) {
    // 予約中は打点まで自動で走る
    if (!p.plan) p.plan = planIntercept(p, state.ball, r);
    if (p.plan) moveToward(p, p.plan.x, p.plan.z, PLAYER.maxSpeed * swingSlow, dt);
    else accelTo(p, 0, 0, dt);
  } else if (mag > 0.18) {
    const k = Math.min(1, mag);
    accelTo(p, input.mx / mag * k * PLAYER.maxSpeed * swingSlow, input.my / mag * k * PLAYER.maxSpeed * swingSlow, dt);
  } else if (state.settings.assist && incoming) {
    if (!p.plan) p.plan = planIntercept(p, state.ball, r);
    if (p.plan) moveToward(p, p.plan.x, p.plan.z, PLAYER.maxSpeed * 0.92 * swingSlow, dt);
    else accelTo(p, 0, 0, dt);
  } else if (state.settings.assist && !incoming) {
    moveToward(p, p.pos.x * 0.0, p.pos.z, PLAYER.maxSpeed * 0.35, dt, 0.4);
  } else {
    accelTo(p, 0, 0, dt);
  }
  clampPlayer(p);

  // 狙い表示
  if (p.pending) {
    const { tx, depth } = humanAim(p, p.pending.type);
    state.aim = { x: tx, z: -depth, type: p.pending.type };
  } else {
    state.aim = null;
  }

  // 打球判定
  if (!incoming) { p.prep = false; return; }
  const info = reachInfo(p);
  if (!info) return;
  if (p.pending) {
    p.prep = info.front < 6;
    if (info.inside) {
      const charge = (state.time - p.pending.t0) / 0.7;
      strikeRally(p, p.pending.type, shotQuality(p, info, charge));
    } else if (info.late) {
      // 振り遅れ
      p.anim = { name: 'swing', t: 0, hand: handFor(p, state.ball) };
      p.pending = null;
      p.aimStick = null;
      p.prep = false;
      emit('whiff', { who: HUMAN });
    }
  }
}

// ── CPU ───────────────────────────────────────
function updateCPU(dt) {
  const p = state.players[CPU];
  const d = diff();

  if (state.phase === 'serve') {
    const sv = state.serve;
    if (sv.server === CPU) {
      accelTo(p, 0, 0, dt);
      sv.t += dt;
      if (sv.stage === 'ready') {
        holdBallAtHand();
        if (sv.t > 1.1) startToss(cpuServeType(sv.second));
      } else if (sv.stage === 'toss') {
        const b = state.ball;
        if (b.vel.y < 0 && b.pos.y < 2.9) {
          const q = clamp(1 - Math.abs(gauss(rand)) * 0.18 * d.err, 0.3, 1);
          strikeServe(q);
        }
      }
    } else {
      accelTo(p, 0, 0, dt);
    }
    return;
  }
  if (state.phase !== 'rally') { accelTo(p, 0, 0, dt); return; }

  const r = state.rally;
  const incoming = r.lastHitter === HUMAN;
  if (incoming) {
    if (!p.plan && state.time >= p.planAt) {
      const pl = planIntercept(p, state.ball, r, d.speed);
      if (pl) {
        pl.x += gauss(rand) * d.posErr;
        pl.z += gauss(rand) * d.posErr * 0.5;
        p.plan = pl;
      } else {
        p.plan = { x: p.pos.x, z: p.pos.z, t: 0, none: true };
      }
    }
    if (p.plan) moveToward(p, p.plan.x, p.plan.z, d.speed, dt);
    else accelTo(p, 0, 0, dt);

    const info = reachInfo(p);
    if (info) {
      p.prep = info.front < 5;
      if (info.inside && info.front <= 0.45) {
        const q = shotQuality(p, info, 0.55 + d.pace * 0.35 + randIn(-0.15, 0.15));
        strikeRally(p, cpuShotType(p, info), q);
      }
    }
  } else {
    moveToward(p, p.recover.x, p.recover.z, d.speed * 0.8, dt, 0.25);
    p.prep = false;
  }
  clampPlayer(p);
}

function cpuServeType(second) {
  const k = state.settings.diff;
  if (second) return k === 'easy' ? 'lob' : 'topspin';
  const x = rand();
  if (k === 'easy') return x < 0.5 ? 'topspin' : 'lob';
  if (k === 'normal') return x < 0.4 ? 'flat' : x < 0.7 ? 'slice' : 'topspin';
  return x < 0.6 ? 'flat' : x < 0.85 ? 'slice' : 'topspin';
}

function cpuShotType(p, info) {
  const human = state.players[HUMAN];
  const x = rand();
  if (info.y > 2.15) return 'flat';
  if (human.pos.z < 5.5 && x < 0.35) return 'lob';
  if (info.y < 0.35) return x < 0.6 ? 'slice' : 'lob';
  switch (state.settings.diff) {
    case 'easy': return x < 0.45 ? 'topspin' : x < 0.8 ? 'slice' : 'lob';
    case 'normal': return x < 0.45 ? 'topspin' : x < 0.75 ? 'flat' : x < 0.95 ? 'slice' : 'lob';
    default: return x < 0.4 ? 'topspin' : x < 0.8 ? 'flat' : 'slice';
  }
}

// ── ボールの判定 ────────────────────────────────
function updateBall(dt) {
  const b = state.ball;
  if (state.phase === 'serve') {
    if (state.serve.stage === 'toss') {
      stepBall(b, dt);
      if (b.vel.y < 0 && b.pos.y < 1.35) {
        // トス失敗 → やり直し
        state.serve.stage = 'ready';
        state.serve.t = 0;
        state.players[state.serve.server].anim = { name: 'idle', t: 0, hand: 'fh' };
        holdBallAtHand();
        if (state.serve.server === HUMAN) emit('message', { text: 'トスやり直し', kind: 'info', dur: 900 });
      }
    }
    return;
  }

  const ev = stepBall(b, dt);
  if (state.phase !== 'rally') return;
  const r = state.rally;
  r.t += dt;

  if (ev === 'net') emit('net', {});
  if (ev === 'netcord') { r.netcord = true; emit('netcord', {}); replan(); }
  if (ev === 'bounce') {
    emit('bounce', { x: b.pos.x, z: b.pos.z, speed: Math.hypot(b.vel.x, b.vel.z) });
    judgeBounce();
    if (state.phase === 'rally') replan();
  } else if (b.rolling && state.phase === 'rally') {
    // 弱々しく転がった → バウンド済みならヒッターのポイント
    endPoint(r.lastHitter, r.bounces >= 1 ? 'winner' : 'error');
  }

  if (state.phase === 'rally' && (Math.abs(b.pos.z) > 24 || Math.abs(b.pos.x) > 16 || r.t > 8)) {
    endPoint(r.bounces >= 1 ? r.lastHitter : 1 - r.lastHitter, r.bounces >= 1 ? 'winner' : 'out');
  }
}

function replan() {
  for (const p of state.players) if (p.plan && !p.plan.none) p.plan = null;
  const r = state.rally;
  if (r && r.lastHitter === CPU && r.bounces === 0) {
    const lb = predictBounce(state.ball);
    state.landing = lb ? { x: lb.x, z: lb.z } : null;
  } else {
    state.landing = null;
  }
}

function judgeBounce() {
  const b = state.ball, r = state.rally;
  const hitter = r.lastHitter;
  const hp = state.players[hitter];
  const side = b.pos.z > 0 ? 1 : -1;

  if (r.bounces >= 1) {
    // ツーバウンド
    endPoint(hitter, r.isServe ? 'ace' : 'winner');
    return;
  }

  if (r.isServe) {
    const sv = state.serve;
    const recvSide = state.players[sv.receiver].side;
    if (side === recvSide && inServiceBox(b.pos.x, b.pos.z, recvSide, sv.boxX)) {
      if (r.netcord) { serveLet(); return; }
      r.bounces = 1;
      emit('call', { text: '' });
      return;
    }
    serveFault(b.pos.z * recvSide > COURT.service ? 'ロング' : side !== recvSide ? 'ネット' : 'ワイド');
    return;
  }

  if (side === hp.side) { endPoint(1 - hitter, 'net'); return; }
  if (!inCourt(b.pos.x, b.pos.z, side)) { endPoint(1 - hitter, 'out'); return; }
  r.bounces = 1;
}

function serveFault(reason) {
  const sv = state.serve;
  emit('fault', { who: sv.server, second: sv.second });
  if (!sv.second) {
    emit('message', { text: `フォルト（${reason}）`, kind: 'fault', dur: 1100 });
    goBetween(1.15, () => setupServe(true));
  } else {
    state.stats.doubleFaults[sv.server]++;
    endPoint(sv.receiver, 'double');
  }
}

function serveLet() {
  emit('message', { text: 'レット', kind: 'info', dur: 1000 });
  const second = state.serve.second;
  goBetween(1.1, () => setupServe(second));
}

function goBetween(t, next) {
  state.phase = 'between';
  state.between = { t, next };
  state.landing = null;
  state.aim = null;
  for (const p of state.players) { p.pending = null; p.aimStick = null; p.plan = null; p.prep = false; }
}

const REASON_TEXT = {
  ace: 'サービスエース！', winner: 'ウィナー！', out: 'アウト', net: 'ネット', double: 'ダブルフォルト', error: 'ミス',
};

function endPoint(winner, reason) {
  if (state.phase !== 'rally' && state.phase !== 'serve' && state.phase !== 'between') return;
  const st = state.stats;
  const r = state.rally;
  st.points[winner]++;
  if (reason === 'ace') st.aces[winner]++;
  if (reason === 'winner') st.winners[winner]++;
  if (reason === 'out' || reason === 'net' || reason === 'error') st.errors[1 - winner]++;
  if (r) st.longestRally = Math.max(st.longestRally, r.hits);

  const res = Score.addPoint(state.score, winner);
  state.lastPoint = { winner, reason };

  const who = winner === HUMAN ? 'あなた' : 'CPU';
  emit('point', { winner, reason, game: res.game, match: res.match });
  emit('message', {
    text: `${REASON_TEXT[reason] || ''}`,
    sub: `${who}のポイント`,
    kind: winner === HUMAN ? 'good' : 'bad',
    dur: 1500,
  });

  if (res.match !== null) {
    goBetween(2.2, () => {
      state.phase = 'over';
      state.ballVisible = false;
      emit('matchOver', { winner: res.match });
    });
    return;
  }
  goBetween(1.9, () => {
    if (res.game !== null) {
      const g = state.score.games;
      emit('message', {
        text: `ゲーム ${res.game === HUMAN ? 'あなた' : 'CPU'}`,
        sub: `あなた ${g[0]} - ${g[1]} CPU${state.score.tiebreak ? '　タイブレーク' : ''}`,
        kind: 'game', dur: 1500,
      });
      goBetween(1.5, () => setupServe(false));
      return;
    }
    const pr = Score.pressure(state.score);
    const call = Score.callText(state.score);
    const tag = pr ? { match: 'マッチポイント', break: 'ブレイクポイント', game: '', set: 'セットポイント' }[pr.kind] : '';
    emit('call', { text: call + (tag ? `　${tag}` : '') });
    setupServe(false);
  });
}

// ── アニメーション時間 ───────────────────────────
function updateAnims(dt) {
  for (const p of state.players) {
    p.anim.t += dt;
    if ((p.anim.name === 'swing' && p.anim.t > 0.55) || (p.anim.name === 'serve' && p.anim.t > 0.7)) {
      p.anim = { name: 'idle', t: 0, hand: 'fh' };
    }
  }
}

// ── ヒント文 ──────────────────────────────────
function updateHint() {
  let h = '';
  if (state.phase === 'serve' && state.serve.server === HUMAN) {
    h = state.serve.stage === 'ready'
      ? 'ショットボタンでトス（ボタンでサーブの種類）'
      : 'もう一度押して打つ！（高い位置ほど良い）';
  } else if (state.phase === 'rally' && state.rally.lastHitter === CPU) {
    const p = state.players[HUMAN];
    h = !p.pending ? 'ショットボタンで打つ準備！'
      : state.settings.assist ? `${SHOTS[p.pending.type].label} — スティックで狙う（移動は自動）`
      : `${SHOTS[p.pending.type].label} — 打つ瞬間のスティックで狙う`;
  }
  state.hint = h;
}

// ── メインステップ ──────────────────────────────
export function step(dt = PHYS_DT) {
  if (state.phase === 'title' || state.phase === 'over' || state.paused) {
    if (state.phase === 'over' || state.phase === 'title') {
      stepBall(state.ball, dt);
      updateAnims(dt);
    }
    input.shot = null;
    return;
  }
  state.time += dt;

  if (state.phase === 'between') {
    stepBall(state.ball, dt);
    for (const p of state.players) accelTo(p, 0, 0, dt);
    updateAnims(dt);
    state.between.t -= dt;
    if (state.between.t <= 0) {
      const next = state.between.next;
      state.between = null;
      next();
    }
    input.shot = null;
    state.hint = '';
    return;
  }

  updateHuman(dt);
  if (state.phase === 'rally' || state.phase === 'serve') updateCPU(dt);
  if (state.phase === 'rally' || state.phase === 'serve') updateBall(dt);
  updateAnims(dt);
  updateHint();
}

// テスト用
export const _internal = { setupServe, strikeServe, startToss, strikeRally, endPoint, judgeBounce, reachInfo };
