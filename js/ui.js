// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ui.js — DOM overlay management (HUD, screens, messages)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { state, startGame, returnToTitle, on, VERSION } from './game.js';

const PT_LABELS = ['0','15','30','40'];

let msgTimer = null;
let elOv, elOc, elMsg, elControls;
let elGame, elPoint, elServeTag, elSide, elTb;

export function init() {
  elOv      = document.getElementById('ov');
  elOc      = document.getElementById('oc');
  elMsg     = document.getElementById('msg');
  elControls= document.getElementById('controls');
  elGame    = document.getElementById('hud-game');
  elPoint   = document.getElementById('hud-point');
  elServeTag= document.getElementById('serveTag');
  elSide    = document.getElementById('hud-side');
  elTb      = document.getElementById('hud-tb');

  // Subscribe to game events
  on('message', m => showMessage(m.text, m.dur));
  on('result',  r => showResult(r.winner));

  showTitle();
}

function showMessage(text, dur) {
  if (!text) {
    clearTimeout(msgTimer);
    elMsg.classList.remove('on');
    return;
  }
  elMsg.textContent = text;
  elMsg.classList.add('on');
  clearTimeout(msgTimer);
  if (dur < 99999) msgTimer = setTimeout(() => elMsg.classList.remove('on'), dur);
}

export function showTitle() {
  state.phase = 'title';
  elOv.classList.remove('hidden');
  elControls.classList.add('hidden');
  elOc.innerHTML = `
    <button class="btn" id="startBtn">ゲームスタート</button>
    <div class="ver">${VERSION}</div>`;
  document.getElementById('startBtn').onclick = showDiff;
}

export function showDiff() {
  state.phase = 'diff';
  const cur = state.diff;
  elOc.innerHTML = `
    <div style="color:#90caf9;font-size:clamp(10px,3vw,14px);margin-bottom:10px;letter-spacing:1px">難易度</div>
    <div class="row">
      <button class="btn ${cur==='easy'?'sel':''}"   data-d="easy">EASY</button>
      <button class="btn ${cur==='normal'?'sel':''}" data-d="normal">NORMAL</button>
      <button class="btn ${cur==='hard'?'sel':''}"   data-d="hard">HARD</button>
    </div>
    <div class="row"><button class="btn" id="startGo">スタート！</button></div>
    <div class="ver">${VERSION}</div>`;
  document.querySelectorAll('[data-d]').forEach(b => {
    b.onclick = () => { state.diff = b.dataset.d; showDiff(); };
  });
  document.getElementById('startGo').onclick = () => {
    elOv.classList.add('hidden');
    elControls.classList.remove('hidden');
    startGame(state.diff);
  };
}

export function showResult(winner) {
  state.phase = 'result';
  elOv.classList.remove('hidden');
  elControls.classList.add('hidden');
  const t = winner === 0 ? '🏆 あなたの勝ち！' : '😓 CPUの勝ち…';
  elOc.innerHTML = `
    <div style="font-size:clamp(16px,5.5vw,32px);margin-bottom:14px">${t}</div>
    <div style="color:#90caf9;margin-bottom:18px;font-size:clamp(11px,3vw,14px)">
      ゲーム ${state.sc.games[0]} - ${state.sc.games[1]}
    </div>
    <div class="row">
      <button class="btn" id="resAgain">もう一度</button>
      <button class="btn" id="resTitle">タイトルへ</button>
    </div>
    <div class="ver">${VERSION}</div>`;
  document.getElementById('resAgain').onclick = () => {
    elOv.classList.add('hidden');
    elControls.classList.remove('hidden');
    startGame(state.diff);
  };
  document.getElementById('resTitle').onclick = () => {
    returnToTitle();
    showTitle();
  };
}

// Called each frame from main loop
export function syncHud() {
  if (state.phase === 'title' || state.phase === 'diff' || state.phase === 'result') return;
  const sc = state.sc;
  // GAME (you - cpu)
  elGame.textContent = `${sc.games[0]} - ${sc.games[1]}`;
  // POINT
  let p0, p1;
  if (sc.tb) {
    p0 = String(sc.tbPts[0]); p1 = String(sc.tbPts[1]);
  } else {
    const w = sc.pts[0], l = sc.pts[1];
    if (w >= 3 && l >= 3) {
      if (sc.adv === -1) p0 = p1 = 'D';
      else { p0 = sc.adv === 0 ? 'A' : '40'; p1 = sc.adv === 1 ? 'A' : '40'; }
    } else {
      p0 = PT_LABELS[Math.min(3, w)];
      p1 = PT_LABELS[Math.min(3, l)];
    }
  }
  elPoint.textContent = `CPU ${p1}  あなた ${p0}`;
  elServeTag.textContent = sc.server === 0 ? '▶ あなたのサーブ' : '▶ CPUのサーブ';
  const side = sc.serveSide === 0 ? 'デュースサイド' : 'アドサイド';
  const ord  = state.serve1st ? '1st' : '2nd';
  elSide.textContent = `${ord} | ${side} | ${state.diff.toUpperCase()}`;
  elTb.textContent = sc.tb ? 'TIEBREAK' : '';
  elTb.style.color = sc.tb ? '#ef9a9a' : '';
}
