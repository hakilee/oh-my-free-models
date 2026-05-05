<p align="center">
  <img src="../oh-my-free-models-character.png" height="96" alt="oh-my-free-models character" />
</p>

# oh-my-free-models

[English](../README.md) | [한국어](./README.ko.md) | [简体中文](./README.zh-CN.md) | 繁體中文 | [日本語](./README.ja.md)

`oh-my-free-models`（`omfm`）是一個本機代理，把你的 coding agent 導向多個 provider 中當下最快的免費模型。把 OpenAI 或 Anthropic 相容客戶端的 baseURL 指到 `localhost`，挑幾個免費模型，`omfm` 就會在 latency、rate-limit、quota 持續波動的情況下讓請求順暢地流過去。

https://github.com/user-attachments/assets/44c07928-1544-4b33-a472-41e82f7aa7d7

> `omfm` 驅動 OpenCode 在路由後的免費模型上運作的示範。

## 為什麼需要它

免費方案的 coding agent 看規格很吸引人，真正跑起來卻常在四個地方卡住：

**Rate limit 在任務途中切斷你的工作。** OpenRouter 或 NVIDIA 的免費模型會在沒有預警的情況下回傳 429。一個跑得好好的流程因為一次工具呼叫就卡住，接下來得自己手動重試。

**Latency 每個時段都不一樣。** 同一個免費模型早上跑很快，下午卻慢到無法使用。沒有「最快的模型」這種說法，只有「現在這個時刻最快的模型」。

**Quota 用完就得手動換 provider。** 某個 provider 的免費 quota 耗盡時，你得自己換 API 金鑰和 baseURL。Agent 的設定不會自動跟著調整。

**免費模型目錄一直在變。** 模型出現又消失，被標記為 deprecated，或者悄悄開始回傳錯誤。不是哪個儀表板會通知你，而是你踢到牆才知道。

## omfm 怎麼解決

你給 `omfm` 一份你真的想用的免費模型 allowlist，它就在 `http://localhost:4567` 作為本機代理運行，並在背後處理這些工作。

| 功能 | 處理方式 |
| --- | --- |
| Latency 追蹤 | 從你的機器實際測量每個模型的 latency，並加以快取。 |
| 請求路由 | 把一般請求導向當下 latency 最低的可用候選。 |
| Cooldown | 剛被 429 或 402 打回的模型，暫停約 10 分鐘不列入候選。 |
| 客戶端相容 | 暴露 OpenAI 相容的 `/v1` 和 Anthropic 相容的 `/anthropic` 介面，並支援 Anthropic tool-use fallback 與本機 token count。 |

Agent 只認識 `localhost`。provider 切換、rate-limit 重試、挑出當前最快模型，都在它下面靜靜發生。

## 30 秒試用

```bash
npm install -g oh-my-free-models
mkdir -p ~/.oh-my-free-models && echo 'OPENROUTER_API_KEY=sk-or-...' > ~/.oh-my-free-models/.env
omfm model        # 在 picker 裡挑幾個免費模型
omfm start        # 啟動 http://localhost:4567
```

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `omfm model` | 開啟 picker，並儲存選取的免費模型。 |
| `omfm model --all` | 不開啟 picker，直接列出所有可選模型。 |
| `omfm model --group fast --best` | Probe fast 群組，並輸出目前最佳候選。 |
| `omfm start` | 在前景執行本機代理，並輸出 request/response 路由日誌。 |
| `omfm start --daemon` | 在背景以 daemon 方式執行本機代理。 |
| `omfm status` | 查看 daemon、config 與 best-route 狀態。 |
| `omfm stop` | 停止背景 daemon。 |
| `omfm doctor` | 檢查 config 路徑、金鑰、模型快取和 daemon 狀態。 |
| `omfm usage` | 查看每個模型的請求數和 token 觀測值。 |

## 從你的 Agent 使用

OpenAI 相容客戶端（OpenCode、Hermes Agent、OpenClaw 等）：

```text
url=http://localhost:4567/v1
model=omfm             # 整個池；或 omfm/fast, omfm/balanced, omfm/capable
```

Anthropic 相容客戶端（Claude Code 等）：

```bash
export ANTHROPIC_BASE_URL=http://localhost:4567/anthropic
export ANTHROPIC_AUTH_TOKEN=omfm-local
export ANTHROPIC_API_KEY=
```

Claude Code 的模型別名（alias）也可以對應到 `omfm` 群組：

```bash
alias freeclaude='ANTHROPIC_BASE_URL=http://localhost:4567/anthropic ANTHROPIC_AUTH_TOKEN=omfm-local ANTHROPIC_API_KEY= CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 ANTHROPIC_DEFAULT_OPUS_MODEL=omfm/capable ANTHROPIC_DEFAULT_SONNET_MODEL=omfm/balanced ANTHROPIC_DEFAULT_HAIKU_MODEL=omfm/fast claude'
```

不帶前綴的 `omfm` 會在整個已選池中路由；`omfm/capable`、`omfm/balanced`、`omfm/fast` 則會過濾到對應的模型群組。Claude 風格的別名 `opus`、`sonnet`、`haiku` 也會對應到同樣的群組。你也可以直接傳入 `omfm model` 中選取的具體模型 ID，把請求釘在那個模型上。

Anthropic 介面也提供本機 `count_tokens` 估算；當請求 fallback 到 OpenAI 相容 provider 路由時，會轉譯常見的 tool-use/tool-result 流程。

## 保持 context 大小一致

Context overflow 確實可能發生。`omfm` 會把請求原樣轉發給被路由到的模型；它不會壓縮（compact）、摘要或截斷 Agent 已累積的對話。如果一個長工作階段從 1M-token 模型開始，之後又被路由或 failover 到 128k/200k 模型，那麼當 prompt 超過較小模型的 context window 時，上游可能會拒絕請求。用戶端的上下文壓縮可以避免這個問題，但不要假設它一定會自動發生。

選擇模型時，請讓每個可路由的模型池維持在同一個 context 長度級距。例如，如果長工作階段使用 `capable`，就只把約 1M-token 模型放進該群組；或者讓 `fast`/`balanced`/`capable` 都保持在 128k/200k 左右。`omfm model` 選擇器會顯示每個模型的 context 大小；未知值會顯示為未知標記，長工作階段應將其視為風險。

## 更多

- 安裝、所有 CLI 旗標、daemon 控制、診斷：[INSTALLATION.zh-TW.md](./INSTALLATION.zh-TW.md)
- Routing 內部運作：[docs/latency-routing.md](./latency-routing.md)
- Provider 目錄：[docs/provider-guide.md](./provider-guide.md)
- 授權條款：[MIT](../LICENSE.md)
