// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  scene.js — three.js の描画
//  ゲームロジック（match.js の state）を読み取って毎フレーム描く
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import * as THREE from '../lib/three.module.js';
import { COURT, BALL_R, HUMAN, CPU } from '../config.js';
import { createCharacter, updateCharacter } from './character.js';

let renderer, scene, camera;
let ball, ballShadow, trail = [], trailPts = [];
let landingMark, aimMark, playerRing, hitFlash, bounceRing;
let rigs = [];
let camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
let lowQuality = false;
let flashT = 1, bounceT = 1;

const TRAIL_N = 9;

export function init(container) {
  lowQuality = Math.min(window.devicePixelRatio || 1, 2) * window.innerWidth * window.innerHeight > 2.6e6
    || /Android [4-7]/.test(navigator.userAgent);

  renderer = new THREE.WebGLRenderer({ antialias: !lowQuality, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowQuality ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(0x9cc4e4, 45, 95);

  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);

  buildLights();
  buildGround();
  buildCourt();
  buildNet();
  buildStadium();
  buildBall();
  buildMarkers();

  rigs[HUMAN] = createCharacter({ shirt: 0x1e88e5, shorts: 0xfafafa, band: 0x1565c0, racket: 0x1565c0, hair: 0x2a1a10 });
  rigs[CPU] = createCharacter({ shirt: 0xe53935, shorts: 0x263238, band: 0xffffff, racket: 0xffb300, skin: 0xc68a5e, hair: 0x111111 });
  scene.add(rigs[HUMAN].root, rigs[CPU].root);

  window.addEventListener('resize', onResize);
  onResize();
  return renderer.domElement;
}

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.fov = w / h < 0.7 ? 58 : w / h < 1.1 ? 52 : 42;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#3d7cc9');
  grd.addColorStop(0.55, '#8fc0ea');
  grd.addColorStop(1, '#dcebf5');
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildLights() {
  scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x3a5a3a, 0.9));
  const sun = new THREE.DirectionalLight(0xfff2dc, 2.2);
  sun.position.set(-8, 20, 6);
  sun.castShadow = true;
  const S = lowQuality ? 1024 : 2048;
  sun.shadow.mapSize.set(S, S);
  const cam = sun.shadow.camera;
  cam.left = -10; cam.right = 10; cam.top = 17; cam.bottom = -17;
  cam.near = 1; cam.far = 60;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
}

function buildGround() {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(36, 50),
    new THREE.MeshStandardMaterial({ color: 0x3f7d55, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
}

function buildCourt() {
  // 内側のハードコート
  const inner = new THREE.Mesh(
    new THREE.PlaneGeometry(COURT.halfWDoubles * 2 + 4, COURT.halfL * 2 + 8),
    new THREE.MeshStandardMaterial({ color: 0x2e6aa8, roughness: 0.85 })
  );
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = 0.002;
  inner.receiveShadow = true;
  scene.add(inner);

  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const W = 0.05;
  const line = (x1, z1, x2, z2) => {
    const len = Math.hypot(x2 - x1, z2 - z1) + W;
    const horiz = Math.abs(z2 - z1) < 1e-6;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(horiz ? len : W, horiz ? W : len), lineMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set((x1 + x2) / 2, 0.006, (z1 + z2) / 2);
    m.receiveShadow = true;
    scene.add(m);
  };
  const { halfW: w, halfWDoubles: dw, halfL: l, service: s } = COURT;
  for (const sgn of [-1, 1]) {
    line(-dw, sgn * l, dw, sgn * l);          // ベースライン
    line(-w, sgn * s, w, sgn * s);            // サービスライン
    line(0, sgn * l, 0, sgn * (l - 0.15));    // センターマーク
    line(sgn * w, -l, sgn * w, l);            // シングルス
    line(sgn * dw, -l, sgn * dw, l);          // ダブルス
  }
  line(0, -s, 0, s);                          // センターサービスライン
}

function netTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(20,20,20,0.9)';
  g.lineWidth = 3;
  for (let i = 0; i <= 64; i += 16) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 64); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(64, i); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(COURT.netHalfW * 2 / 0.05 / 4, COURT.netH / 0.05 / 4);
  return t;
}

