// 写真を OpenAI に読ませて、キャラの設計図（CharacterSpec）を作る。
// ⚠️ 鍵はこのファイルの外から渡す。鍵をログやエラーに出さない。
// 手元（vite.config.ts）でも Firebase の Cloud Functions（functions/src/index.ts）でも、analyzeImage をそのまま呼ぶ。
// 取っておく場所（cache）は呼ぶ側が渡す：手元はファイル、Firebase は Firestore。

import type { CharacterSpec } from '../src/game/types';
import { sanitizeSpec, SPEC_JSON_SCHEMA } from '../src/game/spec';
import { hardKanji, specHardKanji } from '../src/game/kanji';
import { SKILL_TABLE, ULT_TABLE } from '../src/game/data';

// 指示を大きく変えたら上げる（同じ写真でも、前の指示で作った設計図を返さないため）
const CACHE_VERSION = 'k2';
export const cacheKey = (hash: string) => `${CACHE_VERSION}_${hash}`;

export interface SpecCache {
  get(hash: string): Promise<unknown | null>;
  set(hash: string, spec: CharacterSpec): Promise<void>;
}

export interface AnalyzeOptions {
  apiKey: string;
  model: string;
  cache: SpecCache;
  // 開発者だけが知る決まり（どんな写真なら bonus を 1 にするか）。鍵の置き場から渡す。無ければ、いつも 0
  hiddenRule?: string;
}

export interface AnalyzeResult {
  spec: CharacterSpec;
  cached: boolean;
  model: string;
}

const SYSTEM_PROMPT = `あなたは、写真から「オリジナルのSDロボット戦士」を一体設計する、メカデザイナー兼ゲームデザイナーです。
このゲームでは、写真を読み込むとロボが生まれ、ターン制で戦います。
このゲームで遊ぶのは、おもに小学6年生です。名前・二つ名・紹介文・技の名前・叫びは、小学6年生がすらすら読めて、意味が分かって、思わず声に出したくなる、かっこいいものにしてください。

手順：
1. 写真の中で「いちばん特徴的なもの」を一つ選び、motif に短く書く。物・動物・植物・料理・風景など何でもよい。人が写っているときは、顔や体つきではなく、服・持ち物・その場の雰囲気から選ぶ。
2. そのモチーフの色・形・素材・性質・連想から、ロボの体の形・姿・属性・能力の傾向・技を決める。見た人が「あの写真のあれだ」と分かるようにする。
3. 体の形（form）は、モチーフの形と雰囲気に合うものを選ぶ。人型にこだわらない。

決まり：
- 既存のアニメ・ゲーム・特撮の機体名・キャラ名・技名は使わない。すべてオリジナルにする。
- ロボは武器を持たず、素手で戦う（こぶし・キック・体当たり・チョップ・体から出す光やほのおなど）。title・description・技の名前と説明・叫びに、武器（剣・刀・やり・銃・弾・ハンマー・盾・つめ・刃・大砲・キャノンなど）を持つ・使う言葉を書かない。parts.weapon は選ぶが、見た目の設定に残るだけで、画面には出ない。
- 漢字は、小学校で習う漢字だけを使う。中学校で習う漢字の言葉は、ひらがなかカタカナで書くか、やさしい言葉に言いかえる。むずかしい熟語や、古い言い回しは使わない。
- motif：写真の中のものを、短く、ふつうの言葉で（例：赤いリンゴ、ねこ、自転車）。
- name：カタカナのロボの名前（3〜8字）。言いやすく、覚えやすい音にする。モチーフの言葉を、英語風にもじると良い。
- title：「〜の〜」の形の二つ名（12字まで）。
- description：モチーフとのつながりが分かる、かっこいい紹介文（60字まで）。一度読めば分かる、短い文で。
- skill.name と ultimate.name：カタカナの言葉を中心にした、声に出して言いたくなる技名（12字まで）。漢字を入れるなら、小学校で習う字だけ。description はそれぞれ40字まで。ultimate.shout は技を放つときの短い叫び（20字まで）。
- colors：モチーフの色をもとにした #RRGGBB。primary＝本体の装甲、secondary＝差し色の装甲、accent＝角や縁取りの金属、eye＝目の光（明るい色）。primary と secondary ははっきり違う色にする。
- bias：hp・sp・atk・def の傾向を 1〜5 で。重くて硬いものは hp と def、鋭いものや速いものは atk、不思議なものや知的なものは sp を高めに。全部を高くしない（合計は 10〜14）。
- 人を傷つける言葉・差別的な言葉・実在の人物の名前は使わない。

選択肢の意味：
- form：humanoid＝人型（立ち姿が似合うもの：道具・建物・服・人工物） / beast＝四つ足の獣型（動物・乗り物・家具など、横に長いもの・速いもの・力強いもの） / floater＝浮遊型（丸いもの・軽いもの・光るもの・食べ物・空や宇宙のもの）。獣型の weapon は、角（sword・lance）・背中の砲（rifle）・尾の槌（hammer）・肩の盾（shield）・前足の爪（claw）・牙（none）になる。浮遊型は、体のまわりに浮かぶ両手で武器を持つ
- element：blaze＝火・熱・赤・情熱 / tide＝水・氷・海・青・冷静 / verdant＝地（大地・土・岩・山・木や森・植物・金属・茶色や緑。どっしり、力強い） / gale＝風（空・鳥・羽・雲・虫・乗り物・速いもの・軽いもの・すずしい色） / light＝光・金・白・電気・神聖 / dark＝夜・影・黒・神秘・冷たい機械
- parts.head：vfin＝V字の角（主人公らしい） / horns＝二本の角（猛々しい） / mono＝一つ目のバイザー（無機質） / crest＝とさかのフィン（騎士） / ears＝耳型センサー（動物・かわいい） / crown＝王冠（高貴）
- parts.body：standard / slim（すばやい） / heavy（重装）
- parts.arms：standard / heavy（大きな手甲） / blade（腕に刃）
- parts.legs：standard / heavy（太い） / thruster（噴射口つき）
- parts.back：none / wings（翼） / boosters（推進器） / cannons（肩のキャノン） / cape（マント）
- parts.weapon：none（拳） / sword（剣） / lance（槍） / rifle（銃） / hammer（槌） / shield（盾と拳） / claw（爪）
- skill.kind：strike（強烈な一撃） / barrage（三連撃） / drain（攻撃して吸収） / breaker（守りを砕く） / heal（回復） / powerup（攻撃強化） / fortify（防御強化） / hex（相手を弱らせる） / counter（反撃の構え）
- ultimate.style：beam（極太のビーム） / slash（一閃） / meteor（流星を降らせる） / burst（大爆発） / rush（乱舞）
- trait：first（先制） / guts（不屈：一度だけHP1で耐える） / pierce（貫通） / regen（再生） / focus（集中：SPの回復が2倍） / ironwall（堅牢：ピンチで防御アップ） / fighter（闘志：必殺ゲージが早くたまる） / lucky（強運：会心が出やすい） / grit（底力：ピンチでこうげきアップ） / evade（見切り：ときどき、こうげきをかわす）`;

