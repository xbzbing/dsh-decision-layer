# AGENTS.md

本文件是 `dsh-decision-layer` 的 agent 工作指南。功能与交互以代码和测试为准，设计理由以 `docs/adr/` 为准，安装与使用说明以 `README.md` / `README.en.md` 为准。本文件只记录操作规则、必须守住的边界和会静默出错的坑。

## 定位

DSH Web 插件的双半结构：`src/host/` 是 Cordis 插件（TypeScript，逐文件编译到 `lib/host/*.js`），`src/client/` 是 React + TypeScript，打包成单个 `lib/client.js`。两半都由 `npm run build` 产出，产物不入库（ADR-0015）。所有介入都是「模型只给建议、宿主决定行为」：任何决策点失败都必须放行，不能阻断 agent。Host 挂接点在 `src/host/index.ts` 的 `apply()`，client 由 `src/client/index.tsx` 注册 slot。

## 构建与验证

```bash
npm run build               # tsc 严格类型检查 + esbuild -> lib/host/*.js 与 lib/client.js（不入库）
npm run typecheck           # 两半各自的 tsconfig（NodeNext / bundler），不改产物
npm test                    # 先 build，再 node --test tests/*.test.mjs（测试导入 lib/host）
npm run check               # build + 全量测试 + npm pack 断言，提交前必须通过，与 CI 一致
```

- 测试导入的是构建产物 `lib/host/*.js`，不是 `src/host/*.ts`；改完 host 源码必须先构建，否则测到旧代码。
- `tsc` 出错先看 `tsconfig.host.json` / `tsconfig.client.json`，两者都继承根 `tsconfig.json`；根配置是两半并集，只供编辑器粗筛，host 的 NodeNext 规则由两份子配置强制。
- 两半改动都要 `npm run build`，再重启 `dsh web`（client 改动另需刷新页面）；漏建会加载旧产物或找不到入口。
- 改行为先补/改测试；修 bug 必须带回归测试，不要删测试换绿色。
- 发布走 `.github/workflows/release.yml`：版本号变更推入 main 即自动门禁、打 tag、用 OIDC 发 npm 与 Release；不要手工打 tag 或 `npm publish`。版本号用 `npm version <v> --no-git-tag-version`，同时新增 `docs/releases/v<v>.md`。

## 必须守住的边界

- **失败即放行**：裁决点抛错、超时、后端不可达、响应不合法都不能阻断工具调用或回合。`tools/pre-execute` 里的异常会让 agent 连 `read` / `edit` 都做不了。
- **门控只有高置信 `deny` 才拦**；`allow` / `ask` / 低置信 / 异常都不介入，`ask` 不转发宿主审批；拦截经 `tools.guard` 单调执行。
- **收窄不扩权**：只在宿主已允许集合内取交集；`keepBase`（核心 + 保留前缀）必须计入「不能删光」判断；`restrict` 是 agent 作用域：宿主在 pre-step 之前就解析本步工具集，所以必须在 `session/event` 的 `turn/end` 释放（含中止/失败回合），不能等下一回合 pre-step；同回合重判前也先释放。
- **自检与完成核对各自一份 `steerOnce`**，每回合各最多补一次；完成核对以工具证据为准，回复自称完成不算证据。
- **防循环**不走后端、不受各决策点开关影响，但会话总开关关闭时同样暂停。
- **管理 API** 只服务回环绑定，校验 Host / Origin，响应 `no-store`，请求体有上限。
- **配置每次现读、无缓存**；坏配置让整份校验失败、各决策点退回安全默认；配置 API 只回 `apiKeySet`。
- **决策分析页只读日志、只追加标注**；页头开关只写会话级 `enabled`，不要扩展成改配置或改历史。

## 代码约定

