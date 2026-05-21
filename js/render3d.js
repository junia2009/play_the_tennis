// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  render3d.js — Three.js scene
//  Maps game state (wx/z/h) → world coordinates (meters).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SkeletonUtils } from 'three/addons/utils/SkeletonUtils.js';

import { state, CT, SVC_Z_CPU, SVC_Z_PLY, input, clamp } from './game.js';

// ── Court dimensions (m) ───────────────────────────────────
const COURT_W = 8.23 * 1.05;     // singles width × small margin
const COURT_L = 23.77;
const NET_H   = 0.914;

// ── Coordinate conversion ──────────────────────────────────
const GAME_HALF = (CT.right - CT.left) / 2;           // 192
function gx(wx) { return ((wx - CT.cx) / GAME_HALF) * (COURT_W / 2); }
function gz(z)  { return (0.5 - z) * COURT_L; }       // z=0 (CPU) → +far, z=1 (player) → -near
                                                       // ⇒ camera at +Z sees player on near (-Z side, wait flip)
// Note: We want player to be NEAR the camera. Camera at +Z, player at +Z.
// So flip: z=1 (player) → world +Z (near camera), z=0 (CPU) → world -Z (far).
function gzPos(z) { return (z - 0.5) * COURT_L; }
function gh(h)  { return h * 2.5; }                   // h=1 ≈ 2.5m

let scene, camera, renderer, container;
let courtGroup, netGroup;
let ballMesh, ballShadow;
let trailMeshes = [];
let aimCursor;
let hitFlash;
let bounceRing;

let player3D = null, cpu3D = null;
let clock;

const loader = new GLTFLoader();

// Initialize scene; returns a promise that resolves when models are loaded.
export async function init(stageEl) {
  container = stageEl;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a141e);
  scene.fog = new THREE.Fog(0x0a141e, 30, 70);

  const aspect0 = window.innerWidth / window.innerHeight;
  const fov0 = aspect0 < 0.8 ? 62 : 48;
  camera = new THREE.PerspectiveCamera(fov0, aspect0, 0.1, 200);
  camera.position.set(0, 8.5, 19);
  camera.lookAt(0, 1, -2);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  clock = new THREE.Clock();

  buildLights();
  buildEnv();
  buildCourt();
  buildBall();
  buildAim();
  buildHitFlash();
  buildBounceRing();

  window.addEventListener('resize', onResize);

  await buildCharacters();
}

