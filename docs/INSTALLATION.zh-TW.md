# 安裝與設定

[English](./INSTALLATION.md) | [한국어](./INSTALLATION.ko.md) | [简体中文](./INSTALLATION.zh-CN.md) | 繁體中文 | [日本語](./INSTALLATION.ja.md)

本文從安裝 `oh-my-free-models`（`omfm`）開始，依序說明設定 provider 金鑰、選擇模型、啟動本機代理、連接客戶端的完整流程。專案的目的與動機請見 [README.zh-TW.md](./README.zh-TW.md)。

## 1. 安裝

```bash
npm install -g oh-my-free-models
```

安裝時**不會**自動啟動背景程序。需要時請自行執行。

需要 Node.js 20 以上版本。

## 2. 設定 provider API 金鑰

`omfm` 依以下優先順序讀取 provider 金鑰：

1. 目前程序或全域環境中的 `OPENROUTER_API_KEY` / `NVIDIA_API_KEY`
2. `~/.oh-my-free-models/.env`

`~/.oh-my-free-models/.env` 範例：

```bash
OPENROUTER_API_KEY=sk-or-...
NVIDIA_API_KEY=nvapi-...
```

只有設定了金鑰的 provider 才會被啟用。

## 3. 選擇模型

```bash
omfm model
```

在互動式終端機中執行時，會開啟模型 picker。每一列顯示 provider、模型名稱、context 大小、latency（快取或實測值）、推薦狀態、probe 狀態。排序依據是：目前已選取 → 健康狀態／推薦 → 快取的 latency → provider 目錄排名，最佳候選會排在最上方。

Picker 指示如下。

| 指示 | 意義 |
| --- | --- |
| `▶` | 目前高亮列。 |
| `●` | 已選模型。 |
| `○` | 未選模型。 |

Picker 按鍵如下。

| 按鍵 | 動作 |
| --- | --- |
| `Tab`、`Left`/`Right`、`h`/`l` 或 `[`/`]` | 切換上方分頁（`All`、`Fast`、`Balanced`、`Capable`）。 |
| `Up`/`Down` 或 `j`/`k` | 移動游標。 |
| `Space` | 切換選取狀態。 |
| `Enter` | 儲存。 |
| `q` 或 `Esc` | 取消。 |

`All` 標籤管理全域可路由模型清單。群組標籤會把模型分配到 `fast`、`balanced`、`capable`；在群組中選取模型也會自動讓它保留在 `All` 的候選清單中。儲存後的選取清單保留顯示時的順序。當 latency 資料尚未建立時，這個順序會作為確定性的 fallback 路由依據。

Latency probe 以小規模並行批次執行，速率設定保守。`rate-limit` 回應只標記該模型這一列，其餘列繼續 probe。`quota`／付款相關回應會停止尚未開始的 probe，但不會覆蓋已快取的 latency。

當 stdout 不是 TTY 時，`omfm model` 會輸出不含 ANSI 色碼的靜態表格，並略過 probing。可依需求使用以下非互動命令。

| 命令 | 用途 |
| --- | --- |
| `omfm model --all` | 列出所有可選模型。 |
| `omfm model --select google/gemini-2.0-flash-exp:free,meta-llama/llama-3.2-3b-instruct:free` | 儲存明確的已選模型清單。 |
| `omfm model --group fast --select google/gemini-2.0-flash-exp:free` | 儲存某個群組的模型清單。 |
| `omfm model --group capable --best` | Probe 某個群組並輸出最佳候選。 |
| `omfm model --json` | 以 JSON 輸出模型列。 |
| `omfm model --best` | Probe 已選模型並輸出最佳候選。 |
| `omfm model --best --json` | 以 JSON 輸出最佳候選。 |
| `omfm model --no-tui` | 即便在 TTY 中也不開啟 TUI，透過帶編號的靜態表與單行提示選擇模型。 |

使用 `--group fast|balanced|capable` 可以替不同的 coding-agent mode 維護獨立模型池。請求 `omfm/fast`、`omfm/balanced` 或 `omfm/capable` 時只會在對應群組內路由；`haiku`、`sonnet`、`opus` 也會被視為易記的 alias。

## 4. 啟動本機代理

依代理執行方式選擇命令。

| 命令 | 用途 |
| --- | --- |
| `omfm start` | 在前景啟動代理，並輸出 request/response 路由日誌。用 `Ctrl+C` 停止。 |
| `omfm start --daemon` | 以背景 daemon 啟動代理。 |
| `omfm status` | 查看 daemon、config 與 best-route 狀態。 |
| `omfm stop` | 停止背景 daemon。 |