const USER_PROMPT = 'この写真から、ロボを一体設計してください。';

const REASONING = /^(gpt-5|gpt-6|o1|o3|o4)/;

async function callOpenAI(image: string, model: string, apiKey: string, rule: string, avoid: string[] = []): Promise<unknown> {
  const text = avoid.length
    ? `${USER_PROMPT}\n注意：「${avoid.join('」「')}」は小学校で習わない漢字なので、使わないでください（ひらがなかカタカナにするか、やさしい言葉に言いかえる）。`
    : USER_PROMPT;
  return chat(model, apiKey, 'character_spec', SPEC_JSON_SCHEMA, [
    { role: 'system', content: `${SYSTEM_PROMPT}

${rule}` },
    {
      role: 'user',
      content: [
        { type: 'text', text },
        { type: 'image_url', image_url: { url: image, detail: 'low' } },
      ],
    },
  ]);
}

async function chat(model: string, apiKey: string, name: string, schema: unknown, messages: unknown[]): Promise<unknown> {
  const body: Record<string, unknown> = {
    model,
    messages,
    response_format: {
      type: 'json_schema',
      json_schema: { name, strict: true, schema },
    },
  };
  // 新しい世代のモデルは指定の名前が違う（GEMu の llm_params.py と同じ読み替え）
  if (REASONING.test(model)) {
    body.max_completion_tokens = 2000;
    body.reasoning_effort = 'none';
  } else {
    body.max_tokens = 1500;
    body.temperature = 0.9;
  }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`OpenAI HTTP ${res.status}: ${detail}`);
  }
  const data: any = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned empty content');
  return JSON.parse(content);
}

// ── 文だけの書き直し（写真は送らない） ──
// 写真から作り直しても、小学校で習わない漢字が残ることがある。そのときは、画面に出る文だけを AI に渡して、
// その字を使わないように書き直してもらう。強さ・見た目・属性などは変えない。
// 前に作ったロボ（漢字の決まりを入れる前のもの）を、ガレージで直すときにも使う。

