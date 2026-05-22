// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  game.js — physics, scoring, serve rules, CPU AI
//  Coordinate convention (kept from 2D version):
//    wx: court x  (18..402, 210=center)
//    z : 0..1     (0=CPU baseline, 0.5=net, 1=player baseline)
//    h : ball height (0=ground, ~0.3=max realistic for serves)
//
//  Rendering layer maps these to 3D world space.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const VERSION = 'v2.1.1';

export const CT = { left: 18, right: 402, cx: 210 };
export const SVC_Z_CPU = 0.27;
export const SVC_Z_PLY = 0.73;
export const G        = 0.008;

const PT_LABELS = ['0','15','30','40'];
const DIFFS = {
  easy:   { spd: 2.4, react: 22, acc: 0.52, miss: 0.20, corner: 0.10 },
  normal: { spd: 3.5, react: 17, acc: 0.78, miss: 0.07, corner: 0.30 },
  hard:   { spd: 4.7, react:  5, acc: 0.95, miss: 0.02, corner: 0.55 }
};

// Phase: title | diff | playing | fault | let_ | point | result
export const state = {
  phase: 'title',
  diff: 'normal',
  serve1st: true,
  servePending: false,
  serveTimer: 0,
  ptDelay: 0,

  sc: null,
  ball: null,
  pl:   null,
  cpu:  null,

  tossBall: { active: false, wx: 0, timer: 0 },
  hitEffect: null,         // { wx, z, h, life }
  ballTrail: [],           // [{wx, z, h}, ...]
};

const TRAIL_MAX = 10;
const TOSS_FRAMES = 32;

// Event subscribers
const listeners = { hit: [], bounce: [], point: [], serveFault: [], let: [] };
export function on(ev, fn) { listeners[ev]?.push(fn); }
function emit(ev, payload) { for (const fn of listeners[ev] || []) fn(payload); }

// ── Utility ─────────────────────────────────────────────────
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ── Score lifecycle ─────────────────────────────────────────
function newScore() {
  state.sc = {
    sets:  [0, 0],
    games: [0, 0],
    pts:   [0, 0],
    adv:   -1,
    tb:    false,
    tbPts: [0, 0],
    server:    Math.random() < 0.5 ? 0 : 1,
    serveSide: 0
  };
}

function newPlayers() {
  state.pl  = { wx: CT.cx, y: 0.95, spd: 5, state: 'idle', shotType: 'flat', coolTimer: null };
  state.cpu = { wx: CT.cx, y: 0.02, spd: 4, targetWx: CT.cx, targetY: 0.02, shootTimer: 0 };
}

function newBall() {
  state.ball = {
    wx: state.sc.server === 0 ? state.pl.wx : state.cpu.wx,
    z:  state.sc.server === 0 ? 1.0 : 0.0,
    h: 0, vx: 0, vz: 0, vh: 0,
    spin: 'flat',
    bounced: false, inPlay: false, isServe: false, netTouched: false,
    owner: state.sc.server
  };
}

// ── Serve rules ─────────────────────────────────────────────
function serveTargetIsLeft(hitter) {
  return (hitter === 0 && state.sc.serveSide === 0) ||
         (hitter === 1 && state.sc.serveSide === 1);
}

export function prepareServe() {
  state.serve1st = true;
  newBall();
  state.servePending = true;
  state.serveTimer = state.sc.server === 1 ? 80 : 0;

  if (state.sc.server === 0) {
    state.pl.wx = state.sc.serveSide === 0 ? CT.cx + 50 : CT.cx - 50;
    state.pl.y  = 0.97;
    state.cpu.wx = state.sc.serveSide === 0 ? CT.cx - 50 : CT.cx + 50;
    state.cpu.y  = 0.02;
    state.cpu.targetWx = state.cpu.wx; state.cpu.targetY = state.cpu.y;
    emit('message', { text:'タップ または フラット で 1st サーブ', dur:99999 });
  } else {
    state.cpu.wx = state.sc.serveSide === 0 ? CT.cx - 50 : CT.cx + 50;
    state.cpu.y  = -0.05;
    state.cpu.targetWx = state.cpu.wx; state.cpu.targetY = state.cpu.y;
  }
}

