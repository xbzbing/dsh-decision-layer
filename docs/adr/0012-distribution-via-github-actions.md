# ADR-0012：产物移出仓库，发布交给 GitHub Actions

- 状态：Accepted（2026-10-26）
- 相关：`.github/workflows/ci.yml`、`.github/workflows/release.yml`、`scripts/assert-pack.mjs`、`.gitignore`、`package.json` 的 `files`、README 安装章节、ADR-0001

## Context

`lib/client.js`（压缩后的单个 client bundle）曾入库，只服务一条路径：`dsh plugin --profile web add github:xbzbing/dsh-decision-layer` 直接取仓库树、不在安装端构建（为什么不能在安装端构建见 ADR-0001）。代价随规模上升：

- 每次客户端改动都重写整个压缩 bundle，diff 不可读；并行分支**必然冲突**，而冲突只能用重建解决；
- 「改了 `src/` 忘记重建」是静默故障：装上去只有 host 半是新的，UI 还是旧的；
- 产物与源码混在一起，review 时噪声压过真实改动。

同时，仓库已发布到 npm（`dsh-decision-layer@0.6.4`，无 scope），本地 profile 也是从 npm 安装的——主渠道本就不依赖仓库内产物。

## Decision

- **`lib/` 移出仓库**：`.gitignore` 覆盖整个 `lib/`，`git rm --cached` 清掉已跟踪的 `lib/client.js`。源码是唯一事实来源。
- **产物由 CI 构建**：打包前先 `npm run build:client`（`tsc` 严格类型检查 + esbuild 单 bundle）。
- **`package.json` 的 `files` 是唯一清单**：`npm pack` 的 tgz 是唯一产物，npm 与 GitHub Release 附件共用同一份。
- **打包断言**：`scripts/assert-pack.mjs` 解包并断言 `lib/client.js` 存在且非空、`service/` 与 `skills/` 齐全、`locale/` 与元数据齐全、不含 `src/`、`tests/`、`docs/local/`。产物缺失必须在发布前失败，而不是发布后才发现。
- **发布由 workflow 执行，且默认不发布**：`release.yml` 只由 `workflow_dispatch` 触发（不像某些仓库那样由 `package.json` 变更自动触发），带 `dry_run` 输入且**默认 true**——手动触发也只跑到「构建 + 门禁 + 打包 + 断言」，不 tag、不 publish、不建 Release。
- 正式发布时：`dry_run=false` 且必须回填 `confirm_version` 与版本号一致 → 打 tag → `npm publish` → 建 Release 并附同一 tgz。正文来自入库的 `docs/releases/v<版本>.md`，缺文件在打包前失败。

**被否决的选项**：要求安装端构建（平台限制，ADR-0001）；CI 机器人把 `lib/` 提交回 main（冲突问题原样保留，只是换了提交者）；新增 `dist` 分支承载产物（同样保留冲突，且简写安装从未有真实用户）；`prepack` 里构建但产物仍入库（两套事实来源，且本地打包结果与 CI 不可比对）。

## Consequences

- main 的 diff 只剩源码；重构与并行分支不再撞压缩产物；review 噪声消失。
- **破坏性**：不带 ref 的 `github:xbzbing/dsh-decision-layer` 安装会拿到没有 `lib/` 的树——host 半仍工作，但面板消失。README 因此改为只推荐 npm，GitHub 侧指向 Release 附件 tgz。当前真实用户只有作者本人，无需公告期。
- 发布流程暂未启用自动触发，避免「改个 `package.json` 就发版」；启用的时机与 npm 凭据（`NPM_TOKEN` 或 Trusted Publishing）一起决定。
- `npm pack` 依赖工作区里已构建的 `lib/`，所以**本地打包也必须先 `npm run build:client`**；`assert-pack.mjs` 把「忘记构建」从静默故障变成显式失败。
- 回滚：重新入库 `lib/client.js`、删掉两个 workflow。npm 版本不可回收，出问题只能发补丁版。
