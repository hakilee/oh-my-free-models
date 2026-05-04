# README Why-Focused Refactor — Design

Date: 2026-05-04
Owner: hakilee
Status: Approved (pending implementation)

## Goal

Restructure the project's user-facing entry doc so a first-time visitor immediately understands **why** `oh-my-free-models` (`omfm`) exists and what pain it solves, rather than skimming install commands. Move all setup/CLI/configuration reference into a separate `INSTALLATION.md`. Provide a Korean mirror for both files.

## Non-goals

- No runtime behavior change.
- No changes to `src/` or `test/`. `docs/` route pages (provider-guide, latency-routing, client-compatibility, product, architecture) are not modified; only `docs/index.md` gets a one-line addition under "Maintenance rules" to record the README/INSTALLATION split.
- No changes to `scripts/check-docs.mjs` (verified it does not enforce README headings; it only validates required-file presence and link integrity).
- Not translating `docs/` route pages — those remain English per existing maintenance rule.

## "Why" angle (anchor for tone)

The chosen narrative is **"free tier coding-agent pain solved by local latency-aware routing across providers"**. Specifically the four pains:

1. Free tier rate-limits (HTTP 429) hit unpredictably and stall the agent mid-task.
2. The same free model's latency varies sharply by time and region.
3. When one provider's quota dries up, the user has to manually swap keys and base URLs.
4. The free-model catalog churns; "what's fast and live right now" is hard to know.

`omfm` answers all four with: user-curated allowlist, locally observed latency cache, automatic cooldown of rate-limited models, and OpenAI/Anthropic-compatible drop-in surface.

## File layout after refactor

```
README.md           — English, why-focused, ~80–120 lines target
README.ko.md        — Korean mirror, equivalent structure and length
INSTALLATION.md     — English setup/CLI/config reference (absorbs ~90 lines from old README)
INSTALLATION.ko.md  — Korean mirror of INSTALLATION.md
docs/               — agent-oriented English route map; only docs/index.md gets a one-line maintenance-rules update
```

`README.md` and `INSTALLATION.md` live at repository root for GitHub discoverability and to sit next to `LICENSE`. `docs/` continues to serve agents and contributors as a maintained route map; the new install doc is for **humans setting up for the first time**, which is a different audience than the route pages.

## README.md content outline

Both English and Korean versions share this structure. Localize prose, not structure.

1. **One-line definition** — "Local proxy that routes your coding agent to the fastest free model across providers."
2. **Why** (3–4 short paragraphs) — the four pains above, written in problem-first prose, not feature lists.
3. **What omfm does** (one paragraph) — allowlist + latency cache + cooldown + OpenAI/Anthropic drop-in.
4. **30-second try-it** (4-line code block) — install, key, model, start. No explanation; pointer below.
5. **Use it from your agent** — two short blocks: OpenAI-compatible `baseURL`, Anthropic-compatible env vars.
6. **More** — bullet list of links: `INSTALLATION.md`, `README.ko.md` (or `README.md` from the Korean side), `docs/latency-routing.md`, `docs/provider-guide.md`.

Length budget: 80–120 lines per file. Anything longer belongs in `INSTALLATION.md` or `docs/`.

## INSTALLATION.md content outline

Reorder existing README sections into a first-time-user flow:

1. Install (`npm install -g`)
2. API key configuration (env vars, then `~/.oh-my-free-models/.env`)
3. Selecting models (`omfm model` interactive picker, all keybindings, all non-interactive flags)
4. Starting the proxy (foreground / `--daemon` / `status` / `stop` / `--port`)
5. Connecting clients (OpenAI-compatible block, Anthropic-compatible block, including required endpoints)
6. Diagnostics (`omfm doctor`)
7. Routing & latency (the full bullet list currently in README)
8. Limitations in 0.0.1
9. Development (`npm install`, `npm test`, `npm run typecheck`, `npm run build`)

Korean version mirrors structure; localize prose and command descriptions, not commands themselves.

## package.json change

Update the `files` array so npm-installed package ships the new files alongside `README.md`:

```json
"files": [
  "dist",
  "README.md",
  "README.ko.md",
  "INSTALLATION.md",
  "INSTALLATION.ko.md",
  "LICENSE"
]
```

No other `package.json` changes.

## docs/index.md change

Append one line under "Maintenance rules" clarifying the new split:

> `README.md` is the why-focused entry; setup and CLI reference live in `INSTALLATION.md`. Korean mirrors are `README.ko.md` and `INSTALLATION.ko.md`.

This keeps the route map honest about where humans go versus where agents go.

## scripts/check-docs.mjs

No changes. Verified at design time:

- `requiredFiles` does not include `INSTALLATION.md` or the `.ko.md` mirrors. Adding them as required would make Korean-language coverage a CI gate, which is out of scope for this task.
- The script validates local Markdown links from required files. Because the new `README.md` will link to `INSTALLATION.md` and `README.ko.md`, both files must exist before the change lands; the implementation plan must add files in the right order or in the same commit.
- The 180-line compact limit only applies to `docs/` and `research/` files, not to `README.md` or `INSTALLATION.md`.

## Verification

After implementation:

```bash
npm run docs:check
npm test
npm run typecheck
npm run build
```

`docs:check` is the most relevant gate; the others are required by `CLAUDE.md` whenever `package.json` changes.

Manual checks:

- Open `README.md` and confirm a first-time reader can articulate the "why" within 30 seconds of reading.
- Confirm `INSTALLATION.md` covers everything the old README did, in setup-flow order.
- Confirm `README.ko.md` and `INSTALLATION.ko.md` mirror their English counterparts in structure and that all commands and code blocks are byte-identical (only prose is translated).
- Confirm internal links between the four files all resolve.

## Out of scope / explicit exclusions

- No translation of `docs/` route pages (existing rule: maintained docs in English).
- No new tests; `check-docs.mjs` already covers required-file and link integrity.
- No changes to provider, latency, or client-compatibility behavior.
- No CI workflow changes.

## Update rule

Update this spec only if the chosen "why" angle, file split, or `package.json` files-array decision changes. Implementation details belong in the plan produced by the writing-plans skill, not here.
