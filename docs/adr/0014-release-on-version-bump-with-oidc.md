# ADR-0014：版本变更推入 main 即发布，npm 走 OIDC

- 状态：Accepted（2026-10-31）
- 相关：`.github/workflows/release.yml`、`package.json`、`docs/releases/`、ADR-0012、npm Trusted Publishing

## Context

ADR-0012 把发布定成「手动 `workflow_dispatch` + `dry_run` 默认开 + `confirm_version` 二次确认」，npm 凭据留待之后决定。0.7.0 之前实际发版是手工打 tag、`npm publish`、`gh release create` 三步，凭据是长期 `NPM_TOKEN`，产物没有 provenance。

这套流程的代价随发布频率上升：

- 每次发版要点两次（dry run 再正式），且正文文件、版本号、确认字符串三处容易漏；
- 长期 token 存在仓库 secret 里，泄露面比一次性凭据大；
- 手工发布没有可验证的来源证明。

npm 已支持 Trusted Publishing：GitHub Actions 用工作流的 OIDC token 换短期发布凭据，并自动附带 provenance，不需要任何长期 secret。仓库现有的状态检查（tag / npm 版本 / Release 是否已存在）让自动触发可以安全重跑。

**备选**：继续手动（漏步骤的问题不变）；由 tag push 触发（谁打 tag、重跑时 tag 已存在怎么算都更绕）；保留 `NPM_TOKEN`（长期凭据与 provenance 都拿不到）。

## Decision

- **触发**：`release.yml` 在 `package.json` 变更推入 main 时自动执行，同时保留 `workflow_dispatch` 供重跑；去掉 `dry_run` 与 `confirm_version`。
- **凭据**：只用 OIDC。工作流声明 `id-token: write`，不配置 `NPM_TOKEN`，不写带 `_authToken` 的 `.npmrc`；`npm publish --provenance --access public`。npm 侧把该仓库的 `release.yml` 注册为 trusted publisher。
- **幂等**：先查 tag / npm 版本 / Release 是否已存在，已完成的步骤跳过；已有 Release 只更新正文。`npm publish` 位于 tag 之后、Release 之前，是唯一不可逆步骤。
- **正文**：正式版与预发布都来自入库的 `docs/releases/v<版本>.md`，缺文件在 `npm pack` 前失败。
- **渠道**：正式版发 npm + 稳定 Release；版本号带 `-` 的预发布只发 GitHub，不发 npm。
- **门禁**：`npm ci` + `npm run check` + `npm pack` + `scripts/assert-pack.mjs`，全部通过才进 tag 与发布。

## Consequences

- 发版只需一次版本号提交：改 `package.json` / `package-lock.json`、写正文、推 main。少一次人工确认，也少一处漏项。
- 不再有 `NPM_TOKEN` secret；npm 上能看到 provenance 证明产物来自这次 workflow。
- 只改 `package.json` 而不改版本号（例如加脚本、调依赖）会触发一次空操作：tag / npm / Release 都已存在，所有步骤跳过，无副作用但会留下一条运行记录。
- 失败可在 `npm publish` 之前直接重跑；`npm publish` 之后的失败（如 Release 创建失败）重跑只会补 Release，不会重复发布。
- 回滚仍只能发补丁版：npm 版本不可回收。
