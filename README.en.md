# dsh-decision-layer

> English | [简体中文](README.md)

`dsh-decision-layer` adds structured, explicitly scoped decisions to the DeepSeek Harness (DSH) agent loop, backed by a pluggable adjudication backend. Dangerous-call gating, output self-check, tool narrowing, and loop prevention hook into the agent loop as automatic interventions.

> **0.7.1 is a preview release.** The plugin works, but how much real value the adjudication interventions add is still being explored — every threshold is an unvalidated heuristic default. Treat it as something to observe, not a proven guarantee of impact. See [ROADMAP.md](<ROADMAP.md>) for scope and progress.

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

> The repository no longer commits the built `lib/client.js` ([ADR-0012](<docs/adr/0012-distribution-via-github-actions.md>)), so installing `github:xbzbing/dsh-decision-layer` without a ref does **not** work — that tree has no `lib/`, and while the host half still loads, the panel never appears. Use the Release tarball on the GitHub side.

Or build locally and install the `file:` path:

```sh
npm ci --ignore-scripts
npm run build:client
dsh plugin --profile web add file:/absolute/path/dsh-decision-layer
```

Restart `dsh web` and refresh after installing or updating: the host and client halves build their mount and bundle manifests at server start, so a page refresh alone may not reflect changes. The management API only accepts same-origin requests on the local loopback web server. Do not enter a production key before confirming the destination and data flow.

## Features

- **Manual verdicts** — `decision_evaluate` and the `decision-layer` skill submit `noul` / `score` / `choice` questions; `decision_check_connection` tests connectivity. Manual calls do not count as automatic decisions and do not change agent behavior.
- **Dangerous-call gate** — before a destructive tool call, a redacted summary asks the backend for a verdict; only a high-confidence deny blocks the call. Allow, ask, low confidence, backend failure, and invalid responses do not intervene and run the host's original path. Rules and the block confidence floor are configurable.
- **Output self-check and quality trend** — scores the final reply at turn end (0–2), observe-only by default; an opt-in low-score re-prompt fires at most once per turn. Several consecutive high-confidence low scores tint the dock trigger grey → amber → red as a reminder.
- **Tool narrowing** — at turn start, drops optional tools by task relevance, intersecting the host-allowed set and never expanding it; core tools and keep-prefix matches are always kept, over-cap falls back to observe-only, too-few-kept is treated as untrustworthy and skipped, and small-context backends are batched automatically. Enforced by default; observe-only is available.
- **Task-completion review** — when the user spells out multiple delivery conditions, each is judged satisfied / unsatisfied / insufficient evidence, with tool evidence primary. Observe-only by default, with an opt-in re-prompt.
- **Loop guard** — denies the same call repeated consecutively past a threshold; deterministic, local, and backend-free. The per-feature switches do not affect it, but the session master switch pauses it too.
- **Session panel and decision-analysis view** — the panel shows automatic-decision metrics, the session master switch, and the recent log; the "Decision analysis" tab shows a per-session process profile, trend backtest, and decision accuracy, with per-row ratings and a session intervention switch.
- **Configuration and persistence** — each decision point has its own switch and configurable thresholds in the plugin details, written to `~/.config/dsh-decision-layer/config.json` and applied live. Defaults and field names are in [ADR-0006](<docs/adr/0006-configurable-thresholds.md>). You can also edit that file by hand, but only with valid values: an out-of-range value, a misspelled field, or a wrong type makes the whole config fail validation, the config page cannot load it, and every decision point reverts to its own safe default (see [ADR-0005](<docs/adr/0005-config-wholesale-replace-and-live-reload.md>)). Decision logs and session metrics persist for 30 days for review and calibration.
- **Pluggable backend** — defaults to `https://api.typesafe.ai` and `jev-latest`, with per-field URL/key/model overrides under the same protocol; no request without a key. A custom `http://` endpoint requires confirming the plaintext-transport risk for that exact URL, and again whenever the URL changes.

## Privacy and backend

Once a key is configured, the plugin sends adjudication requests to the remote endpoint `https://api.typesafe.ai` (model `jev-latest`) by default. The payload carries real context:

- Gate: the tool name plus redacted command/path summaries (up to 2048 characters each).
- Self-check: the turn's final reply (up to about 24K characters).
- Narrowing: the text of this step's user messages (up to about 8K characters) plus candidate tool names/descriptions.
- Task-completion review: delivery conditions extracted from this turn's user messages (up to 20), tool names with their ok/error status (no arguments or output), and the first ~8K characters of the reply.
- Manual verdicts: `decision_evaluate` and the `decision-layer` skill send whatever the agent submits, unchanged.

User-message text may include context the host injects, such as workspace instructions (AGENTS.md), runtime details, and memory snippets. This content leaves your machine, and the remote provider may log, retain, or otherwise use it depending on its terms; redaction and truncation reduce risk but are not anonymization.

Two kinds of data are also stored locally for 30 days: decision logs in `~/.config/dsh-decision-layer/logs/` and session snapshots in `~/.config/dsh-decision-layer/state/`. They include redacted command/path summaries and short request subjects; delete them yourself if needed.

**If your session content is sensitive, prefer a locally deployed model** so adjudication data never leaves the machine. `tev1` is served natively by ollama at `/v1/systemone`; see [Running with a local tev1](<docs/en/deploy-tev1-with-plugin.md>). Any other local model works as long as it exposes a compatible `/v1/systemone` endpoint, pointed to from the config page.

## Safety boundary and development

Automatic intervention only subtracts: the gate only denies, narrowing only removes tools, and neither grants new permissions. The gate only blocks on a high-confidence deny; on backend failure, low confidence, or an invalid response it does not intervene and runs the host's original path. Self-check, narrowing, and loop-guard errors skip intervention. The redacted gate summary sent to the backend carries only tool name and command/path with secret redaction; the plugin never reads file content, but the command itself (for example a heredoc or text written with echo) is included as-is. Node.js `>=20.11`; `npm test` runs the tests, `npm run build:client` builds `lib/client.js` (this is also where strict `tsc` runs), and `npm run check` runs both. **Build output is not committed** ([ADR-0012](<docs/adr/0012-distribution-via-github-actions.md>)): `lib/` is gitignored and the source is the only source of truth. Releases run through `.github/workflows/release.yml`, which builds, gates, `npm pack`s and then asserts with `scripts/assert-pack.mjs` that the tarball really carries `lib/client.js` and leaks no sources — only then does it publish to npm or open a Release. It runs when a version bump lands on main and publishes through npm Trusted Publishing (OIDC), so no long-lived token is involved. Architecture decisions live in [docs/adr/](<docs/adr/README.md>): why each rule exists and what was rejected. 0.7.1 is a preview: the interventions work, but their real value and thresholds are still being explored — feedback on misjudgments and feel observed in the decision log is welcome.
