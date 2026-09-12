# release/ —— 入库清单的家

本目录**只放清单，不放二进制**。DMG 走 GitHub Releases 附件，二进制不进 git（ADR-0002）。

- `release/<version>.sha256`：由 `packaging/sign-and-dmg.sh` 在产物原子就位**之后**生成（ADR-0058），
  随版本提交入库。字段的权威是脚本本身；这里只解释怎么用：

  ```bash
  # DMG 与本文件同目录时
  shasum -a 256 -c 2.2.0.sha256
  ```

  清单带注释行记录源凭据（`source_commit` / `source_dirty` / `profile_snapshot`）。
  `shasum -c` 会跳过 `#` 开头的行——这一格式已在 macOS `shasum` 6.02 上实测（exit 0）。

- 写入与提交的时序（**构建 → 提交清单 → 打 tag**，顺序不能换）见
  [发布流程 SOP](../docs/release-process.md) 第 2 节。清单必须先于 tag 入库，tag 才担保得住字节。

> 别与 `packaging/release/` 混淆：那是**产物的家**（几百 MB 二进制，被 `packaging/.gitignore`
> 忽略，不进 git）。两个目录同名不同命——本目录进 git，那个不进。

> 2.2.0 的清单是**事后补录**（产物早于 ADR-0058）：哈希可校验，但 `source_commit` 标为不可回溯，
> 因为那一版的载荷含未提交源码。原因见 [CHANGELOG](../CHANGELOG.md) 的 `[2.2.0]`「已知缺口」。
