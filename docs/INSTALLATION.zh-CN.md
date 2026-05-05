# 安装与配置

[English](./INSTALLATION.md) | [한국어](./INSTALLATION.ko.md) | 简体中文 | [繁體中文](./INSTALLATION.zh-TW.md) | [日本語](./INSTALLATION.ja.md)

本文依次介绍 `oh-my-free-models`（`omfm`）的安装、provider 密钥配置、模型选择、本地代理启动与客户端接入。项目的目的和背景见 [README.zh-CN.md](./README.zh-CN.md)。

## 1. 安装

```bash
npm install -g oh-my-free-models
```

安装时**不会**自动启动后台进程。需要用的时候再手动启动。

需要 Node.js 20 或更高版本。

## 2. 配置 provider API key

`omfm` 按以下顺序读取 provider 密钥：

1. 进程或全局环境变量中的 `OPENROUTER_API_KEY` / `NVIDIA_API_KEY`
2. `~/.oh-my-free-models/.env`

`~/.oh-my-free-models/.env` 示例：

```bash
OPENROUTER_API_KEY=sk-or-...
NVIDIA_API_KEY=nvapi-...
```

只有配置了密钥的 provider 才会被启用。

## 3. 选择模型

```bash
omfm model
```

在交互式终端中运行会打开模型 picker。每一行显示 provider、模型名、context 大小、latency（缓存值或实测值）、推荐状态和 probe 状态。排序依据是：当前选中状态 → health/推荐 → 缓存 latency → provider 目录排名，好的候选靠前显示。

Picker 标识：

- `▶` — 当前光标位置，高亮显示
- `●` — 已选中
- `○` — 未选中

Picker 快捷键：

- `Tab`、`Left`/`Right`、`h`/`l` 或 `[`/`]` — 切换顶部标签（`All`、`Fast`、`Balanced`、`Capable`）
- `Up`/`Down` 或 `j`/`k` — 移动光标
- `Space` — 切换选中状态
- `Enter` — 保存
- `q` 或 `Esc` — 取消

`All` 标签管理全局可路由模型列表。组标签把模型分配到 `fast`、`balanced`、`capable`；在组里选中模型也会自动让它保留在 `All` 的候选列表中。保存的选择按显示顺序保留。在没有 latency 数据时，这个顺序会作为确定性的 fallback 使用。

Latency probe 以小批量并行方式运行，节奏保守。`rate-limit` 响应只标记对应的模型行，其余 probe 继续进行。`quota`/付款响应会中止尚未启动的 probe，但不会覆盖已缓存的 latency。

stdout 不是 TTY 时，`omfm model` 输出不带 ANSI 转义码的静态表格，不执行 probe。非交互模式用法：

```bash
omfm model --all
omfm model --select google/gemini-2.0-flash-exp:free,meta-llama/llama-3.2-3b-instruct:free
omfm model --group fast --select google/gemini-2.0-flash-exp:free
omfm model --group capable --best
omfm model --json
omfm model --best
omfm model --best --json
```

使用 `--group fast|balanced|capable` 可以为不同的 coding-agent mode 维护独立模型池。请求 `omfm/fast`、`omfm/balanced` 或 `omfm/capable` 时只在对应组内路由；`haiku`、`sonnet`、`opus` 也会作为友好的 alias 被识别。

## 4. 启动本地代理

前台模式（`Ctrl+C` 退出）：

```bash
omfm start
```

后台 daemon 模式：

```bash
omfm start --daemon
omfm status
omfm stop
```

代理运行期间，会约每 5 分钟用保守的后台 probe 批次刷新已选模型的 latency。Probe 使用与 picker 相同的 cooldown 规则。

默认端口是 `4567`，用 `--port` 修改：

```bash
omfm start --port 4600
```

## 5. 连接客户端

如果客户端支持按 mode 指定模型，可使用 `omfm/fast`、`omfm/balanced` 或 `omfm/capable`。`haiku`、`sonnet`、`opus` 会作为这三个组的 alias 生效。

### OpenAI 兼容客户端

为 OpenCode、Hermes Agent、OpenClaw 或其他 OpenAI 兼容客户端配置：

```text
baseURL=http://localhost:4567/v1
```

`0.0.1` 版本需要以下端点：

- `GET /v1/models`
- `POST /v1/chat/completions`

### Anthropic 兼容客户端（Claude Code）

设置以下环境变量：

```bash
export ANTHROPIC_BASE_URL=http://localhost:4567/anthropic
export ANTHROPIC_AUTH_TOKEN=omfm-local
export ANTHROPIC_API_KEY=
```

`0.0.1` 版本需要以下端点：

- `POST /anthropic/v1/messages`
- `POST /anthropic/messages`（别名）

`omfm` 接收本地 Anthropic 认证头，再用匹配的 provider 密钥转发请求。如果 provider 自身暴露了 Anthropic 兼容端点（如 OpenRouter 的 Anthropic surface），`omfm` 会直接使用；否则 fallback 到一个精简的纯文本 Anthropic→OpenAI 翻译层。

## 6. 诊断

```bash
omfm doctor
omfm usage
omfm usage --json
```

`doctor` 输出 config 路径、provider 密钥来源、已选模型数、已缓存模型数和 daemon 状态。不修改任何配置。

`usage` 输出每个模型的请求次数、成功/失败次数，以及从非 streaming provider 响应中观察到的 token 总量。Streaming 请求会计入请求次数，但 stream passthrough 通常无法获得 token 总量。

## 7. 路由与 latency 规则

- 只有通过 `omfm model` 选中的模型才参与路由。
- 请求中指定了模型名，`omfm` 就直接路由到它。带 provider 前缀的本地模型名也能解析到对应的 upstream 模型 ID。
- 通用请求或未知模型名，路由到本地实测 latency 最低的已选模型。
- 组模型名（`omfm/fast`、`omfm/balanced`、`omfm/capable`，以及 `haiku`/`sonnet`/`opus`）在对应组有已选模型时只在该组内路由；空组 fallback 到完整已选列表。
- 触发 rate-limit（HTTP 429）或 quota（HTTP 402）的模型，约 10 分钟内从候选列表中移除。如果所有已选模型都在冷却，则 fallback 到按 latency 排序的完整列表，确保请求不中断。
- 请求成功后更新本地 latency 缓存。
- `omfm start` 在代理运行期间也会在后台刷新已选模型的 latency。
- 没有 latency 数据时，fallback 到选择时保存的确定性顺序。交互式 picker 和 `omfm model --all` 均按推荐排序保存该顺序。
- `0.0.1` 版本不使用任何托管的 latency 服务。

## 8. 开发

参与 `omfm` 本身的开发：

```bash
git clone https://github.com/hakilee/oh-my-free-models
cd oh-my-free-models
npm install
npm test
npm run typecheck
npm run build
```
