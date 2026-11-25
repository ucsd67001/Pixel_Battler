// 持ち物（アイテム）。武器5種類・防具3種類を、写真から作る（2026-11-25。docs/ITEMS.md）。
//   ・身につけるのは、武器か防具のどれか一つだけ
//   ・AI が写真から決めるのは、種類・名前・説明・色だけ。強さ（総合力とランク）は、写真の印から機械で決める（ロボと同じ）
//   ・種類ごとに「持ち味」がある。数字は npm run sim で、どれを選んでも損をしないように合わせた（ITEM_TABLE の数字）
//   ・HP・こうげき・ぼうぎょが上がる分は withItem で数字に入れる。ほかの持ち味は、バトルの計算（battle.ts）が gearOf で読む
//
// もとの「そのロボがもともと持っていた武器」（設計図の parts.weapon）は、アイテムには使わない（2026-11-25、持ち主が決めた）。
// ただし parts.weapon は体つきの計算（lookSeed）に使っているので、設計図からは消さない。見た目は wornParts で素手にする。

import type { Character, CharacterSpec, Rank } from './types';
import { rankOf } from './stats';
import { rngFrom } from './random';

export type Parts = CharacterSpec['parts'];

/** いま身につけている部品。もとの武器は外して素手、腕の刃はふつうの腕、せなかの大砲はブースターにする */
export function wornParts(spec: CharacterSpec): Parts {
  const p = spec.parts;
  return {
    ...p,
    weapon: 'none',
    arms: p.arms === 'blade' ? 'standard' : p.arms,
    back: p.back === 'cannons' ? 'boosters' : p.back,
  };
}

// ── アイテムの種類 ──
export const ITEM_KINDS = ['sword', 'axe', 'spear', 'gun', 'staff', 'shield', 'helmet', 'armor'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];
export type ItemGroup = 'weapon' | 'armor';
/** 形の特ちょう（3D で持たせるときに使う。段階4） */
export const ITEM_SIZES = ['small', 'medium', 'large'] as const;
export const ITEM_DECOS = ['plain', 'gem', 'spikes', 'wings', 'stripes'] as const;
export type ItemSize = (typeof ITEM_SIZES)[number];
export type ItemDeco = (typeof ITEM_DECOS)[number];

/** 写真から AI が決める部分（アイテムの設計図）。どの形のロボが持っても、同じアイテムに見える */
export interface ItemSpec {
  kind: ItemKind;
  name: string;
  description: string;
  motif: string; // 写真に写っていたもの
  colors: { primary: string; secondary: string; accent: string };
  size: ItemSize; // 大きさ（剣なら長さ、盾なら広さ）
  deco: ItemDeco; // かざり
  bonus?: 0 | 1; // 特別な写真のしるし（ロボと同じく、サーバーの AI だけがつける。まだ使い道は決めていない）
}

export interface Item {
  id: string;
  seed: string; // 写真の印
  spec: ItemSpec;
  rank: Rank;
  power: number; // 総合力（92〜108。100 がふつう）
  createdAt: number;
  thumb?: string;
  source: 'ai' | 'local';
}

/**
 * 種類ごとの持ち味。数字は総合力 100 のときの大きさで、アイテムの総合力に比例して少し変わる（gearOf）。
 * label は画面に出す名前（剣・斧・槍・銃・杖・盾・兜・鎧は、小学校で習わない漢字なので、ひらがなで書く）
 */
export const ITEM_TABLE: Record<
  ItemKind,
  { label: string; en: string; group: ItemGroup; effect: string }
> = {
  sword: { label: 'けん', en: 'SWORD', group: 'weapon', effect: 'こうげきが上がる。まっすぐで使いやすい' },
  axe: { label: 'おの', en: 'AXE', group: 'weapon', effect: 'こうげきが大きく上がる。ただし、ときどき空ぶりする' },
  spear: { label: 'やり', en: 'SPEAR', group: 'weapon', effect: '相手のぼうぎょを、少し無視する' },
  gun: { label: 'じゅう', en: 'GUN', group: 'weapon', effect: '先に動ける。必殺ゲージが早くたまる' },
  staff: { label: 'つえ', en: 'STAFF', group: 'weapon', effect: 'スキルのパワーが上がる。SP がたまりやすい' },
  shield: { label: 'たて', en: 'SHIELD', group: 'armor', effect: '受けるダメージが少しへる。ガードすると、もっとへる' },
  helmet: { label: 'かぶと', en: 'HELM', group: 'armor', effect: 'HP が上がる。会心の一打を受けにくい' },
  armor: { label: 'よろい', en: 'ARMOR', group: 'armor', effect: 'ぼうぎょが上がる' },
};

/**
 * 持ち味の数字（総合力 100 のとき）。npm run sim の「アイテム」で合わせた（2026-11-25）：
 * 同じくらいのロボどうしで、持っているほうが約60%勝つ（レベルが2〜3上なのと同じくらい）。どの種類も 59〜61%
 */
