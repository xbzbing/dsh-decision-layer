# dsh-decision-layer

DeepSeek Harness（DSH）的结构化裁决插件。它把有明确判断标准的问题交给同协议的裁决后端，供 agent 在需要时使用；自动介入按内部迭代逐步接入。

> 开发中。v0.1–v0.4 都是内部里程碑，尚未发布 npm 包或 GitHub Release。功能和进度以 [ROADMAP.md](<ROADMAP.md>) 为准。

## 安装（内部联调）

目前没有可用的 npm 发布版本。开发者可从源码构建客户端，在隔离的 DSH profile 中用本地 `file:` 路径安装并测试。此仓库暂不提交 `lib/` 构建产物，因此不能直接把 GitHub 仓库地址当成已构建插件安装。

```sh
npm ci --ignore-scripts
npm run build:client
npm test
dsh plugin --profile <测试 profile 名称> add file:/绝对路径/dsh-decision-layer
```

插件管理 API 仅接受本机 loopback Web 服务上的同源请求；将 DSH Web 绑定到所有网卡时，该管理 API 会拒绝请求。不要在未确认目标地址和数据流向前填入生产 Key。

## 当前功能

- **手动裁决**：通过 `decision_evaluate` 工具和 `decision-layer` skill 显式提交 `noul`、`score` 或 `choice` 问题；连通测试使用 `decision_check_connection`。手动调用和连通测试不计入自动裁决指标，也不会自行改变 agent 行为。
- **可配置后端**：默认 `https://api.typesafe.ai`、`jev-latest`，URL、Key、model 可逐字段覆盖；仅支持相同的结构化裁决协议。未配置 Key 时不会发送请求。
- **会话面板**：提供会话总开关、后端配置和连通测试。v0.1 没有自动介入点，指标显示“尚无自动裁决”，开关目前只保存未来自动介入的会话偏好。面板显示评估上下文将发送到的已生效地址；自定义 HTTPS 地址也不例外。HTTP 地址需针对实际目标确认明文传输风险，地址变更须重新确认；无交互确认的 headless 环境不得向未获确认的 HTTP 目标发送 Key 或上下文。

## 后续安全边界

危险操作门控、自检和工具收窄分别属于后续内部迭代，当前**尚未启用**。门控给出的建议不能授予宿主未允许的权限。设计中的危险门控在后端失败时交给 DSH 原生审批；若交接不可用，则保守拒绝当前危险调用，不允许因裁决故障而直接放行。自检与收窄故障则跳过介入，不新增权限。

## 开发

服务端使用 Node.js `>=20.11`，客户端构建使用 TypeScript 与 esbuild。`npm test` 运行本地测试；`npm run build:client` 生成本地 `lib/client.js`。在首次公开发布前，安装方式、版本及是否提交构建产物均须另行确认。

---

# English

`dsh-decision-layer` adds structured, explicitly scoped decisions to DeepSeek Harness (DSH). Automatic interventions are being introduced in internal stages.

> In development. v0.1–v0.4 are internal milestones, not npm or GitHub releases. See [ROADMAP.md](<ROADMAP.md>) for scope and progress.

## Installation (internal testing)

There is no published npm version yet. Build the client from source and install the local `file:` directory in an isolated DSH profile using the commands above. The repository does not commit `lib/` at this stage, so a direct GitHub source installation does not include a ready-to-run client bundle. The management API is available only through a loopback-bound, same-origin Web server.

## Current capabilities

Manual `decision_evaluate` calls support `noul`, `score`, and `choice`; `decision_check_connection` tests connectivity. Neither counts as an automatic decision. The backend defaults to `https://api.typesafe.ai` and `jev-latest`, with configurable URL, API key, and model under the same protocol. The session panel displays an empty automatic-metrics state, a future-intervention preference, the active outbound destination, and configuration controls. Sending to an HTTP endpoint requires explicit address-bound plaintext-risk confirmation; headless use without that confirmation must not send credentials or context.

## Safety boundary and development

The dangerous-call gate, output self-check, and optional tool narrowing are **not active in v0.1**. A future gate cannot grant host permissions: on backend failure it must use native DSH approval, or deny the current dangerous call if reliable handoff is unavailable. Self-check and narrowing failures only skip intervention. Node.js `>=20.11` is required; `npm test` and `npm run build:client` run local checks. No release has been made.
