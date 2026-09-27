# 压缩保真度离线评估（研究，不接线）

> 研究工具，**不接入 agent loop、不监听运行时事件、不进 npm/GitHub 发布包**。它复用 `service/backend.mjs` 只为发结构化裁决请求，评估「DSH 压缩摘要是否漏掉了后续任务仍需要的事实」，产出对照实验数据。

## 定位

- 只读离线：读一批人工标注的压缩样本（fixtures），对每条**人工标注的候选事实**问一题 `noul`「摘要是否保留了事实 X，且没有改变其含义？」。
- 不改 DSH 行为：不自动压缩、不改 checkpoint、不阻塞任何 agent 步骤，结果只写本地报告。
- 事实来自原区间的可核对证据，**须人工标注**，不是让模型对摘要整体自评分。

## fixtures schema

每个样本一个 JSON 对象（或一个 JSON 数组包多个样本）：

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `compactionId` | string | DSH `compaction/summary` 事件的 id，便于追溯 |
| `shadowedRange` | `{ start, end }` | 被摘要替换的 surface 区间（seq），来自 DSH |
| `shadowedSeqs` | number[] | 被遮蔽的 surface 节点 seq 列表，来自 DSH |
| `summary` | string | 压缩产生的摘要文本（脱敏后） |
| `facts` | Fact[] | 人工标注的候选事实清单（见下） |

`Fact`：

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `id` | string | 事实唯一 id（如 `f0`），用于把裁决结果对回具体事实 |
| `text` | string | 事实内容（脱敏后的可核对陈述，如「用户确认阈值定为 0.3」） |
| `source_seq` | number | 该事实在原区间的来源 seq，对应 `shadowedSeqs` 之一，便于追溯 |
| `must_keep` | boolean | 人工判断：该事实是否后续任务仍必须保留（真值） |
| `human_preserved` | boolean | 人工判断：摘要是否**实际**保留了该事实（真值） |

## 统计口径

脚本把模型逐事实判定（保留 / 未保留）与人工标注 `must_keep`/`human_preserved` 对照：

- **关键事实检出**：`must_keep=true` 且 `human_preserved=false`（真实遗漏）中，被模型判为「未保留」的比例。
- **误报**：模型判「未保留」但人工 `human_preserved=true`。
- **漏报**：模型判「已保留」但人工 `human_preserved=false`。
- **每样本调用成本**：token 用量、题数、分批数。
- 后端失败的事实记「未评估」，不计入漏报。

分母清晰、不把平均数当百分比；模型自评不作唯一真值。

## 隐私

只用用户授权的测试会话样本，脱敏后入本地；不提交、不外发原始会话，仅发结构化事实与摘要片段。`source_seq` 对应 DSH `shadowedSeqs` 以便追溯。

## 运行

```sh
node scripts/research/compaction-eval.mjs scripts/research/fixtures/sample.json
# 或一个目录 / 多个文件；需要已配置可用的裁决后端（用户授权端点）
```

不设 Key 或后端不可用时，脚本对每条事实记「未评估」，不杜撰结果。
