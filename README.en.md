# dsh-decision-layer

> English | [简体中文](README.md)

`dsh-decision-layer` adds structured, explicitly scoped decisions to the DeepSeek Harness (DSH) agent loop, backed by a pluggable adjudication backend. Dangerous-call gating, output self-check, tool narrowing, and loop prevention hook into the agent loop as automatic interventions.

> **0.7.4 is a preview release.** The plugin works, but how much real value the adjudication interventions add is still being explored — every threshold is an unvalidated heuristic default. Treat it as something to observe, not a proven guarantee of impact. See [ROADMAP.md](<ROADMAP.md>) for scope and progress.

## Installation

Published to npm and GitHub Release.

From npm (append `@latest`):

```sh
dsh plugin --profile web add dsh-decision-layer@latest
```

Or from a GitHub Release: install directly from the version's tgz asset URL.

```sh
dsh plugin --profile web add https://github.com/xbzbing/dsh-decision-layer/releases/download/v<version>/dsh-decision-layer-<version>.tgz
```

> The repository does not commit build output (`lib/`) ([ADR-0012](<docs/adr/0012-distribution-via-github-actions.md>)), so installing `github:xbzbing/dsh-decision-layer` without a ref does **not** work — that tree has neither `lib/host/` nor `lib/client.js`, so the plugin cannot load. Use the Release tarball on the GitHub side.

Or build locally and install the `file:` path:

```sh
npm ci --ignore-scripts
npm run build
dsh plugin --profile web add file:/absolute/path/dsh-decision-layer
```

Restart `dsh web` and refresh after installing or updating: the host and client halves build their mount and bundle manifests at server start, so a page refresh alone may not reflect changes. The management API only accepts same-origin requests on the local loopback web server. Do not enter a production key before confirming the destination and data flow.

## Features

- **Manual verdicts** — `decision_evaluate` and the `decision-layer` skill submit `noul` / `score` / `choice` questions; `decision_check_connection` tests connectivity. Manual calls do not count as automatic decisions and do not change agent behavior.
- **Dangerous-call gate** — before a destructive tool call, a redacted summary asks the backend for a verdict; only a high-confidence deny blocks the call. Allow, ask, low confidence, backend failure, and invalid responses do not intervene and run the host's original path. Rules and the block confidence floor are configurable. Gate rows carry the redacted command/path plus this turn's task excerpt, so a block can be reviewed in context.
- **Output self-check and quality trend** — scores the final reply at turn end (0–2), observe-only by default; an opt-in low-score re-prompt fires at most once per turn. Several consecutive high-confidence low scores tint the dock trigger grey → amber → red as a reminder. Self-check rows carry the turn number and the same task excerpt, and low rows carry a "low score" badge; the decision-analysis tab can show low scores only, so the scored turn is one click away in a long session (low-confidence low scores stay marked as noise to ignore).
- **Tool narrowing** — at turn start and again when a new user request arrives inside the same turn, drops optional tools by task relevance, intersecting the host-allowed set and never expanding it; each re-judgement releases the previous restriction first, the restriction is lifted when the turn stops, and notices such as time or background-job updates never trigger one. Core tools and keep-prefix matches are always kept, over-cap falls back to observe-only, too-few-kept is treated as untrustworthy and skipped, and small-context backends are batched automatically. Enforced by default; observe-only is available. Narrowing logs include the turn and step numbers plus an expandable task excerpt, so you can assess the dropped tools against the task; older logs are not backfilled. The host fixes the tool set before the decision point for a step fires, so a drop reaches the model from the next step on; narrowing covers the tool channel only — UI fences in the reply body and skill instructions are unaffected.
- **Task-completion review** — when the user spells out multiple delivery conditions, each is judged satisfied / unsatisfied / insufficient evidence. Conditions come only from the turn's latest request, so a retired list cannot be revived, and this turn's tool evidence is primary (an earlier turn's success does not count; self-reported completion is not evidence). Observe-only by default, with an opt-in re-prompt.
- **Read-only process checks (new in source, not yet released)** — off by default. After explicit enablement in advanced settings, progress heartbeats, repeated unresolved failures and edits after successful verification can schedule a background check within the same turn without another user prompt. The backend receives the current request and bounded tool evidence; findings are observation signals, with uncertain results kept separate. No prompts are added and no tools are restricted. Single flight, a rolling budget, short deadlines and stale-result cancellation keep the main agent independent. See [ADR-0017](<docs/adr/0017-read-only-execution-checkpoints.md>); task-level benefits have not been established.
- **Loop guard** — denies the same call repeated consecutively past a threshold; deterministic, local, and backend-free. The per-feature switches do not affect it, but the session master switch pauses it too.
- **Session panel and decision-analysis view** — the panel shows automatic-decision metrics, the session master switch, and the recent log; the "Decision analysis" tab shows a per-session process profile, trend backtest, and decision accuracy, with per-row ratings and a session intervention switch.
- **Configuration and persistence** — each decision point has its own switch and configurable thresholds in the plugin details, written to `~/.config/dsh-decision-layer/config.json` and applied live. Defaults and field names are in [ADR-0006](<docs/adr/0006-configurable-thresholds.md>). You can also edit that file by hand, but only with valid values: an out-of-range value, a misspelled field, or a wrong type makes the whole config fail validation, the config page cannot load it, and every decision point reverts to its own safe default (see [ADR-0005](<docs/adr/0005-config-wholesale-replace-and-live-reload.md>)). Decision logs and session metrics persist for 30 days for review and calibration.
- **Pluggable backend** — defaults to `https://api.typesafe.ai` and `jev-latest`, with per-field URL/key/model overrides under the same protocol; no request without a key. A custom `http://` endpoint requires confirming the plaintext-transport risk for that exact URL, and again whenever the URL changes.

## Privacy and backend

Once a key is configured, the plugin sends adjudication requests to the remote endpoint `https://api.typesafe.ai` (model `jev-latest`) by default. The payload carries real context:

- Gate: the tool name plus redacted command/path summaries (up to 2048 characters each); no conversation content.
- Self-check: this turn's request, the recent user asks and AI replies it needs for context (background only, each with its own budget, credentials masked), and the turn's final reply (opening and closing within a combined ~24K-character budget; the middle of an over-long reply is marked as omitted so the conclusion is not lost).
- Narrowing: the current request, the necessary recent background, and the latest execution progress (tool name, ok/error, bounded command/path and shell-result excerpts) plus candidate tool names/descriptions.
- Process checks (off by default): when enabled, the current request and bounded tool names, outcomes, redacted command/path and shell excerpts for the active window. No file-read, search or webpage result bodies, reasoning or PTC scripts. Budgets and invalidation are specified in ADR-0017.
- Task-completion review: delivery conditions extracted from this turn's latest user request (up to 20; a turn's earlier requests are not merged) and that request with its necessary background (credentials masked), this turn's tool evidence (tool name, ok/error, bounded command/path, plus a bounded shell-result excerpt with long unlabeled blobs masked again), and the first ~8K characters of the reply. Raw results from file reads, searches and network tools are never sent.
- Manual verdicts: `decision_evaluate` and the `decision-layer` skill send whatever the agent submits, unchanged.

