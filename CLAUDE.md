# ピクセル・バトラー ― スレッドの申し送り

写真から SD ロボが生まれ、コマンドで戦うブラウザゲーム。**このファイルは、新しいスレッドの最初に自動で読まれる。**
詳しいこと（動かし方・Firebase・作り・決めたこと）は **`README.md`** にある。最初にそちらも読む。
ゲームの考え方と設計のまとめは **`docs/DESIGN.md`**（しくみを変えたら、こちらも直す）。
これから作るストーリーとレベルの設計は **`docs/STORY.md`**（作ったところから DESIGN.md に移す）。

⚠️ **このリポジトリは公開**（github.com/ucsd67001/Pixel_Battler）。このファイルも公開される。
公開しないこと（裏技の中身・家族のこと・いまの積み残しのくわしい話）は **`CLAUDE.local.md`**（git に入らない）に書いてある。

| | |
|---|---|
| 本番 | https://pixelbattler.web.app（Firebase のプロジェクト `pixel-battler-gemu`。Hosting＋Cloud Functions `api`＝東京＋Firestore） |
| 作り | Vite＋React＋TypeScript、three.js。AI は OpenAI（`gpt-6-luna`） |
| フォルダ | `C:\Users\ucsd6\OneDrive\デスクトップ\pixelbattler`（デスクトップ＝OneDrive の中。2026-11-22 に `C:\Users\ucsd6\dev\snapgear` から移した） |
| 手元 | `npm run dev` → http://localhost:5180（使われていれば 5181・5182…）。手元ではログインなし・ガレージはこのスマホの中 |

---

## ⚠️⚠️ 絶対のルール

- ⚠️⚠️ **返答・報告は、必ず日本語で書く。**一行の返事も、途中の一言も、最後のまとめも、ボタンの文字も。長い作業のあとに英語になる事故が何度もあった。**書き始める前に確かめる**
- **鍵・家族のメールアドレス・裏技の中身を、リポジトリに入れない**（公開のため）。鍵は Secret Manager（`OPENAI_API_KEY`・`ALLOWED_EMAILS`・`HIDDEN_RULE`）
- **`.env` を読まない・表示しない・上げない**（`KEY_ENV_FILE` が別のアプリの鍵のファイルを指している）
- **push の前に数える**（何も出なければよい）：
  `git grep -n -I -e 'sk-proj-' -e 'sk-[A-Za-z0-9]\{20,\}' -e 'AIza[0-9A-Za-z_-]\{20,\}'`
  ＋ `CLAUDE.local.md` に書いた、家族のアドレスの一部と裏技の言葉も数える（git に入っていないファイルも grep で）
- **本番に出す・push するのは、持ち主が言ってから**（「出して」「まとめて出す」など）。自動の安全確認で止められたら、無理に通さずに聞く
- git の資格情報やトークンを取り出さない。Google Cloud・GitHub の設定を変えるのは持ち主
- **メインの遊び手は小学6年生。**画面の言葉・キャラ名・技名は、小学校で習う漢字（1026字）とひらがな・カタカナだけ。`npm run check:kanji` で点検する

## 持ち主について

- バイブコーディング（専門用語には言い換えを添える。選択肢を出すときは、おすすめと理由をつけて本文に書き切る）
- 持ち主のターミナルは **PowerShell 5.1**。渡すコマンドは `&&` を使わず、`cd C:\Users\ucsd6\OneDrive\デスクトップ\pixelbattler; …` の1行で
- 自分の作業の説明を盛らない。試していないことは「まだ試していない」と書く

## 作業の作法

- 直したら：`npx tsc --noEmit` と `npm run check:kanji`。バトルの数字を変えたら `npm run sim`
- **本番に出す手順**（`npm run deploy` でも同じ）：
  1. `npm run build`
  2. `npm run build:functions`（⚠️ 忘れると、サーバーに古いコードが出る）
  3. `firebase deploy --only firestore:rules,functions,hosting --project pixel-battler-gemu --non-interactive`
- Secret Manager の中身を変えたら、**functions を出し直す**（出し直さないと効かない）
- コミットの最後は `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- ⚠️ **bash に Python やスクリプトを直接書かない**（クォートや改行が化ける）。スクラッチにファイルとして書いてから走らせる
- 日本語のファイルは LF。`sed -i` で直すと改行が変わることがある → Edit か、スクラッチの Python で直す
- 手元の画面の試し：開発中は `window.__stage`（`S.loop()` で1コマずつ）と `window.__battle`。ふたりで対戦は `?localroom` を付けて二つのタブ
- ロボの見た目の試し：`?showroom` で何体も並べて見る（`&only=0,1`・`&pose=guard`・`&yaw=0.5`・`&zoom=2&y=1.6`・`&battle=1` でそのロボのバトル。`&cpu` で敵九体、`&minions=1` でストーリーの1章の手下とボス）。開発中だけ（`src/ui/Showroom.tsx`）
- 効果音は Web Audio（`src/lib/sfx.ts`）。`renderSfx` で画面に出さずに音を作れる
- ⚠️ **フォルダは OneDrive の中**：同期中のコミットは、まれに競合する。`node_modules` も同期される
- ⚠️ **フォルダの名前に日本語（デスクトップ）が入っている**：スクリプトでファイルの場所を作るときは `fileURLToPath(import.meta.url)` を使う（`new URL(...).pathname` は `%E3…` のままになり、ファイルが見つからない。2026-11-22 に `check-kanji.mjs` で起きた）
- 手元のガレージの保存場所の名前（`snapgear.hangar.v1`）は、前の名前のまま（変えると、ブラウザに残っているロボが読めなくなる）

## しくみの要点（README の補足）

- **数字はサーバーが決める**：AI が選ぶのは見た目・属性・傾向（1〜5）。HP などの数字・総合力・ランクは、写真の印（ハッシュ）から機械で決める。総合力とランクは写真の印だけで決まる
- **ガレージ**：ログイン時は Firestore の `users/{uid}/robots/{写真の印}`、一人30体まで（家族は100体）。入れるのはサーバー（`/api/robots`＝`server/garage.ts`）、見る・消すのは本人（`firestore.rules`）。画面は `src/game/garage.ts` の `useGarage()` から読む
- **特別な写真のロボ**（`spec.bonus`）：総合力 +6・技 1.1倍。どんな写真が特別かは `HIDDEN_RULE` にだけある（中身は `CLAUDE.local.md`）。画面から届いた設計図の bonus は受け取らない
- **ふたりで対戦**：二台で同じさいころの種を使い、選んだ技だけを送り合う（`src/net/room.ts`）。部屋は一つ。出すのはロボの名前だけで、写真は送らない
- **ガード＆リペア**：守る（ダメージ6割カット）＋最大HPの8%回復。続けて使うと回復なし。25ラウンドで引き分け
