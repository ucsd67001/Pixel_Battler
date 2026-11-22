// AIが返す設計図の形（JSON Schema）と、受け取ったものを安全な形にそろえる処理。
// サーバーとブラウザの両方から使う。

import {
  ARMS, BACKS, BODIES, ELEMENTS, FORMS, HEADS, LEGS, SKILL_KINDS, TRAITS, ULT_STYLES, WEAPONS,
  type CharacterSpec, type Element,
} from './types';
import { ELEMENT_INFO } from './data';

const str = { type: 'string' } as const;
const en = (values: readonly string[]) => ({ type: 'string', enum: [...values] });
const level = { type: 'integer', enum: [1, 2, 3, 4, 5] };
const obj = (props: Record<string, unknown>) => ({
  type: 'object',
  properties: props,
  required: Object.keys(props),
  additionalProperties: false,
});

export const SPEC_JSON_SCHEMA = obj({
  motif: str,
  name: str,
  title: str,
  description: str,
  form: en(FORMS),
  element: en(ELEMENTS),
  bias: obj({ hp: level, sp: level, atk: level, def: level }),
  parts: obj({
    head: en(HEADS),
    body: en(BODIES),
    arms: en(ARMS),
    legs: en(LEGS),
    back: en(BACKS),
    weapon: en(WEAPONS),
  }),
  colors: obj({ primary: str, secondary: str, accent: str, eye: str }),
  skill: obj({ name: str, kind: en(SKILL_KINDS), description: str }),
  ultimate: obj({ name: str, style: en(ULT_STYLES), description: str, shout: str }),
  trait: en(TRAITS),
});

function pick<T extends string>(v: unknown, list: readonly T[], fallback: T): T {
  return typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : fallback;
}

function text(v: unknown, max: number, fallback: string): string {
  if (typeof v !== 'string') return fallback;
  const t = v.replace(/[\u0000-\u001f]/g, '').trim();
  if (!t) return fallback;
  return [...t].slice(0, max).join('');
}

function color(v: unknown, fallback: string): string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim()) ? v.trim().toLowerCase() : fallback;
}

function lv(v: unknown): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(5, Math.max(1, n)) : 3;
}

// 受け取った設計図を、決まった形・長さ・選択肢にそろえる
export function sanitizeSpec(raw: any): CharacterSpec {
  const r = raw ?? {};
  const element: Element = pick(r.element, ELEMENTS, 'light');
  const base = ELEMENT_INFO[element].color;
  return {
    motif: text(r.motif, 24, 'ふしぎな写真'),
    name: text(r.name, 12, 'ノーネーム'),
    title: text(r.title, 14, '名もなき戦士'),
    description: text(r.description, 70, ''),
    form: pick(r.form, FORMS, 'humanoid'),
    element,
    bias: {
      hp: lv(r.bias?.hp),
      sp: lv(r.bias?.sp),
      atk: lv(r.bias?.atk),
      def: lv(r.bias?.def),
    },
    parts: {
      head: pick(r.parts?.head, HEADS, 'vfin'),
      body: pick(r.parts?.body, BODIES, 'standard'),
      arms: pick(r.parts?.arms, ARMS, 'standard'),
      legs: pick(r.parts?.legs, LEGS, 'standard'),
      back: pick(r.parts?.back, BACKS, 'none'),
      weapon: pick(r.parts?.weapon, WEAPONS, 'sword'),
    },
    colors: {
      primary: color(r.colors?.primary, '#e8ecf4'),
      secondary: color(r.colors?.secondary, base),
      accent: color(r.colors?.accent, '#ffcc33'),
      eye: color(r.colors?.eye, '#38f2ff'),
    },
    skill: {
      name: text(r.skill?.name, 16, 'スキル'),
      kind: pick(r.skill?.kind, SKILL_KINDS, 'strike'),
      description: text(r.skill?.description, 48, ''),
    },
    ultimate: {
      name: text(r.ultimate?.name, 16, '必殺技'),
      style: pick(r.ultimate?.style, ULT_STYLES, 'beam'),
      description: text(r.ultimate?.description, 48, ''),
      shout: text(r.ultimate?.shout, 24, 'いくぞ！'),
    },
    trait: pick(r.trait, TRAITS, 'fighter'),
  };
}
