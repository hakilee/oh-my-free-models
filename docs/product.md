# Product

`oh-my-free-models` (`omfm`) is a local free-model proxy for coding agents. It gives OpenAI-compatible and Anthropic-compatible tools a localhost endpoint while selecting among user-approved free models by local latency observations. User-facing overview remains in [README.md](../README.md), and full setup lives in [INSTALLATION.md](INSTALLATION.md).

## What it provides

- A CLI named `omfm` for selecting models, starting or stopping the local proxy, checking daemon status, and viewing model usage counters.
- OpenAI-compatible routes under `http://localhost:4567/v1`:
  - `GET /v1/models`
  - `POST /v1/chat/completions`
- Anthropic-compatible routes under `http://localhost:4567/anthropic`:
  - `POST /anthropic/v1/messages`
  - `POST /anthropic/messages`
- Local selection state, latency observations, and usage counters under `~/.oh-my-free-models`.

## Product invariants

- The package does not auto-start a daemon during install; users explicitly run `omfm start` or `omfm start --daemon`.
- Only models selected by `omfm model` are eligible for request routing.
- If a request names a selected model, the proxy honors it; provider upstream IDs also match selected local models when available. Generic or unknown model names route by lowest known latency or deterministic selected order.
- While the proxy is running, selected models are periodically probed in conservative background batches to refresh local latency observations.
- Model groups `fast`, `balanced`, and `capable` let clients address separate pools with `omfm/fast`, `omfm/balanced`, `omfm/capable`, or the `haiku`/`sonnet`/`opus` aliases. Non-empty groups route only within that group; empty groups fall back to the full selected list.
- Supported provider adapters must preserve free/text eligibility and selected-model allowlisting.
- Unsupported modalities and non-chat endpoints remain out of scope for version `0.0.1` unless an implementation task changes the product contract.

## Model selection experience

- The model picker and static table surface current selections first, then healthier recommendations by cached latency and provider catalog rank.
- The interactive picker exposes top tabs for `All`, `Fast`, `Balanced`, and `Capable`; group tabs assign mode-specific pools while keeping group members in the global eligible list.
- Saving from the picker preserves the displayed order so the UI recommendation order also acts as the no-latency routing fallback.
- `omfm model --all` uses the same recommendation-sorted display order; explicit `--select` keeps the user-provided order.
- `omfm model --group fast|balanced|capable --select ...` assigns group pools while also keeping those models eligible in the main selected allowlist.

## Agent task routes

| Task | Start here | Then inspect |
| --- | --- | --- |
| Provider support or model catalog behavior | `docs/provider-guide.md` | `research/providers.md`, `src/providers`, provider tests |
| Latency routing or probe behavior | `docs/latency-routing.md` | `research/latency-routing.md`, `src/latency`, latency tests |
| OpenAI/Anthropic client compatibility | `docs/client-compatibility.md` | `research/client-compatibility.md`, `src/server`, server and translation tests |

## Update rule

Update this page when README-level product behavior changes. Keep user instructions in README and keep this page focused on product behavior, invariants, and routing.
