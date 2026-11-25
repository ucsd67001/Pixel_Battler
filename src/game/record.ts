// 戦績（勝ち負けの数）の決まり（2026-11-25、マイページのため。サーバーも使う）。
//   ・プレイヤーの戦績：Firestore の users/{uid} の stats
//   ・ロボの戦績：ガレージのロボ（users/{uid}/robots/{写真の印}）の record
//   ・書くのはサーバーだけ（/api/battle/start で整理券をもらい、/api/battle/end で結果を知らせる）。
//     ストーリーの勝ちは /api/robots/win が数える（ストーリーの負けは数えない）
//   ・手元（npm run dev）・ログインしていないときは、このスマホの中（garage.ts）
//   ・にせの「勝った」を減らす歯止め：整理券は一回だけ使える・短すぎるバトルは数えない・一日に数える数に上限

export type RecordMode = 'cpu' | 'room'; // コンピュータと対戦・ふたりで対戦
export type BattleResult = 'win' | 'lose' | 'draw';

export interface WinLose {
  win: number;
  lose: number;
  draw: number;
}

export interface BattleRecord {
  cpu: WinLose;
  room: WinLose;
  story: { win: number };
}

/** 整理券をもらってから、これより短いバトルの結果は数えない（演出があるので、どんなに速くても1戦に30秒ほどかかる） */
export const MIN_BATTLE_MS = 20 * 1000;
/** 一人が一日に数えてもらえる結果の数（日本時間の一日ごと） */
export const DAILY_RECORDS = 300;
/** 整理券が使えるあいだ（これより長いバトルは無いので、古い整理券は使えない） */
export const TICKET_LIFE_MS = 2 * 60 * 60 * 1000;

const count = (n: unknown) => (Number.isInteger(n) && (n as number) > 0 ? (n as number) : 0);
const readWL = (x: any): WinLose => ({ win: count(x?.win), lose: count(x?.lose), draw: count(x?.draw) });

/** 保存してあった戦績を読む（無い・おかしいところは 0） */
export function readRecord(x: any): BattleRecord {
  return { cpu: readWL(x?.cpu), room: readWL(x?.room), story: { win: count(x?.story?.win) } };
}

export const EMPTY_RECORD: BattleRecord = readRecord(null);

/** 結果を一つ足した戦績（手元のため。サーバーは Firestore の increment で足す） */
export function addResult(r: BattleRecord, mode: RecordMode | 'story', result: BattleResult): BattleRecord {
  const next = readRecord(r);
  if (mode === 'story') {
    if (result === 'win') next.story.win++;
  } else next[mode][result]++;
  return next;
}

/** 勝った数の合計 */
export const totalWins = (r: BattleRecord) => r.cpu.win + r.room.win + r.story.win;

/** 勝率（0〜100。引き分けは数に入れない。まだ戦っていなければ null） */
export function winRate(w: WinLose): number | null {
  const n = w.win + w.lose;
  return n ? Math.round((w.win / n) * 100) : null;
}

export const isMode = (m: unknown): m is RecordMode => m === 'cpu' || m === 'room';
export const isResult = (r: unknown): r is BattleResult => r === 'win' || r === 'lose' || r === 'draw';

/** 日本時間の日付（一日の上限を数えるため） */
export const jstDay = (t = Date.now()) => new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 10);
