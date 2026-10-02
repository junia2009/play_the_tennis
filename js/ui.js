// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ui.js — DOM の画面（タイトル・設定・スコア・メッセージ・結果）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { VERSION, DIFFICULTY, MATCH_FORMATS, HUMAN } from './config.js';
import { state, on, startMatch, quitToTitle, setPaused } from './match.js';
import * as Score from './score.js';
import * as audio from './audio.js';
import * as inputMod from './input.js';

const $ = id => document.getElementById(id);
const SETTINGS_KEY = 'ptt-settings-v3';

let settings = { diff: 'normal', format: 'g3', assist: true, sound: true };
let msgTimer = 0, callTimer = 0;

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (s) settings = { ...settings, ...s };
  } catch { /* 保存不可の環境では既定値 */ }
  if (!DIFFICULTY[settings.diff]) settings.diff = 'normal';
  if (!MATCH_FORMATS[settings.format]) settings.format = 'g3';
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* noop */ }
}

export function init() {
  loadSettings();
  audio.setEnabled(settings.sound);

  on('message', m => showMessage(m));
  on('call', c => showCall(c.text));
  on('matchOver', e => showResult(e.winner));
  on('serveReady', () => { if (state.phase !== 'title') document.body.dataset.phase = 'play'; });

  $('pauseBtn').addEventListener('click', () => { audio.click(); openPause(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (state.phase === 'serve' || state.phase === 'rally' || state.phase === 'between')) openPause();
  });
  window.addEventListener('keydown', e => {
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (state.paused) closePause();
      else if (state.phase !== 'title' && state.phase !== 'over') openPause();
    }
  });

  showTitle();
}

// ── 画面 ─────────────────────────────────────
function setScreen(html) {
  const ov = $('overlay');
  ov.innerHTML = html;
  ov.hidden = !html;
  document.body.dataset.phase = html ? 'menu' : 'play';
}

function segRow(name, options, current) {
  return `<div class="seg" data-name="${name}">${options.map(([v, label]) =>
    `<button class="${v === current ? 'on' : ''}" data-v="${v}">${label}</button>`).join('')}</div>`;
}

export function showTitle() {
  quitToTitle();
  setScreen(`
    <div class="panel title">
      <div class="logo"><span class="ball"></span>PLAY THE<br><b>TENNIS</b></div>
      <div class="field"><label>難易度</label>${segRow('diff', Object.entries(DIFFICULTY).map(([k, v]) => [k, v.label]), settings.diff)}</div>
      <div class="field"><label>試合形式（先取ゲーム数）</label>${segRow('format', Object.entries(MATCH_FORMATS).map(([k, v]) => [k, v.label]), settings.format)}</div>
      <div class="field"><label>移動補助</label>${segRow('assist', [['on', 'ON'], ['off', 'OFF']], settings.assist ? 'on' : 'off')}</div>
      <div class="field"><label>サウンド</label>${segRow('sound', [['on', 'ON'], ['off', 'OFF']], settings.sound ? 'on' : 'off')}</div>
      <button class="primary" id="startBtn">試合開始</button>
      <button class="ghost" id="howBtn">遊び方</button>
      <div class="ver">${VERSION}</div>
    </div>`);
  for (const seg of document.querySelectorAll('.seg')) {
    seg.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      audio.unlock(); audio.click();
      const name = seg.dataset.name, v = b.dataset.v;
      if (name === 'assist' || name === 'sound') settings[name] = v === 'on';
      else settings[name] = v;
      audio.setEnabled(settings.sound);
      saveSettings();
      seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    });
  }
  $('startBtn').addEventListener('click', () => { audio.unlock(); audio.click(); begin(); });
  $('howBtn').addEventListener('click', () => { audio.unlock(); audio.click(); showHowTo(); });
}

function showHowTo() {
  setScreen(`
    <div class="panel how">
      <h2>遊び方</h2>
      <ul>
        <li><b>移動</b>：画面の左側をドラッグ（スティック）。キーボードは矢印 / WASD</li>
        <li><b>打つ</b>：ボールが来たら右のショットボタンを押して<b>予約</b>。届く位置に来ると自動でスイングします</li>
        <li><b>狙う</b>：予約したあとは<b>スティックが狙い専用</b>になり、移動は自動になります（上＝深く、下＝浅く、左右＝コース）。相手コートのマーカーが落下地点です</li>
        <li><b>PERFECT</b>：早めに予約して良い体勢で打つと、速くて正確な球になります</li>
        <li><b>サーブ</b>：ボタンでトス → もう一度押して打つ。ボールが一番高いところで打つと良いサーブに</li>
        <li><b>移動補助 OFF</b>：予約後も自分で移動し、打つ瞬間のスティックの向きで狙います（上級者向け）</li>
      </ul>
      <div class="shots">
        <div><span class="dot flat"></span><b>フラット</b> 速くて直線的。ミスも出やすい</div>
        <div><span class="dot topspin"></span><b>トップスピン</b> 弧を描いて沈む。安定</div>
        <div><span class="dot slice"></span><b>スライス</b> 遅く低く滑る</div>
        <div><span class="dot lob"></span><b>ロブ</b> 高く深く。ネットの相手に</div>
      </div>
      <p class="keys">キーボード: J/Space=フラット K=トップ L=スライス I=ロブ　P=ポーズ</p>
      <button class="primary" id="backBtn">もどる</button>
    </div>`);
  $('backBtn').addEventListener('click', () => { audio.click(); showTitle(); });
}

