# AGENTS.md

本文件是 `dsh-decision-layer` 的 agent 工作指南。功能与交互以代码和测试为准，设计理由以 `docs/adr/` 为准，安装与使用说明以 `README.md` / `README.en.md` 为准。本文件只记录操作规则、必须守住的边界和会静默出错的坑。

## 定位

DSH Web 插件的双半结构：`service/` 是 Cordis 插件（纯 ESM，无构建），`src/client/` 是 React + TypeScript，构建成单个 `lib/client.js`。所有介入都是「模型只给建议、宿主决定行为」：任何决策点失败都必须放行，不能阻断 agent。Host 挂接点在 `service/dsh.mjs` 的 `apply()`，client 由 `src/client/index.tsx` 注册 slot。

## 构建与验证

```bash
npm run build:client        # tsc 严格类型检查 + esbuild -> lib/client.js（不入库）
npm test                    # node --test tests/*.test.mjs
npm run check               # 两者，提交前必须通过，与 CI 等价
```

- Host 改动重启 `dsh web` 生效；client 改动必须重建 `lib/client.js` 再刷新页面。
- 改行为先补/改测试；修 bug 必须带回归测试，不要删测试换绿色。
- 发布走 `.github/workflows/release.yml`（手动触发、默认 `dry_run=true`），不要手工打 tag 或 `npm publish`；版本号用 `npm version <v> --no-git-tag-version`，同时新增 `docs/releases/v<v>.md`。

## 必须守住的边界

- **失败即放行**：裁决点抛错、超时、后端不可达、响应不合法都不能阻断工具调用或回合。`tools/pre-execute` 里的异常会让 agent 连 `read` / `edit` 都做不了。
- **门控只有高置信 `deny` 才拦**；`allow` / `ask` / 低置信 / 异常都不介入，`ask` 不转发宿主审批；拦截经 `tools.guard` 单调执行。
- **收窄不扩权**：只在宿主已允许集合内取交集；`keepBase`（核心 + 保留前缀）必须计入「不能删光」判断；`restrict` 是 agent 作用域，下一回合前释放。
- **自检与完成核对各自一份 `steerOnce`**，每回合各最多补一次；完成核对以工具证据为准，回复自称完成不算证据。
- **防循环**不走后端、不受各决策点开关影响，但会话总开关关闭时同样暂停。
- **管理 API** 只服务回环绑定，校验 Host / Origin，响应 `no-store`，请求体有上限。
- **配置每次现读、无缓存**；坏配置让整份校验失败、各决策点退回安全默认；配置 API 只回 `apiKeySet`。
- **决策分析页只读日志、只追加标注**；页头开关只写会话级 `enabled`，不要扩展成改配置或改历史。

## 代码约定

- Host 用 `.mjs`，相对导入带 `.mjs`；client 用 TypeScript 严格模式，相对导入带 `.js`。
- 可见文案全部走 `src/client/i18n.ts`；`zh` 是键集权威源，新增 key 必须同步 `en`（缺 key 会 tsc 报错）。
- 样式集中在 `src/client/styles.ts` 的单个 `<style data-plugin>`，用 `--dsw-alias-*` 主题变量，不硬编码颜色。
- 不新增依赖；平台模块（React、`@deepseek-ai/*`）保持 external，由宿主提供。
- 安装身份三处必须一致：`package.json.name`、`cordis.patch.yml` 的 row `name`、`scripts/build-client.mjs` 产出的 ModuleLoader `id`。任一不一致，面板会整个消失。

## 会静默出错的坑

- 已安装的 profile 加载的是包内副本，不跟随本仓库源码：改源码要重新安装（发版后 `@latest`，或 `dsh plugin --profile web add file:/绝对路径/...`）再重启；仅刷新页面只更新 client 半。
- `meta.detail` 必须是包内相对 `.md` 路径（不能绝对、不能 `..`）；新增或改名要同步 `package.json` 的 `files` 与 `scripts/assert-pack.mjs`，否则详情页回落到 README。
- 会话开关有两个界面（dock 面板、决策分析页），必须经 `session-events.ts` 同步，不要各存一份本地状态。
- 决策行会带 gate 的 `command` / `path`，`/logrows` 也会回传；新增日志字段前先确认不会把超出既有范围的原文带到浏览器。
- 阈值默认值不在 `config-store.mjs`：服务端在各决策点模块（如 `narrowing.mjs` 的 `DEFAULT_NARROW_THRESHOLD`），配置页镜像在 `config-form.tsx`，文案在 `i18n.ts`；改默认值要同时改这几处与测试。
- `featureOn` / `resolveConfig` 在热路径上，读取必须容忍抛错并回退默认；`backend.evaluate` 的请求/响应校验是唯一 wire 契约，不要在调用点复制宽松版。

## 提交

- 只在用户明确要求时创建 commit；一个可验证的功能切片一个提交，暂存具体文件，不用 `git add .`。
- Conventional Commits 英文 type + 中文 subject，只写最终实现，不写过程叙述。
- 提交前跑 `npm run check` 与 `git diff --check`。
