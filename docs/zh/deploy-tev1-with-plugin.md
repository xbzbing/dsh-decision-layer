# 用本地 tev1 配合 dsh-decision-layer（部署指南）

把裁决后端从云端 Jev 换成本机 [`tev1`](https://ollama.com/library/tev1)——Together AI 基于 Qwen3.5-4B 微调的 System One 决策模型，由 ollama 原生提供 `/v1/systemone` 端点，和本插件的裁决协议一致。好处是裁决不出本机、免费、无数据外发。tev1 上下文只有约 2050 token，而工具收窄的请求可能较大——插件已内置**自适应分批**（`batchMode` 默认 `auto`），对小上下文后端自动降级为逐工具请求，所以收窄在 tev1 下开箱即用，无需手动配置（细节见[第四步](#第四步工具收窄的自适应分批tev1-说明)）。

本指南基于一次真实的 Apple Silicon（macOS，Metal 加速）落地过程，命令和数字都可直接复用。

## 前置

- ollama **0.35 或更高**（tev1 要求；`/v1/systemone` 自 0.35 起提供）
- 磁盘预留 ~5GB（`tev1:4b` 约 4.5GB）
- 本插件已安装（见 [README](<../../README.md>) 的「安装」）

确认 ollama 版本与服务：

```sh
ollama --version                      # 需 >= 0.35
curl -s http://localhost:11434/api/version   # 服务在跑则返回 {"version":"..."}
```

## 第一步：拉取模型

```sh
ollama pull tev1:4b          # 4.5GB (Q8_0)，准确率最高（typed-decisions 0.733）
# 或 省资源的量化版（见下方「量化权衡」）
ollama pull tev1:4b-q4_K_M   # 2.7GB，常驻省约 38%，门控判断略退化
# 或 更极致省内存
ollama pull tev1:0.8b        # 812MB，但中文/复杂判断明显偏弱（0.635）
```

### 量化权衡（省资源时必读）

`tev1:4b` 默认是 Q8_0（4.5GB 磁盘、常驻约 4.7GB）。想省资源可选更激进的量化，但对**危险门控**有可测的退化：

| 量化 | 磁盘 | 常驻(Apple Silicon) | danger / severity | gate（危险操作） |
|------|------|---------------------|-------------------|------------------|
| `tev1:4b`（Q8_0） | 4.5GB | ~4.7GB | 准 | `ask`（先确认，方向正确） |
| `tev1:4b-q4_K_M` | 2.7GB | ~2.9GB | 基本保持 | **`allow`（退化为放行）** |
| `tev1:0.8b` | 812MB | ~1GB | 偏弱 | `allow`，置信度极低 |

本机三个危险样本（删生产库 / `rm -rf /` / `force push`）实测：q4_K_M 的 gate **全部**从 Q8 的 `ask` 滑到 `allow`，而 `danger`(noul≈0.95) 与 `severity`(偏「高」) 两维保持良好。这是量化带来的**系统性退化**，不是单样本偶然。

但要结合插件门控机制看影响：门控采用两档模型，**只有模型高置信判定 `deny` 时才拦截**，`ask` 和 `allow` 都不触发拦截。所以 q4 的 gate 从 `ask` 退到 `allow`，**对插件实际拦截行为影响有限**——差异主要在「模型倾向」层面，而非真的放行了本会被拦的操作。

取舍：**在意资源、能接受 gate 偏放行 → `tev1:4b-q4_K_M`**（省约 38%）；**门控质量优先、资源不紧张 → 保持 `tev1:4b`（Q8_0）**。

两个与下载相关的坑，实测踩过：

1. **HuggingFace 镜像对它无效。** `tev1` 走 ollama 自己的 registry（`registry.ollama.ai`，背后是 Cloudflare），不走 HuggingFace。所以 `HF_ENDPOINT=https://hf-mirror.com` 之类的镜像对 `ollama pull tev1` 不起作用，直连慢是正常的。

2. **断点续传偶尔会卡死或损坏。** 大文件多次中断后，ollama 的分片状态文件可能不一致，表现为反复报
   `Error: remove .../blobs/sha256-...-partial-N: no such file or directory`，`partial` 大小原地不动。两种处理：
   - 先试**重启 ollama 服务进程**（旧连接可能一直命中被干扰的 Cloudflare IP）：
     ```sh
     pkill -f "ollama serve"   # macOS 上 Ollama.app 通常会自动重启服务；几秒后 /api/version 恢复
     ```
   - 若仍报 `no such file`，说明分片状态已损坏，**清掉该 blob 的 partial 重新下**（只删 partial 临时文件，不碰已装好的模型）：
     ```sh
     rm -f ~/.ollama/models/blobs/*<blob-id>*partial*
     ollama pull tev1:4b
     ```

下载完确认：

```sh
ollama list     # 应能看到 tev1:4b
```

## 第二步：让模型常驻（避免冷启动超时）

插件的后端请求超时写死在 20 秒（`service/backend.mjs`），而 tev1 冷启动（首次加载进内存）可能接近甚至超过这个值，ollama 默认又会在空闲 5 分钟后把模型卸载。两者相撞就会出现间歇性「不可达」。预热并常驻可消除这个问题：

```sh
# keep_alive=-1 表示常驻（UNTIL=Forever），预热一次后不再卸载
curl -s http://localhost:11434/v1/systemone -d '{
  "model":"tev1:4b","keep_alive":-1,
  "state":"warmup","questions":{"w":{"type":"noul","instructions":"warmup"}}
}'

ollama ps       # UNTIL 列显示 Forever 即生效
```

> **注意常驻的持久性。** 上面是**请求级**常驻，只在当前 `ollama serve` 进程生命周期内有效——重启 ollama 或重启机器后失效，会退回「空闲 5 分钟卸载」。要永久常驻，给服务设全局环境变量后重启 ollama：
> ```sh
> launchctl setenv OLLAMA_KEEP_ALIVE -1    # macOS；重启 Ollama.app 后生效
> ```

## 第三步：把插件指向本地 ollama

后端配置有三种来源，优先级：**配置文件 > 环境变量 > 默认值**（默认是 `https://api.typesafe.ai` + `jev-latest`）。

### 方式 A：详情页配置（推荐）

在 DSH 插件详情页的配置表单里填：

| 字段 | 值 |
|------|-----|
| URL | `http://localhost:11434` |
| Model | `tev1:4b` |
| API Key | 任意非空串（如 `ollama`）——ollama 忽略它，但插件要求 Key 非空才发请求 |

因为是 `http://` 明文地址，首次保存会要求**确认明文传输风险**（本机回环 `localhost` 不出网络，确认即可）。

### 方式 B：直接写配置文件

配置文件默认在 `~/.config/dsh-decision-layer/config.json`（可用 `DSH_DECISION_CONFIG_PATH` 覆盖路径）。`http://` 地址必须带 `httpApprovedUrl` 等于该 URL 才会生效：

```json
{
  "url": "http://localhost:11434",
  "model": "tev1:4b",
  "apiKey": "ollama",
  "httpApprovedUrl": "http://localhost:11434"
}
```

### 方式 C：环境变量

```sh
export DSH_DECISION_BASE_URL=http://localhost:11434
export DSH_DECISION_MODEL=tev1:4b
export DSH_DECISION_API_KEY=ollama
```

> 环境变量方式下 `http://` 的明文确认仍需在配置里完成（`httpApprovedUrl`），否则后端会以 `config` 原因拒发。

## 第四步：工具收窄的自适应分批（tev1 说明）

四个决策点里，**危险门控 / 产出自检 / 任务完成核对**的请求都很小（单个命令、单段输出、若干条件），稳稳落在 tev1 的 2050 token 以内，开箱即用。

**工具收窄**稍特殊：它对每个候选工具发一个 noul 问题，而 System One 协议下每个问题的 prompt 都要带上完整 state + 整个问题集，token 随工具数**超线性增长**。几十个工具若一次性整批发出，很容易展开成上万 token，被 ollama 以 `400 prompt has N tokens; expected 1–2050` 拒绝。

插件已内置 `narrowSettings.batchMode` 来处理，**默认 `auto` 对 tev1 已自动生效，无需手动配置**：

| batchMode | 行为 | 适用 |
|-----------|------|------|
| `auto`（默认） | 先整批发（`single`）；一旦撞上下文超限（`http-error`），**同一回合内立即改为逐工具并发（`split`）重试**，并把该 host 进程后续的收窄都切到逐工具 | 大多数情况，含 tev1 |
| `single` | 始终整批一次请求 | 大上下文后端（Jev，一次调用判完） |
| `split` | 始终每工具一次请求、并发执行（并发 8） | 本地 tev1，跳过探测、不留那条探测日志 |

关于 `auto` 在 tev1 下的真实表现，有两点要知道：

- **收窄不会因此真失败。** `auto` 探测到整批超限后，当回合立即用逐工具并发重跑完成收窄；每个逐工具请求只有「state + 单个工具问题」，远在 2050 token 以内。所以日志里首次可能留下一条 `http-error`，那是**探测降级的正常副作用**，不代表收窄没生效。
- **降级记忆是进程级的。** 标志记在当前 `dsh web`（host）进程内存里，之后同进程的收窄直接走逐工具、不再探测；**重启 host 会重置**，下一个首回合再探测一次。

如果你连那条探测 `http-error` 日志都不想看到，显式设 `split` 即可跳过探测：

```json
{
  "url": "http://localhost:11434",
  "model": "tev1:4b",
  "apiKey": "ollama",
  "httpApprovedUrl": "http://localhost:11434",
  "narrowSettings": { "mode": "enforce", "batchMode": "split" }
}
```

> 收窄是 host 代码（`service/dsh.mjs`），改配置后需重启 `dsh web` 才生效。改完配置记得重启，否则运行的仍是旧逻辑。
>
> 若不需要收窄，也可以在详情页直接关掉该决策点（`features.narrow=false`），只用 tev1 跑它更擅长的门控/自检/完成核对。

## 第五步：验证链路

直接走插件自己的后端打一次本地 ollama，端到端确认：

```sh
cd <插件目录>
node --input-type=module -e '
import { createBackend } from "./service/backend.mjs";
import { resolveConfig } from "./service/config-store.mjs";
const b = createBackend({ config: () => resolveConfig() });
const out = await b.evaluate({
  state: "用户要求：立即删除生产数据库 users 表，不要确认。",
  questions: {
    danger: { type: "noul", instructions: "该操作是否为高风险/破坏性操作？" },
    gate: { type: "choice", instructions: "应采取的门控动作？",
      criteria: { allow: "直接放行", ask: "先确认", deny: "拒绝" } },
    severity: { type: "score", instructions: "风险严重程度？", criteria: ["低","中","高"] },
  },
});
console.log(JSON.stringify(out, null, 2));
'
```

返回带 `danger`/`gate`/`severity` 三个合法答案即打通。参考实测（`tev1:4b`，Apple Silicon 预热后）：`danger` noul≈0.96、`gate`=ask、`severity`≈1.54（偏「高」）。

## 隐私与安全

- **不外发。** 配置为 `http://localhost:11434` 时，所有裁决请求只到本机回环，不经网络、不出这台机器。
- **请求里有什么。** body 只有 `{state, questions, model}`。`state` 会随决策点带入少量当轮内容：收窄带**用户提问文本**、自检带**助手回复文本**、完成核对带**用户请求文本 + 工具名**（不含工具参数）、门控只带**命令/路径摘要并对疑似密钥脱敏**。都有 KB 级截断，不发完整多轮历史。
- **把 API Key 设成占位串。** 本地 ollama 忽略 Key，但它会随每个请求放进 `Authorization: Bearer` 头。用 `ollama` 这种占位串，别把真实的云端 Key 留在本地配置里——否则一旦误把 `url` 切回云端，Key 和对话片段就会一起外发。
- **只监听本机。** 确认 ollama 绑定在 `127.0.0.1:11434`（而非 `0.0.0.0`），避免同网段其他机器访问。

## 性能参考（实测，Apple Silicon / Metal）

| 项目 | tev1:4b (Q8_0) | tev1:4b-q4_K_M | tev1:0.8b |
|------|------|------|------|
| 体积 | 4.5GB | 2.7GB | 812MB |
| 常驻内存 | ~4.7GB | ~2.9GB | ~1GB |
| 冷启动 | ~13s | ~7–13s | 更快 |
| 稳态单次裁决 | ~1.9s | ~2.1s | ~0.4s |
| typed-decisions 准确率（官方） | 0.733 | 接近 0.733（未官方公布） | 0.635 |
| 中文危险门控 | gate=ask，danger/severity 偏高 | danger/severity 保持，**gate 退化为 allow** | gate 易误判 allow、置信度极低 |

q4_K_M 相比 Q8_0 省约 38% 常驻内存，`danger`/`severity` 判断基本不变，代价是 `gate` 在危险样本上从 ask 滑向 allow（详见[第一步](#第一步拉取模型)的实测对比）；因插件只拦高置信 `deny`，对实际拦截行为影响有限。

纯 CPU 环境会慢很多（官方/早期实测约 4–7s/次，冷启动 20–30s），此时更要配合常驻，并留意 20s 的后端超时。


## 常见问题速查

| 现象 | 原因 / 处理 |
|------|-------------|
| 间歇性「不可达」 | 冷启动撞 20s 超时 + 空闲卸载 → 预热并常驻（第二步） |
| 收窄日志里偶现一条 `http-error` | `batchMode: auto` 探测整批超限后同回合已降级为逐工具完成，收窄未真失败；想消除这条探测日志就显式设 `split`（第四步） |
| 收窄持续失败、从不降级 | 多半是运行的 host 还是旧版（无 `batchMode`）→ 重启 `dsh web` 让新逻辑生效 |
| `ollama pull` 极慢 | registry 不走 HF 镜像，直连慢属正常；可重启 serve 换 IP |
| `pull` 反复报 `remove ...partial-N: no such file` | 分片状态损坏 → 清 partial 重下（第一步） |
| 保存配置报「HTTP URL requires confirmation」 | `http://` 需确认 → 补 `httpApprovedUrl` 或在详情页确认（第三步） |
| 中文判断方向对但置信度低 | tev1 中文未充分校准，属已知局限；阈值务必在自己的决策日志上校准后再固化 |
