# ADR-0005：配置整段替换、读取无缓存

- 状态：Accepted（2026-10-26）
- 相关：`service/config-store.mjs` 的 `saveConfig`、`service/dsh.mjs`、`src/client/config-form.tsx`、ADR-0004、ADR-0006

## Context

配置分六个块：`dangerRules`、`gateSettings`、`checkSettings`、`narrowSettings`、`completeSettings`、`features`。写入要回答两个问题：

1. 一次 PUT 只带部分字段时，其余字段保留还是清掉？
2. 读取是缓存还是每次读盘？

配置页只是写入端之一，`config.json` 也可以手改；两端对「一次保存的语义」必须一致。

备选（写入）：逐字段 merge —— 漏字段不丢，但**某个字段永远无法取消**（只能改成新值、无法删掉），而 `keepPrefixes: []` 这类「显式清空」是有意义的，merge 会把它变得歧义；要求 PUT 必须带全部（手改用户无法只改一项）。

## Decision

- **按块整段替换**：请求里出现的 section 完全替换磁盘上的同名 section；未出现的 section 保留原值。块内不 merge。
- 因此调用方要么提交**完整块**，要么先读再展开 `{ ...previous, edit }`。配置页采用后者：提交时把已载入的字段全部展开，连它「不认识」的字段也原样带回。
- **读取无缓存**：`resolveConfig` 每次 `readFile` + `JSON.parse`。改配置即时生效，无需重启 host。
- 校验严格且集中在 `config-store.mjs`：未知字段、越界值、类型不符一律抛错；读侧调用方按 ADR-0004 容错。
- 写入原子：临时文件 + `rename`，文件权限 600、目录 700。

## Consequences

- 「手改 `config.json` 立刻生效」成立——这是免重启调试的唯一手段。
- 代价一：任何绕过配置页的写入端（直接 curl PUT）漏字段就会**静默丢配置**。契约写在 `saveConfig` 的注释里，但运行时没有强制；将来若要兜住，应加「完整块」断言而不是退回 merge。
- 代价二：热路径每次读盘。实测单次 `resolveConfig` 约 65µs（401 字节配置、页缓存命中），一次危险门控调用读 2 次，相对 ~2s 的云端裁决可忽略；只有 home 目录挂在网络上时才值得优化。
- 因为校验严格，读侧**必须**容错，否则严格校验会直接变成可用性事故（ADR-0004 的由来）。
