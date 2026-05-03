# Latency Routing Research

Update this page when `src/latency/*` behavior, latency tests, or model-selection assumptions change.

## Current local anchors

- Implementation: `src/latency/router.ts`, `src/latency/probe.ts`, `src/latency/probe-scheduler.ts`
- Tests: `test/router.test.ts`, `test/probe.test.ts`, `test/probe-scheduler.test.ts`
- Routing semantics live in `docs/latency-routing.md`; this page records research-grade detail only.

## Findings beyond the route page

- Interactive probes run bounded parallel batches with conservative pacing; the probe scheduler skips models whose cooldown is still active to avoid extending it with another rate-limit response.
- Row-level rate-limit responses do not stop later probes; quota or payment responses stop unstarted probes for that run without overwriting cached latency.
- No hosted latency service is used in version `0.0.1`.
- The model picker writes selected IDs in recommendation display order. That keeps the no-latency routing fallback aligned with the same local evidence users saw when saving selections.
- Server routing resolves a selected model by local ID or provider upstream ID before latency ordering, which matters for provider-prefixed NVIDIA IDs.

## Pending research

- Define the acceptable refresh cadence for stale latency measurements.
- Tune the 10-minute rate-limit cooldown as real provider quotas are observed.
- Record future cache and pacing tradeoffs in `research/decisions/`.

## Latency-change checklist

1. Document the intended routing or probe policy here before implementation changes.
2. Update `docs/latency-routing.md` if file anchors, invariants, or verification commands change.
3. Add or adjust `test/router.test.ts`, `test/probe.test.ts`, and `test/probe-scheduler.test.ts` coverage.
4. Run `npm test`, `npm run typecheck`, and `npm run build`.
5. Record durable tradeoffs in `research/decisions/` when changing cache or quota semantics.
