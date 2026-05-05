# Latency Routing

Use this route for latency routing, probe scheduling, candidate ordering, and request fallback behavior. Do not edit latency runtime code unless the active task owns latency implementation.

## Current routing model

- Implementation anchors: [src/latency/router.ts](../src/latency/router.ts), [src/latency/probe.ts](../src/latency/probe.ts), [src/latency/probe-scheduler.ts](../src/latency/probe-scheduler.ts), [src/latency/background-prober.ts](../src/latency/background-prober.ts), and [src/config/store.ts](../src/config/store.ts) for cooldown bookkeeping.
- `chooseModel` honors a requested model only when it is selected and not a generic alias, even when that model is in cooldown. Server routing normalizes provider upstream IDs to selected local IDs before calling the router.
- `chooseGroupedModel` and server retry ordering recognize `omfm/fast`, `omfm/balanced`, `omfm/capable`, plus `haiku`, `sonnet`, and `opus` aliases. Non-empty groups route and retry only within that configured group; empty groups fall back to the full selected list.
- Generic or unknown requests choose the selected model with the lowest finite latency observation, skipping models whose `cooldownUntil` is still in the future.
- Selected models that received a recent rate-limit (HTTP 429) or quota (HTTP 402) response enter a 10-minute cooldown and are not picked until the window expires.
- When every selected model is in active cooldown, routing falls back to the full latency-ordered selection so requests do not stall.
- If no latency is known, routing falls back to deterministic selected order. The model picker and `omfm model --all` write that order from the recommendation-sorted display; explicit `--select` keeps the provided order.
- `orderedCandidates` orders retry candidates by status rank (healthy first, other failures next, cooling last), then by known latency and selected order, including latency ties.
- `omfm start` runs a conservative background probe loop for selected models while the proxy is alive. It waits briefly after startup, probes selected models in low-concurrency batches, and repeats about every 5 minutes.

## Required route for latency work

1. Start at `AGENTS.md`, then `docs/index.md`, then this file.
2. Read `research/latency-routing.md` for measurement assumptions, strategy notes, and open questions.
3. Inspect source anchors:
   - `src/latency` for routing and probe behavior.
   - [src/server/create-server.ts](../src/server/create-server.ts) for retry candidate usage and success/failure recording.
   - [src/commands/model-tui.ts](../src/commands/model-tui.ts) for interactive probe scheduling entry points.
   - [src/commands/start.ts](../src/commands/start.ts) and [src/latency/background-prober.ts](../src/latency/background-prober.ts) for server-lifetime background probing.
4. Inspect tests:
   - `test/router.test.ts`
   - `test/probe.test.ts`
   - `test/probe-scheduler.test.ts`
   - `test/background-prober.test.ts`
5. Define verification before implementation: route-choice determinism, tie-breaking, retry ordering, probe pacing, and provider-specific probe behavior.

## Contract checks

- Selected model order is a fallback contract; do not replace it with nondeterministic iteration.
- Model group order is also a fallback contract inside each group.
- Latency observations must be finite numbers before they influence routing.
- Quota and rate-limit handling during probes should avoid unnecessary free-model usage.
- Request success may update latency cache; failed provider attempts should not be treated as successful latency observations.

## Update rule

Update this page and `research/latency-routing.md` when route-choice semantics, probe pacing, latency cache shape, provider probing, or retry behavior changes. Keep benchmarks and experiments in research or decision records.
