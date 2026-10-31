# dsh-decision-layer

> [English](README.en.md) | 简体中文

DeepSeek Harness（DSH）的结构化裁决插件。它把有明确判断标准的问题交给同协议的裁决后端，供 agent 在需要时使用，并在 agent loop 上接入危险门控、产出自检、工具收窄和防循环等自动介入。

> **0.7.1 是体验版。** 插件功能已可用，但裁决介入能带来多少实际价值仍在探索中——各决策点的阈值都是未经验证的启发式默认值，建议先以观察心态体验，别当成经过验证的效果保证。功能与后续进度以 [ROADMAP.md](<ROADMAP.md>) 为准。

## 安装

已发布到 npm 与 GitHub Release。

从 npm 安装（补 `@latest`）：

```sh
dsh plugin --profile web add dsh-decision-layer@latest
```

或从 GitHub Release 安装：直接用对应版本 tgz 附件的 URL 安装。

```sh
dsh plugin --profile web add https://github.com/xbzbing/dsh-decision-layer/releases/download/v<版本>/dsh-decision-layer-<版本>.tgz
```

> 仓库不再提交构建产物 `lib/client.js`（[ADR-0012](<docs/adr/0012-distribution-via-github-actions.md>)），因此**不带 ref 的 `github:xbzbing/dsh-decision-layer` 安装不可用**——那样拿到的是没有 `lib/` 的源码树，host 半仍能加载，但面板不会出现。GitHub 侧请用上面的 Release 附件。

也可从源码本地构建后用 `file:` 安装：

```sh
npm ci --ignore-scripts
npm run build:client
dsh plugin --profile web add file:/绝对路径/dsh-decision-layer
```

安装或更新后需重启 `dsh web` 服务再刷新页面：host 与 client 两半在服务启动时生成挂载与 bundle 清单，仅刷新页面可能看不到变化。插件管理 API 只接受本机 loopback Web 服务上的同源请求；把 DSH Web 绑定到所有网卡时该接口会拒绝请求。不要在未确认目标地址和数据流向前填入生产 Key。

## 功能

- **手动裁决**：`decision_evaluate` 工具与 `decision-layer` skill 可显式提交 `noul` / `score` / `choice` 问题，`decision_check_connection` 做连通测试；手动调用不计入自动裁决指标，也不改变 agent 行为。
- **危险门控**：破坏性工具调用执行前用脱敏摘要请后端裁决，只有高置信「拒绝」才拦截；放行、询问、低置信、后端失败或响应不合法一律不介入，按宿主原路径执行。危险规则与拦截置信度门槛可配。
- **产出自检与质量趋势**：回合结束给最终回复打分（0–2），默认只记录；可开启低分补完，同一回合最多补一次。连续多次高置信低分时，dock 触发器图标会从灰变橙、变红作为提醒。
- **工具收窄**：回合开始时按任务相关性摘掉可选工具，只在宿主已允许的集合内取交集、不扩权；核心工具与保留前缀命中的工具始终保留，可选工具过多时自动降为仅观察、保留过少时视为判定不可信并跳过，对小上下文后端自动分批。默认真正生效，也可切到仅观察。
- **任务完成核对**：用户明确列出多个交付条件时，逐项判定「已满足 / 未满足 / 证据不足」，以工具证据为准；默认只观察，可配补完。
- **防循环**：同一调用连续重复超过阈值即拒绝，确定性本地逻辑，不依赖后端；不受各决策点开关影响，但会话总开关关闭时同样暂停。
- **会话面板与决策分析页**：面板展示自动裁决指标、会话总开关和最近日志；「决策分析」tab 按会话展示过程画像、趋势回测与判断准确度，并支持逐条标注和开关本会话的自动介入。
- **配置与持久化**：各决策点可独立开关，阈值在插件详情页调整，写入 `~/.config/dsh-decision-layer/config.json` 并热生效。默认值与字段说明见 [ADR-0006](<docs/adr/0006-configurable-thresholds.md>)。也可直接手改该文件，但只能写合法值：越界、拼错字段名或类型不符会让整份配置校验失败，配置页读不出来，各决策点退回各自的安全默认（见 [ADR-0005](<docs/adr/0005-config-wholesale-replace-and-live-reload.md>)）。决策日志与会话指标落盘 30 天，供回看和校准。
- **可插拔后端**：默认 `https://api.typesafe.ai`、`jev-latest`，URL、Key、model 可逐字段覆盖；仅支持同协议端点，未配置 Key 时不发请求。自定义 `http://` 地址需针对该 URL 确认明文传输风险，地址变更须重新确认。

