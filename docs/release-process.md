# 发布流程 SOP（版本 + DMG + GitHub）

> **顺序是硬约束**（ADR-0058）：源码提交 → 装配 → 制 DMG → **提交入库清单** → **打 tag** → 发 Release。
> 清单必须先于 tag 入库，tag 才担保得住字节；否则 tag 只担保源码，而客户拿到手的是字节。
> 2.2.0 就是反例：tag 在、产物在，但「客户手上那版对应哪份源码」答不出来。

## 1. 版本（单平台版本 vX.Y.Z）

1. 各插件 package.json 版本对齐 → `CHANGELOG.md` 汇总变更。
2. 提交（Conventional Commits）→ PR（main 分支保护）→ 合并。
3. 确认工作树干净（`git status` 无输出）。载荷含未提交源码时，入库清单只能标 `source_dirty=1`，
   那一版就不可回溯——2026-09-12 发出的 2.2.0 正是这种情况（载荷里 40 行源码不在任何提交里）。

## 2. DMG 发布

1. `packaging/` 流水线产出 DMG：`assemble.sh` → `sign-and-dmg.sh`。
2. `sign-and-dmg.sh` 在产物原子就位后**自动生成** `release/<version>.sha256`
   （DMG 的 SHA256 + `build` / `source_commit` / `source_dirty` / `profile_snapshot`）。
   这是脚本的产出，**不是手工步骤**：本 SOP 从 2026-09-06 起把这一步写成「计算 shasum →
   写入清单 → 入库」，十天内一次也没有执行过，因为每一步都得靠人记得（ADR-0058）。
3. **提交清单**：`git add release/<version>.sha256 && git commit`。
4. `git tag vX.Y.Z && git push origin vX.Y.Z` —— tag 必须指向**含清单的那个提交**。
5. GitHub Releases 创建 release（标题 vX.Y.Z，正文引用 CHANGELOG 段落），
   **DMG 作为附件上传**（二进制不进 git 仓库）。
6. README/文档站更新下载链接与校验和。

客户校验（DMG 与清单同目录）：

```bash
shasum -a 256 -c <version>.sha256
```

## 3. 安全检查（发布前）

```bash
git grep -nE "(gk_live_|shpat_|sk-[A-Za-z0-9]{20,}|api[_-]?key\s*[:=]\s*['\"][^'\"]{8,})" -- ':!*docs*' | head
```

## 4. 回滚

- 代码：`git revert` 或 tag 回退（Release 保留历史版本附件）。
- 本机插件：profile 依赖回指旧 commit 后 `pnpm install` + 重启。
