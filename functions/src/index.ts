// Firebase の Cloud Functions：写真をAIに読ませる窓口（/api/health と /api/analyze）と、
// ロボをクラウドのガレージに入れる窓口（/api/robots。一人30体まで、家族は100体まで。一覧と消すのは、画面が Firestore を直接使う）、
// その人のガレージの上限を教える窓口（/api/garage）、ガレージのロボの文を直す窓口（/api/robots/fix。素手で戦う文に・習わない漢字を取りのぞく）、
// ほかの人のロボを一体、コンピュータの敵として返す窓口（/api/rival）、
// ストーリーで勝ったロボに経験値を足す窓口（/api/robots/win。2026-11-23 から。レベルと経験値を書くのはサーバーだけ）。
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
import { garageLimit, makeRobot, MIN_WIN_GAP, readRobotInput, readWinInput } from '../../server/garage';
import { addWin, EXP_VERSION, expOf, growthOf } from '../../src/game/level';
import { toRival } from '../../server/rival';
import { needsTextFix, specHardKanji, withFixedText } from '../../src/game/kanji';
import { isHash, sanitizeSpec } from '../../src/game/spec';
import { afterWin, canWin, readStory } from '../../src/game/progress';
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
  const day = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
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
    if (!isAnalyze && !isRobots && !isFix && !isGarage && !isRival && !isWin) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'POST only' });
      return;
    }

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
    // 前の勝ちから MIN_WIN_GAP より短い知らせは数えない（users/{uid} の lastWinAt。画面からは書けない場所）。
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
          if (now - last < MIN_WIN_GAP || !canWin(story, inp.chapter, inp.slot)) {
            const g = growthOf(expOf(robot));
            return { counted: false, exp: g.exp, level: g.level, up: false, gain: 0, story };
          }
          // もらえる経験値は、章（敵のレベル）・何体目か（ボスは2倍）・ロボのレベルから、ここで決める
          const w = addWin(robot, inp.chapter, inp.slot);
          const next = afterWin(story, inp.chapter, inp.slot);
          tx.update(ref, { exp: w.exp, expV: EXP_VERSION, level: w.level });
          tx.set(userRef, { lastWinAt: now, lastWin: { chapter: inp.chapter, slot: inp.slot }, story: next }, { merge: true });
          return { counted: true, exp: w.exp, level: w.level, up: w.up, gain: w.gain, story: next };
        });
        if (out === 'missing') res.status(404).json({ error: 'not found' });
        else res.json(out);
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
