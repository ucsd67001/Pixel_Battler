// Firebase の Cloud Functions：写真をAIに読ませる窓口（/api/health と /api/analyze）と、
// ロボをクラウドのガレージに入れる窓口（/api/robots。一人30体まで、家族は100体まで。一覧と消すのは、画面が Firestore を直接使う）、
// その人のガレージの上限を教える窓口（/api/garage）、ガレージのロボの文を直す窓口（/api/robots/fix。素手で戦う文に・習わない漢字を取りのぞく）、
// ほかの人のロボを一体、コンピュータの敵として返す窓口（/api/rival）、
// ストーリーで勝ったロボに経験値を足す窓口（/api/robots/win。2026-11-23 から。レベルと経験値を書くのはサーバーだけ）、
// コンピュータと対戦・ふたりで対戦の戦績を数える窓口（/api/battle/start と /api/battle/end。2026-11-25 から。src/game/record.ts）、
// ニックネームを決める窓口（/api/profile。2026-11-25 から。src/game/profile.ts）、
// ランキングを返す窓口（/api/ranking。2026-11-25 から。src/game/ranking.ts）。
// Hosting の書き換え（firebase.json）で、同じドメインの /api/** がここに来る。
// 写真から作れるのは、Google でログインした人だれでも（2026-11-22 から。それまでは家族だけ）。
// 回数の上限：家族（ALLOWED_EMAILS）は一人一日30回、家族以外は一人一日10回、家族以外の全員を合わせて一日200回。
// ⚠️ 鍵（OPENAI_API_KEY）と、家族のアドレス（ALLOWED_EMAILS）は Secret Manager に置く。リポジトリには書かない。

import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type DocumentReference } from 'firebase-admin/firestore';
import { analyzeImage, cacheKey, refreshText, type SpecCache } from '../../server/analyze';
import { garageLimit, makeRobot, readRobotInput, readWinInput } from '../../server/garage';
import { expOf, growthOf, storyWin } from '../../src/game/level';
import { toRival } from '../../server/rival';
import { needsTextFix, specHardKanji, withFixedText } from '../../src/game/kanji';
import { isHash, sanitizeSpec } from '../../src/game/spec';
import { readStory } from '../../src/game/progress';
import { DAILY_RECORDS, isMode, isResult, jstDay, MIN_BATTLE_MS, readRecord, TICKET_LIFE_MS } from '../../src/game/record';
import { migrateOnce } from './migrate';
import { checkNickname, readNickname } from '../../src/game/profile';
import { buildRanking, type RawPlayer, type RawRobot } from '../../src/game/ranking';
import type { Character, CharacterSpec } from '../../src/game/types';

const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');
const ALLOWED_EMAILS = defineSecret('ALLOWED_EMAILS'); // カンマ区切り
const HIDDEN_RULE = defineSecret('HIDDEN_RULE'); // 開発者だけが知る決まり。中身はリポジトリに書かない
const MODEL = process.env.GAME_MODEL || 'gpt-6-luna';
// 写真から作れる回数（料金の歯止め。日本時間の一日ごと）
const FAMILY_DAILY = 30; // 家族は一人一日
const GUEST_DAILY = 10; // 家族以外は一人一日
const GUEST_TOTAL_DAILY = 200; // 家族以外の全員を合わせて一日

initializeApp();
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true }); // 写真の無いロボ（thumb が無い）も、そのまま入れる

const robots = (uid: string) => db.collection('users').doc(uid).collection('robots');
// 戦績の整理券（tickets/{id}）。画面からは読めない・書けない（firestore.rules の「ほかは全部だめ」）。
// 結果を受け取ったら消す（同じ整理券は一回だけ）。結果が届かなかった整理券は残る（いまは量が少ないので、そのまま）
const tickets = db.collection('tickets');
const TICKET_ID = /^[A-Za-z0-9_-]{10,200}$/;
// 部屋にいる人の「いるよ」が、これより古ければ、いないことにする（src/net/room.ts の STALE_MS と同じ）
const ROOM_STALE_MS = 60_000;
// ガレージに何体いるか（上限を超えて数えない）
async function garageCount(uid: string, limit: number) {
  return (await robots(uid).select().limit(limit).get()).size;
}

