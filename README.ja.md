<p align="center">
  <img src="./oh-my-free-models-character.png" height="96" alt="oh-my-free-models character" />
</p>

# oh-my-free-models

[English](./README.md) | [한국어](./README.ko.md) | [简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md) | 日本語

`oh-my-free-models`（`omfm`）は、コーディング agent を複数の provider の中で今一番速い free モデルへルーティングするローカルプロキシです。OpenAI または Anthropic 互換の agent の baseURL を `localhost` に向け、free モデルをいくつか選んでおくだけで、latency・rate-limit・quota が揺れ動いても `omfm` がリクエストを流し続けます。

## なぜ必要か

Free tier のコーディング agent はスペック上は魅力的に見えて、実際に動かすと四つの箇所で詰まります。

**Rate limit が作業の途中で止めてきます。** OpenRouter や NVIDIA の free モデルは 429 を予告なしに返します。うまく走っていた実行がツール呼び出し一回で止まり、手動でやり直すことになります。

**Latency は時間帯で大きく変わります。** 同じ free モデルが午前中は速く、午後には使い物にならないほど遅くなります。「速いモデル」は固定できません。「今この瞬間に速いモデル」があるだけです。

**Quota が尽きたら provider を手で切り替えるしかありません。** ある provider の free quota が切れると、API キーと baseURL を自分で書き換える必要があります。agent がその変化に自動で追従することはありません。

**Free モデルのカタログは頻繁に変わります。** モデルが追加され、消え、deprecated になり、静かにエラーを返し始めます。ダッシュボードが教えてくれるのではなく、壁にぶつかって初めて気づきます。

## omfm がやってくれること

使いたい free モデルの allowlist を `omfm` に渡すと、`http://localhost:4567` でローカルプロキシとして動き始め、内部でこれらを処理します。

- 自分のマシンからモデルごとの latency を計測してキャッシュ
- モデル未指定のリクエストを、今一番 latency が低い生きている候補へルーティング
- 直前に 429 や 402 を受けたモデルは約 10 分間候補から外す — agent が同じ壁に二度ぶつからないように
- OpenAI 互換（`/v1`）と Anthropic 互換（`/anthropic`）の両エンドポイントを同時に公開 — drop-in クライアントはコード変更なしで接続可能

agent は `localhost` だけを見ていれば OK。provider の切り替え、rate-limit 後のリトライ、「今速いモデル」の選択はその下で静かに行われます。

## 30 秒で試す

```bash
npm install -g oh-my-free-models
mkdir -p ~/.oh-my-free-models && echo 'OPENROUTER_API_KEY=sk-or-...' > ~/.oh-my-free-models/.env
omfm model        # picker で free モデルをいくつか選ぶ
omfm start        # http://localhost:4567 を起動
```

## あなたの agent から使う

OpenAI 互換クライアント（OpenCode、Hermes Agent、OpenClaw など）:

```text
baseURL=http://localhost:4567/v1
```

Anthropic 互換クライアント（Claude Code など）:

```bash
export ANTHROPIC_BASE_URL=http://localhost:4567/anthropic
export ANTHROPIC_AUTH_TOKEN=omfm-local
export ANTHROPIC_API_KEY=
```

## もっと知る

- セットアップ、全 CLI フラグ、daemon 制御、診断: [INSTALLATION.ja.md](./INSTALLATION.ja.md)
- ルーティングの内部動作: [docs/latency-routing.md](./docs/latency-routing.md)
- Provider カタログ: [docs/provider-guide.md](./docs/provider-guide.md)