function buildNet() {
  const W = COURT.netHalfW * 2;
  const geo = new THREE.PlaneGeometry(W, 1, 40, 1);
  // 中央が低い形に変形
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const top = COURT.netH + (COURT.netPostH - COURT.netH) * Math.abs(x) / COURT.netHalfW;
    pos.setY(i, y > 0 ? top : 0);
  }
  geo.computeVertexNormals();
  const net = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    map: netTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false, alphaTest: 0.05,
  }));
  scene.add(net);

  // 白帯
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const x = -COURT.netHalfW + W * i / 40;
    pts.push(new THREE.Vector3(x, COURT.netH + (COURT.netPostH - COURT.netH) * Math.abs(x) / COURT.netHalfW, 0));
  }
  const band = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.03, 4, false),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 })
  );
  band.castShadow = true;
  scene.add(band);

  const postMat = new THREE.MeshStandardMaterial({ color: 0x1b3d2a, roughness: 0.5, metalness: 0.4 });
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, COURT.netPostH + 0.05, 10), postMat);
    post.position.set(s * COURT.netHalfW, (COURT.netPostH + 0.05) / 2, 0);
    post.castShadow = true;
    scene.add(post);
  }
  const strap = new THREE.Mesh(new THREE.PlaneGeometry(0.05, COURT.netH), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  strap.position.set(0, COURT.netH / 2, 0.01);
  scene.add(strap);
}

function crowdTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#26323d';
  g.fillRect(0, 0, 512, 128);
  const colors = ['#e57373', '#64b5f6', '#fff176', '#81c784', '#ffffff', '#ffb74d', '#ba68c8', '#4dd0e1', '#f06292', '#a1887f'];
  for (let row = 0; row < 8; row++) {
    for (let i = 0; i < 64; i++) {
      if (Math.random() < 0.18) continue;
      const x = i * 8 + (row % 2) * 4 + Math.random() * 2;
      const y = 6 + row * 15;
      g.fillStyle = colors[(Math.random() * colors.length) | 0];
      g.fillRect(x, y + 4, 6, 8);
      g.fillStyle = '#e0b48a';
      g.beginPath(); g.arc(x + 3, y + 2, 2.6, 0, Math.PI * 2); g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function buildStadium() {
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x1c4f86, roughness: 0.8 });
  const crowd = crowdTexture();

  const Z = COURT.halfL + 6.5, X = COURT.halfWDoubles + 5;
  // 奥と手前のフェンス（手前はカメラの後ろなので省略）
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(X * 2 + 6, 1.2, 0.2), wallMat);
  backWall.position.set(0, 0.6, -Z);
  scene.add(backWall);
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, Z * 2), wallMat);
    side.position.set(s * X, 0.6, 0);
    side.receiveShadow = true;
    scene.add(side);
  }

  // 観客席（傾いた面）
  const mkStand = (w, x, z, rotY) => {
    const tex = crowd.clone();
    tex.needsUpdate = true;
    tex.repeat.set(w / 14, 1);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 9), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
    m.position.set(x, 4.2, z);
    m.rotation.y = rotY;
    m.rotateX(-0.55);
    scene.add(m);
  };
  mkStand(X * 2 + 8, 0, -Z - 3.8, 0);
  mkStand(Z * 2 + 6, -X - 3.8, 0, Math.PI / 2);
  mkStand(Z * 2 + 6, X + 3.8, 0, -Math.PI / 2);

  // 審判台
  const chairMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.7 });
  const chair = new THREE.Group();
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.8, 0.6), chairMat);
  legs.position.y = 0.9;
  chair.add(legs);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: 0xf5f5f5 }));
  seat.position.y = 2.2;
  chair.add(seat);
  chair.position.set(-COURT.netHalfW - 1.2, 0, 0);
  chair.traverse(o => { if (o.isMesh) o.castShadow = true; });
  scene.add(chair);
}

function buildBall() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xe8ff3a, emissive: 0x6a7a00, emissiveIntensity: 0.45, roughness: 0.6 });
  ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R * 1.9, 16, 12), mat);
  ball.castShadow = true;
  scene.add(ball);

  ballShadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.09, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false })
  );
  ballShadow.rotation.x = -Math.PI / 2;
  scene.add(ballShadow);

  for (let i = 0; i < TRAIL_N; i++) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_R * 1.6 * (1 - i / TRAIL_N * 0.6), 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xf4ff9a, transparent: true, opacity: 0.5 * (1 - i / TRAIL_N), depthWrite: false, blending: THREE.AdditiveBlending })
    );
    m.visible = false;
    scene.add(m);
    trail.push(m);
  }
}

function ringMesh(r1, r2, color, opacity) {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(r1, r2, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide })
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 2;
  return m;
}

function buildMarkers() {
  landingMark = ringMesh(0.16, 0.24, 0xffeb3b, 0.8);
  scene.add(landingMark);
  aimMark = new THREE.Group();
  const a1 = ringMesh(0.3, 0.38, 0x00e5ff, 0.85);
  aimMark.add(a1);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.08, 12), new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.9, depthWrite: false }));
  dot.rotation.x = -Math.PI / 2;
  aimMark.add(dot);
  aimMark.position.y = 0.012;
  scene.add(aimMark);
  playerRing = ringMesh(0.42, 0.5, 0x4fc3f7, 0.7);
  scene.add(playerRing);
  hitFlash = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })
  );
  scene.add(hitFlash);
  bounceRing = ringMesh(0.05, 0.1, 0xffffff, 0);
  scene.add(bounceRing);
}

