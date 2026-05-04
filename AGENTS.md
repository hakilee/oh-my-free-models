# Agent Guide — oh-my-free-models

This repository is a TypeScript/Node local proxy that exposes free models from supported providers (currently OpenRouter and NVIDIA) through OpenAI-compatible and Anthropic-compatible client surfaces. Keep this file short: it is a route map, not the source of truth.

## Start Here

1. Read [`docs/index.md`](docs/index.md) to pick the right lane.
2. Use [`README.md`](README.md) for user-facing install, configuration, proxy, and development commands.

## Common Task Routes

| Task | Read first | Source anchors | Verification anchors |
| --- | --- | --- | --- |
| Provider support | `docs/provider-guide.md`, `research/providers.md` | `src/providers/*` | `test/openrouter.test.ts`, `test/nvidia.test.ts`; add/update provider-specific tests when providers change |
| Latency routing | `docs/latency-routing.md`, `research/latency-routing.md` | `src/latency/*` | `test/router.test.ts`, `test/probe.test.ts`, `test/probe-scheduler.test.ts` |
| Client compatibility | `docs/client-compatibility.md`, `research/client-compatibility.md` | `src/server/*`, `src/server/translate.ts` | `test/server.test.ts`, `test/translate.test.ts` |

## Project Boundaries

- Do not introduce runtime behavior changes from docs-only tasks.
- Do not change `src/providers/*` or `src/latency/*` unless the active task explicitly owns provider or latency implementation.
- Do not add dependencies unless the task explicitly requires and justifies them.
- Keep documentation compact and route-oriented; prefer links to maintained route pages over duplicating details.

## Local Verification

Run the smallest proof first, then broaden as needed:

```bash
npm run docs:check
npm test
npm run typecheck
npm run build
```

Use `npm run docs:check` for documentation structure once the docs harness is present. If `package.json` or scripts change, run `npm test`, `npm run typecheck`, and `npm run build` before reporting completion.

## Freshness Rule

When you change provider, latency, or client compatibility behavior, update the matching `docs/` route and `research/` note in the same change or record why no documentation update was needed.

## Multilingual user-facing docs

`README.md` and `INSTALLATION.md` ship in five languages at the repository root:

- English: `README.md`, `INSTALLATION.md`
- 한국어: `README.ko.md`, `INSTALLATION.ko.md`
- 简体中文: `README.zh-CN.md`, `INSTALLATION.zh-CN.md`
- 繁體中文: `README.zh-TW.md`, `INSTALLATION.zh-TW.md`
- 日本語: `README.ja.md`, `INSTALLATION.ja.md`

When any of these changes:

1. Update every language version in the same change. Code blocks, commands, env vars, file paths, port numbers, and model IDs must stay byte-identical across languages — only prose is translated. Inline `#` comments inside example shell blocks may be translated to match each language.
2. Dispatch a native-speaker writer for each non-source language to verify the translation reads naturally to a reader from that language's region (e.g., mainland Chinese for `zh-CN`, Taiwan for `zh-TW`, Japan for `ja`, Korea for `ko`, US/UK for English) — not as translationese.
3. The language switcher header at the top of each file lists all five languages; the current language is plain text, the others are relative links. Keep this row consistent across files when adding or renaming languages.
4. `npm run docs:check` validates link integrity for required files; manually confirm cross-language links resolve when adding or removing language mirrors.

## Behavioral Principles

Bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These principles are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
