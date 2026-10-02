// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  character.js — プリミティブで組んだテニスプレイヤー
//  モデルはローカル +z を正面として作る（右手は −x 側）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import * as THREE from '../lib/three.module.js';

const smooth = t => t * t * (3 - 2 * t);
const mix = (a, b, t) => a + (b - a) * t;

function capsule(r, len, mat) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat);
  m.castShadow = true;
  return m;
}

// 肢: pivot から下(−y)方向に伸びる
function limb(r, len, mat) {
  const pivot = new THREE.Group();
  const mesh = capsule(r, len, mat);
  mesh.position.y = -len / 2;
  pivot.add(mesh);
  const end = new THREE.Group();
  end.position.y = -len;
  pivot.add(end);
  return { pivot, end };
}

function buildRacket(frameColor) {
  const g = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: frameColor, roughness: 0.4, metalness: 0.3 });
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.22, 8), gripMat);
  handle.position.y = -0.08;
  g.add(handle);
  const throat = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.12, 6), frameMat);
  throat.position.y = -0.24;
  g.add(throat);
  const head = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.012, 6, 24), frameMat);
  head.scale.set(0.8, 1.0, 1);
  head.position.y = -0.42;
  head.castShadow = true;
  g.add(head);
  const strings = new THREE.Mesh(
    new THREE.CircleGeometry(0.125, 20),
    new THREE.MeshBasicMaterial({ color: 0xf0f0f0, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
  );
  strings.scale.set(0.8, 1.0, 1);
  strings.position.y = -0.42;
  g.add(strings);
  return g;
}

export function createCharacter({ shirt, shorts, skin = 0xe0ac7e, hair = 0x2a1a10, band = 0xffffff, racket = 0xd32f2f }) {
  const mShirt = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.7 });
  const mShorts = new THREE.MeshStandardMaterial({ color: shorts, roughness: 0.8 });
  const mSkin = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.75 });
  const mShoe = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.6 });
  const mHair = new THREE.MeshStandardMaterial({ color: hair, roughness: 0.9 });
  const mBand = new THREE.MeshStandardMaterial({ color: band, roughness: 0.6 });

  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.95;
  root.add(hips);

  // 腰・胴
  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 0.2), mShorts);
  pelvis.castShadow = true;
  hips.add(pelvis);

  const torso = new THREE.Group();
  torso.position.y = 0.06;
  hips.add(torso);
  const chest = capsule(0.15, 0.32, mShirt);
  chest.scale.set(1.15, 1, 0.75);
  chest.position.y = 0.28;
  torso.add(chest);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 8), mSkin);
  neck.position.y = 0.58;
  torso.add(neck);
  const head = new THREE.Group();
  head.position.y = 0.7;
  torso.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), mSkin);
  skull.scale.set(0.92, 1.05, 1);
  skull.castShadow = true;
  head.add(skull);
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), mHair);
  hairCap.position.y = 0.012;
  hairCap.rotation.x = -0.25;
  head.add(hairCap);
  const headband = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.016, 6, 20), mBand);
  headband.rotation.x = Math.PI / 2;
  headband.position.y = 0.03;
  head.add(headband);

  // 腕（order YZX: 外転 z → 水平旋回 y）
  function arm(sign) {
    const shoulder = new THREE.Group();
    shoulder.position.set(sign * 0.2, 0.47, 0);
    shoulder.rotation.order = 'YZX';
    torso.add(shoulder);
    const sleeve = capsule(0.055, 0.1, mShirt);
    sleeve.position.y = -0.04;
    shoulder.add(sleeve);
    const upper = limb(0.042, 0.26, mSkin);
    shoulder.add(upper.pivot);
    const elbow = upper.end;
    const fore = limb(0.036, 0.24, mSkin);
    elbow.add(fore.pivot);
    const hand = fore.end;
    const fist = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), mSkin);
    hand.add(fist);
    return { shoulder, elbow: fore.pivot, hand };
  }
  const rArm = arm(-1);
  const lArm = arm(1);
  const racketMesh = buildRacket(racket);
  rArm.hand.add(racketMesh);

  // 脚
  function leg(sign) {
    const hip = limb(0.07, 0.4, mShorts);
    hip.pivot.position.set(sign * 0.1, -0.05, 0);
    hips.add(hip.pivot);
    const thighSkin = capsule(0.058, 0.2, mSkin);
    thighSkin.position.y = -0.36;
    hip.pivot.add(thighSkin);
    const knee = limb(0.052, 0.4, mSkin);
    hip.end.add(knee.pivot);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.24), mShoe);
    shoe.position.set(0, -0.03, 0.05);
    shoe.castShadow = true;
    knee.end.add(shoe);
    return { hip: hip.pivot, knee: knee.pivot };
  }
  const rLeg = leg(-1);
  const lLeg = leg(1);

  const rig = { root, hips, torso, head, rArm, lArm, rLeg, lLeg, racket: racketMesh, runPhase: 0, prep: 0 };
  applyPose(rig, READY, 0);
  return rig;
}

