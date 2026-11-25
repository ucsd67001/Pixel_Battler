// 写真を OpenAI に読ませて、アイテム（武器か防具）の設計図（ItemSpec）を作る（2026-11-25。docs/ITEMS.md の段階2）。
// ⚠️ 鍵はこのファイルの外から渡す。鍵をログやエラーに出さない。
// 手元（vite.config.ts）でも Firebase の Cloud Functions（functions/src/index.ts）でも、analyzeItem をそのまま呼ぶ。
// AI が決めるのは、種類・名前・説明・色・形の特ちょうだけ。強さ（総合力とランク）は、写真の印から機械で決める（src/game/items.ts の itemPower）。

import { ITEM_DECOS, ITEM_JSON_SCHEMA, ITEM_KINDS, ITEM_TABLE, sanitizeItemSpec, type ItemSpec } from '../src/game/items';
import { isHash } from '../src/game/spec';
import { hardKanji } from '../src/game/kanji';
import { chat, modelsFor } from './analyze';

// 指示を大きく変えたら上げる（同じ写真でも、前の指示で作った設計図を返さないため）。ロボの取り置きとは名前を分ける
const ITEM_CACHE_VERSION = 'i1';
export const itemCacheKey = (hash: string) => `${ITEM_CACHE_VERSION}_${hash}`;

export interface ItemCache {
  get(key: string): Promise<unknown | null>;
  set(key: string, spec: ItemSpec): Promise<void>;
}

export interface AnalyzeItemResult {
  spec: ItemSpec;
  cached: boolean;
  model: string;
}

const KIND_LINE = ITEM_KINDS.map((k) => `${k}（${ITEM_TABLE[k].label}）`).join(' / ');

const SYSTEM_PROMPT = `あなたは、写真から「ロボが持つアイテム（武器か防具）」を一つ設計する、ゲームデザイナーです。
このゲームでは、写真を読み込むとロボやアイテムが生まれます。アイテムは、ロボに一つだけ持たせて戦います。
このゲームで遊ぶのは、おもに小学6年生です。名前と説明は、小学6年生がすらすら読めて、思わず持たせたくなる、かっこいいものにしてください。

手順：
1. 写真の中で「いちばん特徴的なもの」を一つ選び、motif に短く書く。物・動物・植物・料理・風景など何でもよい。人が写っているときは、顔や体つきではなく、服・持ち物・その場の雰囲気から選ぶ。
2. そのモチーフの形・素材・性質・連想から、8種類のどれにするか（kind）を決める。形が似ているものを選ぶと分かりやすい（細長い→sword・spear・staff、先が広くて重い→axe、つつの形→gun、丸くて平たい→shield、かぶるもの・丸いもの→helmet、つつむもの・かたいもの→armor）。ふしぎなもの・光るもの・知的なものは staff もよい。
3. 見た人が「あの写真のあれだ」と分かる名前・説明・色・形にする。

決まり：
- 既存のアニメ・ゲーム・特撮・本の武器の名前は使わない。すべてオリジナルにする。
- 漢字は、小学校で習う漢字だけを使う。剣・斧・槍・銃・杖・盾・兜・鎧も小学校で習わない字なので、name と description には書かない（ソード・シールド、けん・たて のように、カタカナかひらがなで書く）。むずかしい熟語や、古い言い回しは使わない。
- motif：写真の中のものを、短く、ふつうの言葉で（例：赤いえんぴつ、なべのふた、自転車）。
- name：カタカナを中心にしたアイテムの名前（3〜10字）。モチーフの言葉と、種類の言葉（ソード・アックス・スピア・ブラスター・ロッド・シールド・ヘルム・アーマーなど）を組み合わせると良い。言いやすく、覚えやすい音にする。
- description：モチーフとのつながりが分かる、わくわくする説明（50字まで）。強さの数字や、効き方（何倍・何%など）は書かない。血や、こわい言葉は書かない。
- colors：モチーフの色をもとにした #RRGGBB。primary＝本体、secondary＝持ち手・ふち・ベルト、accent＝かざり・光るところ（明るい色）。primary と secondary ははっきり違う色にする。
- size：モチーフの大きさ・重さの感じ。small / medium / large（剣や槍なら長さ、盾なら広さ）。
- deco：かざり。${ITEM_DECOS.join(' / ')}（plain＝かざりなし、gem＝宝石、spikes＝とげ、wings＝羽、stripes＝しま模様）。
- 人を傷つける言葉・差別的な言葉・実在の人物の名前は使わない。

kind（種類）：${KIND_LINE}
- gun は、光の玉をうつ未来の道具。staff は、魔法をうつ道具。`;

const USER_PROMPT = 'この写真から、ロボが持つアイテムを一つ設計してください。';

/** 画面に出るアイテムの文に入っている、小学校で習わない漢字 */
export const itemHardKanji = (s: ItemSpec) => hardKanji(`${s.name} ${s.description} ${s.motif}`);

