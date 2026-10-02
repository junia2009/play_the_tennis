// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  score.js — テニスのスコア計算（1セットマッチ）
//    ・通常ゲーム: 0/15/30/40, デュース/アドバンテージ
//    ・gamesToWin ゲーム先取（2ゲーム差）, gamesToWin-gamesToWin でタイブレーク
//    ・gamesToWin = 1 のときは 1 ゲーム先取で終了
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function createScore(gamesToWin, firstServer) {
  return {
    gamesToWin,
    games: [0, 0],
    points: [0, 0],
    tiebreak: false,
    tbFirstServer: null,
    gameServer: firstServer,   // 通常ゲームのサーバー
    winner: null,
  };
}

const other = p => 1 - p;

// 現在のサーバー
export function server(s) {
  if (!s.tiebreak) return s.gameServer;
  const n = s.points[0] + s.points[1];
  return Math.floor((n + 1) / 2) % 2 === 0 ? s.tbFirstServer : other(s.tbFirstServer);
}

// 'deuce' | 'ad'
export function serveSide(s) {
  return (s.points[0] + s.points[1]) % 2 === 0 ? 'deuce' : 'ad';
}

// ポイント加算。戻り値: { game: winner|null, match: winner|null }
export function addPoint(s, winner) {
  const res = { game: null, match: null };
  if (s.winner !== null) return res;
  s.points[winner]++;
  const w = s.points[winner], l = s.points[other(winner)];

  if (s.tiebreak) {
    if (w >= 7 && w - l >= 2) {
      s.games[winner]++;
      res.game = winner;
      s.winner = winner;
      res.match = winner;
    }
    return res;
  }

  if (w >= 4 && w - l >= 2) {
    s.games[winner]++;
    s.points = [0, 0];
    res.game = winner;
    s.gameServer = other(s.gameServer);

    const gw = s.games[winner], gl = s.games[other(winner)];
    const N = s.gamesToWin;
    if (N <= 1 || (gw >= N && gw - gl >= 2)) {
      s.winner = winner;
      res.match = winner;
    } else if (gw === N && gl === N) {
      s.tiebreak = true;
      s.tbFirstServer = s.gameServer;
    }
  }
  return res;
}

const LABEL = ['0', '15', '30', '40'];

// 表示用ポイント文字列 [p0, p1]
export function pointLabels(s) {
  const [a, b] = s.points;
  if (s.tiebreak) return [String(a), String(b)];
  if (a >= 3 && b >= 3) {
    if (a === b) return ['40', '40'];
    return a > b ? ['Ad', '40'] : ['40', 'Ad'];
  }
  return [LABEL[Math.min(a, 3)], LABEL[Math.min(b, 3)]];
}

// 実況っぽいコール文字列
export function callText(s) {
  const [a, b] = s.points;
  if (s.tiebreak) return `${a} - ${b}`;
  if (a >= 3 && b >= 3) {
    if (a === b) return 'デュース';
    return a > b ? 'アドバンテージ あなた' : 'アドバンテージ CPU';
  }
  const srv = server(s);
  const [x, y] = srv === 0 ? [a, b] : [b, a];
  if (x === y && x > 0) return `${LABEL[x]} オール`;
  if (x === 0 && y === 0) return 'ラブ オール';
  const n = v => (v === 0 ? 'ラブ' : LABEL[v]);
  return `${n(x)} - ${n(y)}`;
}

// ブレイクポイント・ゲームポイント等の状況 ('break'|'game'|'set'|'match'|null)
export function pressure(s) {
  if (s.winner !== null) return null;
  const srv = server(s);
  for (const p of [0, 1]) {
    const t = structuredCloneScore(s);
    const r = addPoint(t, p);
    if (r.match === p) return { who: p, kind: 'match' };
  }
  if (s.tiebreak) return null;
  for (const p of [0, 1]) {
    const t = structuredCloneScore(s);
    const r = addPoint(t, p);
    if (r.game === p) return { who: p, kind: p === srv ? 'game' : 'break' };
  }
  return null;
}

function structuredCloneScore(s) {
  return { ...s, games: [...s.games], points: [...s.points] };
}
