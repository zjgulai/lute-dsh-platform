# 发布流程 SOP（版本 + DMG + GitHub）

## 1. 版本（单平台版本 vX.Y.Z）

1. 各插件 package.json 版本对齐 → `CHANGELOG.md` 汇总变更。
2. 提交（Conventional Commits）→ PR（main 分支保护）→ 合并。
3. `git tag vX.Y.Z && git push origin vX.Y.Z`。
4. GitHub Releases 创建 release（标题 vX.Y.Z，正文引用 CHANGELOG 段落）。

## 2. DMG 发布

1. `packaging/` 流水线产出 DMG（assemble.sh → sign-and-dmg.sh）。
2. 计算 `shasum -a 256 <dmg>` → 写入 `release/<version>.sha256` 清单（入库）。
3. **DMG 二进制上传 GitHub Releases 附件**（不进 git 仓库）。
4. README/文档站更新下载链接与校验和。

## 3. 安全检查（发布前）

```bash
git grep -nE "(gk_live_|shpat_|sk-[A-Za-z0-9]{20,}|api[_-]?key\s*[:=]\s*['\"][^'\"]{8,})" -- ':!*docs*' | head
```

## 4. 回滚

- 代码：`git revert` 或 tag 回退（Release 保留历史版本附件）。
- 本机插件：profile 依赖回指旧 commit 后 `pnpm install` + 重启。