// ── ポーズ定義 ───────────────────────────────
// rz/ry: 右肩の外転・旋回, re: 右肘, lz/ly: 左肩, tw: 胴のひねり, lean: 前傾, crouch: 膝
const READY = { rz: -0.55, ry: 0.55, re: -0.9, lz: 0.5, ly: -0.6, le: -1.1, tw: 0, lean: 0.18, crouch: 0.12, rw: 0.6 };

const POSES = {
  fh: {
    back:   { rz: -1.35, ry: -1.55, re: -0.25, lz: 0.9, ly: 0.9, le: -0.4, tw: -0.95, lean: 0.12, crouch: 0.2, rw: 0.2 },
    hit:    { rz: -1.45, ry: 0.15, re: -0.15, lz: 0.6, ly: 0.2, le: -0.8, tw: -0.05, lean: 0.15, crouch: 0.16, rw: 0.0 },
    follow: { rz: -2.3, ry: 1.9, re: -1.3, lz: 0.4, ly: -0.6, le: -1.2, tw: 0.85, lean: 0.12, crouch: 0.1, rw: 0.4 },
  },
  bh: {
    back:   { rz: -1.0, ry: 3.6, re: -0.5, lz: 0.6, ly: 2.6, le: -1.6, tw: 1.0, lean: 0.12, crouch: 0.2, rw: 0.0 },
    hit:    { rz: -1.4, ry: 2.9, re: -0.1, lz: 0.8, ly: 1.2, le: -0.6, tw: 0.15, lean: 0.15, crouch: 0.16, rw: 0.0 },
    follow: { rz: -2.4, ry: 1.7, re: -0.6, lz: 1.6, ly: -0.6, le: -0.3, tw: -0.6, lean: 0.1, crouch: 0.1, rw: 0.3 },
  },
  overhead: {
    back:   { rz: -2.6, ry: -1.4, re: -1.6, lz: 2.8, ly: 0.2, le: -0.1, tw: -0.8, lean: -0.1, crouch: 0.1, rw: 0.5 },
    hit:    { rz: -3.0, ry: 0.3, re: -0.05, lz: 1.2, ly: 0.2, le: -0.8, tw: 0.0, lean: 0.05, crouch: 0.05, rw: 0.0 },
    follow: { rz: -0.9, ry: 1.6, re: -0.4, lz: 0.5, ly: -0.6, le: -1.0, tw: 0.7, lean: 0.35, crouch: 0.15, rw: 0.3 },
  },
  vfh: {
    back:   { rz: -1.3, ry: -0.6, re: -0.7, lz: 0.6, ly: 0.4, le: -0.8, tw: -0.4, lean: 0.25, crouch: 0.25, rw: 0.3 },
    hit:    { rz: -1.5, ry: 0.35, re: -0.4, lz: 0.6, ly: 0.2, le: -0.8, tw: -0.05, lean: 0.25, crouch: 0.22, rw: 0.1 },
    follow: { rz: -1.5, ry: 0.7, re: -0.6, lz: 0.6, ly: 0.0, le: -0.9, tw: 0.1, lean: 0.22, crouch: 0.2, rw: 0.2 },
  },
  vbh: {
    back:   { rz: -1.2, ry: 3.3, re: -0.8, lz: 0.6, ly: 2.0, le: -1.4, tw: 0.5, lean: 0.25, crouch: 0.25, rw: 0.1 },
    hit:    { rz: -1.45, ry: 2.75, re: -0.3, lz: 0.8, ly: 0.8, le: -0.8, tw: 0.1, lean: 0.25, crouch: 0.22, rw: 0.0 },
    follow: { rz: -1.5, ry: 2.4, re: -0.5, lz: 0.8, ly: 0.2, le: -0.8, tw: 0.0, lean: 0.22, crouch: 0.2, rw: 0.1 },
  },
};