export const ITEM_POWER = {
  swordAtk: 0.14, // こうげき +14%
  axeAtk: 0.24, // こうげき +24%
  axeMiss: 0.12, // 自分のこうげきが、12% の確率で空ぶり
  spearPierce: 0.3, // 相手のぼうぎょを 30% 無視
  gunGauge: 0.45, // 必殺ゲージのたまり方 +45%（と、先に動ける）
  staffSkill: 0.55, // スキルのパワー +55%（スキルは何ターンかに一度なので、大きめ）
  staffSp: 8, // 自分の番のたびに SP +8（レベルの倍率つき）
  shieldTaken: 0.11, // 受けるダメージを、いつも 11% へらす
  shieldGuard: 0.3, // ガードで受けるダメージを、さらに 30% へらす
  helmetHp: 0.1, // HP +10%
  helmetCrit: 0.6, // 受ける会心の一打の確率を 60% へらし、会心の大きさも小さくする
  armorDef: 0.32, // ぼうぎょ +32%
};

// ── AI が返すアイテムの設計図の形と、受け取ったものをそろえる処理（サーバーとブラウザの両方から使う） ──
const str = { type: 'string' } as const;
const en = (values: readonly string[]) => ({ type: 'string', enum: [...values] });
const obj = (props: Record<string, unknown>) => ({
  type: 'object',
  properties: props,
  required: Object.keys(props),
  additionalProperties: false,
});
export const ITEM_JSON_SCHEMA = obj({
  motif: str,
  kind: en(ITEM_KINDS),
  name: str,
  description: str,
  colors: obj({ primary: str, secondary: str, accent: str }),
  size: en(ITEM_SIZES),
  deco: en(ITEM_DECOS),
});

const pickOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T =>
  typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : fallback;
function textOf(v: unknown, max: number, fallback: string): string {
  if (typeof v !== 'string') return fallback;
  const t = v.replace(/[\u0000-\u001f]/g, '').trim();
  return t ? [...t].slice(0, max).join('') : fallback;
}
const colorOf = (v: unknown, fallback: string) =>
  typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim()) ? v.trim().toLowerCase() : fallback;

export const isItemKind = (v: unknown): v is ItemKind => typeof v === 'string' && (ITEM_KINDS as readonly string[]).includes(v);

/** 受け取ったアイテムの設計図を、決まった形・長さ・選択肢にそろえる */
export function sanitizeItemSpec(raw: any): ItemSpec {
  const r = raw ?? {};
  return {
    kind: pickOf(r.kind, ITEM_KINDS, 'sword'),
    name: textOf(r.name, 12, 'ナゾのアイテム'),
    description: textOf(r.description, 60, ''),
    motif: textOf(r.motif, 24, 'ふしぎな写真'),
    colors: {
      primary: colorOf(r.colors?.primary, '#c8d0dc'),
      secondary: colorOf(r.colors?.secondary, '#5a6b82'),
      accent: colorOf(r.colors?.accent, '#ffcc33'),
    },
    size: pickOf(r.size, ITEM_SIZES, 'medium'),
    deco: pickOf(r.deco, ITEM_DECOS, 'plain'),
    bonus: r.bonus === 1 ? 1 : 0,
  };
}

// AI につながらないときに、写真の印と色だけから作るアイテム（遊べなくならないための予備）
const LOCAL_HEAD = ['ブライト', 'メタル', 'ネオ', 'スター', 'ギガ', 'ルクス', 'ターボ', 'ミラクル'];
const LOCAL_TAIL: Record<ItemKind, string> = {
  sword: 'ソード', axe: 'アックス', spear: 'スピア', gun: 'ブラスター',
  staff: 'ロッド', shield: 'ガード', helmet: 'ヘルム', armor: 'アーマー',
};
export function localItemSpec(seed: string, colors: string[]): ItemSpec {
  const rng = rngFrom('local-item:' + seed);
  const choose = <T,>(list: readonly T[]): T => list[Math.floor(rng() * list.length)];
  const kind = choose(ITEM_KINDS);
  return {
    kind,
    name: choose(LOCAL_HEAD) + LOCAL_TAIL[kind],
    description: '写真の色から生まれたアイテム。AI の読み取りなしで作った、そのままのすがた。',
    motif: '写真の色',
    colors: { primary: colors[0] ?? '#c8d0dc', secondary: colors[1] ?? '#5a6b82', accent: '#ffcc33' },
    size: choose(ITEM_SIZES),
    deco: choose(ITEM_DECOS),
    bonus: 0,
  };
}

/** 写真の印から、アイテムの総合力（92〜108）とランクを決める。同じ写真なら毎回同じ */
export function itemPower(spec: Pick<ItemSpec, 'bonus'>, seed: string): { power: number; rank: Rank } {
  const rng = rngFrom('item:' + seed);
  const power = 92 + rng() * 16 + (spec.bonus ? 6 : 0);
  return { power, rank: rankOf(power) };
}