function onResize() {
  const aspect = window.innerWidth / window.innerHeight;
  camera.aspect = aspect;
  camera.fov    = aspect < 0.8 ? 62 : 48;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ── Lights ─────────────────────────────────────────────────
function buildLights() {
  scene.add(new THREE.HemisphereLight(0x88aaff, 0x223344, 0.55));
  scene.add(new THREE.AmbientLight(0xffffff, 0.15));

  const sun = new THREE.DirectionalLight(0xfff5e0, 1.45);
  sun.position.set(7, 16, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sz = 16;
  sun.shadow.camera.left   = -sz;
  sun.shadow.camera.right  =  sz;
  sun.shadow.camera.top    =  sz;
  sun.shadow.camera.bottom = -sz;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far  = 50;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
}

// ── Stadium environment ───────────────────────────────────
function buildEnv() {
  // Outer ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ color: 0x12231a, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);

  // Far stands (subtle dark walls behind baseline)
  const standMat = new THREE.MeshStandardMaterial({ color: 0x1a2530, roughness: 0.95 });
  for (const sign of [-1, 1]) {
    const stand = new THREE.Mesh(
      new THREE.BoxGeometry(28, 4, 1),
      standMat
    );
    stand.position.set(0, 2, sign * (COURT_L / 2 + 4));
    stand.castShadow = false; stand.receiveShadow = true;
    scene.add(stand);
  }
}

// ── Court surface + lines + net ────────────────────────────
function buildCourt() {
  courtGroup = new THREE.Group();

  // Inner court (a bit lighter)
  const courtMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.85 });
  const court = new THREE.Mesh(new THREE.PlaneGeometry(COURT_W + 1.5, COURT_L + 1.5), courtMat);
  court.rotation.x = -Math.PI / 2;
  court.receiveShadow = true;
  courtGroup.add(court);

  // Inner play area (slightly different color for contrast)
  const play = new THREE.Mesh(
    new THREE.PlaneGeometry(COURT_W, COURT_L),
    new THREE.MeshStandardMaterial({ color: 0x357a3a, roughness: 0.9 })
  );
  play.rotation.x = -Math.PI / 2;
  play.position.y = 0.001;
  play.receiveShadow = true;
  courtGroup.add(play);

  // Lines
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf2f2f2 });
  const lineW = 0.05;
  const addLine = (x1, z1, x2, z2) => {
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(lineW, len), lineMat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = -Math.atan2(dz, dx) + Math.PI / 2;
    m.position.set((x1 + x2) / 2, 0.005, (z1 + z2) / 2);
    courtGroup.add(m);
  };

  const xL = gx(CT.left), xR = gx(CT.right);
  const zCpu = gzPos(0), zPly = gzPos(1);
  const zSvcCpu = gzPos(SVC_Z_CPU), zSvcPly = gzPos(SVC_Z_PLY);
  const xC = gx(CT.cx);

  addLine(xL, zCpu, xR, zCpu);                   // CPU baseline
  addLine(xL, zPly, xR, zPly);                   // Player baseline
  addLine(xL, zCpu, xL, zPly);                   // Left sideline
  addLine(xR, zCpu, xR, zPly);                   // Right sideline
  addLine(xL, zSvcCpu, xR, zSvcCpu);             // CPU service line
  addLine(xL, zSvcPly, xR, zSvcPly);             // Player service line
  addLine(xC, zSvcCpu, xC, zSvcPly);             // Center service line
  // Center marks on baselines
  addLine(xC, zCpu, xC, zCpu - 0.3);
  addLine(xC, zPly, xC, zPly + 0.3);

  scene.add(courtGroup);

  // Net
  netGroup = new THREE.Group();
  const netW = COURT_W + 0.6;

  // Net mesh material (semi-transparent dark)
  const netMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a1a, transparent: true, opacity: 0.55, side: THREE.DoubleSide
  });
  const netSurf = new THREE.Mesh(new THREE.PlaneGeometry(netW, NET_H), netMat);
  netSurf.position.set(0, NET_H / 2, 0);
  netGroup.add(netSurf);

  // White top band
  const band = new THREE.Mesh(
    new THREE.BoxGeometry(netW + 0.1, 0.06, 0.05),
    new THREE.MeshStandardMaterial({ color: 0xffffff })
  );
  band.position.y = NET_H;
  netGroup.add(band);
  band.castShadow = true;

  // Posts
  const postMat = new THREE.MeshStandardMaterial({ color: 0xcfcfcf, roughness: 0.6, metalness: 0.5 });
  for (const sx of [-netW / 2, netW / 2]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, NET_H + 0.15, 16),
      postMat
    );
    post.position.set(sx, (NET_H + 0.15) / 2, 0);
    post.castShadow = true;
    netGroup.add(post);
  }

  scene.add(netGroup);
}

// ── Ball ───────────────────────────────────────────────────
function buildBall() {
  ballMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 20, 20),
    new THREE.MeshStandardMaterial({
      color: 0xe8ff66, emissive: 0x222200, roughness: 0.45
    })
  );
  ballMesh.castShadow = true;
  ballMesh.visible = false;
  scene.add(ballMesh);

  // Soft contact shadow (separate from sun shadow, ground-aligned)
  ballShadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.12, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 })
  );
  ballShadow.rotation.x = -Math.PI / 2;
  ballShadow.position.y = 0.012;
  ballShadow.visible = false;
  scene.add(ballShadow);
}

