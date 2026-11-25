# ピクセル・バトラー（PIXEL BATTLER）

（はじめの仮の名前は SNAPGEAR。手元のフォルダは、2026-11-22 に `C:\Users\ucsd6\dev\snapgear` から、デスクトップの `pixelbattler` に移した）

写真を読み込むと、その写真の「いちばん特徴的なもの」をもとに SD ロボが生まれ、コマンドで戦うブラウザゲーム。
バーコードバトラーの「読み込んで、生まれて、戦う」を、3D と演出で今風にしたもの。**ストーリー**（章ごとの5連戦。勝つとロボが育つ）のほか、コンピュータの敵（9体）や、ほかの人が作ったロボ（だれかのロボ）と戦う「コンピュータと対戦」、ふたりで対戦がある。

ゲームの考え方と作りのまとめは **[docs/DESIGN.md](docs/DESIGN.md)**。ストーリーとレベルを決めたいきさつと、手下の一覧は **[docs/STORY.md](docs/STORY.md)**。

## 動かし方（PC）

```powershell
cd C:\Users\ucsd6\OneDrive\デスクトップ\pixelbattler; npm run dev
```

ブラウザで http://localhost:5180 を開く。止めるときはターミナルで Ctrl+C。

- **AIの鍵**：`.env` の `KEY_ENV_FILE` が、GEMu の `.env` を指している（鍵そのものはこのフォルダに置かない）。鍵が見つからないときは、写真の色だけからロボを作る（遊べなくはならない）
- **モデル**：既定は `gpt-6-luna`。画像を読めなかったら `gpt-4.1-mini` に切り替える。`.env` に `GAME_MODEL=...` で替えられる
- **同じ写真なら同じロボ**：AIの答えは `.cache/specs/` に写真の印（ハッシュ）ごとに残す。数値は印から機械で決める
- 同じ Wi-Fi のスマホから試すとき：`npm run dev -- --host` で起動し、表示される Network の URL を開く
- 手元では、ログインなしで写真から作れる（ログインと回数の上限は Firebase の上だけ）
- 手元で「ふたりで対戦」を試すとき：URL に `?localroom` を付けて、同じブラウザの二つのタブで開く（開発中だけ）

## Firebase に載せる（Hosting ＋ Cloud Functions）

**公開されている場所：https://pixelbattler.web.app**（2026-11-22 から。Hosting のサイト名 `pixelbattler`。`pixel-battler` はほかの人のプロジェクトが使っていた）。前の https://pixel-battler-gemu.web.app は、新しい場所へ転送するだけ（`hosting-redirect/`）。Google ログインの窓は `pixelbattler.web.app/__/auth/handler` を通す（`.env` の `VITE_FIREBASE_AUTH_DOMAIN=pixelbattler.web.app`。Google Cloud の OAuth クライアントに、この転送先を足してある）。前のサイトは念のため残す