function prepare2ndServe() {
  state.ball.inPlay = false;
  newBall();
  state.servePending = true;
  state.serveTimer = state.sc.server === 1 ? 55 : 0;
  if (state.sc.server === 0) {
    state.pl.y = 0.97;
    emit('message', { text:'【2nd serve】 タップでサーブ', dur:99999 });
  }
}

function doServe(who) {
  const b = state.ball;
  b.wx = who === 0 ? state.pl.wx  : state.cpu.wx;
  b.z  = who === 0 ? 1.0   : 0.0;
  b.h  = 0;

  const toLft = serveTargetIsLeft(who);
  const xMin  = toLft ? CT.left + 15 : CT.cx + 10;
  const xMax  = toLft ? CT.cx - 10   : CT.right - 15;
  const tx    = xMin + Math.random() * (xMax - xMin);
  const tz    = who === 0 ? 0.27 + Math.random() * 0.18
                          : 0.55 + Math.random() * 0.18;

  shoot(who, tx, tz, 'flat', 0.6 + Math.random() * 0.25, true);
  state.servePending = false;
  emit('message', { text:'', dur:0 });
  emit('serve', { who });
}

function serveFault() {
  state.ball.inPlay = false;
  if (state.serve1st) {
    state.serve1st = false;
    emit('message', { text:'フォルト！　2nd serve', dur:1400 });
    state.phase = 'fault';
    state.ptDelay = 75;
    emit('serveFault', { doubleFault: false });
  } else {
    state.serve1st = true;
    emit('message', { text:'ダブルフォルト！', dur:1500 });
    awardPoint(1 - state.sc.server);
    emit('serveFault', { doubleFault: true });
  }
}

function serveLet() {
  state.ball.inPlay = false;
  emit('message', { text:'レット！　打ち直し', dur:1300 });
  state.phase = 'let_';
  state.ptDelay = 65;
  emit('let');
}

// ── Shot ────────────────────────────────────────────────────
function shoot(hitter, targetWx, targetZ, spin, power, isServe) {
  const b = state.ball;
  const fromZ = b.z;
  const dz    = Math.abs(targetZ - fromZ);
  if (dz < 0.005) return;

  let spd = 0.013 + power * 0.007;
  if (spin === 'topspin') spd *= 1.20;
  if (spin === 'slice')   spd *= 0.82;
  if (spin === 'lob')     spd *= 0.50;

  const frames = dz / spd;
  b.vz = (targetZ - fromZ) / frames;
  b.vx = (targetWx - b.wx) / frames;
  b.vh = Math.min(0.5 * G * frames, 0.30);

  b.spin = spin;
  b.bounced = false; b.netTouched = false;
  b.inPlay = true;
  b.owner = hitter; b.isServe = !!isServe;

  emit('hit', { wx: b.wx, z: b.z, h: b.h, hitter, spin, isServe });
}

// ── Scoring ─────────────────────────────────────────────────
function awardPoint(winner) {
  if (state.phase === 'point' || state.phase === 'result') return;
  state.phase = 'point';
  state.ptDelay = 95;
  state.ball.inPlay = false;
  emit('point', { winner });
  emit('message', { text: winner === 0 ? 'あなたのポイント！' : 'CPUのポイント！', dur:1500 });

  state.sc.serveSide = 1 - state.sc.serveSide;

  if (state.sc.tb) {
    state.sc.tbPts[winner]++;
    const w = state.sc.tbPts[winner], l = state.sc.tbPts[1 - winner];
    if (w >= 7 && w - l >= 2) { winSet(winner); return; }
    const total = state.sc.tbPts[0] + state.sc.tbPts[1];
    if (total % 2 === 1) state.sc.server = 1 - state.sc.server;
    return;
  }

  state.sc.pts[winner]++;
  const pw = state.sc.pts[winner], pl2 = state.sc.pts[1 - winner];
  if (pw >= 3 && pl2 >= 3) {
    const d2 = pw - pl2;
    if      (d2 === 0) state.sc.adv = -1;
    else if (d2 >= 2)  winGame(winner);
    else               state.sc.adv = winner;
  } else if (pw >= 4) {
    winGame(winner);
  }
}

