// AIにつながらないときに、写真の色だけからキャラを作る（遊べなくならないための予備）

import {
  ARMS, BACKS, BODIES, FORMS, HEADS, LEGS, SKILL_KINDS, TRAITS, ULT_STYLES, WEAPONS,
  type CharacterSpec, type Element,
} from './types';
import { ELEMENT_INFO, SKILL_TABLE, ULT_TABLE } from './data';
import { rngFrom } from './random';

function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function elementFromColor(hex: string): Element {
  const [h, s, l] = hexToHsl(hex);
  if (l < 0.22) return 'dark';
  if (s < 0.18) return l > 0.6 ? 'light' : 'dark';
  if (h < 40 || h >= 330) return 'blaze';
  if (h < 70) return 'light';
  if (h < 140) return 'verdant'; // 緑は「地」（もとの「森」）
  if (h < 190) return 'gale'; // 青みどり（風の色）
  if (h < 260) return 'tide';
  return 'dark';
}

const NAME_A = ['ブレイ', 'ガルド', 'ネオ', 'ゼク', 'アルク', 'ヴァン', 'ライ', 'シグ', 'ルクス', 'カイ'];
const NAME_B = ['ザード', 'ギア', 'ノヴァ', 'ファング', 'レイヴ', 'ドライブ', 'オン', 'クロウ', 'ストーム', 'リッパー'];

export function localSpec(seed: string, colors: string[]): CharacterSpec {
  const rng = rngFrom('local:' + seed);
  const choose = <T,>(list: readonly T[]): T => list[Math.floor(rng() * list.length)];
  const main = colors[0] ?? '#8899aa';
  const element = elementFromColor(main);
  const kind = choose(SKILL_KINDS);
  const style = choose(ULT_STYLES);
  const lv = () => 1 + Math.floor(rng() * 5);
  const el = ELEMENT_INFO[element];
  return {
    motif: '写真の色',
    name: choose(NAME_A) + choose(NAME_B),
    title: `${el.label}をまとう者`,
    description: '写真の色から組み上げられたロボ。AIの読み取りなしで生まれた、そのままのすがた。',
    form: choose(FORMS),
    element,
    bias: { hp: lv(), sp: lv(), atk: lv(), def: lv() },
    parts: {
      head: choose(HEADS),
      body: choose(BODIES),
      arms: choose(ARMS),
      legs: choose(LEGS),
      back: choose(BACKS),
      weapon: choose(WEAPONS),
    },
    colors: {
      primary: colors[1] ?? '#e8ecf4',
      secondary: main,
      accent: '#ffcc33',
      eye: el.color,
    },
    skill: { name: `${el.label}の${SKILL_TABLE[kind].label}`, kind, description: '' },
    ultimate: {
      name: `メガ${ULT_TABLE[style].label}`,
      style,
      description: '',
      shout: 'これで決める！',
    },
    // 特性は、もとの8つから選ぶ（2026-11-23 に足した二つを入れると、同じ写真から別の特性になってしまうため）
    trait: choose(TRAITS.slice(0, 8)),
  };
}
