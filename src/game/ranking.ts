// ランキングの決まり（2026-11-25。サーバーの /api/ranking と、手元の見本が使う。純粋な計算）。
//   ・プレイヤー：コンピュータに勝った数・ストーリーの進み・ふたりで対戦の勝ち数。
//     **ニックネームを決めた人だけ**出す（Google の名前は、子どもの本名のことが多いため。src/game/profile.ts）
//   ・ロボ：コンピュータに勝った数・ストーリーのレベル・ふたりで対戦の勝ち数。みんなのロボが出る。
//     持ち主は、ニックネームを決めた人だけ名前を出し、ほかは「ないしょ」。
//     送るのは、名前・属性・ランク・姿（設計図）だけ。写真・写っていたもの・写真の印・特別な写真のしるしは送らない（server/rival.ts の toRival と同じ）
//   ・同じ数なら同じ順位（1位・1位・3位）。0 の人・ロボは出さない
//   ・uid は画面に送らない（自分の行かどうかは、サーバーが me で教える）

import type { CharacterSpec, Element, Rank } from './types';
import { CHAPTER_SIZE } from './progress';

export const RANKING_SIZE = 20;

// ── サーバーが集めてくる、もとのデータ ──
export interface RawPlayer {
  uid: string;
  nickname: string;
  cpuWins: number;
  roomWins: number;
  cleared: number; // クリアした章
  next: number; // いちばん先の章で、たどり着いた敵（0〜4）
  storyAt: number; // いまの進み具合に着いた時刻（無ければ 0＝前から）
}
export interface RawRobot {
  uid: string; // 持ち主
  key: string; // ロボを見分ける印（画面には、持ち主の印をのぞいたものを送る）
  name: string;
  element: Element;
  rank: Rank;
  level: number;
  exp: number;
  cpuWins: number;
  roomWins: number;
  spec: CharacterSpec; // 姿を出すための設計図（写真に写っていたもの・特別な写真のしるしは消してある）
}

// ── 画面に送る形 ──
export interface PlayerRow {
  place: number;
  name: string;
  value: number;
  cleared?: number;
  next?: number;
  me?: true;
}
export interface RobotRow {
  place: number;
  id: string; // 行を見分ける番号（並びの中だけで使う）
  name: string;
  owner: string; // 持ち主のニックネーム（決めていなければ ''＝ないしょ）
  element: Element;
  rank: Rank;
  level: number;
  value: number;
  spec: CharacterSpec;
  me?: true;
}
export type PlayerBoard = 'cpu' | 'story' | 'room';
export type RobotBoard = 'cpu' | 'level' | 'room';
export interface RankingData {
  at: number; // 集めた時刻
  players: Record<PlayerBoard, PlayerRow[]>;
  robots: Record<RobotBoard, RobotRow[]>;
  me: { nickname: string; places: Record<PlayerBoard, number | null> }; // 自分の順位（出ていなければ null）
}

/** ストーリーの進みを一つの数にする（クリアした章×5＋いちばん先の章でたどり着いた敵） */
export const storyScore = (cleared: number, next: number) => cleared * CHAPTER_SIZE + next;

/** 大きい順に並べて、順位をつける（同じ数なら同じ順位） */
function placed<T>(list: T[], value: (x: T) => number, tie: (a: T, b: T) => number = () => 0) {
  const sorted = list.filter((x) => value(x) > 0).sort((a, b) => value(b) - value(a) || tie(a, b));
  let place = 0;
  return sorted.map((x, i) => {
    if (i === 0 || value(sorted[i - 1]) !== value(x) || tie(sorted[i - 1], x) !== 0) place = i + 1;
    return { x, place };
  });
}

/** ランキングを作る。myUid＝見ている人（その人の行に me を付ける） */
export function buildRanking(players: RawPlayer[], robots: RawRobot[], myUid: string, at = Date.now()): RankingData {
  const named = players.filter((p) => p.nickname);
  const nick = new Map(named.map((p) => [p.uid, p.nickname]));
  const me = players.find((p) => p.uid === myUid);

  const playerBoard = (value: (p: RawPlayer) => number, tie?: (a: RawPlayer, b: RawPlayer) => number) => {
    const all = placed(named, value, tie);
    const rows: PlayerRow[] = all.slice(0, RANKING_SIZE).map(({ x, place }) => ({
      place,
      name: x.nickname,
      value: value(x),
      ...(x.uid === myUid ? { me: true as const } : {}),
    }));
    const mine = all.find((r) => r.x.uid === myUid)?.place ?? null;
    return { rows, mine, all };
  };
  const cpu = playerBoard((p) => p.cpuWins);
  // ストーリー：同じ進みなら、先に着いた人が上（時刻の無い人は、前から着いていた人）
  const story = playerBoard(
    (p) => storyScore(p.cleared, p.next),
    (a, b) => a.storyAt - b.storyAt,
  );
  const storyRows = story.rows.map((r, i) => ({ ...r, cleared: story.all[i].x.cleared, next: story.all[i].x.next }));
  const room = playerBoard((p) => p.roomWins);

  const robotBoard = (value: (r: RawRobot) => number, tie?: (a: RawRobot, b: RawRobot) => number): RobotRow[] =>
    placed(robots, value, tie)
      .slice(0, RANKING_SIZE)
      .map(({ x, place }, i) => ({
        place,
        id: `${i}`,
        name: x.name,
        owner: nick.get(x.uid) ?? '',
        element: x.element,
        rank: x.rank,
        level: x.level,
        value: value(x),
        spec: x.spec,
        ...(x.uid === myUid ? { me: true as const } : {}),
      }));

  return {
    at,
    players: { cpu: cpu.rows, story: storyRows, room: room.rows },
    robots: {
      cpu: robotBoard((r) => r.cpuWins),
      // レベル：Lv2 から。同じレベルなら、経験値の多いほうが上
      level: robotBoard(
        (r) => (r.level > 1 ? r.level : 0),
        (a, b) => b.exp - a.exp,
      ),
      room: robotBoard((r) => r.roomWins),
    },
    me: { nickname: me?.nickname ?? '', places: { cpu: cpu.mine, story: story.mine, room: room.mine } },
  };
}