function winGame(winner) {
  state.sc.games[winner]++;
  state.sc.pts = [0, 0];
  state.sc.adv = -1;
  state.sc.server = 1 - state.sc.server;
  state.sc.serveSide = 0;

  const gw = state.sc.games[winner], gl = state.sc.games[1 - winner];
  if (gw >= 6 && gw - gl >= 2) {
    winSet(winner);
  } else if (gw === 6 && gl === 6) {
    state.sc.tb = true;
    state.sc.tbPts = [0, 0];
    state.sc.tbStartServer = state.sc.server;
  }
}

function winSet(winner) {
  state.sc.sets[winner]++;
  if (state.sc.tb && state.sc.tbStartServer !== undefined) {
    state.sc.server = 1 - state.sc.tbStartServer;
  }
  state.sc.games = [0, 0]; state.sc.pts = [0, 0]; state.sc.adv = -1;
  state.sc.tb = false; state.sc.tbPts = [0, 0]; state.sc.tbStartServer = undefined;
  state.sc.serveSide = 0;
  if (state.sc.sets[winner] >= 1) {
    state.phase = 'result';
    emit('result', { winner });
  }
}

// ── Ball physics ────────────────────────────────────────────
function updateBall() {
  const b = state.ball;
  if (!b.inPlay) return;

  b.vh -= G;
  b.h  += b.vh;
  b.wx += b.vx;
  b.z  += b.vz;

  // Net
  const atNet = b.z > 0.46 && b.z < 0.54;
  if (atNet && !b.bounced) {
    if (b.isServe && !b.netTouched) {
      if (b.h < 0.05) { serveFault(); return; }
      else if (b.h < 0.18) b.netTouched = true;
    } else if (!b.isServe) {
      if (b.h < 0.05) { awardPoint(1 - b.owner); return; }
    }
  }

  // Bounce
  if (b.h <= 0 && b.vh < 0) {
    if (b.bounced) { awardPoint(b.owner); return; }

    const inX = b.wx >= CT.left - 20 && b.wx <= CT.right + 20;

    if (b.isServe) {
      const playerSrv = b.owner === 0;
      const inSvcZ = playerSrv
        ? (b.z >= SVC_Z_CPU - 0.03 && b.z <= 0.50)
        : (b.z >= 0.50 && b.z <= SVC_Z_PLY + 0.03);
      const toLft = serveTargetIsLeft(b.owner);
      const inBox = toLft ? b.wx < CT.cx : b.wx > CT.cx;
      if (!inX || !inSvcZ || !inBox) { serveFault(); return; }
      if (b.netTouched) { serveLet(); return; }
      b.isServe = false;
    } else {
      const valid =
        (b.owner === 0 && b.z < 0.5 && inX) ||
        (b.owner === 1 && b.z > 0.5 && inX);
      if (!valid) { awardPoint(1 - b.owner); return; }
    }

    b.h = 0;
    const rest = b.spin === 'topspin' ? 0.50
               : b.spin === 'slice'   ? 0.40
               : 0.55;
    b.vh *= -rest;
    if (b.spin === 'topspin') b.vz *= 1.12;
    if (b.spin === 'slice')   b.vz *= 0.78;
    b.bounced = true;
    emit('bounce', { wx: b.wx, z: b.z });
  }

  // Out
  if (b.z >  1.08) { awardPoint(b.bounced ? b.owner : 1 - b.owner); return; }
  if (b.z < -0.08) { awardPoint(b.bounced ? b.owner : 1 - b.owner); return; }
  if (b.bounced && (b.wx < CT.left - 30 || b.wx > CT.right + 30)) {
    awardPoint(b.owner); return;
  }
}

// ── Ball bounce prediction (for CPU AI) ────────────────────
function predictBounce() {
  const b = state.ball;
  const disc = b.vh * b.vh + 2 * G * b.h;
  if (disc < 0) return null;
  const t = (b.vh + Math.sqrt(disc)) / G;
  if (t <= 0 || t > 300) return null;
  return { z: b.z + b.vz * t, wx: b.wx + b.vx * t, t };
}

