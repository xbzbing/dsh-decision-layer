# dsh-decision-layer

DeepSeek Harness（DSH）的结构化裁决插件。它把有明确判断标准的问题交给同协议的裁决后端，供 agent 在需要时使用，并在 agent loop 上接入危险门控、产出自检、工具收窄和防循环等自动介入。

> v0.1–v0.4 都是内部里程碑，尚未发布 npm 包或 GitHub Release。功能和进度以 [ROADMAP.md](<ROADMAP.md>) 为准。

## 安装

尚无 npm 发布版本。仓库已包含构建产物 `lib/client.js`，可直接从 GitHub 安装（不带版本，跟随分支或 tag）：

```sh
dsh plugin --profile web add github:xbzbing/dsh-decision-layer
```

也可从源码本地构建后用 `file:` 安装：

```sh
npm ci --ignore-scripts
npm run build:client
dsh plugin --profile web add file:/绝对路径/dsh-decision-layer
```

安装或更新后需重启 `dsh web` 服务再刷新页面：host 与 client 两半在服务启动时生成挂载与 bundle 清单，仅刷新页面可能看不到变化。插件管理 API 只接受本机 loopback Web 服务上的同源请求；把 DSH Web 绑定到所有网卡时该接口会拒绝请求。不要在未确认目标地址和数据流向前填入生产 Key。

## 功能

- **手动裁决**：`decision_evaluate` 工具与 `decision-layer` skill 支持显式提交 `noul`、`score`、`choice` 问题，`decision_check_connection` 做连通测试。手动调用和连通测试不计入自动裁决指标，也不改变 agent 行为。
- **可配置后端**：默认 `https://api.typesafe.ai`、`jev-latest`，URL、Key、model 可逐字段覆盖；仅支持相同的结构化裁决协议。未配置 Key 时不发送请求。自定义 HTTP 地址需针对实际目标确认明文传输风险，地址变更须重新确认。
- **危险门控**：破坏性工具调用执行前用脱敏摘要请后端给放行 / 询问 / 拒绝建议。模型建议不能授予宿主未允许的权限——放行只降级为宿主原生审批，拒绝经监控守卫单调生效；后端失败、低置信或响应不合法时交回宿主审批。危险规则可增删配置。
- **产出自检**：回合结束用评分量表给最终产出打分（0–2，按各档位概率加权，可能是小数）。默认只提示、不打断；可开启「低分补完」，得分偏低且模型有把握时以你的名义追加一次补完提示，同一回合最多补一次。
- **工具收窄**：回合开始时用 noul 逐个判断可选工具与本轮任务的相关性，摘掉用不上的，只在宿主已允许的集合内取交集、不扩权。默认真正生效，可切到「仅观察」只记录不改工具集。三重保护：核心工具（读写、编辑、Shell、检索、待办）始终保留、不参与判定；可选工具超过 20 个时自动降为仅观察；保留下来不足 5 个时视为判定不可信、跳过。**保留工具前缀**白名单里的工具（默认含 `mcp__openviking`）也始终保留、不参与判定，适合记忆 / 检索这类常驻、按需触发的工具。
- **防循环**：确定性判断，不走后端；同一调用连续重复超过阈值即拒绝，打断死循环。始终生效，不在决策点开关范围内。
- **会话面板**：输入框下方的 dock 触发器弹出面板，展示自动裁决指标（评估数、失败回退、模型建议与实际结果分列）、会话总开关和决策日志；无自动裁决时显示空态。总开关关闭只暂停自动介入，不影响手动裁决。
- **决策点开关**：详情页配置里，危险门控、产出自检、工具收窄各有独立开关，默认全开；关掉某个决策点就不再对应地介入。防循环不在此范围。
- **决策日志落盘**：决策记录在内存面板之外，还按会话全量落盘到 `~/.config/dsh-decision-layer/logs`，供研究回看。文件按运行实例端口和日期滚动切分（`decisions-<端口>-YYYY-MM-DD.jsonl`），批量写入，保留 30 天。写盘为尽力而为，失败只丢当批、不影响决策路径。

