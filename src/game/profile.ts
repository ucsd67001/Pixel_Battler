// ニックネームの決まり（2026-11-25。画面とサーバーの両方が使う）。
//   ・自分で決めて、あとから何度でも変えられる。保存するのはサーバーだけ（/api/profile → users/{uid} の nickname）
//   ・ランキングなど、ほかの人に見える場所には、Google の名前ではなくニックネームを出す
//     （Google の名前は、子どもの本名のことが多いため）。決めていない人は、ランキングに出さない
//   ・ほかの人に連らく先を教えられないように、URL・メールアドレス・長い数字（電話番号など）は入れられない

export const NICK_MAX = 10;

// 使える字：ひらがな・カタカナ・漢字・英字・数字と、いくつかの記号
const ALLOWED = /^[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}A-Za-z0-9ー・ !?☆★♪~_-]+$/u;

export type NickCheck = { ok: true; nickname: string } | { ok: false; reason: string };

/**
 * 入れた名前を確かめて、そろえる（全角の英数字は半角に・前後の空白はとる）。
 * 空にすると「ニックネームを消す」（ok で nickname は ''）
 */
export function checkNickname(raw: unknown): NickCheck {
  const s = String(raw ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return { ok: true, nickname: '' };
  if ([...s].length > NICK_MAX) return { ok: false, reason: `${NICK_MAX}文字までにしてね` };
  if (!ALLOWED.test(s)) return { ok: false, reason: '使えない文字が入っています（ひらがな・カタカナ・漢字・英字・数字で）' };
  if (/\d{5,}/.test(s.replace(/[ ・ー_-]/g, ''))) return { ok: false, reason: '長い数字は入れられません' };
  if (/https?|www|\.(com|jp|net)/i.test(s)) return { ok: false, reason: 'URL のような名前は入れられません' };
  return { ok: true, nickname: s };
}

/** 保存してあったニックネームを読む（おかしいものは、無いことにする） */
export function readNickname(raw: unknown): string {
  const r = checkNickname(raw);
  return r.ok ? r.nickname : '';
}
