// 写真を OpenAI に読ませて、キャラの設計図（CharacterSpec）を作る。
// ⚠️ 鍵はこのファイルの外から渡す。鍵をログやエラーに出さない。
// 手元（vite.config.ts）でも Firebase の Cloud Functions（functions/src/index.ts）でも、analyzeImage をそのまま呼ぶ。
// 取っておく場所（cache）は呼ぶ側が渡す：手元はファイル、Firebase は Firestore。

import type { CharacterSpec } from '../src/game/types';
import { sanitizeSpec, SPEC_JSON_SCHEMA } from '../src/game/spec';
import { specHardKanji } from '../src/game/kanji';

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
- element：blaze＝火・熱・赤・情熱 / tide＝水・氷・海・青・冷静 / verdant＝植物・自然・動物・緑 / light＝光・金・白・電気・神聖 / dark＝夜・影・黒・神秘・冷たい機械
- parts.head：vfin＝V字の角（主人公らしい） / horns＝二本の角（猛々しい） / mono＝一つ目のバイザー（無機質） / crest＝とさかのフィン（騎士） / ears＝耳型センサー（動物・かわいい） / crown＝王冠（高貴）
- parts.body：standard / slim（すばやい） / heavy（重装）
- parts.arms：standard / heavy（大きな手甲） / blade（腕に刃）
- parts.legs：standard / heavy（太い） / thruster（噴射口つき）
- parts.back：none / wings（翼） / boosters（推進器） / cannons（肩のキャノン） / cape（マント）
- parts.weapon：none（拳） / sword（剣） / lance（槍） / rifle（銃） / hammer（槌） / shield（盾と拳） / claw（爪）
- skill.kind：strike（強烈な一撃） / barrage（三連撃） / drain（攻撃して吸収） / breaker（守りを砕く） / heal（回復） / powerup（攻撃強化） / fortify（防御強化） / hex（相手を弱らせる） / counter（反撃の構え）
- ultimate.style：beam（極太のビーム） / slash（一閃） / meteor（流星を降らせる） / burst（大爆発） / rush（乱舞）
- trait：first（先制） / guts（不屈：一度だけHP1で耐える） / pierce（貫通） / regen（再生） / focus（集中：SPの回復が2倍） / ironwall（堅牢：ピンチで防御アップ） / fighter（闘志：必殺ゲージが早くたまる） / lucky（強運：会心が出やすい）`;

const USER_PROMPT = 'この写真から、ロボを一体設計してください。';

const REASONING = /^(gpt-5|gpt-6|o1|o3|o4)/;

async function callOpenAI(image: string, model: string, apiKey: string, avoid: string[] = []): Promise<unknown> {
  const text = avoid.length
    ? `${USER_PROMPT}\n注意：「${avoid.join('」「')}」は小学校で習わない漢字なので、使わないでください（ひらがなかカタカナにするか、やさしい言葉に言いかえる）。`
    : USER_PROMPT;
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text },
          { type: 'image_url', image_url: { url: image, detail: 'low' } },
        ],
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'character_spec', strict: true, schema: SPEC_JSON_SCHEMA },
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

export async function analyzeImage(image: string, hash: string, opt: AnalyzeOptions): Promise<AnalyzeResult> {
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('bad hash');
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) throw new Error('bad image');

  // 同じ写真には、同じ設計図を返す
  const hit = await opt.cache.get(cacheKey(hash)).catch(() => null);
  if (hit) return { spec: sanitizeSpec(hit), cached: true, model: 'cache' };

  const models = [opt.model];
  if (opt.model !== 'gpt-4.1-mini') models.push('gpt-4.1-mini');
  let lastError: unknown = null;
  for (const model of models) {
    try {
      let spec = sanitizeSpec(await callOpenAI(image, model, opt.apiKey));
      // 小学校で習わない漢字が入っていたら、その字を名指しして一度だけ作り直す（指示だけでは守られないことがある）
      const hard = specHardKanji(spec);
      if (hard.length) {
        console.warn(`[analyze] 小学校で習わない漢字：${hard.join('')} → 作り直し`);
        try {
          const again = sanitizeSpec(await callOpenAI(image, model, opt.apiKey, hard));
          if (specHardKanji(again).length < hard.length) spec = again;
        } catch (e) {
          console.warn(`[analyze] 作り直しに失敗：${String((e as Error).message).slice(0, 200)}`);
        }
      }
      await opt.cache.set(cacheKey(hash), spec).catch((e) => console.warn(`[analyze] cache: ${String(e).slice(0, 200)}`));
      return { spec, cached: false, model };
    } catch (e) {
      lastError = e;
      console.warn(`[analyze] ${model} failed: ${String((e as Error).message).slice(0, 300)}`);
    }
  }
  throw lastError ?? new Error('analyze failed');
}
