<p align="center">
  <img src="../oh-my-free-models-character.png" height="96" alt="oh-my-free-models character" />
</p>

# oh-my-free-models

[English](../README.md) | 한국어 | [简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md) | [日本語](./README.ja.md)

`oh-my-free-models` (`omfm`) 는 코딩 에이전트를 여러 무료 provider 중 지금 가장 빠른 모델로 라우팅하는 로컬 프록시입니다. OpenAI 또는 Anthropic 호환 에이전트의 baseURL을 `localhost` 로 바꾸고 free 모델 몇 개를 골라두면, latency·rate-limit·quota가 흔들리는 동안에도 `omfm` 이 요청을 계속 흘려보냅니다.

https://github.com/user-attachments/assets/44c07928-1544-4b33-a472-41e82f7aa7d7

> `omfm` 이 OpenCode를 라우팅된 free 모델에 연결해 동작하는 모습.

## 왜 필요한가

Free tier 코딩 에이전트는 스펙 시트에서는 멀쩡해 보이지만, 실제로 돌려보면 네 군데에서 막힙니다.

**Rate limit이 작업 중간에 끊습니다.** OpenRouter나 NVIDIA의 free 모델은 429를 예고 없이 던집니다. 잘 돌던 실행이 도구 호출 한 번에 멈추고, 사람이 직접 다시 시도해야 합니다.

**Latency가 시간대마다 출렁입니다.** 같은 free 모델이 아침엔 빠르고 오후엔 못 쓸 정도로 느려집니다. 시간과 지역에 따라 다르기 때문에, "빠른 모델"을 미리 정해둘 수 없습니다. "지금 이 순간 빠른 모델"만 있을 뿐입니다.

**Quota가 마르면 provider를 손으로 갈아끼워야 합니다.** 한 provider의 free quota가 떨어지면 키와 baseURL을 직접 바꿔야 합니다. 에이전트 설정은 그 변화를 스스로 따라잡지 않습니다.

**Free 카탈로그가 자주 바뀝니다.** 모델이 새로 생기고, 사라지고, deprecated 표시가 붙고, 조용히 에러를 뱉기 시작합니다. 대시보드가 알려주는 게 아니라 벽에 부딪혀야 알게 됩니다.

## omfm이 하는 일

쓸 free 모델의 allowlist를 `omfm` 에 넘기면 `http://localhost:4567` 에서 로컬 프록시로 동작합니다. 내부에서는 다음 일을 처리합니다.

| 기능 | 처리 방식 |
| --- | --- |
| Latency 추적 | 모델별 latency를 내 머신 기준으로 측정하고 캐시합니다. |
| 요청 라우팅 | 모델을 직접 지정하지 않은 요청을 가장 빠른 살아있는 후보로 보냅니다. |
| Cooldown | 방금 429/402 를 받은 모델은 약 10분 동안 후보에서 제외합니다. |
| 클라이언트 호환성 | OpenAI 호환 `/v1` 과 Anthropic 호환 `/anthropic` surface를 노출하고, Anthropic tool-use fallback과 로컬 token count도 지원합니다. |

에이전트는 `localhost` 만 바라봅니다. provider 전환, rate-limit 우회, "지금 빠른 모델" 선택은 그 아래에서 조용히 일어납니다.

## API 키 발급

`omfm`은 트래픽만 전달합니다. 두 provider 중 하나 또는 둘 모두에서 직접 키를 발급받아야 합니다.

