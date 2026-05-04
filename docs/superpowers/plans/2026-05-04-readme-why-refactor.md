# README Why-Focused Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the install-heavy `README.md` with a why-focused entry doc, move all setup/CLI/configuration reference into a new `INSTALLATION.md`, and ship Korean mirrors (`README.ko.md`, `INSTALLATION.ko.md`) alongside.

**Architecture:** Pure documentation refactor. No source, test, or behavioral changes. Files are added in dependency order — install docs first, then Korean README, then English README rewrite — so `scripts/check-docs.mjs` link validation never sees a broken intermediate state. `package.json` `files` array and `docs/index.md` maintenance rules are updated last.

**Tech Stack:** Markdown only. Verification via `npm run docs:check`, `npm test`, `npm run typecheck`, `npm run build` (the latter three required by `CLAUDE.md` whenever `package.json` changes).

**Spec:** [`docs/superpowers/specs/2026-05-04-readme-why-refactor-design.md`](../specs/2026-05-04-readme-why-refactor-design.md)

**Branch:** Work on `main` (project history shows direct-to-main commits via PRs; create one PR at the end).

---

## File Map

| File | Action | Responsibility |
| --- | --- | --- |
| `INSTALLATION.md` | Create | English setup/CLI/config reference (absorbs ~90 lines from old README) |
| `INSTALLATION.ko.md` | Create | Korean mirror of INSTALLATION.md |
| `README.ko.md` | Create | Korean why-focused entry doc |
| `README.md` | Rewrite | English why-focused entry doc (~80–120 lines) |
| `docs/index.md` | Modify | Append one line under "Maintenance rules" describing the README/INSTALLATION split |
| `package.json` | Modify | Add new files to the `files` array |

Order matters: every file that *links to* another must be created/updated only after the linked target exists, so `npm run docs:check` passes after each commit.

---

## Task 1: Create `INSTALLATION.md`

**Files:**
- Create: `INSTALLATION.md`

- [ ] **Step 1: Write `INSTALLATION.md`**

Create the file with this exact content:

````markdown
# Installation and Setup

This document covers installing `oh-my-free-models` (`omfm`), configuring provider keys, selecting models, running the local proxy, and connecting clients. For the project's purpose and motivation, see [README.md](./README.md). 한국어: [INSTALLATION.ko.md](./INSTALLATION.ko.md).

## 1. Install

```bash
npm install -g oh-my-free-models
```

The package does **not** auto-start a background process during install. Start it explicitly when you want it running.

Requires Node.js 20 or newer.

## 2. Configure provider API keys

`omfm` reads provider keys in this order:

1. `OPENROUTER_API_KEY` / `NVIDIA_API_KEY` from the process or global environment
2. `~/.oh-my-free-models/.env`

Example `~/.oh-my-free-models/.env`:

```bash
OPENROUTER_API_KEY=sk-or-...
NVIDIA_API_KEY=nvapi-...
```

Only the providers whose keys are present are used.

## 3. Select models

```bash
omfm model
```

In an interactive terminal, this opens a model picker. It shows provider, model, context size, cached or measured latency, recommendation, and probe status. Rows are ordered by current selection, health/recommendation, cached latency, and provider catalog rank, so the best known choices are easiest to review.

Picker indicators:

- `▶` — current row, highlighted
- `●` — selected
- `○` — unselected

Picker keys:

- `Up`/`Down` or `j`/`k` — move
- `Space` — toggle selection
- `Enter` — save
- `q` or `Esc` — cancel

Saved selections keep the displayed order. That order becomes the deterministic routing fallback when no latency is known yet.

Latency probes run in small bounded parallel batches with conservative pacing. Row-level `rate-limit` responses are shown for that model and later rows continue probing. `quota`/payment responses stop the remaining unstarted probes for that run, but cached latency is not overwritten.

When stdout is not a TTY, `omfm model` prints a static ANSI-free table and does not probe. Non-interactive forms:

```bash
omfm model --all
omfm model --select google/gemini-2.0-flash-exp:free,meta-llama/llama-3.2-3b-instruct:free
omfm model --json
omfm model --best
omfm model --best --json
```

## 4. Start the local proxy

Foreground mode (exits on `Ctrl+C`):