// ── エフェクト ─────────────────────────────
export function flashAt(pos, strong) {
  hitFlash.position.set(pos.x, pos.y, pos.z);
  hitFlash.material.color.set(strong ? 0xfff59d : 0xffffff);
  flashT = 0;
}

export function bounceAt(x, z) {
  bounceRing.position.set(x, 0.015, z);
  bounceT = 0;
}

// ── 毎フレーム ─────────────────────────────
export function render(state, dt) {
  const b = state.ball;
  const [hp, cp] = state.players;

  // ボール
  ball.visible = state.ballVisible;
  ballShadow.visible = state.ballVisible;
  ball.position.set(b.pos.x, b.pos.y, b.pos.z);
  ballShadow.position.set(b.pos.x, 0.012, b.pos.z);
  const sh = Math.max(0.4, 1 - b.pos.y * 0.12);
  ballShadow.scale.setScalar(sh);
  ballShadow.material.opacity = 0.38 * sh;

  // トレイル
  const flying = state.ballVisible && (state.phase === 'rally' || state.phase === 'between') && Math.hypot(b.vel.x, b.vel.z) > 8;
  if (flying) {
    trailPts.unshift({ x: b.pos.x, y: b.pos.y, z: b.pos.z });
    if (trailPts.length > TRAIL_N) trailPts.pop();
  } else if (trailPts.length) trailPts.length = 0;
  for (let i = 0; i < TRAIL_N; i++) {
    const p = trailPts[i + 1];
    trail[i].visible = !!p;
    if (p) trail[i].position.set(p.x, p.y, p.z);
  }

  // マーカー
  landingMark.visible = !!state.landing && state.settings.diff !== 'hard';
  if (state.landing) {
    landingMark.position.set(state.landing.x, 0.014, state.landing.z);
    const s = 1 + Math.sin(performance.now() / 120) * 0.12;
    landingMark.scale.setScalar(s);
  }
  aimMark.visible = !!state.aim;
  if (state.aim) aimMark.position.set(state.aim.x, 0.012, state.aim.z);

  const showRing = state.phase !== 'title' && state.phase !== 'over';
  playerRing.visible = showRing;
  playerRing.position.set(hp.pos.x, 0.013, hp.pos.z);
  playerRing.material.color.set(hp.pending ? 0xffa726 : 0x4fc3f7);
  playerRing.material.opacity = hp.pending ? 0.95 : 0.6;

  // キャラクター
  for (const p of state.players) {
    const rig = rigs[p.id];
    rig.root.position.set(p.pos.x, 0, p.pos.z);
    rig.root.rotation.y = p.facing < 0 ? Math.PI : 0;
    const side = (b.pos.x - p.pos.x) * p.rightX >= -0.1 ? 'fh' : 'bh';
    updateCharacter(rig, p, dt, side);
  }

  // エフェクト
  flashT = Math.min(1, flashT + dt * 4);
  hitFlash.visible = flashT < 1;
  hitFlash.scale.setScalar(0.6 + flashT * 1.8);
  hitFlash.material.opacity = (1 - flashT) * 0.75;
  bounceT = Math.min(1, bounceT + dt * 2.5);
  bounceRing.visible = bounceT < 1;
  bounceRing.scale.setScalar(1 + bounceT * 4);
  bounceRing.material.opacity = (1 - bounceT) * 0.7;

  updateCamera(state, dt);
  renderer.render(scene, camera);
}

function updateCamera(state, dt) {
  const hp = state.players[HUMAN];
  const aspect = camera.aspect;
  const portrait = aspect < 0.8;
  let tx, ty, tz, lx, ly, lz;
  if (state.phase === 'title') {
    const t = performance.now() / 9000;
    tx = Math.sin(t) * 16; ty = 7; tz = Math.cos(t) * 20;
    lx = 0; ly = 0.5; lz = 0;
  } else {
    const px = hp.pos.x;
    const pz = Math.max(hp.pos.z, 9);
    tx = px * 0.7;
    ty = portrait ? 9.4 : 7.6;
    tz = pz + (portrait ? 10.5 : 8.6);
    lx = px * 0.45;
    ly = 0;
    lz = portrait ? 4.5 : 2.5;
  }
  const k = state.phase === 'title' ? 1 : Math.min(1, dt * 4);
  camPos.lerp(new THREE.Vector3(tx, ty, tz), k);
  camLook.lerp(new THREE.Vector3(lx, ly, lz), k);
  camera.position.copy(camPos);
  camera.lookAt(camLook);
}

export function snapCamera(state) {
  const portrait = camera.aspect < 0.8;
  const p = state.players[HUMAN].pos;
  camPos.set(p.x * 0.7, portrait ? 9.4 : 7.6, Math.max(p.z, 9) + (portrait ? 10.5 : 8.6));
  camLook.set(p.x * 0.45, 0, portrait ? 4.5 : 2.5);
}