export function buildItem(spec: ItemSpec, seed: string, source: Item['source'], thumb?: string): Item {
  const { power, rank } = itemPower(spec, seed);
  return { id: `item-${seed.slice(0, 12)}-${Date.now().toString(36)}`, seed, spec, rank, power, createdAt: Date.now(), thumb, source };
}

/** バトルの計算が読む、アイテムの持ち味（持っていなければ、どれも効かない値） */
export interface Gear {
  kind: ItemKind | null;
  atk: number; // こうげきの倍率
  def: number; // ぼうぎょの倍率
  hp: number; // HP の倍率
  miss: number; // 自分のこうげきが空ぶりする確率
  pierce: number; // 相手のぼうぎょを無視する割合
  first: boolean; // 先に動ける
  gauge: number; // 必殺ゲージのたまり方の倍率
  skill: number; // スキルのパワーの倍率
  sp: number; // 自分の番のたびに、たまる SP（Lv1 の量）
  taken: number; // 受けるダメージの倍率（1 はいまのまま）
  guard: number; // ガードで受けるダメージの倍率（1 はいまのまま）
  critGuard: number; // 受ける会心の一打の確率の倍率
}

const NO_GEAR: Gear = { kind: null, atk: 1, def: 1, hp: 1, miss: 0, pierce: 0, first: false, gauge: 1, skill: 1, sp: 0, taken: 1, guard: 1, critGuard: 1 };

/** そのロボが持っているアイテムの持ち味 */
export function gearOf(c: { item?: Item }): Gear {
  const it = c.item;
  if (!it) return NO_GEAR;
  const k = Math.max(0.8, Math.min(1.2, it.power / 100)); // 総合力に比例（S は少し大きく、C は少し小さく）
  const P = ITEM_POWER;
  const g: Gear = { ...NO_GEAR, kind: it.spec.kind };
  switch (it.spec.kind) {
    case 'sword':
      g.atk = 1 + P.swordAtk * k;
      break;
    case 'axe':
      g.atk = 1 + P.axeAtk * k;
      g.miss = P.axeMiss;
      break;
    case 'spear':
      g.pierce = P.spearPierce * k;
      break;
    case 'gun':
      g.first = true;
      g.gauge = 1 + P.gunGauge * k;
      break;
    case 'staff':
      g.skill = 1 + P.staffSkill * k;
      g.sp = P.staffSp;
      break;
    case 'shield':
      g.taken = 1 - P.shieldTaken * k;
      g.guard = 1 - P.shieldGuard * k;
      break;
    case 'helmet':
      g.hp = 1 + P.helmetHp * k;
      g.critGuard = 1 - P.helmetCrit * k;
      break;
    case 'armor':
      g.def = 1 + P.armorDef * k;
      break;
  }
  return g;
}

/** 持ち味を、数字つきの短い文にする（そのアイテムの総合力で、少し変わる） */
export function itemEffectText(item: Item): string {
  const g = gearOf({ item });
  const pc = (x: number) => Math.round(x * 100);
  switch (item.spec.kind) {
    case 'sword':
      return `こうげき +${pc(g.atk - 1)}%`;
    case 'axe':
      return `こうげき +${pc(g.atk - 1)}%・ただし ${pc(g.miss)}% の確率で空ぶり（必殺技は空ぶりしない）`;
    case 'spear':
      return `相手のぼうぎょを ${pc(g.pierce)}% 無視する`;
    case 'gun':
      return `先に動ける・必殺ゲージのたまり方 +${pc(g.gauge - 1)}%`;
    case 'staff':
      return `スキルのパワー +${pc(g.skill - 1)}%・自分の番ごとに SP +${g.sp}`;
    case 'shield':
      return `受けるダメージ −${pc(1 - g.taken)}%・ガードすると、さらに −${pc(1 - g.guard)}%`;
    case 'helmet':
      return `HP +${pc(g.hp - 1)}%・会心の一打を受ける確率 −${pc(1 - g.critGuard)}%`;
    case 'armor':
      return `ぼうぎょ +${pc(g.def - 1)}%`;
  }
}

/**
 * アイテムを持たせたロボにする（HP・こうげき・ぼうぎょの分を、数字に入れる）。
 * ストーリーのレベル（atLevel）とは、どちらを先にかけてもよい（かけ算なので同じ）
 */
export function withItem(c: Character, item: Item | undefined): Character {
  if (!item) return c;
  const g = gearOf({ item });
  return {
    ...c,
    item,
    stats: {
      hp: Math.round(c.stats.hp * g.hp),
      sp: c.stats.sp,
      atk: Math.round(c.stats.atk * g.atk),
      def: Math.round(c.stats.def * g.def),
    },
  };
}