async function callOpenAI(image: string, model: string, apiKey: string, avoid: string[] = []): Promise<ItemSpec> {
  const text = avoid.length
    ? `${USER_PROMPT}\n注意：「${avoid.join('」「')}」は小学校で習わない漢字なので、使わないでください（ひらがなかカタカナにするか、やさしい言葉に言いかえる）。`
    : USER_PROMPT;
  const raw = await chat(model, apiKey, 'item_spec', ITEM_JSON_SCHEMA, [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text },
        { type: 'image_url', image_url: { url: image, detail: 'low' } },
      ],
    },
  ]);
  // 特別な写真のしるしは、アイテムにはまだ使わない（docs/ITEMS.md の「まだ決めていないこと」）
  return { ...sanitizeItemSpec(raw), bonus: 0 };
}

// 文だけの書き直し（写真は送らない）。習わない漢字が残ったときに使う
const FIX_FIELDS = ['name', 'description', 'motif'] as const;
const FIX_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [...FIX_FIELDS],
  properties: Object.fromEntries(FIX_FIELDS.map((k) => [k, { type: 'string' }])),
};
const FIX_PROMPT = `あなたは、小学6年生が遊ぶゲームの文を、やさしく直す係です。
アイテムの紹介の文の中に、小学校で習わない漢字が入っています。その字を使わないように書き直してください。
- 名指しした字は、ひらがなかカタカナにするか、小学校で習う漢字だけのやさしい言葉に言いかえる。
- 意味・雰囲気・かっこよさは、できるだけそのまま。直さなくてよいところは、元の文のまま返す。
- 字数：name 3〜10字 / description 50字まで / motif 20字まで。`;

async function fixItemText(spec: ItemSpec, apiKey: string, model: string): Promise<ItemSpec> {
  const hard = itemHardKanji(spec);
  if (!hard.length) return spec;
  try {
    const raw: any = await chat(model, apiKey, 'item_text', FIX_SCHEMA, [
      { role: 'system', content: FIX_PROMPT },
      {
        role: 'user',
        content: `習わない漢字：「${hard.join('」「')}」\n直す文（JSON）：\n${JSON.stringify({ name: spec.name, description: spec.description, motif: spec.motif }, null, 1)}`,
      },
    ]);
    const next = sanitizeItemSpec({ ...spec, name: raw?.name, description: raw?.description, motif: raw?.motif });
    return itemHardKanji(next).length < hard.length ? { ...next, bonus: spec.bonus } : spec;
  } catch (e) {
    console.warn(`[item] 文の書き直しに失敗：${String((e as Error).message).slice(0, 200)}`);
    return spec;
  }
}

export async function analyzeItem(
  image: string,
  hash: string,
  opt: { apiKey: string; model: string; cache: ItemCache },
): Promise<AnalyzeItemResult> {
  if (!isHash(hash)) throw new Error('bad hash');
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) throw new Error('bad image');

  // 同じ写真には、同じ設計図を返す
  const hit = await opt.cache.get(itemCacheKey(hash)).catch(() => null);
  if (hit) return { spec: sanitizeItemSpec(hit), cached: true, model: 'cache' };

  let lastError: unknown = null;
  for (const model of modelsFor(opt.model)) {
    try {
      let spec = await callOpenAI(image, model, opt.apiKey);
      // 小学校で習わない漢字が入っていたら、その字を名指しして一度だけ作り直す。それでも残れば、文だけを書き直す
      const hard = itemHardKanji(spec);
      if (hard.length) {
        console.warn(`[item] 小学校で習わない漢字：${hard.join('')} → 作り直し`);
        try {
          const again = await callOpenAI(image, model, opt.apiKey, hard);
          if (itemHardKanji(again).length < hard.length) spec = again;
        } catch (e) {
          console.warn(`[item] 作り直しに失敗：${String((e as Error).message).slice(0, 200)}`);
        }
        spec = await fixItemText(spec, opt.apiKey, model);
      }
      await opt.cache.set(itemCacheKey(hash), spec).catch((e) => console.warn(`[item] cache: ${String(e).slice(0, 200)}`));
      return { spec, cached: false, model };
    } catch (e) {
      lastError = e;
      console.warn(`[item] ${model} failed: ${String((e as Error).message).slice(0, 300)}`);
    }
  }
  throw lastError ?? new Error('analyze item failed');
}

// ── アイテムの置き場に入れるもの（画面から届いた中身を確かめる） ──
const THUMB = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
const THUMB_MAX = 120_000;
const COLOR = /^#[0-9a-f]{6}$/i;

export interface ItemInput {
  image: string;
  hash: string;
  thumb?: string;
  colors: string[]; // 写真の目立つ色（AI につながらないときの予備に使う）
}

/** 画面から届いた中身を確かめる。おかしければ null（写真そのものの形は analyzeItem が確かめる） */
export function readItemInput(body: any): ItemInput | null {
  const b = body ?? {};
  const hash = String(b.hash ?? '');
  if (!isHash(hash)) return null;
  const thumb = typeof b.thumb === 'string' && b.thumb.length <= THUMB_MAX && THUMB.test(b.thumb) ? b.thumb : undefined;
  const colors = Array.isArray(b.colors) ? b.colors.filter((c: unknown) => typeof c === 'string' && COLOR.test(c)).slice(0, 4) : [];
  return { image: String(b.image ?? ''), hash, thumb, colors };
}
