# Decision Records

Owner: Maintainers / decision authors
Last updated: 2026-05-03
Next review trigger: whenever a durable tradeoff is accepted, rejected, or superseded.


Purpose: keep ADR-lite records for durable tradeoffs that future agents should not re-litigate.

Freshness rule: add or update a decision record when provider, latency, compatibility, docs harness, or validation strategy changes create a meaningful tradeoff.

File naming: `YYYY-MM-DD-short-title.md` using lowercase words and hyphens.

## ADR-lite template

```md
# ADR YYYY-MM-DD — Short decision title

## Decision
One sentence describing the chosen path.

## Context
Facts, constraints, and links that shaped the decision.

## Rejected alternatives
- Alternative: why it was rejected.

## Consequences
What future agents must preserve or revisit.

## Verification
Commands, tests, or dry runs that prove the decision still holds.
```

## Index

- No project ADRs yet. Promote durable tradeoffs into dated records here as they are accepted; transient planning notes belong in route pages or local workflow folders, not in this index.