- Host 用 TypeScript 严格模式（`src/host/*.ts`），相对导入带 `.js`（编译产物同名）；client 同样。共享类型放 `src/host/types.ts`，跨模块形状不要各写一份。
- 可见文案全部走 `src/client/i18n.ts`；`zh` 是键集权威源，新增 key 必须同步 `en`（缺 key 会 tsc 报错）。
- 样式集中在 `src/client/styles.ts` 的单个 `<style data-plugin>`，用 `--dsw-alias-*` 主题变量，不硬编码颜色。
- 不新增运行期依赖（编译期的 `@types/node` 除外）；平台模块（React、`@deepseek-ai/*`）保持 external，由宿主提供。
- 安装身份三处必须一致：`package.json.name`、`cordis.patch.yml` 的 row `name`、`build.mjs` 里 `PLUGIN_ID` 产出的 ModuleLoader `id`。任一不一致，面板会整个消失。
- `package.json` 的 `main` / `exports["."]` 指向 `./lib/host/index.js`；`files` 必须含 `lib/host`，否则安装后 host 半不存在。

## 会静默出错的坑

- 已安装的 profile 加载的是包内副本，不跟随本仓库源码：改源码要重新安装（发版后 `@latest`，或 `dsh plugin --profile web add file:/绝对路径/...`）再重启；仅刷新页面只更新 client 半。
- `src/host/index.ts` 用 `new URL('../../skills/decision-layer/SKILL.md', import.meta.url)` 找打包内的 skill：源码在 `src/host/`、产物在 `lib/host/`，两层 `..` 才对；改了目录层级会静默丢掉 skill。
- `meta.detail` 必须是包内相对 `.md` 路径（不能绝对、不能 `..`）；新增或改名要同步 `package.json` 的 `files` 与 `scripts/assert-pack.mjs`，否则详情页回落到 README。
- 会话开关有两个界面（dock 面板、决策分析页），必须经 `session-events.ts` 同步，不要各存一份本地状态。
- 决策行会带 gate 的 `command` / `path`；四个决策点的任务节选都来自 `src/host/decision-context.ts` 的同一快照：**只接受 `source.kind=user`**（无 source 的旧宿主消息走兼容路径），时间 / 运行环境 / 记忆 / 后台通知 / 插件 steer 都不算用户要求，改用 `role` 判断会让日志场景被注入消息覆盖。回合边界在首个 pre-step 记录，完成证据只取边界之后的工具结果（`toolCallId` 关联调用名）；历史被 rewind / 压缩替换时证据保守清空。`/logrows` 也会回传 `task` / `turn` / `step`，新增字段前先确认不会把超出既有范围的原文带到浏览器。节选必须走 `taskExcerpt`（剥离注入块 + 遮蔽凭据 + 512 上限），`session-state` 落盘前还会再掩码一次；不要在各决策点另写一份。
- 收窄在回合首步和同回合新用户要求时都会重跑，**重跑前必须先释放旧 restriction**（旧 allow-list 会让工具永久回不来），并在 `turn/end` 释放以覆盖下一回合首步；通知类消息不重判；不要改成每步都调模型。宿主在 `agent/pre-step` 之前就解析好本步工具集，所以限制**从下一步起**才进入模型请求，首步自身的调用仍按全量放行——这是宿主时序，不是 bug，面板文案与 ADR-0016 都按此表述。
- 收窄只作用于工具通道：`dsh-ui` 围栏由 client 从回复正文解析渲染（`fence-channel=dom`），`skill` 是核心工具、技能说明照旧可加载。判断「收窄是否生效」要看 `request/header` 里的 tools 是否变少、以及调用是否落在当步集合内，不要拿「还能出 UI」当证据。
- 阈值默认值不在 `src/host/config-store.ts`：服务端在各决策点模块（如 `src/host/narrowing.ts` 的 `DEFAULT_NARROW_THRESHOLD`），配置页镜像在 `config-form.tsx`，文案在 `i18n.ts`；改默认值要同时改这几处与测试。
- `featureOn` / `resolveConfig` 在热路径上，读取必须容忍抛错并回退默认；`backend.evaluate` 的请求/响应校验是唯一 wire 契约，不要在调用点复制宽松版。

## 提交

- 只在用户明确要求时创建 commit；一个可验证的功能切片一个提交，暂存具体文件，不用 `git add .`。
- Conventional Commits 英文 type + 中文 subject，只写最终实现，不写过程叙述。
- 提交前跑 `npm run check` 与 `git diff --check`。
