# 설치 및 설정

[English](./INSTALLATION.md) | 한국어 | [简体中文](./INSTALLATION.zh-CN.md) | [繁體中文](./INSTALLATION.zh-TW.md) | [日本語](./INSTALLATION.ja.md)

`oh-my-free-models` (`omfm`) 설치부터 클라이언트 연결까지 순서대로 설명합니다. 프로젝트의 목적과 배경은 [README.ko.md](./README.ko.md) 를 보세요.

## 1. 설치

```bash
npm install -g oh-my-free-models
```

설치 시 백그라운드 프로세스가 자동으로 뜨지 **않습니다**. 필요할 때 직접 실행하세요.

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

대화형 터미널에서 실행하면 모델 picker가 열립니다. provider, 모델, context 크기, latency (캐시 또는 측정값), 추천 여부, probe 상태를 보여줍니다. 정렬 기준은 현재 선택 여부 → health/추천 → 캐시된 latency → provider 카탈로그 순위 순이라, 좋은 후보가 위로 올라옵니다.

Picker 표시:

- `▶` — 현재 커서 위치, 강조
- `●` — 선택됨
- `○` — 미선택

Picker 키 매핑:

- `Tab`, `Left`/`Right`, `h`/`l`, 또는 `[`/`]` — 상단 탭 (`All`, `Fast`, `Balanced`, `Capable`) 전환
- `Up`/`Down` 또는 `j`/`k` — 이동
- `Space` — 선택 토글
- `Enter` — 저장
- `q` 또는 `Esc` — 취소

`All` 탭은 전체 라우팅 후보 목록을 관리합니다. 그룹 탭은 모델을 `fast`, `balanced`, `capable` 에 배정하며, 그룹에서 모델을 선택하면 `All` 에도 자동으로 포함되어 라우팅 후보로 유지됩니다. 저장된 선택은 표시 순서 그대로 유지됩니다. latency 정보가 아직 없으면 이 순서가 결정적 fallback으로 쓰입니다.

Latency probe는 소규모 병렬로 실행되며, 속도를 보수적으로 조절합니다. `rate-limit` 응답은 해당 모델 행에만 표시되고 나머지 probe는 계속 진행됩니다. `quota`/결제 응답이 오면 아직 시작하지 않은 probe는 중단되지만, 캐시된 latency는 덮어쓰지 않습니다.

stdout이 TTY가 아니면 `omfm model` 은 ANSI 없는 정적 표를 출력하고 probe는 실행하지 않습니다. 비대화형 옵션:

```bash
omfm model --all
omfm model --select google/gemini-2.0-flash-exp:free,meta-llama/llama-3.2-3b-instruct:free
omfm model --group fast --select google/gemini-2.0-flash-exp:free
omfm model --group capable --best
omfm model --json
omfm model --best
omfm model --best --json
```

`--group fast|balanced|capable` 로 코딩 에이전트 mode별 모델 풀을 따로 관리할 수 있습니다. `omfm/fast`, `omfm/balanced`, `omfm/capable` 요청은 해당 그룹 안에서 라우팅되며, `haiku`, `sonnet`, `opus` 도 친숙한 alias로 인식합니다.

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

프록시가 실행 중이면 선택된 모델의 latency를 약 5분마다 보수적인 백그라운드 probe 배치로 갱신합니다. Probe는 picker와 같은 cooldown 규칙을 사용합니다.

기본 포트는 `4567` 입니다. `--port` 로 바꿀 수 있습니다:

```bash
omfm start --port 4600
```

## 5. 클라이언트 연결

Mode별 모델을 지정할 수 있는 클라이언트에서는 `omfm/fast`, `omfm/balanced`, `omfm/capable` 을 사용하세요. `haiku`, `sonnet`, `opus` 는 세 그룹의 alias로 동작합니다.

### OpenAI 호환 클라이언트

OpenCode, Hermes Agent, OpenClaw 등 OpenAI 호환 클라이언트에서 아래와 같이 설정합니다:

```text
baseURL=http://localhost:4567/v1
```

`0.0.1` 에서 필요한 엔드포인트:

- `GET /v1/models`
- `POST /v1/chat/completions`

### Anthropic 호환 클라이언트 (Claude Code)

아래 환경변수를 설정합니다:

```bash
export ANTHROPIC_BASE_URL=http://localhost:4567/anthropic
export ANTHROPIC_AUTH_TOKEN=omfm-local
export ANTHROPIC_API_KEY=
```

`0.0.1` 에서 필요한 엔드포인트:

- `POST /anthropic/v1/messages`
- `POST /anthropic/messages` (alias)

`omfm` 은 로컬 Anthropic 인증 헤더를 받아서 선택된 모델에 맞는 provider 키로 요청을 forward합니다. provider가 자체 Anthropic 호환 엔드포인트를 노출하면 (예: OpenRouter의 Anthropic surface) `omfm` 은 그쪽을 우선 사용하고, 그렇지 않으면 텍스트 전용 Anthropic→OpenAI 번역으로 fallback합니다.

## 6. 진단

```bash
omfm doctor
omfm usage
omfm usage --json
```

`doctor` 는 config 경로, provider 키 출처, 선택된 모델 수, 캐시된 모델 수, 데몬 상태를 출력합니다. 클라이언트 설정은 건드리지 않습니다.

`usage` 는 모델별 요청 수, 성공/실패 수, 그리고 non-streaming provider 응답에서 관측된 토큰 합계를 출력합니다. Streaming 요청은 요청 수에는 포함되지만, stream passthrough에서는 보통 토큰 합계를 알 수 없습니다.

## 7. 라우팅 및 latency 규칙

- `omfm model` 로 선택한 모델만 라우팅 후보에 포함됩니다.
- 요청에 모델 이름이 명시되어 있으면 `omfm` 은 그 모델을 그대로 사용합니다. provider prefix가 붙은 로컬 모델 ID는 매칭되는 upstream 모델 ID도 인식합니다.
- 모델 이름이 없거나 알 수 없는 이름이면, 로컬에서 측정한 latency가 가장 낮은 선택 모델로 라우팅합니다.
- 그룹 모델명 (`omfm/fast`, `omfm/balanced`, `omfm/capable`, 그리고 `haiku`/`sonnet`/`opus`) 은 해당 그룹에 선택된 모델이 있으면 그 그룹 안에서만 라우팅합니다. 빈 그룹은 전체 선택 목록으로 fallback합니다.
- rate-limit (HTTP 429) 또는 quota (HTTP 402) 가 발생한 모델은 약 10분간 후보에서 빠집니다. 선택된 모델 전체가 cooling 상태면 latency 정렬 전체 목록으로 fallback해 요청을 이어갑니다.
- 요청이 성공하면 로컬 latency 캐시를 갱신합니다.
- `omfm start` 는 프록시 실행 중에도 선택된 모델의 latency를 백그라운드에서 갱신합니다.
- Latency 정보가 없으면 picker에서 저장한 선택 순서로 fallback합니다. picker와 `omfm model --all` 은 추천 정렬 기준으로 저장합니다.
- `0.0.1` 에서는 hosted latency 서비스를 사용하지 않습니다.

## 8. 개발

`omfm` 자체를 작업하려면:

```bash
git clone https://github.com/hakilee/oh-my-free-models
cd oh-my-free-models
npm install
npm test
npm run typecheck
npm run build
```