- プロジェクト：`pixel-battler-gemu`（表示名 Pixel Battler。`pixel-battler` は使われていた）。料金プランは Blaze（従量課金）
- **画面**は Hosting、**写真を読む窓口**は Cloud Functions の `api`（東京 asia-northeast1）。同じドメインの `/api/**` が `api` に届く（`firebase.json` の rewrites）
- **鍵**は Secret Manager：`OPENAI_API_KEY`（OpenAI の鍵）と `ALLOWED_EMAILS`（家族の Gmail。カンマ区切り。家族は作れる回数が多い）と `HIDDEN_RULE`（開発者だけが知る決まり。中身はここにも書かない）。**どれもリポジトリに書かない**
- **ログイン**：**遊ぶのは Google でログインしてから**（2026-11-23 から。タイトルだけはログインなしで見られる）。**Google のアカウントならだれでも使える**（2026-11-22 から。それまでは家族だけ）
- **歯止め**（`functions/src/index.ts`）：家族は一人一日30回、家族以外は一人一日10回、家族以外の全員を合わせて一日200回。同じ写真の2回目からは、取っておいた設計図を返すので数えない。OpenAI の側にも、使える金額の上限を置いてある
- **ふたりで対戦**：Firestore の `rooms/main`（バトル）と `rooms/main/players/{uid}`（部屋にいる人。一人一枚）と `rooms/main/moves`（選んだ技）。ログインした人ならだれでも使えるが、ほかの人の分は書きかえられない（`firestore.rules`）。知らない人とも会うので、出すのはロボの名前だけ。写真は部屋に送らない
- **ガレージ**（一人30体まで。家族は100体まで。上限は `/api/garage` でサーバーに聞く）：ログインしているときは Firestore の `users/{uid}/robots/{写真の印}`（ほかのスマホでも同じ）。入れるのはサーバー（`/api/robots`。数字はサーバーが計算し直す＝`server/garage.ts`）、見る・消すのは本人だけ。ログインしていないときは、このスマホの中（localStorage）。ログインしたとき、このスマホのロボを一度だけクラウドへ移す。ガレージがいっぱいなら、AI に読ませる前に止める（409）。手元（npm run dev）では、いつもこのスマホの中
- **同じ写真なら同じロボ**：Firebase の上では、設計図を Firestore の `specs/` に取っておく（画面から Firestore は読めない＝`firestore.rules`）
- 画面用の Firebase の接続設定は `.env` の `VITE_FIREBASE_*`（`.env.example` に名前）

```powershell
cd C:\Users\ucsd6\OneDrive\デスクトップ\pixelbattler; npm run deploy
```

（画面を作る → 窓口を一つのファイルにまとめる（`functions/lib/`）→ `firebase deploy`）

家族を足すとき（今のアドレスも含めて、全部をカンマ区切りで入れ直す。入れたら `npm run deploy`。⚠️ 出し直さないと効かない）：

```powershell
cd C:\Users\ucsd6\OneDrive\デスクトップ\pixelbattler; firebase functions:secrets:set ALLOWED_EMAILS --project pixel-battler-gemu
```

## 遊び方

1. 「写真から作る」で写真を選ぶ → AIが写真を読み、ロボの姿・属性・能力の傾向・スキル・必殺技を決める
2. 「ストーリー」で章を選び、5体の敵と続けて戦う（5体目がボス）。勝ったロボに経験値が入り、レベルが上がる（Lv99 まで。成長はストーリーの中だけ）。章の画面に、有利な属性が出る
3. 「コンピュータと対戦」では、9体のどれかか、ほかの人が作ったロボ（だれかのロボ。持ち主と写真は出さない）が半分ずつ出てくる。みんな Lv1 の強さで戦う（くわしくは docs/DESIGN.md）
4. 自分の番に、四つのコマンドから選ぶ

| コマンド | 中身 |
|---|---|
| アタック | ふつうのこうげき。必殺ゲージがたまる |
| ガード＆リペア | 次の自分の番まで、受けるダメージが6割減。最大HPの8%回復（続けて使うと回復なし）。SP+15・ゲージ+10 |
| スキル | SPを使う。キャラごとに9種類のどれか（強打・連打・ドレイン・ブレイク・回復・パワーアップ・ガードアップ・のろい・カウンター）。使ったあと休みがある |
| 必殺技 | 必殺ゲージが MAX のときだけ。3倍のパワー・カットインつき。5種類の型（ビーム・スラッシュ・流星・大ばくはつ・ラッシュ） |

ほかに、**特性**（常に効く能力・10種類）と、**属性**（地・水・火・風の4すくみ＝水は火に、火は風に、風は地に、地は水に強い。光と夜はお互いに強い）がある。

## 作り

