# インストールと設定

[English](./INSTALLATION.md) | [한국어](./INSTALLATION.ko.md) | [简体中文](./INSTALLATION.zh-CN.md) | [繁體中文](./INSTALLATION.zh-TW.md) | 日本語

`oh-my-free-models`（`omfm`）のインストールから provider キーの設定、モデル選択、ローカルプロキシの起動、クライアント接続まで順番に説明します。プロジェクトの目的と背景は [README.ja.md](./README.ja.md) を参照してください。

## 1. インストール

```bash
npm install -g oh-my-free-models
```

インストール時にバックグラウンドプロセスが自動で立ち上がることは**ありません**。使いたいときに自分で起動してください。

Node.js 20 以上が必要です。

## 2. Provider API キーの設定

`omfm` は provider キーを次の順序で読み込みます。

1. プロセスまたはグローバル環境の `OPENROUTER_API_KEY` / `NVIDIA_API_KEY`
2. `~/.oh-my-free-models/.env`

`~/.oh-my-free-models/.env` の記述例:

```bash
OPENROUTER_API_KEY=sk-or-...
NVIDIA_API_KEY=nvapi-...
```

キーが設定されている provider だけが使われます。

## 3. モデルの選択

```bash
omfm model
```

対話型ターミナルで実行するとモデル picker が開きます。各行に provider、モデル名、context サイズ、latency（キャッシュ値または計測値）、推奨度、probe ステータスが表示されます。並び順は現在の選択状態 → health・推奨 → キャッシュ済み latency → provider カタログ順位の優先度で、良い候補が上に来ます。

Picker の表示記号:

- `▶` — 現在のカーソル位置、ハイライト表示
- `●` — 選択済み
- `○` — 未選択

Picker のキー操作:

- `Tab`、`Left`/`Right`、`h`/`l`、または `[`/`]` — 上部タブ（`All`、`Fast`、`Balanced`、`Capable`）を切り替える
- `Up`/`Down` または `j`/`k` — 移動
- `Space` — 選択のトグル
- `Enter` — 保存
- `q` または `Esc` — キャンセル

`All` タブはグローバルなルーティング候補リストを管理します。グループタブではモデルを `fast`、`balanced`、`capable` に割り当てます。グループでモデルを選ぶと、そのモデルは `All` の候補にも自動的に残ります。保存された選択は表示順のまま維持されます。latency 情報がまだない場合、この順序が決定的な fallback として使われます。

Latency probe は小規模な並列バッチで実行され、ペースは控えめに保たれます。`rate-limit` 応答は該当モデルの行にのみ反映され、残りの probe は継続されます。`quota`/支払いに関するエラーが返ると、まだ開始していない probe は中断されますが、キャッシュ済みの latency は上書きされません。

stdout が TTY でない場合、`omfm model` は ANSI エスケープなしの静的なテーブルを出力し、probe は実行しません。非対話モードのオプション:

```bash
omfm model --all
omfm model --select google/gemini-2.0-flash-exp:free,meta-llama/llama-3.2-3b-instruct:free
omfm model --group fast --select google/gemini-2.0-flash-exp:free
omfm model --group capable --best
omfm model --json
omfm model --best
omfm model --best --json
```

`--group fast|balanced|capable` を使うと、coding-agent の mode ごとに別々のモデルプールを管理できます。`omfm/fast`、`omfm/balanced`、`omfm/capable` のリクエストはそのグループ内でルーティングされ、`haiku`、`sonnet`、`opus` も覚えやすい alias として扱われます。

## 4. ローカルプロキシの起動

フォアグラウンドモード（`Ctrl+C` で終了）:

```bash
omfm start
```

バックグラウンド daemon モード:

```bash
omfm start --daemon
omfm status
omfm stop
```

プロキシの実行中は、選択済みモデルの latency を約 5 分ごとに控えめなバックグラウンド probe バッチで更新します。Probe は picker と同じ cooldown ルールを使います。

デフォルトのポートは `4567` です。`--port` で変更できます。

```bash
omfm start --port 4600
```

## 5. クライアント接続

mode ごとにモデルを指定できるクライアントでは、`omfm/fast`、`omfm/balanced`、`omfm/capable` を使えます。`haiku`、`sonnet`、`opus` はこの 3 つのグループの alias として扱われます。

### OpenAI 互換クライアント

OpenCode、Hermes Agent、OpenClaw などの OpenAI 互換クライアントには次のように設定します。

```text
baseURL=http://localhost:4567/v1
```

`0.0.1` で必要なエンドポイント:

- `GET /v1/models`
- `POST /v1/chat/completions`

### Anthropic 互換クライアント（Claude Code）

次の環境変数を設定します。

```bash
export ANTHROPIC_BASE_URL=http://localhost:4567/anthropic
export ANTHROPIC_AUTH_TOKEN=omfm-local
export ANTHROPIC_API_KEY=
```

`0.0.1` で必要なエンドポイント:

- `POST /anthropic/v1/messages`
- `POST /anthropic/messages`（alias）

`omfm` はローカルの Anthropic 認証ヘッダーを受け取り、選択されたモデルに合った provider キーでリクエストを転送します。provider が自前の Anthropic 互換エンドポイントを持っている場合（例: OpenRouter の Anthropic surface）はそちらを優先し、そうでなければテキスト限定の Anthropic→OpenAI 変換へ fallback します。

## 6. 診断

```bash
omfm doctor
omfm usage
omfm usage --json
```

`doctor` は config のパス、provider キーの取得元、選択済みモデル数、キャッシュ済みモデル数、daemon の状態を表示します。設定の変更は一切行いません。

`usage` はモデルごとのリクエスト数、成功/失敗数、non-streaming provider レスポンスから観測できた token 合計を表示します。Streaming リクエストは件数に含まれますが、stream passthrough では通常 token 合計を取得できません。

## 7. ルーティングと latency のルール

- `omfm model` で選択したモデルだけがルーティング対象になります。
- リクエストにモデル名が指定されている場合、`omfm` はそのモデルへ直接ルーティングします。provider プレフィックス付きのローカルモデル ID は、対応する upstream モデル ID としても認識されます。
- モデル名がない、または不明な名前の場合は、ローカルで計測した latency が最も低い選択済みモデルへルーティングします。
- グループモデル名（`omfm/fast`、`omfm/balanced`、`omfm/capable`、および `haiku`/`sonnet`/`opus`）は、そのグループに選択済みモデルがある場合、そのグループ内だけでルーティングします。空のグループは選択済みモデル全体へ fallback します。
- rate-limit（HTTP 429）または quota（HTTP 402）が発生したモデルは約 10 分間候補から外れます。選択済みモデルがすべて cooling 状態のときは、latency 順の全リストへ fallback してリクエストを継続します。
- リクエストが成功すると、ローカルの latency キャッシュを更新します。
- `omfm start` はプロキシの実行中にも、選択済みモデルの latency をバックグラウンドで更新します。
- latency 情報がない場合は、picker で保存した選択順へ fallback します。picker と `omfm model --all` は推奨順でそのまま保存します。
- `0.0.1` では hosted latency サービスは使用しません。

## 8. 開発

`omfm` 自体を開発するには:

```bash
git clone https://github.com/hakilee/oh-my-free-models
cd oh-my-free-models
npm install
npm test
npm run typecheck
npm run build
```