```bash
omfm start
```

Background daemon:

```bash
omfm start --daemon
omfm status
omfm stop
```

Default port is `4567`. Override with `--port`:

```bash
omfm start --port 4600
```

## 5. Connect clients

### OpenAI-compatible clients

Configure OpenCode, Hermes Agent, OpenClaw, or any other OpenAI-compatible client with:

```text
baseURL=http://localhost:4567/v1
```

Required endpoints in `0.0.1`:

- `GET /v1/models`
- `POST /v1/chat/completions`

### Anthropic-compatible clients (Claude Code)

Set:

```bash
export ANTHROPIC_BASE_URL=http://localhost:4567/anthropic
export ANTHROPIC_AUTH_TOKEN=omfm-local
export ANTHROPIC_API_KEY=
```

Required endpoints in `0.0.1`:

- `POST /anthropic/v1/messages`
- `POST /anthropic/messages` (alias)

`omfm` accepts the local Anthropic auth header and forwards requests with the matching provider key for the chosen model. When a provider exposes its own Anthropic-compatible endpoint (for example OpenRouter's Anthropic surface), `omfm` prefers it; otherwise it falls back to a minimal text-only Anthropic-to-OpenAI translation.

## 6. Diagnostics

```bash
omfm doctor
```

`doctor` reports config paths, provider key sources, selected model count, cached model count, and daemon state. It does not modify client tool settings.

## 7. Routing and latency rules

- Only models you selected with `omfm model` are eligible for routing.
- If a request names a selected model, `omfm` honors it. For provider-prefixed local models, the matching upstream model id is also honored.
- Generic or unknown model names route to the selected model with the lowest locally observed latency.
- Models that just hit rate-limit (HTTP 429) or quota (HTTP 402) are skipped for ~10 minutes before becoming candidates again. If every selected model is cooling, routing falls back to the full latency-ordered list so requests still proceed.
- Successful requests update the local latency cache.
- If no latency is known, routing falls back to deterministic selected order. The interactive picker and `omfm model --all` save that order from the recommendation-sorted display.
- No hosted latency service is used in `0.0.1`.

## 8. Limitations in 0.0.1

- OpenRouter and NVIDIA chat models only.
- No hosted latency service.
- No install-time daemon autostart.
- No embeddings, image, audio, video, or non-chat endpoints.
- Tool-use and multimodal Anthropic blocks are best-effort pass-through when a provider exposes an Anthropic-compatible surface, otherwise rejected/unsupported.

## 9. Development

To work on `omfm` itself:

```bash
git clone https://github.com/hakilee/oh-my-free-models
cd oh-my-free-models
npm install
npm test
npm run typecheck
npm run build
```
````

**Note on the link to `README.ko.md`:** This file links to `INSTALLATION.ko.md` and `README.md`. `INSTALLATION.ko.md` does not yet exist at this commit, but it is *not referenced from any `requiredFiles` entry* in `scripts/check-docs.mjs` — only links from required files are validated. `INSTALLATION.md` itself is also not in `requiredFiles`. So `docs:check` will not fail on this commit.

- [ ] **Step 2: Run `docs:check` to verify nothing broke**

Run: `npm run docs:check`
Expected: `docs:check passed (13 required files, 6 route checks)`

- [ ] **Step 3: Commit**

```bash
git add INSTALLATION.md
git commit -m "docs: add INSTALLATION.md with setup and CLI reference"
```

---

## Task 2: Create `INSTALLATION.ko.md`

**Files:**
- Create: `INSTALLATION.ko.md`

- [ ] **Step 1: Write `INSTALLATION.ko.md`**

Create the file with this exact content. Code blocks and commands are byte-identical to `INSTALLATION.md`; only prose is translated.

````markdown
# 설치 및 설정

이 문서는 `oh-my-free-models` (`omfm`) 의 설치, provider 키 설정, 모델 선택, 로컬 프록시 실행, 클라이언트 연결을 다룹니다. 프로젝트의 목적과 동기는 [README.ko.md](./README.ko.md) 를 참고하세요. English: [INSTALLATION.md](./INSTALLATION.md).

## 1. 설치

```bash
npm install -g oh-my-free-models
```

설치 중에 백그라운드 프로세스가 자동으로 뜨지 **않습니다**. 필요할 때 명시적으로 실행하세요.

Node.js 20 이상이 필요합니다.

## 2. Provider API 키 설정

`omfm` 은 provider 키를 다음 순서로 읽습니다:

1. 프로세스/전역 환경의 `OPENROUTER_API_KEY` / `NVIDIA_API_KEY`
2. `~/.oh-my-free-models/.env`

`~/.oh-my-free-models/.env` 예시:

```bash
OPENROUTER_API_KEY=sk-or-...
NVIDIA_API_KEY=nvapi-...
```

키가 설정된 provider만 사용됩니다.

## 3. 모델 선택

```bash
omfm model
```

대화형 터미널에서 실행하면 모델 picker가 열립니다. provider, 모델, context 크기, 캐시 또는 측정된 latency, 추천 여부, probe 상태가 표시됩니다. 행은 현재 선택, health/추천, 캐시된 latency, provider 카탈로그 순위 순으로 정렬되므로 가장 좋은 후보를 먼저 검토할 수 있습니다.

Picker 표시:

- `▶` — 현재 커서 위치, 강조
- `●` — 선택됨
- `○` — 미선택

Picker 키 매핑:

- `Up`/`Down` 또는 `j`/`k` — 이동
- `Space` — 선택 토글
- `Enter` — 저장
- `q` 또는 `Esc` — 취소

저장된 선택은 표시 순서를 그대로 유지합니다. 그 순서가 latency 정보가 아직 없을 때 결정적 fallback이 됩니다.

Latency probe는 작은 단위로 병렬 실행되며 보수적으로 페이싱됩니다. `rate-limit` 응답을 받은 행은 그 모델에만 표시되고 이후 행들은 계속 probe됩니다. `quota`/결제 응답이 오면 해당 실행에서 아직 시작하지 않은 probe들은 중단되지만, 캐시된 latency는 덮어쓰이지 않습니다.

stdout이 TTY가 아니면 `omfm model` 은 ANSI 없는 정적 표를 출력하며 probe하지 않습니다. 비대화형 옵션:

```bash
omfm model --all
omfm model --select google/gemini-2.0-flash-exp:free,meta-llama/llama-3.2-3b-instruct:free
omfm model --json
omfm model --best
omfm model --best --json
```

## 4. 로컬 프록시 실행

Foreground 모드 (`Ctrl+C` 로 종료):

```bash
omfm start
```

데몬 모드:

```bash
omfm start --daemon
omfm status
omfm stop
```

기본 포트는 `4567` 입니다. `--port` 로 바꿀 수 있습니다:

```bash
omfm start --port 4600
```

## 5. 클라이언트 연결

### OpenAI 호환 클라이언트

OpenCode, Hermes Agent, OpenClaw, 그 외 OpenAI 호환 클라이언트에 다음을 설정합니다:

```text
baseURL=http://localhost:4567/v1
```

`0.0.1` 에서 필요한 엔드포인트:

- `GET /v1/models`
- `POST /v1/chat/completions`

### Anthropic 호환 클라이언트 (Claude Code)

다음 환경변수를 설정합니다:

```bash
export ANTHROPIC_BASE_URL=http://localhost:4567/anthropic
export ANTHROPIC_AUTH_TOKEN=omfm-local
export ANTHROPIC_API_KEY=
```

`0.0.1` 에서 필요한 엔드포인트:

- `POST /anthropic/v1/messages`
- `POST /anthropic/messages` (alias)

`omfm` 은 로컬 Anthropic 인증 헤더를 받아서, 선택된 모델에 맞는 provider 키로 요청을 forward합니다. provider가 자체 Anthropic 호환 엔드포인트를 노출하면 (예: OpenRouter의 Anthropic surface) `omfm` 은 그쪽을 선호하고, 그렇지 않으면 텍스트 전용 Anthropic→OpenAI 번역으로 fallback합니다.

## 6. 진단

```bash
omfm doctor
```

`doctor` 는 config 경로, provider 키 출처, 선택된 모델 수, 캐시된 모델 수, 데몬 상태를 보고합니다. 클라이언트 도구 설정은 변경하지 않습니다.

## 7. 라우팅 및 latency 규칙

- `omfm model` 로 선택한 모델만 라우팅 후보가 됩니다.
- 요청이 선택된 모델 이름을 명시하면 `omfm` 이 그 모델을 사용합니다. provider prefix 가 붙은 로컬 모델 ID에 대해서는 매칭되는 upstream 모델 ID도 인정됩니다.
- 일반 또는 알 수 없는 모델 이름은 로컬에서 관측된 latency가 가장 낮은 선택 모델로 라우팅됩니다.
- 방금 rate-limit (HTTP 429) 또는 quota (HTTP 402) 를 받은 모델은 약 10분간 후보에서 제외됩니다. 모든 선택 모델이 cooling 상태면 전체 latency 정렬 목록으로 fallback해서 요청은 계속 진행됩니다.
- 성공한 요청은 로컬 latency 캐시를 갱신합니다.
- Latency 정보가 없으면 결정적 선택 순서로 fallback합니다. picker와 `omfm model --all` 은 추천 정렬 순서대로 저장합니다.
- `0.0.1` 에서는 hosted latency 서비스를 쓰지 않습니다.

## 8. 0.0.1 의 한계

- OpenRouter, NVIDIA chat 모델만 지원.
- Hosted latency 서비스 없음.
- 설치 시 데몬 autostart 없음.
- Embedding, image, audio, video 등 chat 외 엔드포인트 없음.
- Tool-use 와 multimodal Anthropic 블록은 provider가 Anthropic 호환 surface를 노출할 때만 best-effort pass-through 이고, 그 외에는 거부 또는 미지원입니다.

## 9. 개발

`omfm` 자체를 작업하려면:

```bash
git clone https://github.com/hakilee/oh-my-free-models
cd oh-my-free-models
npm install
npm test
npm run typecheck
npm run build
```
````

- [ ] **Step 2: Run `docs:check` to verify nothing broke**

Run: `npm run docs:check`
Expected: `docs:check passed (13 required files, 6 route checks)`

- [ ] **Step 3: Commit**

```bash
git add INSTALLATION.ko.md
git commit -m "docs: add Korean INSTALLATION.ko.md mirror"
```

---

## Task 3: Create `README.ko.md`

**Files:**
- Create: `README.ko.md`

- [ ] **Step 1: Write `README.ko.md`**

Create the file with this exact content:

````markdown
# oh-my-free-models

`oh-my-free-models` (`omfm`) 는 코딩 에이전트를 여러 무료 provider 중 지금 가장 빠른 모델로 라우팅하는 로컬 프록시입니다. OpenAI 또는 Anthropic 호환 에이전트의 baseURL만 `localhost` 로 돌리고 free 모델 몇 개를 고르면, latency·rate-limit·quota 가 흔들리는 동안에도 `omfm` 이 요청을 계속 흘려보냅니다.

## 왜 필요한가

Free tier 코딩 에이전트는 종이 위에서는 멀쩡해 보이지만 실제로 쓰면 네 군데에서 깨집니다.

**Rate limit이 작업 중간에 멈춰버립니다.** OpenRouter나 NVIDIA의 free 모델은 429를 예측 없이 던집니다. 잘 돌던 실행이 도구 호출 한 번에 멈춰서, 손으로 다시 시도해야 합니다.

**Latency가 시간대별로 출렁입니다.** 같은 free 모델이 아침엔 빠르고 오후엔 못 쓸 정도로 느려집니다. 시간·지역에 따라 다르고, "이게 빠른 모델" 이라고 미리 정해둘 수 없고 "지금 이 순간 빠른 모델" 만 있을 뿐입니다.

**Quota가 마르면 손으로 provider를 갈아끼워야 합니다.** 한 provider의 free quota가 떨어지면 키와 baseURL을 수동으로 바꿉니다. 에이전트 쪽 설정은 그 변화에 적응하지 않습니다.

**Free 카탈로그가 자주 바뀝니다.** 모델이 새로 나오고, 사라지고, deprecated 표시가 붙고, 조용히 에러를 반환하기 시작합니다. 대시보드가 알려주는 게 아니라, 벽에 부딪혀야 알게 됩니다.

## omfm이 하는 일

쓸 free 모델의 allowlist를 `omfm` 에 넘기면, `http://localhost:4567` 에서 로컬 프록시로 동작하면서 다음을 처리합니다:

- 모델별 latency를 내 머신 기준으로 측정·캐시
- 일반 (특정 모델 미지정) 요청을 가장 빠른 살아있는 후보로 라우팅
- 방금 429/402 를 받은 모델은 약 10분간 후보에서 제외 — 에이전트가 같은 벽으로 다시 부딪히지 않게
- OpenAI 호환 (`/v1`) 과 Anthropic 호환 (`/anthropic`) surface를 동시에 노출 — drop-in 클라이언트는 코드 변경 없이 동작

에이전트는 `localhost` 만 바라봅니다. provider 전환, rate-limit 우회 재시도, "지금 빠른 모델" 선택은 모두 그 아래에서 일어납니다.

## 30초 만에 시도하기

```bash
npm install -g oh-my-free-models
mkdir -p ~/.oh-my-free-models && echo 'OPENROUTER_API_KEY=sk-or-...' > ~/.oh-my-free-models/.env
omfm model        # picker에서 free 모델 몇 개 선택
omfm start        # http://localhost:4567 서빙
```

## 에이전트에서 쓰기

OpenAI 호환 클라이언트 (OpenCode, Hermes Agent, OpenClaw 등):

```text
baseURL=http://localhost:4567/v1
```

Anthropic 호환 클라이언트 (Claude Code 등):

```bash
export ANTHROPIC_BASE_URL=http://localhost:4567/anthropic
export ANTHROPIC_AUTH_TOKEN=omfm-local
export ANTHROPIC_API_KEY=
```

## 더 알아보기

- 설치, 모든 CLI 플래그, 데몬 제어, 진단: [INSTALLATION.ko.md](./INSTALLATION.ko.md)
- English README: [README.md](./README.md)
- 라우팅 내부 동작: [docs/latency-routing.md](./docs/latency-routing.md)
- Provider 카탈로그: [docs/provider-guide.md](./docs/provider-guide.md)
````

- [ ] **Step 2: Run `docs:check` to verify nothing broke**

Run: `npm run docs:check`
Expected: `docs:check passed (13 required files, 6 route checks)`

Note: `README.ko.md` is not in `requiredFiles`, so its links are not validated by the script. Manually verify the four links in the "더 알아보기" section resolve to real files.

- [ ] **Step 3: Manual link check**

Run: `ls INSTALLATION.ko.md README.md docs/latency-routing.md docs/provider-guide.md`
Expected: all four files exist (`README.md` still old; the new one comes in Task 4).

- [ ] **Step 4: Commit**

```bash
git add README.ko.md
git commit -m "docs: add Korean README.ko.md focused on why omfm exists"
```

---

## Task 4: Rewrite `README.md`

**Files:**
- Modify: `README.md` (full rewrite from 127 lines to ~80 lines)

- [ ] **Step 1: Replace the entire contents of `README.md` with**

````markdown
# oh-my-free-models

`oh-my-free-models` (`omfm`) is a local proxy that routes your coding agent to the fastest free model across providers. Point your OpenAI- or Anthropic-compatible agent at `localhost`, pick a few free models, and `omfm` keeps requests flowing as latency, rate limits, and quotas shift underneath.

## Why this exists

Free-tier coding agents look great on paper and break in practice. Four things tend to go wrong:

**Rate limits stop your work mid-task.** Free models on OpenRouter or NVIDIA hit 429 unpredictably. A clean run becomes a stalled tool call, and you have to retry by hand.

**Latency drifts hour to hour.** The same free model is fast in the morning and unusable by afternoon, depending on time and region. There is no "this is the fast one" — only "this is the fast one *right now*."

**Quotas force manual provider swapping.** When one provider's free quota is exhausted you switch keys and base URLs by hand. Your agent's config does not adapt.

**The free catalog churns.** Models appear, disappear, get marked deprecated, or quietly start returning errors. You learn this by hitting the wall, not from a dashboard.

## What omfm does about it

You give `omfm` an allowlist of free models you actually want to use. It runs as a local proxy on `http://localhost:4567` and:

- measures and caches per-model latency from your machine
- routes generic requests to the lowest-latency live candidate
- cools off models that just hit 429 or 402 for ~10 minutes, so the agent does not retry into the same wall
- exposes one OpenAI-compatible (`/v1`) and one Anthropic-compatible (`/anthropic`) surface, so any drop-in client works without code changes

Your agent points at `localhost`. Switching providers, retrying around rate limits, and picking the currently-fast model all happen below it.

## 30-second try-it

```bash
npm install -g oh-my-free-models
mkdir -p ~/.oh-my-free-models && echo 'OPENROUTER_API_KEY=sk-or-...' > ~/.oh-my-free-models/.env
omfm model        # pick a few free models in the picker
omfm start        # serves http://localhost:4567
```

## Use it from your agent

OpenAI-compatible clients (OpenCode, Hermes Agent, OpenClaw, etc.):

```text
baseURL=http://localhost:4567/v1
```

Anthropic-compatible clients (Claude Code, etc.):

```bash
export ANTHROPIC_BASE_URL=http://localhost:4567/anthropic
export ANTHROPIC_AUTH_TOKEN=omfm-local
export ANTHROPIC_API_KEY=
```

## More

- Setup, all CLI flags, daemon control, diagnostics: [INSTALLATION.md](./INSTALLATION.md)
- 한국어 README: [README.ko.md](./README.ko.md)
- Routing internals: [docs/latency-routing.md](./docs/latency-routing.md)
- Provider catalog: [docs/provider-guide.md](./docs/provider-guide.md)
````

- [ ] **Step 2: Run `docs:check` to verify all links resolve**

Run: `npm run docs:check`
Expected: `docs:check passed (13 required files, 6 route checks)`

`README.md` IS in `requiredFiles`, so all four links in the "More" section are validated. They must all exist now (Tasks 1–3 created the targets).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README.md to lead with why omfm exists"
```

---

## Task 5: Update `docs/index.md` maintenance rules

**Files:**
- Modify: `docs/index.md` (add one bullet under "Maintenance rules")

- [ ] **Step 1: Locate the existing bullet**

The current section reads:

```markdown
## Maintenance rules

- `README.md` remains the user-facing quickstart and command reference.
- `docs/` stays compact and route-oriented.
- `research/` stores reusable findings and decision records that are too detailed for route pages.
- Keep all maintained documentation in English.
```

- [ ] **Step 2: Replace the first bullet to reflect the split**

New text for that section:

```markdown
## Maintenance rules

- `README.md` is the why-focused entry doc; setup and CLI reference live in `INSTALLATION.md`. Korean mirrors are `README.ko.md` and `INSTALLATION.ko.md`.
- `docs/` stays compact and route-oriented.
- `research/` stores reusable findings and decision records that are too detailed for route pages.
- Keep all maintained documentation under `docs/` and `research/` in English. Top-level user-facing docs (`README*.md`, `INSTALLATION*.md`) ship English and Korean.
```

Use the Edit tool. The `old_string` should match the entire current "## Maintenance rules" section (header and four bullets). The `new_string` is the replacement above.

- [ ] **Step 3: Run `docs:check`**

Run: `npm run docs:check`
Expected: `docs:check passed (13 required files, 6 route checks)`

`docs/index.md` is in `requiredFiles` and its content is checked for `freshnessTerms` (`update|fresh|maintain|review|refresh|when changing`). The replacement still includes "maintain" via `## Maintenance rules`, so freshness check still passes. Confirm.

- [ ] **Step 4: Commit**

```bash
git add docs/index.md
git commit -m "docs: update index maintenance rules for README/INSTALLATION split"
```

---

## Task 6: Update `package.json` `files` array

**Files:**
- Modify: `package.json:9-13`

- [ ] **Step 1: Replace the `files` array**

Current state of `package.json:9-13`:

```json
  "files": [
    "dist",
    "README.md",
    "LICENSE"
  ],
```

Replace with:

```json
  "files": [
    "dist",
    "README.md",
    "README.ko.md",
    "INSTALLATION.md",
    "INSTALLATION.ko.md",
    "LICENSE"
  ],
```

Use the Edit tool. The Edit `old_string` should match the existing five-line block exactly (including indentation and trailing comma).

- [ ] **Step 2: Verify the package.json is still valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"`
Expected: no output (silent success means valid JSON).

- [ ] **Step 3: Run `npm run docs:check`**

Run: `npm run docs:check`
Expected: `docs:check passed (13 required files, 6 route checks)`

- [ ] **Step 4: Run typecheck, tests, build (required by `CLAUDE.md` when `package.json` changes)**

Run sequentially (each must pass before the next):

```bash
npm run typecheck
npm test
npm run build
```

Expected: all three exit 0. If any fail and the failure is unrelated to docs (e.g., pre-existing issue), stop and ask the user before proceeding.

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit -m "chore: include README.ko.md and INSTALLATION docs in npm package"
```

---

## Task 7: Final verification and PR

**Files:** none modified

- [ ] **Step 1: Re-run all gates from a clean state**

```bash
npm run docs:check
npm run typecheck
npm test
npm run build
```

Expected: all pass.

- [ ] **Step 2: Manually open each new/changed file and skim**

Read each in order: `README.md`, `README.ko.md`, `INSTALLATION.md`, `INSTALLATION.ko.md`, `docs/index.md`, `package.json`.

Verify:
- README.md and README.ko.md have the same six top-level sections in the same order.
- INSTALLATION.md and INSTALLATION.ko.md have the same nine numbered sections in the same order.
- All code blocks are byte-identical between Korean and English files (only prose differs).
- All cross-links (English ↔ Korean, README ↔ INSTALLATION, top-level → docs/) resolve.

- [ ] **Step 3: Push and open a PR**

```bash
git push -u origin main
```

Wait — `main` is the default branch. The repo's recent history shows merges from feature branches into main (`refactor: ...`, `feat: ...`, `docs: ...`). For a clean review surface, push commits to a feature branch instead. If commits are already on `main` locally, transfer them:

```bash
git checkout -b docs/readme-why-refactor
git push -u origin docs/readme-why-refactor
gh pr create --title "docs: refactor README to lead with why, add Korean mirrors" --body "$(cat <<'EOF'
## Summary
- Replaced install-heavy README.md with a why-focused entry doc (~80 lines, four free-tier pain points + what omfm does about them).
- Moved all setup/CLI/configuration reference into a new INSTALLATION.md.
- Added Korean mirrors README.ko.md and INSTALLATION.ko.md (same structure, byte-identical commands, prose translated).
- Updated docs/index.md maintenance rules and added the new files to package.json files array so npm-installed users get all four.

## Test plan
- [ ] npm run docs:check passes
- [ ] npm run typecheck, npm test, npm run build all pass
- [ ] All cross-links between README*, INSTALLATION*, and docs/ resolve
- [ ] README.ko.md and README.md have matching section structure

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Confirm the PR URL with the user before merging.

---

## Self-Review Checklist (run after writing the plan)

This was run at plan-write time. Findings:

**1. Spec coverage:**
- Spec § "File layout after refactor" → Tasks 1–4 create/modify all four user-facing files. ✓
- Spec § "README.md content outline" → Task 4 contains the literal content matching the six sections. ✓
- Spec § "INSTALLATION.md content outline" → Task 1 contains the literal content matching the nine sections. ✓
- Spec § "package.json change" → Task 6. ✓
- Spec § "docs/index.md change" → Task 5. ✓
- Spec § "scripts/check-docs.mjs" (no change) → confirmed in Task 1 note and not re-touched. ✓
- Spec § "Verification" → Task 7. ✓

**2. Placeholder scan:** No "TBD"/"TODO"/"fill in details"/"add appropriate error handling". All Markdown content is literal. ✓

**3. Type consistency:** Not applicable (docs only).

**4. Cross-task consistency:** File names (`INSTALLATION.md`, `INSTALLATION.ko.md`, `README.ko.md`) appear identically in every task. Section counts (six in README, nine in INSTALLATION) are stated consistently in Task 7's manual check. ✓

**5. Order of operations:** Targets exist before linkers. Task 1 (INSTALLATION.md) → Task 2 (INSTALLATION.ko.md) → Task 3 (README.ko.md, links resolve) → Task 4 (README.md rewrite, all links resolve) → Task 5 (docs/index.md) → Task 6 (package.json) → Task 7 (final check). ✓