// ── CPU AI ──────────────────────────────────────────────────
function updateCPU(dt) {
  const d = DIFFS[state.diff];
  const c = state.cpu, b = state.ball;
  c.spd = d.spd;

  if (state.servePending && state.sc.server === 1) {
    c.targetWx = c.wx; c.targetY = c.y;
  } else if (b.inPlay && b.owner === 0) {
    const pred = predictBounce();
    if (pred && pred.z >= -0.05 && pred.z < 0.48) {
      const noise = (Math.random() - 0.5) * (1 - d.acc) * 60;
      c.targetWx = clamp(pred.wx + noise, CT.left + 14, CT.right - 14);
      c.targetY = clamp(pred.z - 0.08, -0.06, 0.40);
    }
  } else {
    c.targetWx = CT.cx; c.targetY = 0.02;
  }

  const dx = c.targetWx - c.wx;
  if (Math.abs(dx) > 1) c.wx += Math.sign(dx) * Math.min(Math.abs(dx), c.spd);
  const dy = c.targetY - c.y;
  if (Math.abs(dy) > 0.005) c.y += Math.sign(dy) * Math.min(Math.abs(dy), c.spd * 0.85 / 465);

  if (!b.inPlay) return;

  // Hit detection
  if (b.owner === 0 && b.z < 0.50 && b.h < 0.55
      && Math.abs(b.z - c.y) < 0.18
      && Math.abs(b.wx - c.wx) < 100) {
    c.shootTimer += (dt || 16);
    if (c.shootTimer > d.react * 16) {
      c.shootTimer = 0;
      if (Math.random() < d.miss) { awardPoint(0); return; }
      let tx = CT.cx + (Math.random() - 0.5) * 230;
      if (Math.random() < d.corner) tx = Math.random() < 0.5 ? CT.left + 18 : CT.right - 18;
      const spins = ['flat','topspin','slice'];
      const sp = state.diff === 'hard' ? spins[Math.floor(Math.random() * 3)] : 'flat';
      shoot(1, clamp(tx, CT.left + 15, CT.right - 15), 0.68 + Math.random() * 0.22, sp, 0.5 + Math.random() * 0.4, false);
    }
  } else {
    c.shootTimer = 0;
  }
}

// ── Player input ────────────────────────────────────────────
// Input state set by input.js
export const input = {
  stickActive: false, stickDx: 0, stickDy: 0,
  // For aim memory between move and swing
  lastNx: 0, lastNy: 0,
  // Pending swing requests (cleared on next consume)
  pendingShot: null,    // shotType or null
};

function updatePlayer() {
  const p = state.pl, b = state.ball;

  // Movement
  const s = p.spd;
  if (input.stickActive) {
    const nx = clamp(input.stickDx, -1, 1);
    const ny = clamp(input.stickDy, -1, 1);
    p.wx = clamp(p.wx + nx * s, CT.left + 14, CT.right - 14);
    if (!state.servePending) {
      // Constrain Y between net side and slightly past baseline
      p.y = clamp(p.y + ny * s / 465, 0.55, 1.07);
    }
    if (nx !== 0 || ny !== 0) { input.lastNx = nx; input.lastNy = ny; }
  }

  // Handle swing requests
  if (input.pendingShot) {
    const shotType = input.pendingShot;
    input.pendingShot = null;
    handleSwing(shotType);
  }
}

