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
