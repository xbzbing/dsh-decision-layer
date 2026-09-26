# dsh-decision-layer

DeepSeek Harness（DSH）的结构化裁决插件。它把有明确判断标准的问题交给同协议的裁决后端，供 agent 在需要时使用，并按内部迭代逐步接入危险门控、产出自检和防循环等自动介入。

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
- **产出自检**：回合结束用评分量表评估最终产出。默认只提示、不打断；可在面板开启「低分补完」，低分时追加一次补完提示。评分量表与阈值可配置。
- **防循环**：确定性判断，不走后端；同一调用连续重复超过阈值即拒绝，打断死循环。
- **会话面板**：输入框左侧按钮弹出面板，展示自动裁决指标（评估数、失败回退、模型建议与实际结果分列）、会话总开关、自检开关和后端配置；无自动裁决时显示空态。总开关关闭只暂停自动介入，不影响手动裁决。

## 安全边界

自动介入只减不增：门控只拒绝、收窄只删工具，都不给 agent 新权限。危险门控在后端失败或无法可靠交接时交回 DSH 原生审批，不因裁决故障直接放行；自检与防循环异常则跳过介入。发送到后端的危险摘要只含工具名与命令 / 路径并对疑似密钥脱敏，不含文件内容。

## 开发

服务端使用 Node.js `>=20.11`（`.mjs`，无需构建）；客户端用 TypeScript + esbuild 构建。`npm test` 跑本地测试，`npm run build:client` 生成 `lib/client.js`。改动客户端后需重建并连同 `lib/client.js` 一起提交，否则 GitHub 安装拿到的是旧 bundle。首次公开发布的版本与范围另行确认。

---

# English

`dsh-decision-layer` adds structured, explicitly scoped decisions to the DeepSeek Harness (DSH) agent loop, backed by a pluggable adjudication backend. Dangerous-call gating, output self-check, and loop prevention are introduced across internal iterations.

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
- **Output self-check** — scores the final output at turn end against a configurable rubric. Observe-only by default; an opt-in panel toggle re-prompts once on a low score.
- **Loop guard** — deterministic and backend-free; denies the same call repeated consecutively past a threshold.
- **Session panel** — shows automatic-decision metrics (attempts, fallbacks, model suggestions vs actual outcomes), the master switch, the self-check toggle, and backend configuration, with an empty state before any automatic decision. The master switch pauses only automatic intervention.

## Safety boundary and development

Automatic intervention only subtracts: the gate only denies, narrowing only removes tools, and neither grants new permissions. The gate defers to native DSH approval on backend failure rather than allowing; self-check and loop-guard errors skip intervention. The redacted summary sent to the backend carries only tool name and command/path with secret redaction — never file content. Node.js `>=20.11`; `npm test` and `npm run build:client` run local checks. Rebuild and commit `lib/client.js` with any client change. The first public release's version and scope are confirmed separately.
