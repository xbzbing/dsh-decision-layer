# AGENTS.md

本文件是 `dsh-decision-layer` 的 agent 工作指南。动手前先读完；功能与交互以代码和测试为准，设计理由以 `docs/adr/` 为准，安装与使用说明以 `README.md` / `README.en.md` 为准。本文件只记录操作规则、边界和会静默出错的坑，不重复 README / ADR 的完整内容。

## 项目定位

`dsh-decision-layer` 是 DeepSeek Harness（dsh）的 Web 插件（MIT）：在 agent 循环里接入四个由可插拔裁决模型驱动的自动决策点——危险调用门控、产出自检、工具收窄、任务完成核对，以及一个不依赖后端的确定性防循环。另提供手动裁决工具 `decision_evaluate`、连通测试 `decision_check_connection` 和 `decision-layer` skill。

所有介入都必须是「有限的本地干预」：模型只给建议，宿主决定最终行为；任何决策点失败都必须放行，不能阻断 agent。当前各阈值是未经验证的启发式默认值，插件仍标为体验版。

Host 半是普通 ESM（`service/*.mjs`，无构建步骤），Client 半是 React + TypeScript，构建成单个 `lib/client.js`。`lib/` 不入库。

## 架构

```
Host (Cordis, service/)
  dsh.mjs                 apply()：配置、后端、会话状态、日志/快照、路由、工具、skill
  backend.mjs             /v1/systemone 协议校验、超时、重试（唯一 wire 契约）
  danger-gate.mjs         危险门控：只有高置信 deny 才拦截；ask 不转发审批
  self-check.mjs          产出自检：概率加权分、低置信噪声、每回合最多补一次
  narrowing.mjs           工具收窄：相关性 noul、核心/保留前缀、三重保护
  task-completion.mjs     完成核对：显式条件、三态判定、工具证据优先
  loop-guard.mjs          防循环：确定性、本地；不受决策点开关影响，但会话开关关闭时暂停
  config-store.mjs        配置读取/校验/整段替换；配置路径与环境变量覆盖
  session-state.mjs       每会话 enabled/计数/最近日志；ensureLoaded 续算
  state-store.mjs         会话状态快照落盘（防重启归零）
  log-store.mjs           JSONL 研究日志（按端口/日期滚动，30 天）
  log-read.mjs            JSONL 流式逐行读取
  log-analyze.mjs         会话聚合、趋势回测、分页、seed 重建
  manager-api.mjs         本地管理 API（只回环同源）
  quality-trend.mjs       质量趋势连续计数
  steer-once.mjs          每个决策点各自的「每回合最多补一次」预算

Client (React, src/client/)
  index.tsx               注册三个 slot + i18n
  panel.tsx               输入框 dock 面板：指标、会话总开关、最近日志
  analysis-view.tsx       会话内「决策分析」tab：聚合、回测、标注、分页、会话开关
  config-form.tsx         插件详情页配置表单
  decision-log.tsx        面板与分析页共用的决策行渲染与点赞
  cards.tsx               指标卡、Stat 与占比小工具
  use-annotations.ts      标注读取/写入与会话日志种子
  api.ts                  /plugins/dsh-decision-layer/api 的 fetch 与类型
  session-events.ts       面板与决策分析页的会话开关同步事件
  i18n.ts                 zh 是键集权威源，en 按 zh 的类型约束
  styles.ts               全部 CSS（一个 <style data-plugin>）
```

Host 侧挂接点：`ctx.tools.guard`（防循环、门控的单调拒绝）、`tools/pre-execute` / `tools/post-execute`（门控）、`agent/pre-step`（收窄，每回合首步）、`agent/turn-stopping`（自检与完成核对，两个独立监听器）。管理 API 只在注入 `webServer` 后注册；`logStore` 也在这时拿到实例端口。

## 运行与数据

- 配置文件：`~/.config/dsh-decision-layer/config.json`；可用 `DSH_DECISION_CONFIG_PATH` 覆盖。
- 后端默认 `https://api.typesafe.ai`、模型 `jev-latest`；可用 `DSH_DECISION_BASE_URL` / `DSH_DECISION_API_KEY` / `DSH_DECISION_MODEL`（兼容 `TYPESAFE_BASE_URL` / `TYPESAFE_API_KEY`）提供。未配置 Key 时不发请求。
- 决策日志：`~/.config/dsh-decision-layer/logs/decisions-<port>-YYYY-MM-DD.jsonl`；按 UTC 日期和运行实例端口滚动，批量写、30 天保留，失败只丢当批，不进入决策路径。
- 会话快照：`~/.config/dsh-decision-layer/state/<sessionId>.json`；防抖原子写、30 天保留。恢复时优先读快照，没有快照则从历史 JSONL 按 session id 重建 seed；gate 的「实际结果」（放行/拒绝）无法从日志重建，重启后从零累计。
- 会话级 `enabled` 默认 true；关闭只暂停自动介入（门控、自检、收窄、完成核对、防循环），手动工具与日志标注不受影响。状态写在会话快照里，面板与决策分析页通过 `session-events.ts` 的 window 事件同步。
- 管理 API 前缀 `/plugins/dsh-decision-layer/api`：`config`、`probe`、`metrics`、`log`、`logs`、`logrows`、`annotate`、`session`。`GET /logs` 只返回聚合，`GET /logrows` 返回分页决策行；新增字段前先确认不会把 API Key 或超出既有范围的原始内容带回浏览器。
- **正在运行的 GUI 装的是 npm 上的版本，不是本仓库 checkout。** 改源码不会立即出现在当前页面；发布或 `file:` 安装并重启后才生效。

