// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  physics.js — ボールの物理・ショット計算・軌道予測
//  three.js に依存しない純粋なロジック（node でテスト可能）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { COURT, BALL_R, GRAVITY, PHYS_DT, clamp } from './config.js';

const ROLL_FRICTION = 3.0;
const AFTER_BOUNCE = { bounceH: 0.78, bounceV: 0.66 };

export function createBall() {
  return {
    pos: { x: 0, y: 1, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    spin: 0,          // 追加の下向き加速度
    ax: 0,            // 横方向の加速度（スライスサーブの曲がり）
    bounceH: 0.78,
    bounceV: 0.66,
    rolling: false,
  };
}

export function copyBall(b) {
  return {
    pos: { ...b.pos }, vel: { ...b.vel },
    spin: b.spin, ax: b.ax, bounceH: b.bounceH, bounceV: b.bounceV, rolling: b.rolling,
  };
}

export function netHeightAt(x) {
  const t = Math.min(1, Math.abs(x) / COURT.netHalfW);
  return COURT.netH + (COURT.netPostH - COURT.netH) * t;
}

// 1ステップ進める。発生したイベント名（'bounce' | 'net' | 'netcord' | null）を返す
export function stepBall(b, dt = PHYS_DT) {
  const p = b.pos, v = b.vel;

  if (b.rolling) {
    const sp = Math.hypot(v.x, v.z);
    if (sp > 0) {
      const ns = Math.max(0, sp - ROLL_FRICTION * dt);
      v.x *= ns / sp; v.z *= ns / sp;
    }
    p.x += v.x * dt; p.z += v.z * dt;
    return null;
  }

  const ay = -(GRAVITY + b.spin);
  const px = p.x, py = p.y, pz = p.z;

  p.x += v.x * dt + 0.5 * b.ax * dt * dt;
  p.y += v.y * dt + 0.5 * ay * dt * dt;
  p.z += v.z * dt;
  v.x += b.ax * dt;
  v.y += ay * dt;

  let ev = null;

  // ── ネット ──
  if ((pz > 0) !== (p.z > 0) && pz !== 0) {
    const f = pz / (pz - p.z);
    const cx = px + (p.x - px) * f;
    const cy = py + (p.y - py) * f;
    if (Math.abs(cx) < COURT.netHalfW) {
      const top = netHeightAt(cx);
      if (cy < top + BALL_R) {
        if (cy > top - 0.03) {
          // ネットコード：勢いを失いつつ越える
          v.x *= 0.45; v.z *= 0.45;
          v.y = Math.abs(v.y) * 0.25 + 0.6;
          p.y = top + BALL_R + 0.01;
          ev = 'netcord';
        } else {
          // ネットに掛かる：打った側に落ちる
          const back = Math.sign(pz) || 1;
          p.z = back * (BALL_R + 0.02);
          p.x = cx; p.y = Math.max(BALL_R, cy);
          v.z = -v.z * 0.06; v.x *= 0.2; v.y = Math.min(v.y, 0) * 0.2;
          b.ax = 0; b.spin = 0;
          return 'net';
        }
      }
    }
  }

  // ── 地面 ──
  if (p.y < BALL_R && v.y < 0) {
    p.y = BALL_R + (BALL_R - p.y) * b.bounceV;
    v.y = -v.y * b.bounceV;
    v.x *= b.bounceH; v.z *= b.bounceH;
    b.spin *= 0.2;
    b.ax = 0;
    b.bounceH = AFTER_BOUNCE.bounceH;
    b.bounceV = AFTER_BOUNCE.bounceV;
    if (v.y < 0.5) { v.y = 0; p.y = BALL_R; b.rolling = true; }
    ev = 'bounce';
  }
  return ev;
}

// from から target(x,z) の地面に落ちる初速を求める
//   opt: { speed, spin, clearance, ax }
export function solveShot(from, target, opt) {
  const ge = GRAVITY + (opt.spin || 0);
  const ax = opt.ax || 0;
  const dx = target.x - from.x, dz = target.z - from.z;
  const dist = Math.hypot(dx, dz);
  let T = dist / opt.speed;

  // ネットを越える必要がある場合は最低限の滞空時間を確保
  if ((from.z > 0) !== (target.z > 0)) {
    const fn = from.z / (from.z - target.z);
    const xAtNet = from.x + dx * fn;
    const req = netHeightAt(xAtNet) + BALL_R + (opt.clearance || 0);
    const yt = BALL_R;
    const need = (req - from.y - fn * (yt - from.y)) / (0.5 * ge * fn * (1 - fn));
    if (need > T * T) T = Math.sqrt(need);
  }
  T = Math.max(T, 0.15);

  return {
    vel: {
      x: (dx - 0.5 * ax * T * T) / T,
      y: (BALL_R - from.y + 0.5 * ge * T * T) / T,
      z: dz / T,
    },
    T,
  };
}

export function launch(b, from, vel, opt) {
  b.pos = { ...from };
  b.vel = { ...vel };
  b.spin = opt.spin || 0;
  b.ax = opt.ax || 0;
  b.bounceH = opt.bounceH ?? AFTER_BOUNCE.bounceH;
  b.bounceV = opt.bounceV ?? AFTER_BOUNCE.bounceV;
  b.rolling = false;
}

// 軌道を予測してサンプル列を返す
//   { t, x, y, z, vy, bounces, net }
export function predict(b, maxT = 3.0, every = 2) {
  const s = copyBall(b);
  const out = [];
  let bounces = 0, net = false, t = 0, i = 0;
  while (t < maxT) {
    const ev = stepBall(s);
    t += PHYS_DT; i++;
    if (ev === 'bounce') bounces++;
    if (ev === 'net') net = true;
    if (ev === 'bounce' || i % every === 0) {
      out.push({ t, x: s.pos.x, y: s.pos.y, z: s.pos.z, vy: s.vel.y, vz: s.vel.z, bounces, net, bounce: ev === 'bounce' });
    }
    if (s.rolling || bounces >= 2) break;
  }
  return out;
}

// 最初のバウンド地点の予測
export function predictBounce(b) {
  const tr = predict(b, 4, 4);
  return tr.find(s => s.bounce) || null;
}

// コート内判定（ラインに少しでも触れればイン）
export function inCourt(x, z, side) {
  // side: +1 = プレイヤー側（z>0）, -1 = CPU側
  if (Math.abs(x) > COURT.halfW + BALL_R) return false;
  const zz = z * side;
  return zz >= -BALL_R && zz <= COURT.halfL + BALL_R;
}

// サービスボックス判定
//   side   … 受け手のコート (+1 / -1)
//   boxX   … ボックスの x 符号 (+1 = x>0 側のボックス)
export function inServiceBox(x, z, side, boxX) {
  const zz = z * side;
  if (zz < -BALL_R || zz > COURT.service + BALL_R) return false;
  const xx = x * boxX;
  return xx >= -BALL_R && xx <= COURT.halfW + BALL_R;
}

export { clamp };