代理執行期間，會約每 5 分鐘以保守的背景 probe 批次刷新已選模型的 latency。Probe 使用與 picker 相同的 cooldown 規則。

前景 `omfm start` 也會輸出單行 request/response 日誌；可用時包含 requested model、routed model、route reason、cached latency、status、duration 與 stream 標記。

預設 port 為 `4567`，需要時可以改用其他 port。

| 命令 | 用途 |
| --- | --- |
| `omfm start --port 4600` | 在 `4600` port 啟動代理。 |

## 5. 連接客戶端

如果客戶端支援依 mode 指定模型，可以使用 `omfm/fast`、`omfm/balanced` 或 `omfm/capable`。`haiku`、`sonnet`、`opus` 會作為這三個群組的 alias 生效。

### OpenAI 相容客戶端

設定 OpenCode、Hermes Agent、OpenClaw 或其他任何 OpenAI 相容客戶端：

```text
baseURL=http://localhost:4567/v1
```

`0.0.1` 所需端點：

- `GET /v1/models`
- `POST /v1/chat/completions`

### Anthropic 相容客戶端（Claude Code）

設定以下環境變數：

```bash
export ANTHROPIC_BASE_URL=http://localhost:4567/anthropic
export ANTHROPIC_AUTH_TOKEN=omfm-local
export ANTHROPIC_API_KEY=
```

`0.0.1` 所需端點：

- `POST /anthropic/v1/messages`
- `POST /anthropic/messages`（alias）
- `POST /anthropic/v1/messages/count_tokens`
- `POST /anthropic/messages/count_tokens`（alias）

`omfm` 接受本機 Anthropic 認證標頭，並以對應的 provider 金鑰轉發請求。若該 provider 本身有暴露 Anthropic 相容端點（例如 OpenRouter 的 Anthropic surface），`omfm` 會直接使用；否則 fallback 到 Anthropic/OpenAI 轉譯層，支援文字與常見用戶端 tool-use 流程。Token count 回傳本機相容性估算值，不是 provider tokenizer 的精確計數。

## 6. 診斷

| 命令 | 用途 |
| --- | --- |
| `omfm doctor` | 輸出 config 路徑、provider 金鑰來源、已選模型數、快取模型數和 daemon 狀態。 |
| `omfm usage` | 輸出每個模型的請求數與可用 token 合計。 |
| `omfm usage --json` | 以 JSON 輸出 usage 觀測值。 |

`doctor` 不會修改設定。Streaming 請求會計入 `usage` 的請求數，但 stream passthrough 通常無法取得 token 合計。

## 7. 路由與 latency 規則

- 只有透過 `omfm model` 選取的模型才會列入路由候選。
- 請求中若指定了已選取的模型名稱，`omfm` 會直接路由到該模型。帶有 provider 前綴的本機模型名稱，也能解析到對應的 upstream 模型 ID。
- 未指定或無法識別的模型名稱，會路由到本機實測 latency 最低的已選模型。
- 群組模型名（`omfm/fast`、`omfm/balanced`、`omfm/capable`，以及 `haiku`/`sonnet`/`opus`）在對應群組有已選模型時只會在該群組內路由；空群組 fallback 到完整已選清單。
- 剛觸發 rate-limit（HTTP 429）或 quota（HTTP 402）的模型，約 10 分鐘內不列入候選。若所有已選模型都在 cooling 狀態，則 fallback 到完整的 latency 排序清單，確保請求仍能繼續。
- 請求成功後會更新本機 latency 快取。
- `omfm start` 在代理執行期間也會於背景刷新已選模型的 latency。
- 沒有 latency 資料時，fallback 到 picker 儲存的選取順序。互動式 picker 與 `omfm model --all` 以推薦排序儲存該順序。
- `0.0.1` 不使用任何託管的 latency 服務。

## 8. 開發

若要對 `omfm` 本身進行開發，請使用這些命令。

| 命令 | 用途 |
| --- | --- |
| `git clone https://github.com/hakilee/oh-my-free-models` | Clone repository。 |
| `cd oh-my-free-models` | 進入專案目錄。 |
| `npm install` | 安裝依賴。 |
| `npm test` | 執行完整測試。 |
| `npm run typecheck` | 執行 TypeScript 型別檢查。 |
| `npm run build` | 建置 `dist`。 |