// ── Aim cursor (target marker on CPU side during rally) ───
function buildAim() {
  aimCursor = new THREE.Group();
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffd54f, transparent: true, opacity: 0.85, side: THREE.DoubleSide
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.42, 32), ringMat);
  ring.rotation.x = -Math.PI / 2;
  aimCursor.add(ring);

  const lineMat = new THREE.LineBasicMaterial({ color: 0xffd54f });
  const cross = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.6, 0, 0), new THREE.Vector3(0.6, 0, 0),
      new THREE.Vector3(0, 0, -0.6), new THREE.Vector3(0, 0, 0.6)
    ]),
    lineMat
  );
  aimCursor.add(cross);
  aimCursor.position.y = 0.015;
  aimCursor.visible = false;
  scene.add(aimCursor);
}

// ── Hit flash (white burst at contact point) ──────────────
function buildHitFlash() {
  hitFlash = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 })
  );
  hitFlash.visible = false;
  scene.add(hitFlash);
}

// ── Bounce ring (expanding circle on ground at bounce) ────
function buildBounceRing() {
  bounceRing = new THREE.Mesh(
    new THREE.RingGeometry(0.15, 0.22, 24),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide })
  );
  bounceRing.rotation.x = -Math.PI / 2;
  bounceRing.position.y = 0.018;
  bounceRing.visible = false;
  scene.add(bounceRing);
}

// ── Characters ─────────────────────────────────────────────
async function buildCharacters() {
  let gltf;
  try {
    gltf = await loader.loadAsync('/play_the_tennis/assets/player.glb');
  } catch (e) {
    console.warn('Failed to load player.glb, using placeholder', e);
    player3D = makePlaceholder(0x1976d2);
    cpu3D    = makePlaceholder(0xc62828);
    scene.add(player3D.group);
    scene.add(cpu3D.group);
    return;
  }

  player3D = makeCharFromGltf(gltf, 0x1976d2);
  cpu3D    = makeCharFromGltf(gltf, 0xc62828);
  scene.add(player3D.group);
  scene.add(cpu3D.group);
}

function makeCharFromGltf(gltf, tintHex) {
  const clone = SkeletonUtils.clone(gltf.scene);
  const root = new THREE.Group();
  root.add(clone);

  clone.scale.setScalar(1.0);
  clone.traverse(obj => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = false;
      // Tint material slightly without losing detail
      if (obj.material) {
        const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
        const newMat = mat.clone();
        if (newMat.color) {
          const c = newMat.color.clone();
          c.lerp(new THREE.Color(tintHex), 0.45);
          newMat.color = c;
        }
        if (newMat.emissive) {
          newMat.emissive = new THREE.Color(tintHex).multiplyScalar(0.06);
        }
        obj.material = newMat;
      }
    }
  });

  // Animation
  const mixer = new THREE.AnimationMixer(clone);
  const actions = {};
  for (const clip of gltf.animations || []) {
    actions[clip.name] = mixer.clipAction(clip);
  }
  // Soldier.glb has: Idle, Walk, Run, TPose
  const idleAct = actions['Idle'] || Object.values(actions)[0];
  const walkAct = actions['Walk'];
  const runAct  = actions['Run'];
  if (idleAct) { idleAct.play(); }
  if (walkAct) { walkAct.weight = 0; walkAct.play(); }
  if (runAct)  { runAct.weight = 0; runAct.play(); }

  // Find right arm bone for procedural swing
  let rightArm = null;
  clone.traverse(obj => {
    if (obj.isBone) {
      const n = obj.name.toLowerCase();
      // Mixamo right arm bone
      if (!rightArm && n.includes('rightarm') && !n.includes('forearm')) rightArm = obj;
      else if (!rightArm && n.includes('right_arm') && !n.includes('forearm')) rightArm = obj;
      else if (!rightArm && /right.*shoulder/.test(n)) rightArm = obj;
    }
  });

  return {
    group: root,
    mixer,
    actions, idleAct, walkAct, runAct,
    rightArm,
    initialArmRot: rightArm ? rightArm.rotation.clone() : null,
    swingTimer: 0,
    swingActive: false,
    swingSign: 1
  };
}