const SERVE = {
  toss:   { rz: -1.0, ry: -1.6, re: -0.6, lz: 2.9, ly: 0.3, le: -0.05, tw: -0.7, lean: -0.15, crouch: 0.25, rw: 0.6 },
  trophy: { rz: -2.3, ry: -1.5, re: -2.0, lz: 2.9, ly: 0.3, le: -0.05, tw: -0.9, lean: -0.2, crouch: 0.3, rw: 0.8 },
  hit:    { rz: -3.05, ry: 0.2, re: -0.05, lz: 1.0, ly: 0.2, le: -0.6, tw: 0.1, lean: 0.1, crouch: 0.0, rw: 0.0 },
  follow: { rz: -0.7, ry: 1.7, re: -0.5, lz: 0.5, ly: -0.6, le: -1.0, tw: 0.8, lean: 0.45, crouch: 0.2, rw: 0.2 },
};

function blend(a, b, t) {
  const o = {};
  for (const k in a) o[k] = mix(a[k], b[k], t);
  return o;
}

function seq(keys, t) {
  // keys: [[time, pose], ...]
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, p0] = keys[i], [t1, p1] = keys[i + 1];
    if (t <= t1) return blend(p0, p1, smooth((t - t0) / (t1 - t0)));
  }
  return keys[keys.length - 1][1];
}

function applyPose(rig, P, speed) {
  const { rArm, lArm, torso, hips, rLeg, lLeg } = rig;
  rArm.shoulder.rotation.set(0, P.ry, P.rz);
  rArm.elbow.rotation.set(P.re, 0, 0);
  rArm.hand.rotation.set(0, P.rw || 0, 0);
  lArm.shoulder.rotation.set(0, P.ly, P.lz);
  lArm.elbow.rotation.set(P.le, 0, 0);
  torso.rotation.set(P.lean, P.tw, 0);

  // 脚：走り or 構え
  const k = Math.min(1, speed / 5);
  const ph = rig.runPhase;
  const sw = Math.sin(ph) * 0.75 * k;
  rLeg.hip.rotation.x = -P.crouch * 1.2 + sw;
  lLeg.hip.rotation.x = -P.crouch * 1.2 - sw;
  rLeg.knee.rotation.x = P.crouch * 2.2 + Math.max(0, -Math.sin(ph)) * 1.1 * k;
  lLeg.knee.rotation.x = P.crouch * 2.2 + Math.max(0, Math.sin(ph)) * 1.1 * k;
  rLeg.hip.rotation.z = 0.06;
  lLeg.hip.rotation.z = -0.06;
  hips.position.y = 0.95 - P.crouch * 0.28 + Math.abs(Math.cos(ph)) * 0.04 * k;
}

// プレイヤー状態からポーズを更新
//   p: match.js のプレイヤー, ballSide: 'fh' | 'bh'（構え用）
export function updateCharacter(rig, p, dt, ballSide) {
  const speed = Math.hypot(p.vel.x, p.vel.z);
  rig.runPhase += dt * (4 + speed * 2.2);

  rig.prep += ((p.prep ? 1 : 0) - rig.prep) * Math.min(1, dt * 10);

  let P;
  const a = p.anim;
  if (a.name === 'swing') {
    const set = POSES[a.hand] || POSES.fh;
    P = seq([[0, set.back], [0.07, set.hit], [0.32, set.follow], [0.55, READY]], a.t);
  } else if (a.name === 'toss') {
    P = seq([[0, READY], [0.35, SERVE.toss], [0.75, SERVE.trophy]], a.t);
  } else if (a.name === 'serve') {
    P = seq([[0, SERVE.trophy], [0.06, SERVE.hit], [0.35, SERVE.follow], [0.7, READY]], a.t);
  } else {
    const set = POSES[ballSide] || POSES.fh;
    P = rig.prep > 0.01 ? blend(READY, set.back, rig.prep) : READY;
  }
  applyPose(rig, P, a.name === 'idle' ? speed : speed * 0.5);
}
