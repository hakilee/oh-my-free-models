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

Picker 指示符：

- `▶` — 目前游標位置，反白顯示
- `●` — 已選取
- `○` — 未選取

Picker 按鍵：

- `Tab`、`Left`/`Right`、`h`/`l` 或 `[`/`]` — 切換頂部標籤（`All`、`Fast`、`Balanced`、`Capable`）
- `Up`／`Down` 或 `j`／`k` — 移動游標
- `Space` — 切換選取狀態
- `Enter` — 儲存
- `q` 或 `Esc` — 取消

`All` 標籤管理全域可路由模型清單。群組標籤會把模型分配到 `fast`、`balanced`、`capable`；在群組中選取模型也會自動讓它保留在 `All` 的候選清單中。儲存後的選取清單保留顯示時的順序。當 latency 資料尚未建立時，這個順序會作為確定性的 fallback 路由依據。

Latency probe 以小規模並行批次執行，速率設定保守。`rate-limit` 回應只標記該模型這一列，其餘列繼續 probe。`quota`／付款相關回應會停止尚未開始的 probe，但不會覆蓋已快取的 latency。

當 stdout 不是 TTY 時，`omfm model` 會輸出不含 ANSI 色碼的靜態表格，並略過 probing。非互動式用法：

```bash
omfm model --all
omfm model --select google/gemini-2.0-flash-exp:free,meta-llama/llama-3.2-3b-instruct:free
omfm model --group fast --select google/gemini-2.0-flash-exp:free
omfm model --group capable --best
omfm model --json
omfm model --best
omfm model --best --json
```

使用 `--group fast|balanced|capable` 可以替不同的 coding-agent mode 維護獨立模型池。請求 `omfm/fast`、`omfm/balanced` 或 `omfm/capable` 時只會在對應群組內路由；`haiku`、`sonnet`、`opus` 也會被視為易記的 alias。

## 4. 啟動本機代理

前景模式（`Ctrl+C` 結束）：

```bash
omfm start
```

背景 daemon：

```bash
omfm start --daemon
omfm status
omfm stop
```

代理執行期間，會約每 5 分鐘以保守的背景 probe 批次刷新已選模型的 latency。Probe 使用與 picker 相同的 cooldown 規則。

預設 port 為 `4567`，可用 `--port` 覆蓋：

```bash
omfm start --port 4600
```

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

`omfm` 接受本機 Anthropic 認證標頭，並以對應的 provider 金鑰轉發請求。若該 provider 本身有暴露 Anthropic 相容端點（例如 OpenRouter 的 Anthropic surface），`omfm` 會直接使用；否則退回僅支援純文字的 Anthropic→OpenAI 轉譯。

## 6. 診斷

```bash
omfm doctor
omfm usage
omfm usage --json
```

`doctor` 會顯示設定檔路徑、provider 金鑰來源、已選取的模型數量、已快取的模型數量，以及 daemon 狀態。不會修改任何設定。

`usage` 會輸出每個模型的請求次數、成功/失敗次數，以及從非 streaming provider 回應中觀察到的 token 總量。Streaming 請求會計入請求次數，但 stream passthrough 通常無法取得 token 總量。

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

若要對 `omfm` 本身進行開發：

```bash
git clone https://github.com/hakilee/oh-my-free-models
cd oh-my-free-models
npm install
npm test
npm run typecheck
npm run build
```
