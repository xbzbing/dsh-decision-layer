# Decision Layer

A structured set of explicitly scoped decisions for the DeepSeek Harness agent loop: whether a destructive call should be blocked, whether the current tool set is enough, and whether this turn's output is complete are all judged by a pluggable adjudication model, while the host always owns the resulting behavior.

## Features

- **Dangerous-call gate** — before a destructive tool call, a redacted summary asks the backend for a verdict; only a high-confidence deny blocks the call, while backend failures, low confidence, and invalid responses fall back to the host's original path.
- **Output self-check and quality trend** — scores the final reply at turn end and can append one re-prompt when the score is low and the model is confident; several consecutive confident low scores raise an alert on the trigger button.
- **Task-completion review** — when the user lists multiple delivery conditions, each is judged satisfied / unsatisfied / insufficient evidence, with tool evidence primary and self-reported completion not counting.
- **Tool narrowing** — at turn start, judges each optional tool's relevance to the task and drops the ones not needed, intersecting the host-allowed set and never expanding it.
- **Loop guard** — denies the same call repeated consecutively past a threshold; deterministic and backend-free.
- **Decision panel and analysis view** — shows automatic-decision metrics and the decision log, and lets you rate each decision correct / wrong / unsure.

The backend, per-decision-point switches, and intervention thresholds are configurable; defaults remain uncalibrated heuristics.

## Repository

<https://github.com/xbzbing/dsh-decision-layer>

Full installation, configuration, and design trade-offs live in the repository README and `docs/adr/`.