// みんなのガレージのロボの一覧（場所だけ）。毎回数えると読む回数が増えるので、10分ごとに読み直す
let rivalPool: { at: number; refs: DocumentReference[] } | null = null;
async function rivalRefs() {
  if (!rivalPool || Date.now() - rivalPool.at > 10 * 60 * 1000) {
    const snap = await db.collectionGroup('robots').select().get();
    rivalPool = { at: Date.now(), refs: snap.docs.map((d) => d.ref) };
  }
  return rivalPool.refs;
}

// ── ランキングのもとのデータ（2026-11-25。並べ方は src/game/ranking.ts） ──
//   ・プレイヤー：ニックネームを決めた人（users の nickname）を全部読む（人数が少ないので）
//   ・ロボ：みんなのガレージから、レベル・コンピュータの勝ち・ふたりで対戦の勝ちの多いロボを、それぞれ上から読む
//     （robots のコレクショングループの並びの索引が要る。firestore.indexes.json）。写真（thumb）は読まない
//   ・読む回数をへらすため、1分のあいだは同じものを使う（見る人ごとの「自分の行」は、毎回つけ直す）
const RANKING_TTL = 60 * 1000;
const ROBOT_FETCH = 60;
let rankingRaw: { at: number; players: RawPlayer[]; robots: RawRobot[] } | null = null;
async function loadRankingRaw() {
  if (rankingRaw && Date.now() - rankingRaw.at < RANKING_TTL) return rankingRaw;
  const users = await db.collection('users').where('nickname', '>', '').get();
  const players: RawPlayer[] = users.docs.map((d) => {
    const u = d.data();
    const rec = readRecord(u.stats);
    const story = readStory(u.story);
    return {
      uid: d.id,
      nickname: readNickname(u.nickname),
      cpuWins: rec.cpu.win,
      roomWins: rec.room.win,
      cleared: story.cleared,
      next: story.run?.next ?? 0,
      storyAt: Number(u.storyAt) || 0,
    };
  });
  const fields = ['seed', 'spec', 'rank', 'level', 'exp', 'record', 'stats'];
  const top = (field: string) => db.collectionGroup('robots').orderBy(field, 'desc').limit(ROBOT_FETCH).select(...fields).get();
  const snaps = await Promise.all([top('level'), top('record.cpu.win'), top('record.room.win')]);
  const seen = new Set<string>();
  const robots: RawRobot[] = [];
  for (const d of snaps.flatMap((s) => s.docs)) {
    if (seen.has(d.ref.path)) continue;
    seen.add(d.ref.path);
    const uid = d.ref.parent.parent?.id;
    const data = d.data() as Character;
    const shown = toRival(data); // 写真に写っていたもの・特別な写真のしるしを消した設計図（習わない漢字が残るロボは出さない）
    if (!uid || !shown) continue;
    const rec = readRecord(data.record);
    const g = growthOf(expOf(data));
    robots.push({
      uid,
      key: d.ref.path,
      name: shown.spec.name,
      element: shown.spec.element,
      rank: shown.rank,
      level: g.level,
      exp: g.exp,
      cpuWins: rec.cpu.win,
      roomWins: rec.room.win,
      spec: shown.spec,
    });
  }
  rankingRaw = { at: Date.now(), players, robots };
  return rankingRaw;
}

// ガレージのロボの文を、いまの決まりに合わせて書き直して、しまい直す（一体につき一度だけ。強さ・見た目は変えない）。
//   素手で戦う文になっていない（2026-11-23 より前）・習わない漢字が残っている、のどちらか
async function fixRobot(ref: DocumentReference, robot: Character): Promise<Character> {
  if (!needsTextFix(robot)) return robot;
  const spec = await refreshText(sanitizeSpec(robot.spec), { apiKey: OPENAI_API_KEY.value(), model: MODEL });
  const fixed = withFixedText(robot, spec);
  await ref.update({ spec: fixed.spec, skill: fixed.skill, textFixedAt: fixed.textFixedAt });
  // 同じ写真の取り置き（設計図の控え）も、同じロボのものなら直しておく（次に同じ写真を読んだときのため）
  const key = cacheKey(robot.seed);
  const cached = (await cache.get(key).catch(() => null)) as CharacterSpec | null;
  if (cached) {
    const c = sanitizeSpec(cached);
    if (c.name === robot.spec.name && (!c.bare || specHardKanji(c).length))
      await cache.set(key, { ...c, ...fixed.spec, look: undefined, bonus: c.bonus } as CharacterSpec).catch(() => undefined);
  }
  console.log(`[fix] ${robot.spec.name}：${robot.skill.name}／${robot.spec.ultimate.name} → ${fixed.skill.name}／${fixed.spec.ultimate.name}（習わない字：${specHardKanji(fixed.spec).join('') || 'なし'}）`);
  return fixed;
}

