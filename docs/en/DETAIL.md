# Decision Layer

A structured set of explicitly scoped decisions for the DeepSeek Harness agent loop: whether a destructive call should be blocked, whether the current tool set is enough, and whether this turn's output is complete are all judged by a pluggable adjudication model, while the host always owns the resulting behavior.

## Features

- **Dangerous-call gate** — before a destructive tool call, a redacted summary asks the backend for a verdict; only a high-confidence deny blocks the call, while backend failures, low confidence, and invalid responses fall back to the host's original path.
- **Output self-check and quality trend** — scores the final reply at turn end and can append one re-prompt when the score is low and the model is confident; several consecutive confident low scores raise an alert on the trigger button.
- **Task-completion review** — when the user lists multiple delivery conditions, each is judged satisfied / unsatisfied / insufficient evidence. Conditions come only from the turn's latest request, with this turn's tool evidence primary (an earlier turn's success does not count) and self-reported completion not counting.
- **Tool narrowing** — at turn start, and again when a new user request arrives inside the same turn, judges each optional tool's relevance to the task and drops the ones not needed; each re-judgement releases the previous restriction first, and notices such as time or background-job updates trigger no re-judgement. It intersects the host-allowed set and never expands it. The host resolves the tool set before the decision point for a step fires, so a drop reaches the model from the next step on; narrowing covers the tool channel only — UI fences in the reply body and skill instructions are unaffected.
- **Loop guard** — denies the same call repeated consecutively past a threshold; deterministic and backend-free.
- **Decision panel and analysis view** — shows automatic-decision metrics and the decision log, and lets you rate each decision correct / wrong / unsure; the analysis view's header can enable or disable automatic interventions for the current session.

The backend, per-decision-point switches, and intervention thresholds are configurable; defaults remain uncalibrated heuristics.

## Repository

<https://github.com/xbzbing/dsh-decision-layer>

Installation and privacy notes live in the repository README; threshold defaults and field names are in `docs/adr/0006-configurable-thresholds.md`, and design trade-offs in `docs/adr/`.
