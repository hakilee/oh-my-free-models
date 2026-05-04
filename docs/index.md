# Documentation Index

This directory is the maintained route map for `oh-my-free-models`. Start here when deciding which files, research notes, and checks apply to a task.

## Routes

| Task | Read | Research / decisions | Code anchors | Test anchors |
| --- | --- | --- | --- | --- |
| Provider support | [Provider guide](provider-guide.md) | [Provider research](../research/providers.md) | `src/providers/*`, `src/server/create-server.ts`, `src/commands/model.ts` | `test/openrouter.test.ts`, `test/nvidia.test.ts`, provider-related server/model tests |
| Latency routing | [Latency routing](latency-routing.md) | [Latency research](../research/latency-routing.md) | `src/latency/*`, `src/server/create-server.ts`, `src/commands/model-tui.ts` | `test/router.test.ts`, `test/probe.test.ts`, `test/probe-scheduler.test.ts` |
| Client compatibility | [Client compatibility](client-compatibility.md) | [Client research](../research/client-compatibility.md) | `src/server/*`, `src/server/translate.ts` | `test/server.test.ts`, `test/translate.test.ts` |
| Product behavior | [Product notes](product.md) | [Research index](../research/index.md) | `src/cli.ts`, `src/commands/*`, `src/server/*` | User-visible command and API tests in `test/` |
| Architecture boundaries | [Architecture](architecture.md) | [Decision records](../research/decisions/README.md) | `src/config/*`, `src/providers/*`, `src/latency/*`, `src/server/*` | Layer-specific tests |

## Maintenance rules

- `README.md` is the why-focused entry doc; setup and CLI reference live in `INSTALLATION.md`. Both ship in five languages (`*.md`, `*.ko.md`, `*.zh-CN.md`, `*.zh-TW.md`, `*.ja.md`); see `AGENTS.md` § "Multilingual user-facing docs" for update rules.
- `docs/` stays compact and route-oriented.
- `research/` stores reusable findings and decision records that are too detailed for route pages.
- Keep all maintained documentation under `docs/` and `research/` in English. Top-level user-facing docs ship five languages.

## Validation

Run:

```bash
npm run docs:check
```

Expected coverage: required docs and research files exist, local markdown links resolve, route pages point to their code and test anchors, and maintained docs avoid stale or origin-focused wording.

## Update rule

Update this index whenever a top-level route, source anchor, test anchor, or research note becomes the preferred entry point. Keep entries short and move details to the linked page.