const cache: SpecCache = {
  async get(hash) {
    const d = await db.collection('specs').doc(hash).get();
    return d.exists ? d.data()?.spec ?? null : null;
  },
  async set(hash, spec) {
    await db.collection('specs').doc(hash).set({ spec, createdAt: FieldValue.serverTimestamp() });
  },
};

function isFamily(email: string | undefined) {
  if (!email) return false;
  const list = ALLOWED_EMAILS.value()
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

// 一日の回数を数える（日本時間の日付ごと）。ok／mine＝その人の分を使い切った／all＝家族以外の全員の分を使い切った
async function countUp(uid: string, family: boolean): Promise<'ok' | 'mine' | 'all'> {
  const day = jstDay();
  const ref = db.collection('usage').doc(`${uid}_${day}`);
  const allRef = db.collection('usage').doc(`_guests_${day}`);
  return db.runTransaction(async (tx) => {
    const n = ((await tx.get(ref)).data()?.count as number | undefined) ?? 0;
    const all = family ? 0 : (((await tx.get(allRef)).data()?.count as number | undefined) ?? 0);
    if (n >= (family ? FAMILY_DAILY : GUEST_DAILY)) return 'mine';
    if (!family && all >= GUEST_TOTAL_DAILY) return 'all';
    tx.set(ref, { count: n + 1, day }, { merge: true });
    if (!family) tx.set(allRef, { count: all + 1, day }, { merge: true });
    return 'ok';
  });
}

// ログインを確かめる。だめなら 401 を返して null
async function verify(req: { get(name: string): string | undefined }, res: { status(n: number): { json(b: unknown): void } }) {
  const token = (req.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) {
    res.status(401).json({ error: 'login required' });
    return null;
  }
  try {
    return await getAuth().verifyIdToken(token);
  } catch {
    res.status(401).json({ error: 'login required' });
    return null;
  }
}

export const api = onRequest(
  {
    region: 'asia-northeast1',
    secrets: [OPENAI_API_KEY, ALLOWED_EMAILS, HIDDEN_RULE],
    timeoutSeconds: 120,
    memory: '512MiB',
    maxInstances: 3,
  },
  async (req, res) => {
    if (req.path.endsWith('/health')) {
      res.json({ ai: true, model: MODEL, auth: true });
      return;
    }
    const isAnalyze = req.path.endsWith('/analyze');
    const isRobots = req.path.endsWith('/robots');
    const isFix = req.path.endsWith('/robots/fix');
    const isGarage = req.path.endsWith('/garage');
    const isRival = req.path.endsWith('/rival');
    const isWin = req.path.endsWith('/robots/win');
    const isStart = req.path.endsWith('/battle/start');
    const isEnd = req.path.endsWith('/battle/end');
    const isProfile = req.path.endsWith('/profile');
    const isRanking = req.path.endsWith('/ranking');
    if (!isAnalyze && !isRobots && !isFix && !isGarage && !isRival && !isWin && !isStart && !isEnd && !isProfile && !isRanking) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'POST only' });
      return;
    }

    // 本番のデータの書き直しが残っていれば、先に済ませる（functions/src/migrate.ts。一度だけ）
    await migrateOnce(db);

    // ログインを確かめる（メールアドレスの確認が済んだ Google アカウントなら、だれでも）
    const user = await verify(req, res);
    if (!user) return;
    if (!user.email_verified) {
      res.status(403).json({ error: 'not allowed' });
      return;
    }
    const family = isFamily(user.email);
    const limit = garageLimit(family);
    // 届いた中身（JSON）は、ここで一度だけ読む。うまくいかなかったときの答え方も、一つにまとめる
    let body: any;
    try {
      body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) ?? {};
    } catch {
      res.status(400).json({ error: 'bad json' });
      return;
    }
    const fail = (e: unknown) => res.status(500).json({ error: String((e as Error)?.message ?? e).slice(0, 200) });

    // ── その人のガレージに何体まで入るか（画面の「◯ / ◯体」と、いっぱいかどうかのため） ──
    if (isGarage) {
      res.json({ limit });
      return;
    }

    // ── ほかの人のロボを一体、コンピュータの敵として返す（自分のロボは出さない。写真と持ち主は送らない） ──
    if (isRival) {
      try {
        const refs = (await rivalRefs()).filter((r) => r.parent.parent?.id !== user.uid);
        // 習わない漢字が残っているロボは出さないので、何体か試す
        for (let i = 0; i < 4 && refs.length; i++) {
          const snap = await refs[Math.floor(Math.random() * refs.length)].get();
          if (!snap.exists) continue;
          // 前に作ったロボは、出す前に文を直す（持ち主のガレージも直る。直せなくても、そのまま出す）
          const data = await fixRobot(snap.ref, snap.data() as Character).catch(() => snap.data() as Character);
          const robot = toRival(data);
          if (robot) {
            res.json({ robot });
            return;
          }
        }
        res.json({ robot: null });
      } catch (e) {
        fail(e);
      }
      return;
    }

    // ── ストーリーで勝ったロボに、経験値を足す（勝ったロボだけ。負けても減らない） ──
    // 前の勝ちから MIN_BATTLE_MS（20秒）より短い知らせは数えない（users/{uid} の lastWinAt。画面からは書けない場所）。
    // ストーリーの進み具合（users/{uid} の story）も、ここで進める。開いていない章・とばした敵の勝ちは数えない
    if (isWin) {
      try {
        const inp = readWinInput(body);
        if (!inp) {
          res.status(400).json({ error: 'bad win' });
          return;
        }
        const ref = robots(user.uid).doc(inp.hash);
        const userRef = db.collection('users').doc(user.uid);
        const out = await db.runTransaction(async (tx) => {
          const [snap, me] = await Promise.all([tx.get(ref), tx.get(userRef)]);
          if (!snap.exists) return 'missing' as const;
          const now = Date.now();
          const last = Number(me.data()?.lastWinAt ?? 0);
          const robot = snap.data() as Character;
          const story = readStory(me.data()?.story);
          // もらえる経験値は、章（敵のレベル）・何体目か（ボスは2倍）・ロボのレベルから、ここで決める（level.ts の storyWin）
          const w = storyWin(robot, story, inp.chapter, inp.slot, now - last < MIN_BATTLE_MS);
          if (!w.counted) return w;
          const next = w.story;
          tx.update(ref, { exp: w.exp, level: w.level, 'record.story.win': FieldValue.increment(1) });
          tx.set(
            userRef,
            {
              lastWinAt: now,
              story: next,
              stats: { story: { win: FieldValue.increment(1) } }, // 戦績（2026-11-25 から数える）
              // 進み具合が先へ進んだ時刻（ランキングで、同じ進みなら先に着いた人が上。2026-11-25 から）
              ...(next.cleared !== story.cleared || next.run?.next !== story.run?.next ? { storyAt: now } : {}),
            },
            { merge: true },
          );
          return w;
        });
        if (out === 'missing') res.status(404).json({ error: 'not found' });
        else res.json(out);
      } catch (e) {
        fail(e);
      }
      return;
    }

    // ── ランキング（プレイヤーとロボ、3つずつ）。自分のニックネームと順位もつける ──
    if (isRanking) {
      try {
        const raw = await loadRankingRaw();
        const data = buildRanking(raw.players, raw.robots, user.uid, raw.at);
        // ニックネームを決めていない人の「自分のニックネーム」は空のまま（ランキングに出ていないことを、画面で伝える）
        if (!data.me.nickname) {
          const mine = await db.collection('users').doc(user.uid).get();
          data.me.nickname = readNickname(mine.data()?.nickname);
        }
        res.json(data);
      } catch (e) {
        fail(e);
      }
      return;
    }

    // ── ニックネームを決める・変える（空にすると消す）。確かめ方は src/game/profile.ts ──
    if (isProfile) {
      try {
        const r = checkNickname(body?.nickname);
        if (!r.ok) {
          res.status(400).json({ error: 'bad nickname', reason: r.reason });
          return;
        }
        await db
          .collection('users')
          .doc(user.uid)
          .set({ nickname: r.nickname || FieldValue.delete(), nicknameAt: Date.now() }, { merge: true });
        res.json({ nickname: r.nickname });
      } catch (e) {
        fail(e);
      }
      return;
    }

    // ── 戦績：バトルを始めるときに、整理券を一枚もらう（コンピュータと対戦・ふたりで対戦） ──
    // ふたりで対戦は、部屋（rooms/main）にいまあるバトルに、その人とそのロボが入っているときだけ。
    // 整理券の名前は「人＋バトル」なので、一つのバトルで一枚だけ。バトルが始まって1分をすぎたら、もうもらえない。
    // コンピュータと対戦の整理券は、一人一枚（2026-11-25。新しいバトルを始めると、前の整理券は消える）。
    // 何枚も同時にもらって、20秒後にまとめて勝ちを数える、ができないように（勝ちを数えられるのは、20秒に1回まで）
    if (isStart) {
      try {
        const mode = body?.mode;
        const hash = String(body?.hash ?? '');
        if (!isMode(mode) || !isHash(hash)) {
          res.status(400).json({ error: 'bad battle' });
          return;
        }
        const now = Date.now();
        if (mode === 'cpu') {
          const ref = tickets.doc(`${user.uid}_cpu`);
          await ref.set({ uid: user.uid, mode, hash, at: now });
          res.json({ ticket: ref.id });
          return;
        }
        const bid = String(body?.battle ?? '');
        if (!/^[a-z0-9]{4,40}$/.test(bid)) {
          res.status(400).json({ error: 'bad battle' });
          return;
        }
        const b = (await db.collection('rooms').doc('main').get()).data()?.battle;
        const opp = Array.isArray(b?.p) ? b.p.find((u: unknown) => u !== user.uid) : undefined;
        // 相手も、ほんとうに部屋にいる人か（部屋にいる人の札は、本人しか書けない。firestore.rules）。
        // バトルは画面が書くので、でたらめな相手の名前でバトルを書いて勝ちを作る、ができないように（2026-11-25）
        const oppSeen =
          typeof opp === 'string' && opp
            ? Number((await db.collection('rooms').doc('main').collection('players').doc(opp).get()).data()?.seen ?? 0)
            : 0;
        const ok =
          b && b.id === bid && Array.isArray(b.p) && b.p.length === 2 && b.p.includes(user.uid) && b.p[0] !== b.p[1] &&
          b.chars?.[user.uid]?.seed === hash && now - Number(b.at) < 60_000 && now - oppSeen < ROOM_STALE_MS;
        if (!ok) {
          res.json({ ticket: null });
          return;
        }
        const id = `${user.uid}_${bid}`;
        const ref = tickets.doc(id);
        const made = await ref.create({ uid: user.uid, mode, hash, at: now }).then(
          () => true,
          () => false, // もうある（同じバトルで二枚目）
        );
        res.json({ ticket: made ? id : null });
      } catch (e) {
        fail(e);
      }
      return;
    }

    // ── 戦績：バトルが終わったら、整理券と結果を受け取って数える（整理券は消す＝一回だけ） ──
    // 短すぎるバトル・古すぎる整理券・一日の上限をこえた分は、数えない
    if (isEnd) {
      try {
        const id = String(body?.ticket ?? '');
        const result = body?.result;
        if (!TICKET_ID.test(id) || !isResult(result)) {
          res.status(400).json({ error: 'bad result' });
          return;
        }
        const ref = tickets.doc(id);
        const userRef = db.collection('users').doc(user.uid);
        const counted = await db.runTransaction(async (tx) => {
          const t = await tx.get(ref);
          const d = t.data();
          if (!t.exists || !d || d.uid !== user.uid || !isMode(d.mode) || !isHash(String(d.hash))) return false;
          const robotRef = robots(user.uid).doc(String(d.hash));
          const [me, robot] = await Promise.all([tx.get(userRef), tx.get(robotRef)]);
          const now = Date.now();
          const age = now - Number(d.at);
          const day = jstDay(now);
          const n = me.data()?.recDay === day ? Number(me.data()?.recCount ?? 0) : 0;
          tx.delete(ref);
          if (!(age >= MIN_BATTLE_MS && age <= TICKET_LIFE_MS) || n >= DAILY_RECORDS) return false;
          tx.set(userRef, { stats: { [d.mode]: { [result]: FieldValue.increment(1) } }, recDay: day, recCount: n + 1 }, { merge: true });
          if (robot.exists) tx.update(robotRef, { [`record.${d.mode}.${result}`]: FieldValue.increment(1) });
          return true;
        });
        res.json({ counted });
      } catch (e) {
        fail(e);
      }
      return;
    }

    // ── ガレージのロボの文から、小学校で習わない漢字を取りのぞく（一体につき一度だけ。強さ・見た目は変えない） ──
    // 漢字の決まりを入れる前（2026-11-22 の昼）に作ったロボのため。回数の上限には数えない
    if (isFix) {
      try {
        const hash = String(body?.hash ?? '');
        if (!isHash(hash)) {
          res.status(400).json({ error: 'bad hash' });
          return;
        }
        const ref = robots(user.uid).doc(hash);
        const snap = await ref.get();
        if (!snap.exists) {
          res.status(404).json({ error: 'not found' });
          return;
        }
        res.json({ robot: await fixRobot(ref, snap.data() as Character) });
      } catch (e) {
        fail(e);
      }
      return;
    }

    // ── ロボをクラウドのガレージに入れる ──
    if (isRobots) {
      try {
        const inp = readRobotInput(body);
        if (!inp) {
          res.status(400).json({ error: 'bad robot' });
          return;
        }
        const cached = (await cache.get(cacheKey(inp.hash)).catch(() => null)) as CharacterSpec | null;
        const ref = robots(user.uid).doc(inp.hash);
        // 同じ写真のロボがもういれば、それを返す。いなければ、上限より少ないときだけ入れる
        const out = await db.runTransaction(async (tx) => {
          const cur = await tx.get(ref);
          if (cur.exists) return cur.data();
          const n = (await tx.get(robots(user.uid).select().limit(limit))).size;
          if (n >= limit) return 'full' as const;
          const robot = makeRobot(inp, cached);
          tx.set(ref, robot);
          return robot;
        });
        if (out === 'full') res.status(409).json({ error: 'garage full', limit });
        else res.json({ robot: out });
      } catch (e) {
        fail(e);
      }
      return;
    }

    try {
      const image = String(body?.image ?? '');
      const hash = String(body?.hash ?? '');
      // 取っておいたものがあれば、回数に数えずに返す
      const hit = isHash(hash) ? await cache.get(cacheKey(hash)).catch(() => null) : null;
      // ガレージがいっぱいなら、AI に読ませる前に止める（作っても入れられないため）
      if (!hit && (await garageCount(user.uid, limit)) >= limit) {
        res.status(409).json({ error: 'garage full', limit });
        return;
      }
      const count = hit ? 'ok' : await countUp(user.uid, family);
      if (count !== 'ok') {
        res.status(429).json({ error: count === 'all' ? 'everyone limit' : 'daily limit', limit: family ? FAMILY_DAILY : GUEST_DAILY });
        return;
      }
      const result = await analyzeImage(image, hash, {
        apiKey: OPENAI_API_KEY.value(),
        model: MODEL,
        cache,
        hiddenRule: HIDDEN_RULE.value(),
      });
      console.log(`[analyze] ${result.spec.motif} → ${result.spec.name}（${result.model}）`);
      res.json(result);
    } catch (e) {
      fail(e);
    }
  },
);
