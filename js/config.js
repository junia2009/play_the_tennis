// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  config.js — 定数（単位はすべてメートル・秒）
//
//  座標系:
//    x … 横方向（プレイヤーから見て右が +）
//    y … 高さ（地面 = 0）
//    z … コート縦方向（ネット = 0、プレイヤー側が +、CPU側が −）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const VERSION = 'v3.0.0';

export const COURT = {
  halfW: 4.115,          // シングルス横幅の半分
  halfWDoubles: 5.485,   // ダブルスライン（見た目用）
  halfL: 11.885,         // ネット〜ベースライン
  service: 6.40,         // ネット〜サービスライン
  netH: 0.914,           // ネット中央の高さ
  netPostH: 1.07,        // ポスト位置の高さ
  netHalfW: 6.4,         // ネットの横幅の半分
};

export const BALL_R = 0.034;
export const GRAVITY = 9.8;
export const PHYS_DT = 1 / 120;

// プレイヤー番号
export const HUMAN = 0;
export const CPU = 1;

// ショットの性質
//   speed     … 水平速度 (m/s)
//   spin      … 追加の下向き加速度 (+ でトップスピン, − でスライスの浮き)
//   clearance … ネット上に最低限確保する高さ
//   depth     … 狙いのデフォルト深さ（ネットからの距離）
//   err       … 狙いのブレの基本値 (m)
export const SHOTS = {
  flat:    { speed: 23, spin: 1.0,  clearance: 0.30, depth: 9.0, err: 1.45, bounceH: 0.80, bounceV: 0.68, label: 'フラット' },
  topspin: { speed: 20, spin: 5.0,  clearance: 0.70, depth: 9.6, err: 1.10, bounceH: 0.90, bounceV: 0.62, label: 'トップスピン' },
  slice:   { speed: 16, spin: -2.5, clearance: 0.35, depth: 8.6, err: 1.10, bounceH: 0.66, bounceV: 0.55, label: 'スライス' },
  lob:     { speed: 11, spin: 1.5,  clearance: 3.20, depth: 10.0, err: 1.25, bounceH: 0.78, bounceV: 0.55, label: 'ロブ' },
};

export const SERVES = {
  flat:    { speed: 27, spin: 1.5,  clearance: 0.10, err: 0.50 },
  topspin: { speed: 21, spin: 8.0,  clearance: 0.45, err: 0.32 },
  slice:   { speed: 22, spin: -1.0, clearance: 0.25, err: 0.38, curve: 1 },
  lob:     { speed: 15, spin: 3.0,  clearance: 0.60, err: 0.20 },
};

export const PLAYER = {
  maxSpeed: 6.4,        // m/s
  accel: 34,            // m/s²
  reachX: 1.65,         // 横方向に届く距離
  reachFront: 0.75,     // 前方の打点許容
  reachBack: 0.55,      // 後ろ側の打点許容（これを過ぎると振り遅れ）
  minHitY: 0.05,
  maxHitY: 2.9,
  idealOffset: 0.75,    // 打点と体の横距離
};

export const DIFFICULTY = {
  easy:   { label: 'EASY',   speed: 4.4, react: 0.34, err: 1.45, aimMargin: 1.20, pace: 0.80, posErr: 0.55, kindRatio: 0.70, net: false },
  normal: { label: 'NORMAL', speed: 5.6, react: 0.22, err: 0.92, aimMargin: 0.85, pace: 0.92, posErr: 0.30, kindRatio: 0.35, net: false },
  hard:   { label: 'HARD',   speed: 6.6, react: 0.12, err: 0.70, aimMargin: 0.55, pace: 1.05, posErr: 0.12, kindRatio: 0.10, net: true },
};

export const MATCH_FORMATS = {
  g1: { label: '1ゲーム', games: 1 },
  g3: { label: '3ゲーム', games: 3 },
  g6: { label: '6ゲーム', games: 6 },
};

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

// 正規分布っぽい乱数（-∞..∞, σ≈1）
export function gauss(rand = Math.random) {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
