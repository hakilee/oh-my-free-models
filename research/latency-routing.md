# Latency Routing Research

Update this page when `src/latency/*` behavior, latency tests, or model-selection assumptions change.

## Current local anchors

- Implementation: `src/latency/router.ts`, `src/latency/probe.ts`, `src/latency/probe-scheduler.ts`, `src/latency/background-prober.ts`
- Tests: `test/router.test.ts`, `test/probe.test.ts`, `test/probe-scheduler.test.ts`, `test/background-prober.test.ts`
- Routing semantics live in `docs/latency-routing.md`; this page records research-grade detail only.

## Findings beyond the route page

- Interactive probes run bounded parallel batches with conservative pacing; the probe scheduler skips models whose cooldown is still active to avoid extending it with another rate-limit response.
- Row-level rate-limit responses do not stop later probes; quota or payment responses stop unstarted probes for that run without overwriting cached latency.
- No hosted latency service is used in version `0.0.1`.
- The model picker writes selected IDs in recommendation display order. That keeps the no-latency routing fallback aligned with the same local evidence users saw when saving selections.
- Server routing resolves a selected model by local ID or provider upstream ID before latency ordering, which matters for provider-prefixed NVIDIA IDs.
- Server startup now schedules a low-concurrency selected-model probe loop after a short delay and repeats it roughly every 5 minutes while the process is alive. This keeps latency cache fresh without introducing a hosted latency service. Shutdown aborts an active scheduler run, and unexpected background probe errors are surfaced as one-line daemon/foreground log messages.
- User-configured model groups are deliberately explicit instead of inferred from provider metadata. This avoids stale or subjective automatic "capability" classification while still matching coding-agent mode patterns through `fast`/`balanced`/`capable` and `haiku`/`sonnet`/`opus` aliases.

## Pending research

- Tune the background probe cadence if provider quota pressure or freshness needs change.
- Tune the 10-minute rate-limit cooldown as real provider quotas are observed.
- Record future cache and pacing tradeoffs in `research/decisions/`.

## Latency-change checklist

1. Document the intended routing or probe policy here before implementation changes.
2. Update `docs/latency-routing.md` if file anchors, invariants, or verification commands change.
3. Add or adjust `test/router.test.ts`, `test/probe.test.ts`, and `test/probe-scheduler.test.ts` coverage.
4. Run `npm test`, `npm run typecheck`, and `npm run build`.
5. Record durable tradeoffs in `research/decisions/` when changing cache or quota semantics.
