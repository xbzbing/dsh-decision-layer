# 发布说明归档

每次发版的正文随发版提交入库：`docs/releases/v<版本>.md`。

- **唯一来源**：`release.yml` 用 `--notes-file` 直接发这份文件；在网页上手工改 Release 正文而不改文件，下次重跑会被文件内容覆盖（刻意的）。
- **缺文件即失败**：workflow 在 `npm pack` 之前就检查文件是否存在，所以「忘了写正文」不会走到不可逆的 npm publish。
- **正式版与预发布都写**：两者用同一份四段格式，预发布只是多一个 `--prerelease` 标记、不发 npm。
- 数字**不得沿用上一版**：验证段写当次门禁的真实输出。

## 模板

正式版与预发布共用。复制下面内容到 `docs/releases/v<版本>.md`，把 `<PREV>` 换成上一个正式版 tag、`<TAG>` 换成当前 tag：

````markdown
## 主要变更

- **<用户可感知的标题>**：<现在是什么样、为什么值得升级>
- **修复**：<修掉的现象与影响面>
- **内部**：<约定 / 门禁 / 结构性改动>

## 安装

```bash
# 正式版（npm）
dsh plugin --profile web add dsh-decision-layer@<VERSION>

# 同一版本的 GitHub Release 附件
dsh plugin --profile web add https://github.com/xbzbing/dsh-decision-layer/releases/download/<TAG>/dsh-decision-layer-<VERSION>.tgz
```

## 验证

- `npm run check` 全绿：<N> 单测 + host/client 构建
- `scripts/assert-pack.mjs`：产物含 `lib/host/` 与 `lib/client.js`，无源码/测试泄漏
- <关键回归：修了什么；去掉该修复后哪条测试转红>

[完整变更记录 <PREV>...<TAG>](https://github.com/xbzbing/dsh-decision-layer/compare/<PREV>...<TAG>)

---

## English

- **<Title>**: <what it does now and why it is worth upgrading>
- **Fixes**: <the symptom and its blast radius>
- **Internal**: <conventions / gates / structural changes>

## Install

```bash
# Stable (npm)
dsh plugin --profile web add dsh-decision-layer@<VERSION>

# The same version as a GitHub Release asset
dsh plugin --profile web add https://github.com/xbzbing/dsh-decision-layer/releases/download/<TAG>/dsh-decision-layer-<VERSION>.tgz
```

## Verification

- `npm run check` green: <N> unit tests + host and client build
- `scripts/assert-pack.mjs`: the tarball carries `lib/host/` and `lib/client.js` and leaks no sources
- <key regression: what was fixed and which test turns red without it>

[Full changelog <PREV>...<TAG>](https://github.com/xbzbing/dsh-decision-layer/compare/<PREV>...<TAG>)
````

## 写作规则

- **主要变更**：一条一个用户可感知的结果，标题加粗，冒号后写「现在是什么样 / 为什么值得升级」，不写实现流水账；顺序上用户可见的能力与修复在前，`**内部**` 放最后。
- **安装**：npm 一行钉到本版具体版本（不写 `@latest`），再给同版本 Release 附件一行；命令带 `--profile web`。预发布不发 npm，只给附件。
- **验证**：写当次 `npm run check` 的真实数字，再写 1–3 条最有判别力的回归；没有新验证内容时宁可只留 check 一行。
- **对比链接**：`<PREV>` 用上一个**正式版** tag，跳过中间的预发布，完整覆盖「上一次稳定版之后」的全部内容。
- 不要保留 GitHub 自动生成的 `## What's Changed`。
- 篇幅：patch 1–4 条，minor 5–10 条，major 按需分组。

## 发布流程

发布由 `.github/workflows/release.yml` 在「`package.json` 变更推入 main」时自动执行，使用 npm Trusted Publishing（OIDC），不需要 `NPM_TOKEN`：

```bash
# 1. 版本号：同步 package.json 与 package-lock.json
npm version <v> --no-git-tag-version

# 2. 正文：和代码一起提交、一起 review
$EDITOR docs/releases/v<v>.md
git add package.json package-lock.json docs/releases/v<v>.md
git commit -m "chore: release v<v>"
git push origin main
```

workflow 依次完成：门禁（`npm ci` + `npm run check` + `npm pack` + `assert-pack`）→ 打 tag →（仅正式版）`npm publish --provenance` → GitHub Release（附同一个 tgz）。`package.json` 变更但版本未变时，tag / npm / Release 都已存在，整轮是空操作。

重跑：`gh workflow run release.yml`。已存在的 tag 不重建，已有 Release 只更新正文，已发布的 npm 版本跳过。