## 构建与验证

```bash
npm run build:client        # tsc 严格类型检查 + esbuild -> lib/client.js（不入库）
npm test                    # node --test tests/*.test.mjs
npm run check               # build:client + test，提交前必须通过
npm run pack:assert <tgz>   # 解包断言运行时文件齐全、无源码/测试泄漏
```

- Host 改动不需要构建，但已运行的 `dsh web` 必须重启才会加载新的 `service/`。
- Client 改动必须重建 `lib/client.js` 再刷新页面；有 `pnpm run dev:web` watcher 时可能自动重建，但仍以显式构建结果为准。
- 修改行为先补/改测试。测试都在 `tests/`，用 Node 内建 runner：服务端是纯 ESM 单测；客户端测试用 esbuild 把入口打成临时 bundle，再经 jsdom + Testing Library 渲染。
- CI（`.github/workflows/ci.yml`）在 Node 22/24 上执行 `npm ci && npm run build:client && npm test`；本地 `npm run check` 与 CI 等价。
- 发布由 `.github/workflows/release.yml` 手动触发，默认 `dry_run=true`（只构建、门禁、打包、断言）。正式发版必须 `dry_run=false` 且 `confirm_version` 等于 `package.json` 的 version；正文来自入库的 `docs/releases/v<version>.md`，缺文件会在发布前失败。不要手工打 tag 或 `npm publish`。
- `package.json` 的 `files` 是唯一打包清单。新增运行时文件（尤其 `docs/zh|en/DETAIL.md`、locale、client bundle）必须同步更新 `files` 与 `scripts/assert-pack.mjs` 的 `REQUIRED`，否则发版产物会缺文件。
- 不要添加 `prepare` / `prepublishOnly` 等安装期构建脚本；`lib/` 由发版流水线在 `npm pack` 前构建。

## 必须守住的边界

- **失败即放行**：任何裁决点抛错、超时、后端不可达、响应不合法，都不能阻断工具调用或回合。`tools/pre-execute` 里的异常会变成工具失败，agent 连 `read` / `edit` 都做不了；配置读不出来时 `featureOn` 退回「全部功能开启 + 各点安全默认」。
- **门控两档**：只有高置信 `deny` 才拦截；`allow` / `ask` / 低置信 / 异常都不介入，`ask` 不转发宿主审批。拦截经 `tools.guard` 单调执行，guard 只能 deny、不能 re-allow。
- **收窄不扩权**：只在宿主已允许的工具集内取交集；核心工具和 `keepPrefixes` 命中的工具始终保留、不参与判定。`narrowTools` 的「不能删光」判断必须把 `keepBase`（核心 + 保留前缀）算进去；可选工具超过 `maxCandidates` 自动降级 observe；保留不足 `minKeep` 视为判定不可信、跳过。`agent.ctx.tools.restrict` 是 agent 作用域，下一回合前要释放。
- **自检 / 完成核对每回合各自最多补一次**：两个决策点各自持有一份 `steerOnce` 预算；低置信分只记录、不打断；完成核对只处理用户明确列出的条件，以工具证据为准，回复自称完成不算证据；`insufficient` 不触发补完。
- **防循环不受决策点开关影响**：确定性本地逻辑，不走后端；会话总开关关闭时同样暂停（`loop-guard.mjs` 先查 `enabled`）。
- **管理 API 只在回环绑定上提供服务**：只接受 `127.0.0.1` 绑定，校验 Host / Origin，响应 `no-store`，请求体有上限；非回环绑定直接拒绝。
- **配置整段替换**：`dangerRules` / `gateSettings` / `checkSettings` / `narrowSettings` / `completeSettings` / `features` 每个 section 在 PUT 时整体替换，省略则保留原值；未知字段、越界值直接拒绝。配置每次调用现读、无缓存；坏配置会让整份校验失败，各决策点退回安全默认，所以不要把 `resolveConfig` 结果缓存到构造期。
- **API Key 不回传**：配置 API 只回 `apiKeySet`；删除 Key 是显式动作。HTTP 地址必须针对具体 URL 确认明文传输风险，地址变更重新确认。
- **决策分析页只读日志、只追加标注**：页头的会话开关是唯一会改会话状态的控件，只写会话级 `enabled`；不要把它扩展成改配置或改历史。