## 安全边界

自动介入只减不增：门控只拒绝、收窄只删工具，都不给 agent 新权限。危险门控在后端失败或无法可靠交接时交回 DSH 原生审批，不因裁决故障直接放行；自检、收窄与防循环异常则跳过介入。发送到后端的危险摘要只含工具名与命令 / 路径并对疑似密钥脱敏，不含文件内容。

## 开发

服务端使用 Node.js `>=20.11`（`.mjs`，无需构建）；客户端用 TypeScript + esbuild 构建。`npm test` 跑本地测试，`npm run build:client` 生成 `lib/client.js`。改动客户端后需重建并连同 `lib/client.js` 一起提交，否则 GitHub 安装拿到的是旧 bundle。首次公开发布的版本与范围另行确认。

---

# English

`dsh-decision-layer` adds structured, explicitly scoped decisions to the DeepSeek Harness (DSH) agent loop, backed by a pluggable adjudication backend. Dangerous-call gating, output self-check, tool narrowing, and loop prevention hook into the agent loop as automatic interventions.

> v0.1–v0.4 are internal milestones, not npm or GitHub releases. See [ROADMAP.md](<ROADMAP.md>) for scope and progress.

## Installation

There is no npm release yet. The repository ships the built `lib/client.js`, so it installs directly from GitHub (no version — follows the branch or tag):

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
- **Dangerous-call gate** — before a destructive tool call, a redacted summary asks the backend for allow/ask/deny. A model allow only downgrades to native host approval; a deny is enforced monotonically; backend failure, low confidence, or invalid results defer to host approval. Rules are configurable.
- **Output self-check** — scores the final output at turn end against a rubric (0–2, a probability-weighted mean across levels, so it can be fractional). Observe-only by default; an opt-in low-score re-prompt appends one prompt on your behalf when the score is low and the model is confident, at most once per turn.
- **Tool narrowing** — at turn start, a noul judges each optional tool's relevance to the task and drops the ones not needed, intersecting the host-allowed set and never expanding it. Enforced by default; switch to observe-only to log without changing the tool set. Three safeguards: core tools (read, write, edit, shell, search, todos) are always kept and never judged; more than 20 optional tools falls back to observe only; fewer than 5 tools remaining is treated as untrustworthy and skipped. Tools matching a **keep-prefix** allowlist (defaults to `mcp__openviking`) are also always kept and never judged — good for resident, on-demand tools like memory and retrieval.
- **Loop guard** — deterministic and backend-free; denies the same call repeated consecutively past a threshold. Always on and outside the per-feature switches.
- **Session panel** — a dock trigger below the composer opens the panel with automatic-decision metrics (attempts, fallbacks, model suggestions vs actual outcomes), the master switch, and the decision log, with an empty state before any automatic decision. The master switch pauses only automatic intervention.
- **Per-feature switches** — the config page has an independent switch for the danger gate, output self-check, and tool narrowing, all on by default; turning one off drops that intervention. The loop guard is not covered by these switches.
- **Persisted decision log** — beyond the in-memory panel, decisions are written in full per session to `~/.config/dsh-decision-layer/logs` for research. Files roll by running-instance port and date (`decisions-<port>-YYYY-MM-DD.jsonl`), are batched, and retained for 30 days. Writing is best-effort: a failed flush drops that batch and never breaks the decision path.

## Safety boundary and development

Automatic intervention only subtracts: the gate only denies, narrowing only removes tools, and neither grants new permissions. The gate defers to native DSH approval on backend failure rather than allowing; self-check, narrowing, and loop-guard errors skip intervention. The redacted summary sent to the backend carries only tool name and command/path with secret redaction — never file content. Node.js `>=20.11`; `npm test` and `npm run build:client` run local checks. Rebuild and commit `lib/client.js` with any client change. The first public release's version and scope are confirmed separately.
