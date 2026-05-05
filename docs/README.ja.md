<p align="center">
  <img src="../oh-my-free-models-character.png" height="96" alt="oh-my-free-models character" />
</p>

# oh-my-free-models

[English](../README.md) | [한국어](./README.ko.md) | [简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md) | 日本語

`oh-my-free-models`（`omfm`）は、コーディング agent を複数の provider の中で今一番速い free モデルへルーティングするローカルプロキシです。OpenAI または Anthropic 互換の agent の baseURL を `localhost` に向け、free モデルをいくつか選んでおくだけで、latency・rate-limit・quota が揺れ動いても `omfm` がリクエストを流し続けます。

https://github.com/user-attachments/assets/44c07928-1544-4b33-a472-41e82f7aa7d7

> `omfm` が OpenCode をルーティングされた free モデルに繋いで動かしているデモ。

## なぜ必要か

Free tier のコーディング agent はスペック上は魅力的に見えて、実際に動かすと四つの箇所で詰まります。

**Rate limit が作業の途中で止めてきます。** OpenRouter や NVIDIA の free モデルは 429 を予告なしに返します。うまく走っていた実行がツール呼び出し一回で止まり、手動でやり直すことになります。

**Latency は時間帯で大きく変わります。** 同じ free モデルが午前中は速く、午後には使い物にならないほど遅くなります。「速いモデル」は固定できません。「今この瞬間に速いモデル」があるだけです。

**Quota が尽きたら provider を手で切り替えるしかありません。** ある provider の free quota が切れると、API キーと baseURL を自分で書き換える必要があります。agent がその変化に自動で追従することはありません。

**Free モデルのカタログは頻繁に変わります。** モデルが追加され、消え、deprecated になり、静かにエラーを返し始めます。ダッシュボードが教えてくれるのではなく、壁にぶつかって初めて気づきます。

## omfm がやってくれること

使いたい free モデルの allowlist を `omfm` に渡すと、`http://localhost:4567` でローカルプロキシとして動き始め、内部で次の仕事を処理します。

| 機能 | 処理内容 |
| --- | --- |
| Latency 追跡 | 自分のマシンからモデルごとの latency を計測してキャッシュします。 |
| リクエストルーティング | モデル未指定のリクエストを、今一番 latency が低い生きている候補へルーティングします。 |
| Cooldown | 直前に 429 や 402 を受けたモデルは約 10 分間候補から外します。 |
| クライアント互換性 | OpenAI 互換の `/v1` と Anthropic 互換の `/anthropic` エンドポイントを公開し、Anthropic tool-use fallback とローカル token count もサポートします。 |

agent は `localhost` だけを見ていれば OK。provider の切り替え、rate-limit 後のリトライ、「今速いモデル」の選択はその下で静かに行われます。

## 30 秒で試す

```bash
npm install -g oh-my-free-models
mkdir -p ~/.oh-my-free-models && echo 'OPENROUTER_API_KEY=sk-or-...' > ~/.oh-my-free-models/.env
omfm model        # picker で free モデルをいくつか選ぶ
omfm start        # http://localhost:4567 を起動
```

## よく使うコマンド

| コマンド | 用途 |
| --- | --- |
| `omfm model` | picker を開き、選択した free モデルを保存します。 |
| `omfm model --all` | picker を開かずに、選択可能な全モデルを表示します。 |
| `omfm model --group fast --best` | fast グループを probe し、現在の最良候補を表示します。 |
| `omfm start` | ローカルプロキシを foreground で起動し、request/response ルーティングログを出力します。 |
| `omfm start --daemon` | ローカルプロキシを background daemon として起動します。 |
| `omfm status` | daemon、config、best-route の状態を表示します。 |
| `omfm stop` | background daemon を停止します。 |
| `omfm doctor` | config パス、キー、モデルキャッシュ、daemon 状態を確認します。 |
| `omfm usage` | モデルごとの request 数と token 観測値を表示します。 |

## あなたの agent から使う

OpenAI 互換クライアント（OpenCode、Hermes Agent、OpenClaw など）:

```text
url=http://localhost:4567/v1
model=omfm             # プール全体; または omfm/fast, omfm/balanced, omfm/capable
```

Anthropic 互換クライアント（Claude Code など）:

```bash
export ANTHROPIC_BASE_URL=http://localhost:4567/anthropic
export ANTHROPIC_AUTH_TOKEN=omfm-local
export ANTHROPIC_API_KEY=
```

Claude Code のモデルエイリアスを `omfm` のモデルグループに割り当てることもできます:

```bash
alias freeclaude='ANTHROPIC_BASE_URL=http://localhost:4567/anthropic ANTHROPIC_AUTH_TOKEN=omfm-local ANTHROPIC_API_KEY= CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 ANTHROPIC_DEFAULT_OPUS_MODEL=omfm/capable ANTHROPIC_DEFAULT_SONNET_MODEL=omfm/balanced ANTHROPIC_DEFAULT_HAIKU_MODEL=omfm/fast claude'
```

プレフィックスなしの `omfm` は選択されたプール全体にルーティングされ、`omfm/capable`、`omfm/balanced`、`omfm/fast` はそれぞれ対応するモデルグループにフィルターします。Claude 形式のエイリアスである `opus`、`sonnet`、`haiku` も同じグループにマッピングされます。`omfm model` で選んだ具体的なモデル ID をそのまま渡すと、そのモデルに固定されます。

Anthropic surface はローカルの `count_tokens` 推定にも対応します。リクエストが OpenAI 互換 provider route に fallback する場合は、一般的な tool-use/tool-result の流れも変換します。

## コンテキストサイズを揃える

コンテキストオーバーフローは実際に起こり得ます。`omfm` はリクエストをルーティング先のモデルへそのまま転送します。agent が蓄積した会話をコンパクト化、要約、切り詰めることはありません。長時間のセッションが 1M-token モデルで始まり、その後 128k/200k モデルへルーティングまたは failover されると、prompt が小さいモデルの context window を超えた時点で上流プロバイダーがリクエストを拒否する可能性があります。クライアント側のコンパクションで避けられる場合はありますが、常に自動で起きるとは考えないでください。

モデルを選ぶときは、ルーティング対象のプールごとに、コンテキスト長の階層を揃えてください。たとえば長時間のセッションを `capable` で使うなら、そのグループには ~1M-token モデルだけを入れるか、`fast`/`balanced`/`capable` 全体を 128k/200k 前後に揃えます。`omfm model` picker は各モデルの context サイズを表示します。値が不明な場合は不明マーカーとして表示されます。長時間のセッションではリスクとして扱ってください。

## もっと知る

- セットアップ、全 CLI フラグ、daemon 制御、診断: [INSTALLATION.ja.md](./INSTALLATION.ja.md)
- ルーティングの内部動作: [docs/latency-routing.md](./latency-routing.md)
- Provider カタログ: [docs/provider-guide.md](./provider-guide.md)
- ライセンス: [MIT](../LICENSE.md)
