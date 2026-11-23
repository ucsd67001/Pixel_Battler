# ピクセル・バトラー（PIXEL BATTLER）

（はじめの仮の名前は SNAPGEAR。手元のフォルダは、2026-11-22 に `C:\Users\ucsd6\dev\snapgear` から、デスクトップの `pixelbattler` に移した）

写真を読み込むと、その写真の「いちばん特徴的なもの」をもとに SD ロボが生まれ、コンピュータと戦うブラウザゲーム。
バーコードバトラーの「読み込んで、生まれて、戦う」を、3D と演出で今風にしたもの。コンピュータの敵（9体）や、ほかの人が作ったロボ（だれかのロボ）と戦うほか、ふたりで対戦もできる。

ゲームの考え方と作りのまとめは **[docs/DESIGN.md](docs/DESIGN.md)**。

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
- **ログイン**：写真から作るときと、ふたりで対戦のときに Google でログイン。**Google のアカウントならだれでも使える**（2026-11-22 から。それまでは家族だけ）。コンピュータとのバトルと格納庫は、ログインなしで遊べる
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
2. 「コンピュータと対戦」で戦うロボを選び、コンピュータの敵と戦う。敵は、9体のどれかか、ほかの人が作ったロボ（だれかのロボ。持ち主と写真は出さない）が半分ずつ（くわしくは docs/DESIGN.md）
3. 自分の番に、四つのコマンドから選ぶ

| コマンド | 中身 |
|---|---|
| アタック | ふつうのこうげき。必殺ゲージがたまる |
| ガード＆リペア | 次の自分の番まで、受けるダメージが6割減。最大HPの8%回復（続けて使うと回復なし）。SP+15・ゲージ+10 |
| スキル | SPを使う。キャラごとに9種類のどれか（一撃・連撃・吸収・破砕・回復・強化・鉄壁・呪縛・反撃）。使ったあと休みがある |
| 必殺技 | 必殺ゲージ（OD）が MAX のときだけ。威力3倍・カットインつき。5種類の演出（ビーム・一閃・流星・爆発・乱舞） |

ほかに、**特性**（常に効く能力・8種類）と、**属性**（炎→森→水→炎 の三すくみ、光と闇はお互いに強い）がある。

## 作り

| 場所 | 中身 |
|---|---|
| `server/analyze.ts` | 写真を OpenAI に読ませて、設計図（JSON）を受け取る。**Firebase の Cloud Functions に移すときは、ここをそのまま呼ぶ** |
| `vite.config.ts` | 開発サーバーに `/api/analyze` と `/api/health` を足している（鍵の読み込みもここ） |
| `functions/src/index.ts` | Firebase の窓口。ログインと家族の許可・一日の回数を確かめてから `server/analyze.ts` を呼ぶ |
| `src/lib/firebase.ts` | Google ログイン |
| `src/game/` | ゲームの決まり（画面と切り離した計算）。`battle.ts`＝バトル、`stats.ts`＝数値、`data.ts`＝スキル・特性の表、`cpu.ts`＝CPUのキャラと考え方 |
| `src/three/` | 3D。`robot.ts`＝部品を組むロボとポーズ、`stage.ts`＝バトル場と演出、`effects.ts`＝光・ビーム・斬撃 |
| `src/ui/` | 画面（タイトル・作成・格納庫・バトル） |
| `scripts/sim.ts` | 釣り合いの確かめ：`npm run sim` で4000戦して勝率を出す |

### 決めたこと

- **AIには選ばせるだけ、数字は機械が決める**：AIが選ぶのは名前・見た目の部品・色・属性・スキルの種類・能力の傾向（1〜5）。HP・攻撃などの数値とスキルの威力は、写真の印と表から機械で決める（強すぎるキャラが出ないように）
- **プラモ方式の3D**：部品（頭6種・胴3・腕3・脚3・背中5・武器7）を組み合わせて色を塗る。いまは、どのロボも素手で戦う（武器・腕の刃・背中の大砲は外して見せる。あとで入れるアイテムの準備。`src/game/items.ts`）。関節（骨組み）を持っているので、ポーズで動かせる
- **体の形は三つ**：人型（humanoid）・四つ足の獣型（beast）・浮遊型（floater）。AIが写真のモチーフに合わせて選ぶ。どの形も頭を大きくした SD の比率。獣型の武器は角・背中の砲・尾の槌・肩の盾・前足の爪・牙に、浮遊型は体のまわりに浮かぶ両手で持つ。体の形はステータスに影響しない（見た目と動きだけ）
- **ランク**：総合力が写真ごとに ±8% ゆれる（S/A/B/C）。バーコードバトラーの「強いバーコード」の楽しみ
- 釣り合い（2026-11-22）：ランダムなキャラの勝率 約50%・1戦あたり約15行動・必殺技は1戦に2〜3回

## これから（MVPの先）

- プレイヤー同士・いろいろなCPU
- 写真から3Dモデルを作るサービスとの組み合わせ（見た目の自由度を上げる）

## 小学6年生向けの言葉

メインの遊び手は小学6年生。画面の言葉・キャラ名・技名は、**小学校で習う漢字（1026字）だけ**で書き、ほかはひらがな・カタカナにする。

- 字の表：`src/game/kanji.ts`（学年別漢字配当表）
- 画面の言葉の点検：`npm run check:kanji`（コメントとAIへの指示は数えない）
- AIが作る名前：指示に書いたうえで、習わない漢字が入っていたら、その字を名指しして一度だけ作り直す（`server/analyze.ts`）
- 指示を大きく変えたら、`server/analyze.ts` の `CACHE_VERSION` を上げる（同じ写真でも、前の指示の設計図を返さないため）