const TEXT_FIELDS = ['motif', 'name', 'title', 'description', 'skill_name', 'skill_description', 'ultimate_name', 'ultimate_description', 'shout'] as const;
type TextFields = Record<(typeof TEXT_FIELDS)[number], string>;
const TEXT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [...TEXT_FIELDS],
  properties: Object.fromEntries(TEXT_FIELDS.map((k) => [k, { type: 'string' }])),
};

const FIX_PROMPT = `あなたは、小学6年生が遊ぶゲームの文を、やさしく直す係です。
ロボの紹介の文の中に、小学校で習わない漢字が入っています。その字を使わないように書き直してください。

決まり：
- 名指しした字は、ひらがなかカタカナにするか、小学校で習う漢字だけのやさしい言葉に言いかえる。ほかの字も、小学校で習う漢字だけにする。
- 意味・雰囲気・かっこよさは、できるだけそのまま。直さなくてよいところは、元の文のまま返す。
- name（ロボの名前）は、習わない漢字が入っていなければ、元のまま返す。
- 字数：motif 20字まで / name 3〜8字 / title 12字まで / description 60字まで / skill_name・ultimate_name 12字まで / skill_description・ultimate_description 40字まで / shout 20字まで。`;

function textOf(s: CharacterSpec): TextFields {
  return {
    motif: s.motif,
    name: s.name,
    title: s.title,
    description: s.description,
    skill_name: s.skill.name,
    skill_description: s.skill.description,
    ultimate_name: s.ultimate.name,
    ultimate_description: s.ultimate.description,
    shout: s.ultimate.shout,
  };
}

function withText(s: CharacterSpec, raw: any): CharacterSpec {
  const t = { ...textOf(s) };
  for (const k of TEXT_FIELDS) if (typeof raw?.[k] === 'string' && raw[k].trim()) t[k] = raw[k];
  // 名前に習わない字が無ければ、名前は変えない（遊ぶ子が覚えている名前なので）
  if (!hardKanji(s.name).length) t.name = s.name;
  return sanitizeSpec({
    ...s,
    motif: t.motif,
    name: t.name,
    title: t.title,
    description: t.description,
    skill: { ...s.skill, name: t.skill_name, description: t.skill_description },
    ultimate: { ...s.ultimate, name: t.ultimate_name, description: t.ultimate_description, shout: t.shout },
  });
}

// ── 素手で戦う文への書き直し（2026-11-23。写真は送らない） ──
// どのロボも素手で戦うことにしたので、それより前に作ったロボの文から、武器を使う言葉をなくす。
// 名前（name）と motif は変えない（遊ぶ子が覚えている名前で、体つきもこの二つから決まるため）。

const BARE_FIELDS = ['title', 'description', 'skill_name', 'skill_description', 'ultimate_name', 'ultimate_description', 'shout'] as const;
const BARE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [...BARE_FIELDS],
  properties: Object.fromEntries(BARE_FIELDS.map((k) => [k, { type: 'string' }])),
};

const BARE_PROMPT = `あなたは、小学6年生が遊ぶロボのゲームの文を直す係です。
このゲームでは、ロボは武器を持たず、素手で戦うことになりました（こぶし・キック・体当たり・チョップ・体から出す光やほのお・エネルギーなど）。
ロボの紹介の文と技の文から、武器（剣・刀・やり・銃・弾・ハンマー・盾・つめ・刃・大砲・キャノン・ミサイルなど）を持つ・使う言葉をなくして、素手で戦う文に書き直してください。

決まり：
- 武器が出てこないところは、一字も変えずに、元の文のまま返す。
- 技の名前は、武器の言葉が入っているときだけ、素手らしい名前に変える（ナックル・パンチ・キック・タックル・チョップ・ストライクなど）。声に出して言いたくなる、かっこいい名前にする。
- ロボの名前と、写真のモチーフとのつながり・雰囲気は、そのまま生かす。
- 技の説明は、動きや見た目を書く文のままにする。数字や、効き方の説明（何倍・何%・何回など）は書かない（効き方は、画面に別に出る）。
- 角・しっぽ・羽・こうら・体そのものは武器ではないので、使ってよい。
- 漢字は、小学校で習う漢字だけ。中学校で習う漢字の言葉は、ひらがなかカタカナにする。
- 字数：title 12字まで / description 60字まで / skill_name・ultimate_name 12字まで / skill_description・ultimate_description 40字まで / shout 20字まで。`;