| 場所 | 中身 |
|---|---|
| `server/analyze.ts` | 写真を OpenAI に読ませて、設計図（JSON）を受け取る。**Firebase の Cloud Functions に移すときは、ここをそのまま呼ぶ** |
| `server/garage.ts`・`server/rival.ts` | ガレージに入れるロボをサーバーで組み立て直す・勝ちの知らせを確かめる／だれかのロボとして送る形にする |
| `vite.config.ts` | 開発サーバーに `/api/health`・`/api/analyze`・`/api/fix-text`・`/api/rival` を足している（鍵の読み込みもここ）。本番のファイルは、変わりにくい部品（3D・Firebase・React）を別のファイルに分ける |
| `functions/src/index.ts` | Firebase の窓口（`/api/health`・`analyze`・`robots`・`robots/fix`・`robots/win`・`garage`・`rival`）。ログインと一日の回数を確かめてから、`server/` の決まりを呼ぶ |
| `src/lib/` | `firebase.ts`＝Google ログイン、`api.ts`＝サーバーの窓口を呼ぶ（ログインの印を付ける `postApi`）、`sfx.ts`＝効果音 |
| `src/game/` | ゲームの決まり（画面と切り離した計算）。`battle.ts`＝バトル、`stats.ts`＝数値、`data.ts`＝スキル・特性・属性の表、`level.ts`＝レベルと経験値、`story.ts`＝章の中身、`progress.ts`＝ストーリーの進み具合（サーバーも使う）、`minions.ts`＝手下36体、`thinkers.ts`＝10章から先の人物、`cpu.ts`＝コンピュータの敵と考え方、`garage.ts`＝ガレージ |
| `src/three/` | 3D。`robot.ts`＝部品を組むロボとポーズ、`stage.ts`＝バトル場と演出、`effects.ts`＝光・ビーム・斬撃 |
| `src/ui/` | 画面（タイトル・あそびかた・作成・ガレージ・ストーリー・バトル・部屋） |
| `scripts/` | `sim.ts`＝釣り合いの確かめ（`npm run sim`）、`tune-minions.ts`＝手下の強さ合わせ（`npm run tune:minions`）、`battle-lib.ts`＝その二つの共通の部品、`check-kanji.mjs`＝習わない漢字の点検 |

### 決めたこと

- **AIには選ばせるだけ、数字は機械が決める**：AIが選ぶのは名前・見た目の部品・色・属性・スキルの種類・能力の傾向（1〜5）。HP・攻撃などの数値とスキルの威力は、写真の印と表から機械で決める（強すぎるキャラが出ないように）
- **プラモ方式の3D**：部品（頭6種・胴3・腕3・脚3・背中5・武器7）を組み合わせて色を塗る。いまは、どのロボも素手で戦う（武器・腕の刃・背中の大砲は外して見せる。あとで入れるアイテムの準備。`src/game/items.ts`）。関節（骨組み）を持っているので、ポーズで動かせる
- **体の形は三つ**：人型（humanoid）・四つ足の獣型（beast）・浮遊型（floater）。AIが写真のモチーフに合わせて選ぶ。どの形も頭を大きくした SD の比率。体の形はステータスに影響しない（見た目と動きだけ）
- **ランク**：総合力が写真ごとに ±8% ゆれる（S/A/B/C）。バーコードバトラーの「強いバーコード」の楽しみ
- 釣り合い（2026-11-23）：コンピュータの敵へのランダムなロボの勝率 約50%（敵ごとに 47〜53%）・1戦あたり約17行動・必殺技は1戦に約3回。ストーリーの通しの遊び方も `npm run sim` で確かめる

## これから（MVPの先）

- ストーリーの11章から先・節目のごほうび・マイページ・アイテム（docs/STORY.md の「まだ決めていないこと」）
- 写真から3Dモデルを作るサービスとの組み合わせ（見た目の自由度を上げる）

## 小学6年生向けの言葉

メインの遊び手は小学6年生。画面の言葉・キャラ名・技名は、**小学校で習う漢字（1026字）だけ**で書き、ほかはひらがな・カタカナにする。

- 字の表：`src/game/kanji.ts`（学年別漢字配当表）
- 画面の言葉の点検：`npm run check:kanji`（コメントとAIへの指示は数えない）
- AIが作る名前：指示に書いたうえで、習わない漢字が入っていたら、その字を名指しして一度だけ作り直す（`server/analyze.ts`）
- 指示を大きく変えたら、`server/analyze.ts` の `CACHE_VERSION` を上げる（同じ写真でも、前の指示の設計図を返さないため）