## 代码约定

- Host 用 ESM `.mjs`，相对导入带 `.mjs`；Client 用 TypeScript 严格模式，相对导入带 `.js` 后缀（同一份源码要同时产出可运行 JS 与 `.d.ts`）。
- 注释只写代码现在做什么、约束是什么；不写演进过程、根因叙述和「曾经怎样」。决策理由进 `docs/adr/`。
- 所有可见文案走 `src/client/i18n.ts`；`zh` 是键集权威源，新增 key 必须同步 `en`（`en` 已按 `zh` 的 key 类型约束，缺 key 会 tsc 报错）。中文/英文 README、`docs/zh|en/DETAIL.md`、部署文档要成对更新。
- 样式统一在 `src/client/styles.ts` 的单个 `<style data-plugin>` 中；用 `--dsw-alias-*` 主题变量，不硬编码颜色，深浅色都检查。
- 不新增依赖，除非宿主没有等价能力；平台模块（React、`@deepseek-ai/*`）保持 external，由宿主提供。
- 修 bug 必须带回归测试；不要删除或跳过测试来换绿色结果。
- 安装身份三处必须一致：`package.json.name`、`cordis.patch.yml` 的 row `name`、`scripts/build-client.mjs` 产出的 ModuleLoader `id`（都是 `dsh-decision-layer`）。任一不一致，面板会整个消失。

## 提交与发布

- **只在用户明确要求时创建 commit**；一个可验证的功能切片一个提交，暂存具体文件，不用 `git add .`。
- Conventional Commits 英文 type + 中文 subject，例如 `fix(narrow): 可选工具全被摘除时不再作废整轮判定`。只写最终实现，不写过程叙述；正文只在能提供 subject 之外的信息时才写。
- 提交前运行 `npm run check` 和 `git diff --check`；不提交 `lib/`、`node_modules/`、`*.tgz`、`docs/local/`、`.DS_Store`。
- 版本号用 `npm version <v> --no-git-tag-version` 同步 `package.json` / `package-lock.json`，同时新增 `docs/releases/v<v>.md`（格式见 `docs/releases/README.md`）。验证段的数字用当次 `npm run check` 的真实输出。
- 发布走 workflow：先用 `dry_run=true` 验证，再 `dry_run=false` + 匹配的 `confirm_version`。`lib/client.js` 在发布流水线里构建，`scripts/assert-pack.mjs` 会拦住忘记构建或产物缺失。
- 文档分工：README 是安装与配置手册；`docs/adr/` 是理由与取舍；`docs/zh/DETAIL.md` / `docs/en/DETAIL.md` 是插件详情页简介，修改功能时与 README「功能」段一起更新。

## 已知坑

- 运行中的 web profile 是 npm 安装版；源码改动要发版或 `dsh plugin --profile web add file:/绝对路径/dsh-decision-layer`，再重启 `dsh web`、刷新页面。
- `lib/client.js` 不入库，`npm pack` 前必须 `npm run build:client`；`assert-pack` 会检查 ModuleLoader 包装、非空与体积。
- `meta.detail` 必须是包内相对 `.md` 路径（不能绝对、不能 `..`）；新增 / 改名后同步 `package.json` `files` 与 `assert-pack`，否则详情页回落到 README 或发版缺文件。
- `session-state` 的 `enabled` 是会话级、持久化的；面板和决策分析页必须通过 `session-events.ts` 同步，不要各写一份本地状态。
- `steerOnce` 目前是每个决策点各一份实例（self-check 与 task-completion 不共享预算）；如果产品要求同一回合跨决策点只补一次，需要把实例提升到 `dsh.mjs` 共享，而不是在各自模块里新建。
- 决策行可能带 gate 的 `command` / `path`（`decision-log.tsx` 会渲染；`session-state` 已做长度截断和空白折叠）。`/logrows` 会回传这些字段，新增日志字段前先确认不会把超出既有范围的原始内容带回浏览器。
- 阈值默认值不在 `config-store.mjs`：服务端默认值在各决策点模块（如 `narrowing.mjs` 的 `DEFAULT_NARROW_THRESHOLD`），配置页镜像在 `config-form.tsx`，提示文案在 `i18n.ts`；改一个默认值要同时改这几处与测试。
- `featureOn` / `resolveConfig` 在热路径上，任何配置读取都要容忍抛错并回退默认；`backend.evaluate` 的请求 / 响应校验是唯一 wire 契约，不要在调用点复制一份宽松版。
