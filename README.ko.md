<p align="center">
  <img src="./oh-my-free-models-character.png" height="96" alt="oh-my-free-models character" />
</p>

# oh-my-free-models

[English](./README.md) | 한국어 | [简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md) | [日本語](./README.ja.md)

`oh-my-free-models` (`omfm`) 는 코딩 에이전트를 여러 무료 provider 중 지금 가장 빠른 모델로 라우팅하는 로컬 프록시입니다. OpenAI 또는 Anthropic 호환 에이전트의 baseURL을 `localhost` 로 바꾸고 free 모델 몇 개를 골라두면, latency·rate-limit·quota가 흔들리는 동안에도 `omfm` 이 요청을 계속 흘려보냅니다.

## 왜 필요한가

Free tier 코딩 에이전트는 스펙 시트에서는 멀쩡해 보이지만, 실제로 돌려보면 네 군데에서 막힙니다.

**Rate limit이 작업 중간에 끊습니다.** OpenRouter나 NVIDIA의 free 모델은 429를 예고 없이 던집니다. 잘 돌던 실행이 도구 호출 한 번에 멈추고, 사람이 직접 다시 시도해야 합니다.

**Latency가 시간대마다 출렁입니다.** 같은 free 모델이 아침엔 빠르고 오후엔 못 쓸 정도로 느려집니다. 시간과 지역에 따라 다르기 때문에, "빠른 모델"을 미리 정해둘 수 없습니다. "지금 이 순간 빠른 모델"만 있을 뿐입니다.

**Quota가 마르면 provider를 손으로 갈아끼워야 합니다.** 한 provider의 free quota가 떨어지면 키와 baseURL을 직접 바꿔야 합니다. 에이전트 설정은 그 변화를 스스로 따라잡지 않습니다.

**Free 카탈로그가 자주 바뀝니다.** 모델이 새로 생기고, 사라지고, deprecated 표시가 붙고, 조용히 에러를 뱉기 시작합니다. 대시보드가 알려주는 게 아니라 벽에 부딪혀야 알게 됩니다.

## omfm이 하는 일

쓸 free 모델의 allowlist를 `omfm` 에 넘기면 `http://localhost:4567` 에서 로컬 프록시로 동작합니다. 내부에서 처리하는 것들:

- 모델별 latency를 내 머신 기준으로 측정·캐시
- 일반 (특정 모델 미지정) 요청을 가장 빠른 살아있는 후보로 라우팅
- 방금 429/402 를 받은 모델은 약 10분간 후보에서 제외 — 에이전트가 같은 벽에 두 번 부딪히지 않도록
- OpenAI 호환 (`/v1`) 과 Anthropic 호환 (`/anthropic`) surface를 동시에 노출 — drop-in 클라이언트는 코드 변경 없이 동작

에이전트는 `localhost` 만 바라봅니다. provider 전환, rate-limit 우회, "지금 빠른 모델" 선택은 그 아래에서 조용히 일어납니다.

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
- 라우팅 내부 동작: [docs/latency-routing.md](./docs/latency-routing.md)
- Provider 카탈로그: [docs/provider-guide.md](./docs/provider-guide.md)
