# 发布说明归档

每次发版的正文随发版提交入库：`docs/releases/v<版本>.md`。

- **唯一来源**：`release.yml` 用 `--notes-file` 直接发这份文件；在网页上手工改 Release 正文而不改文件，下次重跑会被文件内容覆盖（刻意的）。
- **缺文件即失败**：workflow 在 `npm pack` 之前就检查文件是否存在，所以「忘了写正文」不会走到不可逆的 npm publish。
- **只有正式版与预发布都写**：两者用同一份格式，预发布只是多一个 `--prerelease` 标记、不发 npm。
- 数字**不得沿用上一版**：验证段写当次门禁的真实输出。

## 模板

复制下面内容到 `docs/releases/v<版本>.md`，把 `<PREV>` 换成上一个 tag、`<TAG>` 换成当前 tag：

```markdown
## 主要变更

- 

## 验证

- `npm test`：<N> 通过 / 0 失败
- `npm run build:client`：`tsc` 严格模式 + esbuild 无告警
- `scripts/assert-pack.mjs`：打包产物含 `lib/client.js`，无源码/测试泄漏

---

## English

- 

## Verification

- `npm test`: <N> passed / 0 failed
- `npm run build:client`: strict `tsc` + esbuild clean
- `scripts/assert-pack.mjs`: the tarball carries `lib/client.js` and leaks no sources

<https://github.com/xbzbing/dsh-decision-layer/compare/<PREV>...<TAG>>
```
