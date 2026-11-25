// 本番のデータを、一度だけ新しい決まりに書き直す（2026-11-25。持ち主が「身内の PoC のうちは、書きかえてよい」と決めた）。
// 書き直しが終わったら（Firestore の meta/migrations に印が付いたら）、次のリファクタリングでこのファイルごと消す。
//
// ① 経験値の表（exp2）：2026-11-25 に、経験値の表を「Lv1〜9 は1勝」から「Lv1〜19 は2勝」に変えた。
//    前の表でためた経験値を、前の表でのレベルと、次のレベルまでの進み具合（割合）のまま、いまの表に書き直す（レベルは下がらない）。
//    書き直したロボには expV: 2 が付く（このファイルだけが見る。何度走っても、二度は書き直さない）

import { FieldValue, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import { expAt, MAX_EXP, MAX_LEVEL, EXP_PER_WIN, growthOf, winsToNext } from '../../src/game/level';

const oldWinsToNext = (l: number) => (l >= MAX_LEVEL ? 0 : l < 10 ? 1 : l < 20 ? 2 : l < 40 ? 3 : l < 60 ? 4 : 5);

/** 前の表の経験値を、いまの表の経験値にする */
export function convertOldExp(e: number): number {
  let level = 1;
  let base = 0;
  while (level < MAX_LEVEL && e >= base + oldWinsToNext(level) * EXP_PER_WIN) {
    base += oldWinsToNext(level) * EXP_PER_WIN;
    level++;
  }
  const oldNeed = oldWinsToNext(level) * EXP_PER_WIN;
  const need = winsToNext(level) * EXP_PER_WIN;
  return Math.min(MAX_EXP, expAt(level) + (oldNeed ? Math.floor(((e - base) * need) / oldNeed) : 0));
}

async function migrateExp(db: Firestore, mark: DocumentReference): Promise<number> {
  // ロボはまだ少ないので、全部読んで、経験値のあるロボだけ直す（並びの索引が要らないように）
  const snap = await db.collectionGroup('robots').select('exp', 'expV').get();
  let n = 0;
  for (const d of snap.docs) {
    if (!(Number(d.data().exp) > 0) || d.data().expV === 2) continue;
    // 一体ずつ、読んでから書く。ほかのサーバーが書き直しを終えていたら（印があれば）、もう書かない
    // （そのあと新しい表で勝ったロボを、二度書き直さないため）
    const done = await db.runTransaction(async (tx) => {
      const [cur, m] = await Promise.all([tx.get(d.ref), tx.get(mark)]);
      if (m.data()?.exp2) return false;
      const data = cur.data();
      if (!data || data.expV === 2) return false;
      const exp = convertOldExp(Math.max(0, Math.floor(Number(data.exp) || 0)));
      tx.update(d.ref, { exp, level: growthOf(exp).level, expV: 2 });
      return true;
    });
    if (done) n++;
  }
  return n;
}

let running: Promise<void> | null = null;

/** まだなら書き直す（サーバーが起きて最初の窓口で一度だけ。終わるまで、その窓口は待つ） */
export function migrateOnce(db: Firestore): Promise<void> {
  running ??= (async () => {
    const ref = db.collection('meta').doc('migrations');
    if ((await ref.get()).data()?.exp2) return;
    const n = await migrateExp(db, ref);
    await ref.set({ exp2: FieldValue.serverTimestamp(), exp2Count: n }, { merge: true });
    console.log(`[migrate] exp2：${n}体を書き直した`);
  })().catch((e) => {
    running = null; // 次の窓口で、もう一度ためす
    console.warn(`[migrate] ${String((e as Error)?.message ?? e).slice(0, 200)}`);
  });
  return running;
}