function makePlaceholder(color) {
  // Box humanoid fallback
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 1.0, 0.3),
    new THREE.MeshStandardMaterial({ color })
  );
  body.position.y = 0.85;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xffcc88 })
  );
  head.position.y = 1.55;
  head.castShadow = true;
  g.add(head);
  return { group: g, mixer: null, actions: {}, rightArm: null, swingTimer: 0, swingActive: false };
}

// ── Trigger procedural swing ──────────────────────────────
export function triggerSwing(isPlayer) {
  const c = isPlayer ? player3D : cpu3D;
  if (!c || !c.rightArm) return;
  c.swingActive = true;
  c.swingTimer = 0;
}

// ── Trigger hit flash ─────────────────────────────────────
export function triggerHitFlash(wx, z, h) {
  hitFlash.position.set(gx(wx), gh(h) + 0.3, gzPos(z));
  hitFlash.visible = true;
  hitFlash.material.opacity = 1.0;
  hitFlash.scale.setScalar(1.0);
}

// ── Trigger bounce ring ───────────────────────────────────
export function triggerBounce(wx, z) {
  bounceRing.position.set(gx(wx), 0.018, gzPos(z));
  bounceRing.visible = true;
  bounceRing.material.opacity = 0.85;
  bounceRing.scale.setScalar(1.0);
}

// ── Per-frame update ──────────────────────────────────────
const _v = new THREE.Vector3();

function updateCharacter(c, gx_pos, gz_pos, faceTowardCpu, dt) {
  if (!c) return;
  const moving = (Math.abs(c.group.position.x - gx_pos) > 0.02) || (Math.abs(c.group.position.z - gz_pos) > 0.02);

  // Smooth follow
  c.group.position.x += (gx_pos - c.group.position.x) * 0.35;
  c.group.position.z += (gz_pos - c.group.position.z) * 0.35;

  // Face direction (toward opponent's side or by movement)
  c.group.rotation.y = faceTowardCpu ? Math.PI : 0;

  // Crossfade idle ↔ run based on movement
  if (c.idleAct && c.runAct) {
    const target = moving ? 1 : 0;
    c.runAct.weight  += (target - c.runAct.weight) * 0.2;
    c.idleAct.weight += ((1 - target) - c.idleAct.weight) * 0.2;
  }

  if (c.mixer) c.mixer.update(dt);

  // Procedural swing on top
  if (c.swingActive && c.rightArm && c.initialArmRot) {
    c.swingTimer += dt * 4.5;   // ~0.22s swing
    const t = clamp(c.swingTimer, 0, 1);
    // Wind-up at 0..0.25, strike at 0.25..0.55, follow-through 0.55..1
    let phase;
    if (t < 0.25) phase = -0.6 * (t / 0.25);
    else if (t < 0.55) phase = -0.6 + 2.0 * ((t - 0.25) / 0.30);
    else phase = 1.4 - 1.4 * ((t - 0.55) / 0.45);
    c.rightArm.rotation.set(
      c.initialArmRot.x,
      c.initialArmRot.y,
      c.initialArmRot.z + phase * c.swingSign
    );
    if (t >= 1) {
      c.swingActive = false;
      c.rightArm.rotation.copy(c.initialArmRot);
    }
  }
}

let prevPlState = 'idle', prevCpuShootTimer = 0;
let aimVisibleSmoothing = 0;