function bareTextOf(s: CharacterSpec) {
  return {
    title: s.title,
    description: s.description,
    skill_name: s.skill.name,
    skill_description: s.skill.description,
    ultimate_name: s.ultimate.name,
    ultimate_description: s.ultimate.description,
    shout: s.ultimate.shout,
  };
}

// 武器を使う言葉（指示だけでは守られないことがあるので、新しく作った文も確かめる）
// 武器が出てくる文だけを書き直す（AI に全部をまかせると、武器の無い文や技の名前まで変えてしまうため）
const WEAPON_WORDS =
  // 「バランス」「クローバー」「思いやり」などは武器ではないので、外す
  /剣|刀|刃|やりで|やりを|やりの|やりが|槍|(?<![バフ])ランス|スピア|ソード|ブレード|ブレイド|サーベル|ナイフ|ライフル|銃|弾丸|バズーカ|ハンマー|斧|アックス|鎌|ムチ|盾|たてを|たてで|シールド|クロー(?!バ)|つめで|つめを|つめの|つめが|爪|キャノン|大砲|ミサイル|弓|矢/g;
const weaponWordsOf = (text: string) => [...new Set(text.match(WEAPON_WORDS) ?? [])];
const hasWeaponWords = (s: CharacterSpec) => weaponWordsOf(Object.values(bareTextOf(s)).join(' ')).length > 0;

/**
 * 文を、素手で戦うロボの文に書き直す。武器の言葉が入っている文だけを AI に直してもらい、
 * それでも残っていたら、その言葉を名指しして、もう一度だけ。書き直せたら bare: 1 をつける。AI につながらなければ、元のまま
 */
async function rewriteBare(spec: CharacterSpec, opt: { apiKey: string; model: string }): Promise<CharacterSpec> {
  const models = opt.model === 'gpt-4.1-mini' ? [opt.model] : [opt.model, 'gpt-4.1-mini'];
  const sk = SKILL_TABLE[spec.skill.kind];
  const info = [
    `ロボの名前：${spec.name}（写真のモチーフ：${spec.motif}）`,
    `スキルの種類：${sk.label}`,
    `必殺技の型：${ULT_TABLE[spec.ultimate.style].label}`,
  ].join('\n');
  let cur = spec;
  let done = false;
  for (let round = 0; round < 2; round++) {
    const words = weaponWordsOf(Object.values(bareTextOf(cur)).join(' '));
    if (!words.length) break;
    let raw: any = null;
    for (const model of models) {
      try {
        raw = await chat(model, opt.apiKey, 'robot_bare_text', BARE_SCHEMA, [
          { role: 'system', content: BARE_PROMPT },
          {
            role: 'user',
            content: `${info}\n武器の言葉：「${words.join('」「')}」（この言葉を使わない）\n直す文（JSON）：\n${JSON.stringify(bareTextOf(cur), null, 1)}`,
          },
        ]);
        break;
      } catch (e) {
        console.warn(`[bareText] ${model} failed: ${String((e as Error).message).slice(0, 200)}`);
      }
    }
    if (!raw) break;
    done = true;
    const t = { ...bareTextOf(cur) };
    // 武器の言葉が入っていた文だけ、書き直した文にする
    for (const k of BARE_FIELDS) if (weaponWordsOf(t[k]).length && typeof raw?.[k] === 'string' && raw[k].trim()) t[k] = raw[k];
    cur = sanitizeSpec({
      ...cur,
      title: t.title,
      description: t.description,
      skill: { ...cur.skill, name: t.skill_name, description: t.skill_description },
      ultimate: { ...cur.ultimate, name: t.ultimate_name, description: t.ultimate_description, shout: t.shout },
    });
  }
  return done ? { ...cur, bare: 1 } : spec;
}

/**
 * 前に作ったロボの文を、いまの決まりに合わせて書き直す（ガレージを開いたとき・だれかのロボとして出すとき）：
 *   ① 素手で戦う文になっていなければ、書き直す
 *   ② 小学校で習わない漢字が残っていれば、取りのぞく
 * 強さ・見た目・名前は変えない（名前は、習わない漢字が入っているときだけ）。
 */
