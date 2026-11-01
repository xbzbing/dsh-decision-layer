# ADR-0015：host 半改用 TypeScript，两半统一构建

- 状态：Accepted（2026-11-01）
- 相关：`src/host/*.ts`、`build.mjs`、`tsconfig.json` / `tsconfig.host.json` / `tsconfig.client.json`、`package.json` 的 `main` / `exports` / `files` / `scripts`、`scripts/assert-pack.mjs`、ADR-0001（被本 ADR 取代）、ADR-0012、ADR-0013

## Context

ADR-0001 选择让 host 半保持纯 ESM、零构建：安装端不能跑构建脚本，而 host 又必须能被 `import`，于是「源码即产物」是最省事的形态。代价在 host 长到 16 个模块、约 120 KB 后变得具体：

- 跨模块契约（`EvaluateInput` / `EvaluateResult`、`LogRow`、`SessionState`、各配置段的形状）只存在于调用约定里；字段名漂移、可选性变化、返回形状不一致都逃过 `node --test` 的覆盖，只在运行时暴露。
- 重命名与删除靠全仓库搜索和测试红绿兜底；`config-store` 的校验结果与决策点读到的字段之间没有编译期约束。
- 客户端半早已是 TypeScript 严格模式（`strict` + `noUncheckedIndexedAccess`），两半的严格程度不对称。

不变的约束：安装端不能编译（包管理器会拦 git 依赖的构建脚本）；产物必须能直接 `import`；`@deepseek-ai/*` 与 React 由宿主提供，不能打进产物。ADR-0012 已经确立「产物不入库、CI 构建后再 pack」，所以编译这一步有地方可放。

同组织内的 `dsh-git-panel` 用 `src/host/*.ts → lib/host/*.js`（tsc 出声明、esbuild 逐文件转译）跑通了整条链路，说明这条路在本仓库的发布形态下可行。

## Decision

- host 半源码迁到 `src/host/*.ts`，与 `src/client/` 对称；共享类型集中在 `src/host/types.ts`，运行时边界（配置、后端响应、持久化快照、宿主对象）继续逐层校验，**类型不替代校验**。
- 两半都开 `strict` + `noUncheckedIndexedAccess`；host 用 `tsconfig.host.json`（`module: NodeNext`、`lib: ES2023`、`types: node`，不引入 DOM/React 全局），client 用 `tsconfig.client.json`（DOM + react），根 `tsconfig.json` 供编辑器与 `npm run typecheck` 覆盖两半。
- 一个构建入口 `npm run build`（`node build.mjs`）产出两半：
  - tsc 按 `tsconfig.host.json` 输出 `lib/host/*.d.ts`（同时完成 host 的类型检查）；
  - esbuild 把 `src/host/*.ts` **逐文件**转译到 `lib/host/*.js`：不打包、不压缩，相对导入带 `.js`，`@deepseek-ai/*` 保持裸导入由宿主解析；
  - tsc 按 `tsconfig.client.json` 做 client 类型检查（`noEmit`），esbuild 打成单个 `lib/client.js` 并包上 `window.__ModuleLoader__.load({ id, factory })`。
- `package.json` 的 `main` 与 `exports["."]` 指向 `./lib/host/index.js`，`files` 用 `lib/host` 取代 `service`；`service/` 删除，不再保留双份源码。
- 测试改为导入 `lib/host/*.js`；`npm test` 先构建再跑 `node --test`，`npm run check` 与 CI 等价。`scripts/assert-pack.mjs` 断言 tarball 里有 host 入口与 client bundle，且入口的相对导入在包内可解析。

## Consequences

- 跨模块契约在编译期受检；`strict` + `noUnusedLocals` 让「删了调用但留着死代码」这类漂移在构建期暴露。
- host 改动多了一步 `npm run build`：忘了构建会加载旧产物（或入口不存在），属静默故障。挡住它的是「`npm test` 内建构建」与 `assert-pack` 的入口/兄弟模块断言；本地仍需重启 `dsh web` 后才生效。
- `lib/host/*.js` 是逐文件转译，栈信息仍指向具体模块；线上排查看 `lib/host/`，改代码看 `src/host/`。
- 发布链路不变：`lib/` 仍不入库，`npm pack` 前必须构建，CI 的 `npm run check` 已经包含构建。
- 新增直接依赖 `@types/node`（dev 依赖，仅编译期）。类型选择器与 `engines` 的 Node 版本允许的 API 之间需要人工把关，`tsc` 不会校验运行期 Node 版本。
