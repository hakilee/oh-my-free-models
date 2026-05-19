<p align="center">
  <img src="../oh-my-free-models-character.png" height="96" alt="oh-my-free-models character" />
</p>

# oh-my-free-models

[English](../README.md) | [한국어](./README.ko.md) | 简体中文 | [繁體中文](./README.zh-TW.md) | [日本語](./README.ja.md)

`oh-my-free-models`（`omfm`）是一个本地代理，能把你的编程 Agent 路由到多个 provider 中当前最快的免费模型。把 OpenAI 或 Anthropic 兼容 Agent 的 baseURL 指向 `localhost`，选好几个免费模型，`omfm` 就会在 latency、rate-limit、quota 不断变化的情况下持续把请求送出去。

https://github.com/user-attachments/assets/44c07928-1544-4b33-a472-41e82f7aa7d7

> `omfm` 驱动 OpenCode 在路由后的免费模型上运行的演示。

## 为什么需要它

免费的编程 Agent 看起来很美，用起来漏洞百出。实际会卡在四个地方：

**Rate limit 在任务中途把你掐断。** OpenRouter 或 NVIDIA 上的免费模型会在毫无预兆的情况下返回 429。一次顺畅的运行会因为一个工具调用卡死，然后只能手动重试。

**Latency 每个小时都在漂移。** 同一个免费模型早上跑得飞快，下午慢到没法用。没有“最快的模型”这种说法，只有“此刻最快的模型”。

**Quota 耗尽之后只能手动换 provider。** 一个 provider 的免费 quota 用完，你得自己去改 API key 和 baseURL。Agent 不会自己适应。

**免费模型目录时常翻新。** 模型会出现、消失、被标记为 deprecated，或者悄悄开始返回错误。不是仪表盘会告诉你，而是撞墙了才知道。

## omfm 是怎么解决的

你给 `omfm` 一份你想用的免费模型 allowlist，它跑在 `http://localhost:4567` 上作为本地代理，并在后台处理这些工作。

| 功能 | 处理方式 |
| --- | --- |
| Latency 跟踪 | 从你的机器测量并缓存每个模型的 latency。 |
| 请求路由 | 把未指定模型的请求路由到当前 latency 最低的可用候选。 |
| Cooldown | 刚触发 429 或 402 的模型冷却约 10 分钟，不再作为候选。 |
| 客户端兼容 | 暴露 OpenAI 兼容的 `/v1` 和 Anthropic 兼容的 `/anthropic` 入口，并支持 Anthropic tool-use fallback 与本地 token count。 |

Agent 只管盯着 `localhost`。provider 切换、rate-limit 重试、选出当前最快的模型，这些都在它下面静悄悄地发生。

## 申请 API key

`omfm` 只负责转发流量。你需要自己从一个或两个 provider 申请 key。

**OpenRouter** — 在 [openrouter.ai](https://openrouter.ai) 注册后，到 Keys 菜单里签发 key（prefix `sk-or-`）。`:free` 模型每天最多 50 次请求；充值至少 $10 的 credit 后，上限会提高到每天 1,000 次。免费额度不需要绑定信用卡。

**NVIDIA** — 在 [build.nvidia.com](https://build.nvidia.com)（NVIDIA Developer Program）注册后，在任意模型卡片上点击 "Get API Key" 即可签发（prefix `nvapi-`）。不需要绑定信用卡；rate-limit 按模型分别计算。

把你手上的 key 写进 `~/.oh-my-free-models/.env`，`omfm` 只会使用设置了 key 的 provider。

## 30 秒上手

```bash
npm install -g oh-my-free-models
mkdir -p ~/.oh-my-free-models && echo 'OPENROUTER_API_KEY=sk-or-...' > ~/.oh-my-free-models/.env
omfm model        # 在 picker 里选几个免费模型
omfm start        # 启动 http://localhost:4567
```

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `omfm model` | 打开 picker 并保存选中的免费模型。 |
| `omfm model --all` | 不打开 picker，直接列出全部可选模型。 |
| `omfm model --no-tui` | 不打开 TUI，直接输出静态模型表。 |
| `omfm model --group fast --best` | Probe fast 组并输出当前最佳候选。 |
| `omfm start` | 在前台运行本地代理，并输出 request/response 路由日志。 |
| `omfm start --daemon` | 在后台以 daemon 方式运行本地代理。 |
| `omfm status` | 查看 daemon、config 和 best-route 状态。 |
| `omfm stop` | 停止后台 daemon。 |
| `omfm doctor` | 检查 config 路径、密钥、模型缓存和 daemon 状态。 |
| `omfm usage` | 查看每个模型的请求数和 token 观测值。 |

## 在你的 Agent 中使用

OpenAI 兼容客户端（OpenCode、Hermes Agent、OpenClaw 等）：

```text
url=http://localhost:4567/v1
model=omfm             # 整个池；或 omfm/fast, omfm/balanced, omfm/capable
```

Anthropic 兼容客户端（Claude Code 等）：

```bash
export ANTHROPIC_BASE_URL=http://localhost:4567/anthropic
export ANTHROPIC_AUTH_TOKEN=omfm-local
export ANTHROPIC_API_KEY=
```

Claude Code 的模型别名也可以指向 `omfm` 的模型组：

```bash
alias freeclaude='ANTHROPIC_BASE_URL=http://localhost:4567/anthropic ANTHROPIC_AUTH_TOKEN=omfm-local ANTHROPIC_API_KEY= CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 ANTHROPIC_DEFAULT_OPUS_MODEL=omfm/capable ANTHROPIC_DEFAULT_SONNET_MODEL=omfm/balanced ANTHROPIC_DEFAULT_HAIKU_MODEL=omfm/fast claude'
```

不带前缀的 `omfm` 会在整个已选池中路由；`omfm/capable`、`omfm/balanced`、`omfm/fast` 则会过滤到对应的模型组。Claude 风格的别名 `opus`、`sonnet`、`haiku` 也会映射到这些组。你也可以直接传入 `omfm model` 中选中的具体模型 ID，把请求钉死在那个模型上。

Anthropic 入口还提供本地 `count_tokens` 估算；当请求 fallback 到 OpenAI 兼容 provider 路由时，会翻译常见的 tool-use/tool-result 流程。

## 保持上下文窗口大小一致

上下文溢出确实可能发生。`omfm` 会把请求原样转发给被路由到的模型；它不会压缩、总结或截断 Agent 已累积的对话。如果一个长会话一开始使用 1M token 的模型，之后又被路由或故障切换到 128k/200k 的模型，那么一旦提示内容超过较小模型的上下文窗口，上游就可能拒绝请求。客户端侧的压缩/总结可以避免这个问题，但不要假设它一定会自动发生。

选择模型时，请让每个可路由的模型池保持在同一档上下文容量。例如，如果长会话使用 `capable`，就只把约 1M token 的模型放进该组；或者让 `fast`/`balanced`/`capable` 都维持在 128k/200k 左右。`omfm model` 选择器会显示每个模型的上下文大小；未知值会显示为未知标记，长会话应将其视为风险。

## 更多

- 安装、全部 CLI 参数、daemon 控制、诊断：[INSTALLATION.zh-CN.md](./INSTALLATION.zh-CN.md)
- 路由内部机制：[docs/latency-routing.md](./latency-routing.md)
- Provider 目录：[docs/provider-guide.md](./provider-guide.md)
- 许可证：[MIT](../LICENSE.md)
