# dsh-decision-layer

> English | [简体中文](README.md)

`dsh-decision-layer` adds structured, explicitly scoped decisions to the DeepSeek Harness (DSH) agent loop, backed by a pluggable adjudication backend. Dangerous-call gating, output self-check, tool narrowing, and loop prevention hook into the agent loop as automatic interventions.

> **0.5.3 is a preview release.** The plugin works, but how much real value the adjudication interventions add is still being explored — every threshold is an unvalidated heuristic default. Treat it as something to observe, not a proven guarantee of impact. See [ROADMAP.md](<ROADMAP.md>) for scope and progress.

## Installation

Published to npm and GitHub.

From npm (append `@latest`):

```sh
dsh plugin --profile web add dsh-decision-layer@latest
```

Or from GitHub (no version — follows the branch or tag; the repository ships the built `lib/client.js`):

```sh
dsh plugin --profile web add github:xbzbing/dsh-decision-layer
```

Or build locally and install the `file:` path:

```sh
npm ci --ignore-scripts
npm run build:client
dsh plugin --profile web add file:/absolute/path/dsh-decision-layer
```

Restart `dsh web` and refresh after installing or updating: the host and client halves build their mount and bundle manifests at server start, so a page refresh alone may not reflect changes. The management API only accepts same-origin requests on the local loopback web server. Do not enter a production key before confirming the destination and data flow.

## Features

- **Manual verdicts** — `decision_evaluate` and the `decision-layer` skill submit `noul`, `score`, or `choice` questions; `decision_check_connection` tests connectivity. Neither counts as an automatic decision or changes agent behavior.
- **Configurable backend** — defaults to `https://api.typesafe.ai` and `jev-latest`, with per-field URL/key/model overrides under the same protocol. No request without a key. Custom HTTP endpoints require address-bound plaintext-risk confirmation.
- **Dangerous-call gate** — before a destructive tool call, a redacted summary asks the backend for a verdict, using a **two-tier model**: only a high-confidence deny is enforced monotonically through the guard to block that call; every other case (a high-confidence allow/ask, low confidence, backend failure, or an invalid result) does not intervene and runs the host's original path. The gate is a safety net that only blocks when the model is confident of danger — it never authorizes on the host's behalf or downgrades approval. Rules are configurable.
- **Output self-check** — scores the final output at turn end against a rubric (0–2, a probability-weighted mean across levels, so it can be fractional). Observe-only by default; an opt-in low-score re-prompt appends one prompt on your behalf when the score is low and the model is confident, at most once per turn.
- **Task-completion review** — when the user spells out multiple delivery conditions (numbered / bulleted / multi-command), each is judged satisfied / unsatisfied / insufficient-evidence via a choice before turn end, with tool evidence primary and self-reported replies not counting as evidence; extraction is deterministic and never infers implicit expectations. Observe-only by default, steer configurable, coexisting with self-check and tracked as separate metrics.
- **Output-quality trend alert** — a read-only reminder built on self-check data. After several consecutive high-confidence low scores, the trigger button's icon shifts from grey to amber to red, with a hover hint that the task may have grown harder or the model may be fluctuating and suggesting a prompt tweak or model swap. Purely a hint, never driving automatic intervention; the three thresholds (high-confidence bar / consecutive rounds / severe tier) are configurable (defaults 0.6 / 3 / 5), conservative, and pending real-data calibration.
- **Tool narrowing** — at turn start, a noul judges each optional tool's relevance to the task and drops the ones not needed (relevance probability below the drop threshold, default 0.3, configurable), intersecting the host-allowed set and never expanding it. Enforced by default; switch to observe-only to log without changing the tool set. Three safeguards: core tools (read/write/edit/shell/search/todos, plus agent meta-abilities such as asking the user, goals, skills, delivery, background jobs, and teamwork) are always kept and never judged; more optional tools than the candidate cap (default 20, configurable) falls back to observe only; fewer than 5 tools remaining is treated as untrustworthy and skipped. Tools matching a **keep-prefix** allowlist (defaults to `mcp__openviking` and `team_task_`) are also always kept and never judged — good for resident, on-demand tools like memory, retrieval, and teamwork.
- **Loop guard** — deterministic and backend-free; denies the same call repeated consecutively past a threshold. Always on and outside the per-feature switches.
- **Session panel** — a dock trigger below the composer opens the panel with automatic-decision metrics (attempts, fallbacks, model suggestions vs actual outcomes), the master switch, and the decision log, with an empty state before any automatic decision. The master switch pauses only automatic intervention.
- **Decision-analysis view** — an in-session "Decision analysis" tab (`conversation.view`, alongside chat and trajectory, naturally scoped per session) that reads the persisted log read-only and shows a process profile (per-point attempts and outcome distribution, mean self-check score), a quality-trend threshold backtest, and a decision-accuracy summary, and lets you rate each decision correct / wrong / unsure. Ratings share one source with the intervention panel: a rating on either surface writes to the same log, keyed by decision id, latest wins. Read-only over logs, append-only for annotations; it changes no decision behavior.
- **Per-feature switches** — the config page has an independent switch for the danger gate, output self-check, and tool narrowing, all on by default; turning one off drops that intervention. The loop guard is not covered by these switches.
- **Persisted decision log** — beyond the in-memory panel, decisions are written in full per session to `~/.config/dsh-decision-layer/logs` for research. Files roll by running-instance port and date (`decisions-<port>-YYYY-MM-DD.jsonl`), are batched, and retained for 30 days. Writing is best-effort: a failed flush drops that batch and never breaks the decision path.

## Safety boundary and development

Automatic intervention only subtracts: the gate only denies, narrowing only removes tools, and neither grants new permissions. The gate defers to native DSH approval on backend failure rather than allowing; self-check, narrowing, and loop-guard errors skip intervention. The redacted summary sent to the backend carries only tool name and command/path with secret redaction — never file content. Node.js `>=20.11`; `npm test` and `npm run build:client` run local checks. Rebuild and commit `lib/client.js` with any client change. 0.5.3 is a preview: the interventions work, but their real value and thresholds are still being explored — feedback on misjudgments and feel observed in the decision log is welcome.