export function frame() {
  const dt = clock ? clock.getDelta() : 0.016;

  // Detect player swing transition → trigger 3D swing
  if (state.pl.state === 'swing' && prevPlState !== 'swing') {
    triggerSwing(true);
  }
  prevPlState = state.pl.state;

  // Detect CPU shoot trigger via shootTimer reset (when timer resets after firing)
  // Simpler: trigger on every hit event via game.js hooks (registered in main.js)

  // ─── Update characters ─────────────────────────────────
  if (player3D) {
    updateCharacter(player3D, gx(state.pl.wx), gzPos(state.pl.y), true, dt);
  }
  if (cpu3D) {
    updateCharacter(cpu3D, gx(state.cpu.wx), gzPos(state.cpu.y), false, dt);
  }

  // ─── Ball ──────────────────────────────────────────────
  if (state.ball.inPlay) {
    const bx = gx(state.ball.wx);
    const bz = gzPos(state.ball.z);
    const by = gh(state.ball.h) + 0.07;
    ballMesh.position.set(bx, by, bz);
    ballMesh.visible = true;
    ballShadow.visible = true;
    ballShadow.position.set(bx, 0.012, bz);
    // Shadow scale & opacity based on height
    const sc = clamp(1.0 - state.ball.h * 0.3, 0.5, 1);
    ballShadow.scale.setScalar(sc);
    ballShadow.material.opacity = 0.35 * sc;
  } else if (state.tossBall.active) {
    // Serve toss animation
    const progress = state.tossBall.timer / 32;
    const tossY = Math.sin(progress * Math.PI) * 1.3;
    const px = gx(state.tossBall.wx);
    const pz = gzPos(state.pl.y) - 0.25;
    ballMesh.position.set(px, 1.4 + tossY, pz);
    ballMesh.visible = true;
    ballShadow.visible = false;
  } else {
    ballMesh.visible = false;
    ballShadow.visible = false;
  }

  // ─── Trail ─────────────────────────────────────────────
  // Build/reuse small spheres
  const trail = state.ballTrail;
  while (trailMeshes.length < trail.length) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff066, transparent: true, opacity: 0.4 })
    );
    scene.add(m);
    trailMeshes.push(m);
  }
  for (let i = 0; i < trailMeshes.length; i++) {
    const m = trailMeshes[i];
    if (i < trail.length) {
      const t = trail[i];
      m.position.set(gx(t.wx), gh(t.h) + 0.07, gzPos(t.z));
      const a = (1 - i / Math.max(1, trail.length)) * 0.45;
      m.material.opacity = a;
      m.scale.setScalar(1 - i * 0.06);
      m.visible = state.ball.inPlay;
    } else {
      m.visible = false;
    }
  }

  // ─── Aim cursor ────────────────────────────────────────
  const showAim = state.phase === 'playing' && state.ball.inPlay && state.ball.owner === 1 && state.ball.z > 0.50;
  aimVisibleSmoothing += ((showAim ? 1 : 0) - aimVisibleSmoothing) * 0.2;
  aimCursor.visible = aimVisibleSmoothing > 0.05;
  if (aimCursor.visible) {
    const nx = input.stickActive ? clamp(input.stickDx, -1, 1) : input.lastNx;
    const ny = input.stickActive ? clamp(input.stickDy, -1, 1) : input.lastNy;
    const aimRange = CT.right - CT.cx - 20;
    const tx = clamp(CT.cx + nx * aimRange, CT.left + 15, CT.right - 15);
    const baseDeep = state.pl.shotType === 'lob' ? 0.06 : 0.12;
    const tz = clamp(baseDeep - ny * 0.08, 0.05, 0.26);
    aimCursor.position.set(gx(tx), 0.015, gzPos(tz));
    aimCursor.scale.setScalar(0.8 + 0.2 * aimVisibleSmoothing);
    aimCursor.material && (aimCursor.material.opacity = 0.85 * aimVisibleSmoothing);
  }

  // ─── Hit flash decay ───────────────────────────────────
  if (hitFlash.visible) {
    hitFlash.material.opacity *= 0.78;
    hitFlash.scale.multiplyScalar(1.18);
    if (hitFlash.material.opacity < 0.02) hitFlash.visible = false;
  }

  // ─── Bounce ring decay ─────────────────────────────────
  if (bounceRing.visible) {
    bounceRing.material.opacity *= 0.86;
    bounceRing.scale.multiplyScalar(1.13);
    if (bounceRing.material.opacity < 0.02) bounceRing.visible = false;
  }

  renderer.render(scene, camera);
}