Only real user messages are used as requests: host-injected content such as time notices, runtime details, memory snippets, system reminders and background-job updates is excluded or stripped, but anything you paste into the conversation still leaves your machine. The remote provider may log, retain, or otherwise use it depending on its terms; redaction and truncation reduce risk but are not anonymization.

Two kinds of data are also stored locally for 30 days: decision logs in `~/.config/dsh-decision-layer/logs/` and session snapshots in `~/.config/dsh-decision-layer/state/`. They include redacted command/path summaries; every decision row's task excerpt is at most 512 characters (injected memory/system-reminder blocks removed, common credential forms masked) and a row may carry its turn and step numbers. No extra copies of the full background, execution progress, tool results or reply text are persisted — only the excerpt and decision counters. New source process checks additionally retain trigger codes, the evidence sequence boundary and candidate counts. Automatic decisions can retain request correlation ids, latency, physical request counts and reported usage. Missing usage is not zero; usage returned after a retry describes the successful response, not necessarily all billed attempts. An unfinished request at plugin disposal may lack its final cost record. The excerpts are shown in the local session panel and decision-analysis view only; outbound adjudication content is the list above, and you can delete the local data yourself.

**If your session content is sensitive, prefer a locally deployed model** so adjudication data never leaves the machine. `tev1` is served natively by ollama at `/v1/systemone`; see [Running with a local tev1](<docs/en/deploy-tev1-with-plugin.md>). Any other local model works as long as it exposes a compatible `/v1/systemone` endpoint, pointed to from the config page.

## Safety boundary and development

Automatic intervention only subtracts: the gate only denies, narrowing only removes tools, and neither grants new permissions. The gate only blocks on a high-confidence deny; on backend failure, low confidence, or an invalid response it does not intervene and runs the host's original path. Self-check, narrowing, and loop-guard errors skip intervention. The redacted gate summary sent to the backend carries only tool name and command/path with secret redaction; the plugin never reads file content, but the command itself (for example a heredoc or text written with echo) is included as-is. Both halves are TypeScript under strict mode: `npm run build` type-checks with `tsc` and emits `lib/host/*.js` plus `lib/client.js` ([ADR-0015](<docs/adr/0015-typed-host-build.md>)); `npm test` builds first and then runs the tests, and `npm run check` matches CI (build, tests, and the packed-tarball check). Node.js `>=20.11` at runtime. **Build output is not committed** ([ADR-0012](<docs/adr/0012-distribution-via-github-actions.md>)): `lib/` is gitignored and the source is the only source of truth. Releases run through `.github/workflows/release.yml`, which builds, gates, `npm pack`s and then asserts with `scripts/assert-pack.mjs` that the tarball really carries the host entry and `lib/client.js`, and leaks no sources — only then does it publish to npm or open a Release. It runs when a version bump lands on main and publishes through npm Trusted Publishing (OIDC), so no long-lived token is involved. Architecture decisions live in [docs/adr/](<docs/adr/README.md>): why each rule exists and what was rejected. 0.7.4 is a preview: the interventions work, but their real value and thresholds are still being explored — feedback on misjudgments and feel observed in the decision log is welcome.
