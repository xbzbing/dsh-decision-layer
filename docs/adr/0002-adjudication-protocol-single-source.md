# ADR-0002：裁决协议单源、模型无关

- 状态：Accepted（2026-10-26）
- 相关：`service/backend.mjs`、`service/config-store.mjs`、`skills/decision-layer/SKILL.md`、`docs/zh/deploy-tev1-with-plugin.md`

## Context

「结构化裁决」需要一个能被不同后端实现的窄协议：云端托管模型（`jev-latest`）与本地 ollama（`tev1`、`nimble`）都要能接。若每个决策点各写一套提示词与解析，题型校验、失败语义、置信度语义会分裂成 N 份，换后端要改 N 处。

备选：直接调各家 SDK（把插件绑死在一家，且 ollama 的 `/v1/systemone` 端点本就是同一协议）；让模型输出自由文本再正则解析（不可校验、拿不到可比较的置信度）。

## Decision

- 唯一契约：`POST {baseURL}/v1/systemone`，请求体 `{ state, questions, model }`，响应 `{ model, answers, usage }`。
- 三种题型：`noul`（单概率）、`choice`（`probabilities` + `confidence` + `choice`）、`score`（`probabilities` + `confidence` + `score`）。
- 请求在本地校验：1–64 题（后端单请求上限）、题 id ≤160 字符、`choice` 选项 2–255、`score` 档位 2–10、整体 ≤256KB。
- 响应同样严格校验：概率须在 `[0,1]`、`choice` 须命中选项、`score` 须落在档位区间、概率和与 1 的偏差 ≤0.02；不合规统一映射为 `reason: 'invalid-response'`。
- 失败携带稳定 reason 码：`unreachable` / `http-error` / `invalid-response` / `config`；`429`、`529` 重试。
- 超时 20s，响应体上限 1MB；HTTP 地址需针对具体目标确认明文风险。
- 换后端是配置而非代码：`url` + `model` + `apiKey`，无 Key 时不发请求。

## Consequences

- 换后端只改配置；同一套决策点逻辑在云端与本地模型上行为一致，差异只在模型能力（小上下文后端需要分批，见 ADR-0007）。
- 三种题型各解析一次，但都集中在 `backend.mjs`，调用方只见 `answers` —— 新决策点不需要碰网络层。
- 协议窄是有代价的：`noul` 拿不到 `confidence`，需要置信度的判断必须用 `choice`；`score` 的合法取值由档位数量决定，所以档位数（2–10）既是协议边界也是配置边界。
- 严格校验把「模型的坏输出」与「后端故障」分开：前者是 `invalid-response` 且不介入（ADR-0004），不会被误当成「危险」或「低质量」。