function handleSwing(shotType) {
  if (state.phase !== 'playing') return;
  const p = state.pl, b = state.ball;
  if (p.state === 'tossing' || p.state === 'swing') return;

  // Serve case
  if (state.servePending && state.sc.server === 0 && !state.tossBall.active) {
    state.tossBall.active = true;
    state.tossBall.wx = p.wx;
    state.tossBall.timer = 0;
    p.state = 'tossing';
    emit('message', { text:'', dur:0 });
    return;
  }

  if (p.state !== 'idle' && p.state !== 'cool') return;
  p.shotType = shotType;
  p.state = 'swing';

  // Rally return
  if (b.inPlay && b.owner === 1 && b.z > 0.50 && b.h < 0.55) {
    const plZ = p.y;
    if (Math.abs(b.z - plZ) < 0.18 && Math.abs(b.wx - p.wx) < 90) {
      const pwr = shotType === 'topspin' ? 0.85
                : shotType === 'slice'   ? 0.55
                : shotType === 'lob'     ? 0.40
                : 0.75;

      const nx = input.stickActive ? clamp(input.stickDx, -1, 1) : input.lastNx;
      const ny = input.stickActive ? clamp(input.stickDy, -1, 1) : input.lastNy;
      const aimRange = CT.right - CT.cx - 20;
      const tx = clamp(CT.cx + nx * aimRange, CT.left + 15, CT.right - 15);

      const baseDeep = shotType === 'lob'     ? 0.06
                     : shotType === 'topspin'  ? 0.07 + Math.random() * 0.10
                     : shotType === 'slice'    ? 0.15 + Math.random() * 0.08
                     :                          0.10 + Math.random() * 0.10;
      const deep = clamp(baseDeep - ny * 0.08, 0.05, 0.26);

      shoot(0, tx, deep, shotType, pwr, false);
    }
  }

  // Cool down
  if (p.coolTimer) clearTimeout(p.coolTimer);
  p.coolTimer = setTimeout(() => {
    if (p.state === 'cool' || p.state === 'swing') p.state = 'idle';
    p.coolTimer = null;
  }, 350);
  setTimeout(() => { if (p.state === 'swing') p.state = 'cool'; }, 180);
}

// External commands from input layer
export function requestSwing(shotType) {
  input.pendingShot = shotType;
}
export function setStick(active, dx, dy) {
  input.stickActive = active;
  input.stickDx = dx;
  input.stickDy = dy;
}

// ── Main update step ───────────────────────────────────────
export function tick(dt) {
  if (state.phase === 'playing') {
    updatePlayer();

    if (state.tossBall.active) {
      state.tossBall.wx = state.pl.wx;
      state.tossBall.timer++;
      if (state.tossBall.timer >= TOSS_FRAMES) {
        state.tossBall.active = false;
        state.pl.state = 'swing';      // brief swing pose on serve
        setTimeout(() => { if (state.pl.state === 'swing') state.pl.state = 'idle'; }, 200);
        if (state.servePending && state.sc.server === 0) doServe(0);
      }
    }

    updateBall();
    updateCPU(dt);

    // Trail
    if (state.ball.inPlay) {
      state.ballTrail.unshift({ wx: state.ball.wx, z: state.ball.z, h: state.ball.h });
      if (state.ballTrail.length > TRAIL_MAX) state.ballTrail.pop();
    } else if (state.ballTrail.length) {
      state.ballTrail.length = 0;
    }

    // Hit effect lifetime
    if (state.hitEffect) {
      state.hitEffect.life -= 0.06;
      if (state.hitEffect.life <= 0) state.hitEffect = null;
    }

    // CPU auto-serve
    if (state.servePending && state.sc.server === 1) {
      state.serveTimer--;
      if (state.serveTimer <= 0) doServe(1);
    }
  } else if (state.phase === 'fault') {
    state.ptDelay--;
    if (state.ptDelay <= 0) {
      state.phase = 'playing';
      prepare2ndServe();
    }
  } else if (state.phase === 'let_') {
    state.ptDelay--;
    if (state.ptDelay <= 0) {
      state.phase = 'playing';
      state.ball.inPlay = false;
      newBall();
      state.servePending = true;
      if (state.sc.server === 0) {
        state.serveTimer = 0;
        state.pl.y = 0.97;
        emit('message', { text:'打ち直し', dur:1000 });
      } else {
        state.serveTimer = 55;
      }
    }
  } else if (state.phase === 'point') {
    state.ptDelay--;
    if (state.ptDelay <= 0 && state.phase === 'point') {
      state.phase = 'playing';
      state.pl.y = 0.97;
      state.cpu.wx = CT.cx; state.cpu.y = 0.02;
      prepareServe();
    }
  }
}

// ── Lifecycle ──────────────────────────────────────────────
export function startGame(difficulty) {
  state.diff = difficulty;
  newScore(); newPlayers();
  state.phase = 'playing';
  prepareServe();
}

export function returnToTitle() {
  state.phase = 'title';
  newScore(); newPlayers(); newBall();
}

// Init defaults so render can read state immediately
newScore();
newPlayers();
newBall();