function begin() {
  setScreen('');
  inputMod.reset();
  startMatch({ diff: settings.diff, format: settings.format, assist: settings.assist });
  const g = MATCH_FORMATS[settings.format].label;
  showMessage({ text: g, sub: `${state.score.gameServer === HUMAN ? 'あなた' : 'CPU'}のサーブから`, kind: 'game', dur: 1600 });
}

function openPause() {
  if (state.phase === 'title' || state.phase === 'over' || state.paused) return;
  setPaused(true);
  inputMod.reset();
  setScreen(`
    <div class="panel">
      <h2>ポーズ</h2>
      <button class="primary" id="resumeBtn">再開</button>
      <button class="ghost" id="soundBtn">サウンド: ${settings.sound ? 'ON' : 'OFF'}</button>
      <button class="ghost" id="quitBtn">タイトルへ</button>
    </div>`);
  $('resumeBtn').addEventListener('click', () => { audio.click(); closePause(); });
  $('soundBtn').addEventListener('click', e => {
    settings.sound = !settings.sound;
    audio.setEnabled(settings.sound);
    saveSettings();
    e.target.textContent = `サウンド: ${settings.sound ? 'ON' : 'OFF'}`;
  });
  $('quitBtn').addEventListener('click', () => { audio.click(); showTitle(); });
}

function closePause() {
  setScreen('');
  setPaused(false);
}

function showResult(winner) {
  const st = state.stats;
  const won = winner === HUMAN;
  if (won) audio.win();
  const row = (label, a, b) => `<tr><td>${a}</td><th>${label}</th><td>${b}</td></tr>`;
  setScreen(`
    <div class="panel result ${won ? 'win' : 'lose'}">
      <div class="big">${won ? 'YOU WIN!' : 'YOU LOSE'}</div>
      <div class="final">${state.score.games[0]} - ${state.score.games[1]}</div>
      <div class="sub">${DIFFICULTY[settings.diff].label} ・ ${MATCH_FORMATS[settings.format].label}</div>
      <table class="stats">
        <tr><td>あなた</td><th></th><td>CPU</td></tr>
        ${row('獲得ポイント', st.points[0], st.points[1])}
        ${row('サービスエース', st.aces[0], st.aces[1])}
        ${row('ウィナー', st.winners[0], st.winners[1])}
        ${row('ミス', st.errors[0], st.errors[1])}
        ${row('ダブルフォルト', st.doubleFaults[0], st.doubleFaults[1])}
      </table>
      <div class="sub">最長ラリー ${st.longestRally} 本</div>
      <button class="primary" id="againBtn">もう一度</button>
      <button class="ghost" id="titleBtn">タイトルへ</button>
    </div>`);
  $('againBtn').addEventListener('click', () => { audio.click(); begin(); });
  $('titleBtn').addEventListener('click', () => { audio.click(); showTitle(); });
}

// ── 当たりの判定表示 ───────────────────────────
let gradeTimer = 0;
const GRADE_TEXT = { perfect: 'PERFECT!', good: 'NICE', poor: '' };
export function showGrade(grade, type) {
  const el = $('grade');
  const text = type === 'smash' ? 'SMASH!' : GRADE_TEXT[grade];
  if (!text) return;
  el.textContent = text;
  el.className = 'grade ' + (type === 'smash' ? 'perfect' : grade);
  void el.offsetWidth;          // アニメーションを再生し直す
  el.classList.add('on');
  clearTimeout(gradeTimer);
  gradeTimer = setTimeout(() => el.classList.remove('on'), 650);
}

// ── メッセージ ─────────────────────────────────
function showMessage({ text, sub = '', kind = 'info', dur = 1200 }) {
  const el = $('msg');
  el.className = 'msg on ' + kind;
  el.innerHTML = `<div class="t">${text}</div>${sub ? `<div class="s">${sub}</div>` : ''}`;
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => el.classList.remove('on'), dur);
}

function showCall(text) {
  const el = $('call');
  if (!text) { el.classList.remove('on'); return; }
  el.textContent = text;
  el.classList.add('on');
  clearTimeout(callTimer);
  callTimer = setTimeout(() => el.classList.remove('on'), 1800);
}

// ── HUD（毎フレーム） ─────────────────────────
let lastHud = '';
export function syncHud() {
  const playing = state.phase !== 'title' && state.phase !== 'over';
  const hud = $('hud');
  hud.hidden = !playing;
  $('controls').hidden = !playing || state.paused;
  if (!playing) return;

  const sc = state.score;
  const [p0, p1] = Score.pointLabels(sc);
  const srv = Score.server(sc);
  const key = `${sc.games}|${p0}|${p1}|${srv}|${sc.tiebreak}|${state.hint}`;
  if (key === lastHud) return;
  lastHud = key;
  $('sbName0').classList.toggle('serving', srv === 0);
  $('sbName1').classList.toggle('serving', srv === 1);
  $('sbGames0').textContent = sc.games[0];
  $('sbGames1').textContent = sc.games[1];
  $('sbPts0').textContent = p0;
  $('sbPts1').textContent = p1;
  $('sbTag').textContent = sc.tiebreak ? 'TIEBREAK' : `${DIFFICULTY[state.settings.diff].label}`;
  const hint = $('hint');
  hint.textContent = state.hint;
  hint.classList.toggle('on', !!state.hint);
}