## 隐私与后端

配置 Key 后，插件默认把裁决请求发往远程端点 `https://api.typesafe.ai`（模型 `jev-latest`）。裁决会携带具体上下文：

- 门控：工具名与脱敏后的命令 / 路径摘要（各最多 2048 字符）。
- 产出自检：本轮最终回复（最多约 24K 字符）。
- 工具收窄：本步 user 消息的文本（最多约 8K 字符）与候选工具的名称 / 描述。
- 完成核对：从本回合 user 消息中提取的交付条件（最多 20 条）、工具名与成败状态（不含参数和输出）、回复前约 8K 字符。
- 手动裁决：`decision_evaluate` 与 `decision-layer` skill 会把 agent 提交的内容原样发送。

user 消息的文本里可能含有宿主注入的上下文，例如工作区指令（AGENTS.md）、运行时信息和记忆片段。这些内容会离开本机，远程服务提供方可能记录、留存或用于其他用途，具体取决于其服务条款；脱敏和截断只降低风险，不等于匿名化。

本地还会落盘两类数据，各保留 30 天：决策日志在 `~/.config/dsh-decision-layer/logs/`，会话快照在 `~/.config/dsh-decision-layer/state/`，其中包含脱敏后的命令 / 路径和请求主题摘要，可按需自行清理。

**会话内容敏感时，推荐改用本地部署的模型**，让裁决数据不出本机。`tev1` 可经 ollama 原生的 `/v1/systemone` 端点直接接入，部署步骤见 [用本地 tev1 配合插件（部署指南）](<docs/zh/deploy-tev1-with-plugin.md>)；其他本地模型只要提供兼容 `/v1/systemone` 的端点，同样可以在配置页把服务地址指向本机。

## 安全边界

自动介入只减不增：门控只拒绝、收窄只删工具，都不给 agent 新权限。危险门控采用两档模型，只在模型高置信判定拒绝时拦截；后端失败、低置信或响应不合法时一律不介入、按原路径执行，不因裁决故障阻断，也不替宿主放行。自检、收窄与防循环异常则跳过介入。发送到后端的危险摘要只含工具名与命令 / 路径并对疑似密钥脱敏，插件不读取文件内容；但命令本身（如 heredoc、echo 写入的文本）会原样计入摘要。

## 开发

服务端使用 Node.js `>=20.11`（`.mjs`，无需构建）；客户端用 TypeScript + esbuild 构建。`npm test` 跑本地测试，`npm run build:client` 生成 `lib/client.js`（`tsc` 严格模式就在这一步），`npm run check` 跑完两者。

**构建产物不入库**（[ADR-0012](<docs/adr/0012-distribution-via-github-actions.md>)）：`lib/` 已被 `.gitignore` 覆盖，源码是唯一事实来源。发布由 GitHub Actions 的 `release.yml` 完成——构建、跑门禁、`npm pack`，并用 `scripts/assert-pack.mjs` 断言产物里确实有 `lib/client.js` 且没有源码泄漏，之后才发 npm / 建 Release。该 workflow 在版本号变更推入 main 时自动执行；npm 侧使用 Trusted Publishing（OIDC），不依赖长期 token。

架构决策记录见 [docs/adr/](<docs/adr/README.md>)：每条规则为什么存在、当时放弃了哪些备选。0.7.1 为体验版：介入能力已可用，但实际价值与阈值仍在探索，欢迎反馈决策日志观察到的误判与体感。