**OpenRouter** — [openrouter.ai](https://openrouter.ai)에서 가입한 뒤 Keys 메뉴에서 키를 발급받습니다(prefix `sk-or-`). `:free` 모델은 하루 50회까지 사용할 수 있고, 크레딧을 $10 이상 충전하면 하루 1,000회로 늘어납니다. 무료 한도에는 신용카드가 필요하지 않습니다.

**NVIDIA** — [build.nvidia.com](https://build.nvidia.com)(NVIDIA Developer Program)에서 가입한 뒤 모델 카드의 "Get API Key" 버튼으로 발급받습니다(prefix `nvapi-`). 신용카드는 필요하지 않으며, rate-limit은 모델별로 적용됩니다.

가지고 있는 키를 `~/.oh-my-free-models/.env`에 넣어 두면, `omfm`은 키가 설정된 provider만 사용합니다.

## 30초 만에 시도하기

```bash
npm install -g oh-my-free-models
mkdir -p ~/.oh-my-free-models && echo 'OPENROUTER_API_KEY=sk-or-...' > ~/.oh-my-free-models/.env
omfm model        # picker에서 free 모델 몇 개 선택
omfm start        # http://localhost:4567 서빙
```

## 자주 쓰는 명령어

| 명령어 | 용도 |
| --- | --- |
| `omfm model` | Picker를 열고 사용할 free 모델을 저장합니다. |
| `omfm model --all` | Picker 없이 선택 가능한 모든 모델을 출력합니다. |
| `omfm model --no-tui` | TUI를 띄우지 않고 번호가 매겨진 정적 표와 한 줄 프롬프트로 모델을 선택합니다. |
| `omfm model --group fast --best` | fast 그룹을 probe하고 현재 가장 좋은 후보를 출력합니다. |
| `omfm start` | 로컬 프록시를 foreground로 실행하고 request/response 라우팅 로그를 출력합니다. |
| `omfm start --daemon` | 로컬 프록시를 background daemon으로 실행합니다. |
| `omfm status` | daemon, config, best-route 상태를 확인합니다. |
| `omfm stop` | background daemon을 중지합니다. |
| `omfm doctor` | config 경로, 키, 모델 캐시, daemon 상태를 점검합니다. |
| `omfm usage` | 모델별 요청 수와 token 관측치를 확인합니다. |

## 에이전트에서 쓰기

OpenAI 호환 클라이언트(OpenCode, Hermes Agent, OpenClaw 등)에서는 다음 값을 사용합니다.

```text
url=http://localhost:4567/v1
model=omfm             # 전체 풀; 또는 omfm/fast, omfm/balanced, omfm/capable
```

Anthropic 호환 클라이언트(Claude Code 등)에서는 다음 환경변수를 설정합니다.

```bash
export ANTHROPIC_BASE_URL=http://localhost:4567/anthropic
export ANTHROPIC_AUTH_TOKEN=omfm-local
export ANTHROPIC_API_KEY=
```

Claude Code의 모델 별칭도 `omfm` 그룹을 가리키도록 설정할 수 있습니다.

```bash
alias freeclaude='ANTHROPIC_BASE_URL=http://localhost:4567/anthropic ANTHROPIC_AUTH_TOKEN=omfm-local ANTHROPIC_API_KEY= CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 ANTHROPIC_DEFAULT_OPUS_MODEL=omfm/capable ANTHROPIC_DEFAULT_SONNET_MODEL=omfm/balanced ANTHROPIC_DEFAULT_HAIKU_MODEL=omfm/fast claude'
```

접두사 없는 `omfm`은 선택된 전체 풀로 라우팅되며, `omfm/capable`, `omfm/balanced`, `omfm/fast`는 각 모델 그룹으로 필터링됩니다. Claude 스타일 별칭인 `opus`, `sonnet`, `haiku`도 같은 그룹에 매핑됩니다. `omfm model`에서 고른 구체 모델 ID를 그대로 넘기면 해당 모델로 고정됩니다.

Anthropic surface는 로컬 `count_tokens` 추정치도 제공하며, OpenAI 호환 provider route로 fallback되는 경우 일반적인 tool-use/tool-result 흐름을 번역합니다.

## 컨텍스트 크기 맞추기

`omfm`은 요청을 라우팅된 모델로 그대로 전달하며, 에이전트 세션에 누적된 대화를 자동으로 압축(compact)하거나 요약하거나 잘라내지 않습니다. 따라서 컨텍스트 오버플로우는 실제로 발생할 수 있습니다. 긴 세션이 1M 토큰 컨텍스트 모델에서 시작된 뒤 128k/200k 모델로 라우팅되거나 페일오버되면, 프롬프트가 작은 모델의 컨텍스트 윈도를 넘는 순간 업스트림 제공자가 요청을 거절할 수 있습니다. 클라이언트 측 compact 기능으로 피할 수는 있지만, 항상 자동으로 처리된다고 가정하지 마세요.

모델을 고를 때는 라우팅 후보 풀마다 컨텍스트 크기 티어를 맞춰두세요. 예를 들어 긴 세션을 `capable`에서 쓴다면 그 그룹에는 약 1M 토큰 컨텍스트 모델만 넣거나, `fast`/`balanced`/`capable` 전체를 128k/200k 근처로 맞추세요. `omfm model` 선택 화면은 각 모델의 컨텍스트 크기를 보여줍니다. 컨텍스트 크기를 알 수 없는 모델은 값 없음으로 표시되므로, 긴 세션에서는 위험한 후보로 보세요.

## 더 알아보기

- 설치, 모든 CLI 플래그, 데몬 제어, 진단은 [INSTALLATION.ko.md](./INSTALLATION.ko.md)를 참고하세요.
- 라우팅 내부 동작은 [docs/latency-routing.md](./latency-routing.md)를 참고하세요.
- Provider 카탈로그는 [docs/provider-guide.md](./provider-guide.md)를 참고하세요.
- 라이선스: [MIT](../LICENSE.md)
