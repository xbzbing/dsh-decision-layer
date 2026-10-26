# ADR-0013：测试与门禁策略

- 状态：Accepted（2026-10-26）
- 相关：`tests/`、`package.json` 的 `scripts`、`.github/workflows/ci.yml`、ADR-0004、ADR-0011

## Context

插件一半的逻辑是「在 agent loop 的接缝上做判断」，直接做集成测试要拉起整个 DSH，成本高且不稳定；而这些判断本身都写成了「注入 `evaluate` / `sessions` / `steer` 的工厂」，天然可测。

## Decision

- 运行时**零测试依赖**：`node --test tests/*.test.mjs`，不用测试框架。
- 每个决策点导出**纯函数**（`classifyDangerous`、`scoreQuestion`、`extractConditions`、`narrowTools`、`relevanceQuestions`）与**工厂**（`createDangerGate` / `createSelfCheck` / `createTaskCompletion` / `createNarrowing` / `createLoopGuard`）。测试驱动工厂的公开接口、注入假后端，**不测实现细节**。
- 宿主接口用假 ctx 验证装配（`tests/dsh.test.mjs`）：注册了哪些 hook、哪些工具、`pre-execute` 的具体行为。
- 客户端用 esbuild 在内存里构建 + jsdom + `@testing-library/react`，测真实渲染与提交体；其中一条是**跨半耦合断言**——表单提交的 body 必须能被真实的 `saveConfig` 接受并落盘，防止两半字段名漂移后「单测全绿、线上 400」。
- 门禁 = `npm run build:client`（`tsc` 严格：`strict` + `noUncheckedIndexedAccess`）+ `npm test`。CI 在 Node 22/24 上跑同一组。
- **断言必须有判别力**：修 bug 时先确认「去掉修复后测试变红」。反例已发生两次——保留期清理用真实时钟，让带固定日期的 fixture 随时间腐坏；配置爆炸半径的测试起初从空配置起步，测不出「显示已载入值却提交默认值」这个正是要防的回归。

## Consequences

- 测试跑得快（全量约 2.4s），本地可以频繁跑；无框架依赖也就没有升级负担。
- 代价：手写断言与假对象比 matcher 库多几行；`node --test` 的失败输出不如 matcher 友好。
- 客户端测试要现建 bundle（约 1s），因此 client 测试文件比服务端慢一个数量级。
- 与真实宿主的集成仍只在「装进 profile 手动跑」时验证：CI 不覆盖 DSH 本体的行为，宿主升级带来的接口漂移只能靠人工回归。
