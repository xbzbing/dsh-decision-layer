# 架构决策记录（ADR）

本目录记录 `dsh-decision-layer` 已经做出的架构决策。

这些决策原先散落在 `README.md`、代码注释、测试断言与提交信息里：规则还在，**理由会丢**。提交信息里的论证（例如「为什么门控不发 `ask`」「为什么配置整段替换而不是逐字段 merge」）只有翻历史才看得到，而 ADR 把它固定在仓库里。本批迁移自 2026-10-26 的代码与文档现状，不是新决策；只有 ADR-0012 是本次新做的决定。

## 约定

- 一个 ADR 只记一个决策；文件名 `NNNN-短横线标题.md`，编号单调递增、**不复用**。
- 状态取值：`Accepted`（生效中）、`Superseded by ADR-XXXX`（被取代，正文保留）、`Deprecated`（不再适用）。
- 决策被推翻时**不改写历史**：新写一份 ADR，把旧的标为 Superseded 并互相链接，让人能看到完整的决策链。
- 结构固定为 Context（当时的约束与备选）→ Decision（我们做什么）→ Consequences（代价与后续），一到两页。
- **与 README / 代码注释的分工**：README 是使用与操作手册（怎么装、怎么配、改哪里），ADR 解释这些规则**为什么存在**、当时放弃了什么。改规则时两处一起改，别只改一处。

## 索引

| 编号 | 决策 | 领域 |
| --- | --- | --- |
| [ADR-0001](0001-two-halves-and-zero-build-install.md) | 双半架构与服务端零构建（已被 ADR-0015 取代） | 架构 |
| [ADR-0002](0002-adjudication-protocol-single-source.md) | 裁决协议单源、模型无关 | 契约 |
| [ADR-0003](0003-danger-gate-two-tier.md) | 危险门控只在高置信 `deny` 时拦截 | 安全 |
| [ADR-0004](0004-fail-open-with-bounded-blast-radius.md) | 失败即放行，但爆炸半径必须有界 | 安全 |
| [ADR-0005](0005-config-wholesale-replace-and-live-reload.md) | 配置整段替换、读取无缓存 | 配置 |
| [ADR-0006](0006-configurable-thresholds.md) | 介入阈值全部可配，防循环阈值除外 | 配置 |
| [ADR-0007](0007-narrowing-safeguards.md) | 工具收窄的三重保护 | 安全 |
| [ADR-0008](0008-self-check-weighted-score.md) | 自检用概率加权分，低置信低分视为噪声 | 质量 |
| [ADR-0009](0009-task-completion-three-state.md) | 完成核对：确定性提取 + 三态判定 | 质量 |
| [ADR-0010](0010-loop-guard-deterministic.md) | 防循环确定性、不走后端 | 安全 |
| [ADR-0011](0011-observability-persistence.md) | 决策数据落盘：JSONL 日志 + 会话快照 | 数据 |
| [ADR-0012](0012-distribution-via-github-actions.md) | 产物移出仓库，发布交给 GitHub Actions | 分发 |
| [ADR-0013](0013-test-and-gate-strategy.md) | 测试与门禁策略 | 工程 |
| [ADR-0014](0014-release-on-version-bump-with-oidc.md) | 版本变更推入 main 即发布，npm 走 OIDC | 分发 |
| [ADR-0015](0015-typed-host-build.md) | host 半改用 TypeScript，两半统一构建 | 架构 |
| [ADR-0016](0016-decision-context-snapshots.md) | 按来源与回合边界构造裁决上下文 | 契约 |
| [ADR-0017](0017-read-only-execution-checkpoints.md) | 同回合有界只读过程检查与测量 | 质量 |

## 有效期

ADR 记录的是**决策与它的有效期**，不是当前实现的快照。当实现按计划演进时，旧 ADR 不删除、不重写，而是标注新状态并链接取代者：

- **ADR-0001** 的「双半架构、产物由 CI 构建」持续有效；其中「host 半零构建」由 **ADR-0015** 取代（host 改为 `src/host/*.ts` 编译到 `lib/host/*.js`），「产物入库」已退出，由 **ADR-0012** 取代（`lib/` 已移出 main）。
- **ADR-0006** 标定的默认值全部是**未经验证的启发式**，插件因此仍标为体验版（见 README 顶部）；实测校准后应新写 ADR 记录新值，而不是改这份。
- **ADR-0008 / 0009 / 0011** 的判定逻辑持续有效；其输入范围与日志字段由 **ADR-0016** 更新（请求/前文/同回合证据、回合号与步骤号），**ADR-0017** 再扩展了只读过程检查 kind、证据序号与测量字段。
- **ADR-0012** 的「产物移出仓库、由 CI 构建」持续有效；其中「发布只手动触发、默认 dry run」由 **ADR-0014** 取代（改为版本变更自动触发 + OIDC）。

## 新增一份 ADR

复制下面的骨架到 `NNNN-标题.md`（编号取索引里最大的 +1），然后在上表补一行：

```markdown
# ADR-000N：一句话说清的决定

- 状态：Accepted（YYYY-MM-DD）
- 相关：issue / PR / 代码位置

## Context

当时面对什么约束、有哪些备选、为什么它们不够好。写事实，不写立场。

## Decision

我们做什么。用完整句子、主动语态；能被后来的人照着判断「这个改动违不违反它」。

## Consequences

正面、负面、中性后果都要写：代价是什么、后续必须跟着做什么、什么情况下该回来重新评估。
```