export async function refreshText(spec: CharacterSpec, opt: { apiKey: string; model: string }): Promise<CharacterSpec> {
  let s = spec;
  if (!s.bare && !hasWeaponWords(s)) s = { ...s, bare: 1 }; // 武器の言葉が無ければ、そのまま（AI は呼ばない）
  if (!s.bare) {
    const next = await rewriteBare(s, opt);
    // 書き直しで習わない漢字が増えたら、そこは下の②で取りのぞく
    s = next;
    console.log(`[bareText] ${spec.name}：${spec.skill.name}／${spec.ultimate.name} → ${s.skill.name}／${s.ultimate.name}${s.bare ? '' : '（書き直せず）'}`);
  }
  if (specHardKanji(s).length) s = await fixSpecText(s, opt);
  return s;
}

/**
 * 画面に出る文から、小学校で習わない漢字を取りのぞく（文だけを AI に書き直してもらう。最大2回）。
 * いちばん習わない字が少なかったものを返す。直せなければ、元のまま。
 */
export async function fixSpecText(spec: CharacterSpec, opt: { apiKey: string; model: string }): Promise<CharacterSpec> {
  let best = spec;
  let hard = specHardKanji(spec);
  const models = opt.model === 'gpt-4.1-mini' ? [opt.model] : [opt.model, 'gpt-4.1-mini'];
  for (let round = 0; round < 2 && hard.length; round++) {
    let raw: unknown = null;
    for (const model of models) {
      try {
        raw = await chat(model, opt.apiKey, 'robot_text', TEXT_SCHEMA, [
          { role: 'system', content: FIX_PROMPT },
          {
            role: 'user',
            content: `習わない漢字：「${hard.join('」「')}」\n直す文（JSON）：\n${JSON.stringify(textOf(best), null, 1)}`,
          },
        ]);
        break;
      } catch (e) {
        console.warn(`[fixText] ${model} failed: ${String((e as Error).message).slice(0, 200)}`);
      }
    }
    if (!raw) break;
    const next = withText(best, raw);
    const left = specHardKanji(next);
    if (left.length < hard.length) {
      best = next;
      hard = left;
    }
  }
  console.log(`[fixText] ${specHardKanji(spec).join('')} → ${hard.join('') || 'なし'}`);
  return best;
}

export async function analyzeImage(image: string, hash: string, opt: AnalyzeOptions): Promise<AnalyzeResult> {
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('bad hash');
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) throw new Error('bad image');

  // 同じ写真には、同じ設計図を返す
  const hit = await opt.cache.get(cacheKey(hash)).catch(() => null);
  if (hit) return { spec: sanitizeSpec(hit), cached: true, model: 'cache' };

  const rule = opt.hiddenRule?.trim() || '- bonus：いつも 0 にする。';
  const models = [opt.model];
  if (opt.model !== 'gpt-4.1-mini') models.push('gpt-4.1-mini');
  let lastError: unknown = null;
  for (const model of models) {
    try {
      let spec = sanitizeSpec(await callOpenAI(image, model, opt.apiKey, rule));
      // 小学校で習わない漢字が入っていたら、その字を名指しして一度だけ作り直す（指示だけでは守られないことがある）
      const hard = specHardKanji(spec);
      if (hard.length) {
        console.warn(`[analyze] 小学校で習わない漢字：${hard.join('')} → 作り直し`);
        try {
          const again = sanitizeSpec(await callOpenAI(image, model, opt.apiKey, rule, hard));
          if (specHardKanji(again).length < hard.length) spec = again;
        } catch (e) {
          console.warn(`[analyze] 作り直しに失敗：${String((e as Error).message).slice(0, 200)}`);
        }
        // それでも残っていたら、文だけを書き直してもらう
        if (specHardKanji(spec).length) spec = await fixSpecText(spec, { apiKey: opt.apiKey, model }).catch(() => spec);
      }
      // 素手で戦う指示で作った文（2026-11-23 から）。それでも武器の言葉が入っていたら、一度だけ書き直す
      if (hasWeaponWords(spec)) {
        console.warn('[analyze] 武器の言葉が入っていた → 書き直し');
        spec = await rewriteBare(spec, { apiKey: opt.apiKey, model });
        if (specHardKanji(spec).length) spec = await fixSpecText(spec, { apiKey: opt.apiKey, model }).catch(() => spec);
      }
      spec = { ...spec, bare: 1 };
      await opt.cache.set(cacheKey(hash), spec).catch((e) => console.warn(`[analyze] cache: ${String(e).slice(0, 200)}`));
      return { spec, cached: false, model };
    } catch (e) {
      lastError = e;
      console.warn(`[analyze] ${model} failed: ${String((e as Error).message).slice(0, 300)}`);
    }
  }
  throw lastError ?? new Error('analyze failed');
}
