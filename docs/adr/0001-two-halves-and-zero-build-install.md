# ADR-0001：双半架构与服务端零构建

- 状态：Accepted（2026-10-26）
- 相关：`service/`、`src/client/`、`package.json` 的 `dsh.client`、`cordis.patch.yml`、ADR-0012

## Context

DSH 插件有两半：host 半跑在 Node 进程里（Cordis 插件），client 半在浏览器里由模块加载器装配。两条平台约束固定了形态：

1. host 半必须是可直接 `import` 的 ESM —— dsh 加载插件时**不做构建**；
2. 安装端不能跑构建脚本（包管理器会拦 git 依赖的构建脚本，dsh 又把安装期脚本审批做成人工步骤），所以「安装时编译 TypeScript」这条路不可用。

备选：全部手写 JavaScript（放弃类型检查与 `tsc` 的接线校验）；host 半也过 bundler（多一层产物、source map 与调试栈变差，收益为零）；发布前手工构建并入库（见 ADR-0012，冲突成本被实测淘汰）。

## Decision

- host 半（`service/*.mjs`）是纯 ESM，无构建步骤，Node `>=20.11`。
- client 半（`src/client/*.tsx`）用 TypeScript 严格模式，经 esbuild 打成**单个** `lib/client.js`，以 `window.__ModuleLoader__.load({ id, factory })` 包装后交给宿主。
- 只有 client 半有产物；产物由 CI 构建（ADR-0012），不入库。
- 类型检查与产物生成是同一条命令：`npm run build:client`（`tsc --emitDeclarationOnly` + esbuild）。

## Consequences

- 服务端改动无需构建链路，重启 host 进程即生效——没有「构建产物过期」这类故障面。
- 客户端改动必须重建 `lib/client.js`。漏建时只有 host 半是新的、UI 仍是旧的，属静默故障；由 CI 的构建 + 打包断言挡住（ADR-0012）。
- 单 bundle 意味着任何 client 改动都重写整个 `lib/client.js`——这正是它无法入库的原因（ADR-0012）。
- `tsc` 只产 `.d.ts`（`emitDeclarationOnly`），因此类型错误在构建期暴露，但产物里没有可读源码；排查线上问题要看 `src/`。
