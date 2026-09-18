# packaging/backup —— 不在仓库树里（2026-09-17 迁出）

## 迁往何处

`~/project/Magpie-Horch-backups/pre-2.0.10-migration/`（同机同卷，本目录的上级之外）。

内含（T-00 全量备份，2.0.5 → 2.0.10 迁移用的回滚点；2026-09-17 三角齐备）：

- `DSH Desktop.app/` —— 生产位 2.0.5（lute 2.4.1）app 备份（`ditto` 保留元数据；42871 文件）
- `dsh-home-snapshot.tar` —— `~/.dsh` 快照
- `DSH.Desktop-2.0.10-universal.dmg` —— 上游基线 DMG + sha256
- `lute-desktop-profile-20260917.tar` —— T-00b：`~/.dsh/profiles/desktop`（689M，含 vendor/、cordis.patch.yml、package.json 与双锁）
- `settings-20260917.yaml` —— T-00b：settings 副本（T-05 回滚用）
- `dsh-userdata-20260917.tar` —— T-00c：userData（87M；排除 Cache/Code Cache/Service Worker CacheStorage，保留 leveldb+logs；**热备份**，pristine 需停机窗口重打）
- `SHA256SUMS` —— 上列 5 个大文件的 sha256（`shasum -c` 验证）
- `DSH-Desktop.app-file-hashes.txt` —— app 目录树 42871 文件逐文件 sha256 清单（生成教训：串行 `find -exec` 600s 超时；批量哈希须 `xargs -P` 并行 + `LC_ALL=C sort` 双清单 diff 收口——comm 在 UTF-8 collation 下有假阳性）

T-00 恢复演练命令（逐条可直接执行）见 docs/research/13 号执行计划 §1「T-00 恢复演练命令（回滚节）」。

## 为什么迁出（决策，2026-09-17 用户选定「迁出仓库树」）

备份在本仓库工作树内时以 **7.9G untracked** 身份存在：`repo-attest`（ADR-0103）
的快照对 untracked 做 `git hash-object` **全量读取**，实测单次快照 174.8s →
六条见证路径 ×2 次快照 → `repo-attest-selftest` 在 `runNodeTestFile` 的 120s
上限内必超时（退出码 124）。备份是**载荷数据**，不是源码；源仓库不应携带
app 二进制树——这不是 repo-attest 一个判据的问题，是任何快照/克隆/tar 类
工具都会付的税。

T-11 回滚引用以本 README 为准：恢复 = 把 `pre-2.0.10-migration/` mv 回
`/Applications`（app）与 `~/.dsh`（tar 解开），或直接从备份外置家取用。

## 不做什么

- 不 `.gitignore` 本目录：迁出后这里没有东西可忽略；若未来要再放备份，
  放到外置家（`~/project/Magpie-Horch-backups/`），不要放回仓库树。
