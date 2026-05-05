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

Picker 表示は次のとおりです。

| 表示 | 意味 |
| --- | --- |
| `▶` | 現在ハイライトされている行です。 |
| `●` | 選択済みモデルです。 |
| `○` | 未選択モデルです。 |

Picker のキー操作は次のとおりです。

| キー | 操作 |
| --- | --- |
| `Tab`、`Left`/`Right`、`h`/`l`、または `[`/`]` | 上部タブ（`All`、`Fast`、`Balanced`、`Capable`）を切り替えます。 |
| `Up`/`Down` または `j`/`k` | カーソルを移動します。 |
| `Space` | 選択を切り替えます。 |
| `Enter` | 保存します。 |
| `q` または `Esc` | キャンセルします。 |

`All` タブはグローバルなルーティング候補リストを管理します。グループタブではモデルを `fast`、`balanced`、`capable` に割り当てます。グループでモデルを選ぶと、そのモデルは `All` の候補にも自動的に残ります。保存された選択は表示順のまま維持されます。latency 情報がまだない場合、この順序が決定的な fallback として使われます。

Latency probe は小規模な並列バッチで実行され、ペースは控えめに保たれます。`rate-limit` 応答は該当モデルの行にのみ反映され、残りの probe は継続されます。`quota`/支払いに関するエラーが返ると、まだ開始していない probe は中断されますが、キャッシュ済みの latency は上書きされません。

stdout が TTY でない場合、`omfm model` は ANSI エスケープなしの静的なテーブルを出力し、probe は実行しません。必要に応じて次の非対話コマンドを使います。

| コマンド | 用途 |
| --- | --- |
| `omfm model --all` | 選択可能な全モデルを表示します。 |
| `omfm model --select google/gemini-2.0-flash-exp:free,meta-llama/llama-3.2-3b-instruct:free` | 明示的な選択モデルリストを保存します。 |
| `omfm model --group fast --select google/gemini-2.0-flash-exp:free` | 特定グループのモデルリストを保存します。 |
| `omfm model --group capable --best` | グループを probe して最良候補を表示します。 |
| `omfm model --json` | モデル行を JSON で表示します。 |
| `omfm model --best` | 選択済みモデルを probe して最良候補を表示します。 |
| `omfm model --best --json` | 最良候補を JSON で表示します。 |

`--group fast|balanced|capable` を使うと、coding-agent の mode ごとに別々のモデルプールを管理できます。`omfm/fast`、`omfm/balanced`、`omfm/capable` のリクエストはそのグループ内でルーティングされ、`haiku`、`sonnet`、`opus` も覚えやすい alias として扱われます。

## 4. ローカルプロキシの起動

プロキシの実行方法に合わせてコマンドを選びます。

| コマンド | 用途 |
| --- | --- |
| `omfm start` | プロキシを foreground で起動します。`Ctrl+C` で停止します。 |
| `omfm start --daemon` | プロキシを background daemon として起動します。 |
| `omfm status` | daemon 状態を表示します。 |
| `omfm stop` | background daemon を停止します。 |

プロキシの実行中は、選択済みモデルの latency を約 5 分ごとに控えめなバックグラウンド probe バッチで更新します。Probe は picker と同じ cooldown ルールを使います。

デフォルトのポートは `4567` です。必要に応じて変更できます。

| コマンド | 用途 |
| --- | --- |
| `omfm start --port 4600` | プロキシを `4600` ポートで起動します。 |

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

| コマンド | 用途 |
| --- | --- |
| `omfm doctor` | config パス、provider キーの取得元、選択済みモデル数、キャッシュ済みモデル数、daemon 状態を出力します。 |
| `omfm usage` | モデルごとの request 数と利用可能な token 合計を出力します。 |
| `omfm usage --json` | usage 観測値を JSON で出力します。 |

`doctor` は設定を変更しません。Streaming リクエストは `usage` の request 数に含まれますが、stream passthrough では通常 token 合計を取得できません。

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

`omfm` 自体を開発するには、次のコマンドを使います。

| コマンド | 用途 |
| --- | --- |
| `git clone https://github.com/hakilee/oh-my-free-models` | リポジトリを clone します。 |
| `cd oh-my-free-models` | プロジェクトディレクトリに移動します。 |
| `npm install` | 依存関係をインストールします。 |
| `npm test` | テスト全体を実行します。 |
| `npm run typecheck` | TypeScript の型チェックを実行します。 |
| `npm run build` | `dist` をビルドします。 |
