# 灰度发布 SOP（LUTE 2.0.0 起）

> 目标：大版本升级（如 2.0.0 基座迁移）在客户灰度名单验证一周后全量。
> 触发：每次跨运行时/跨基座大版本发布（patch/minor 产品版仍走常规发布）。

## 1. 灰度名单

- 规模：**1-2 个老客户**（数据量大、使用频繁、且愿意配合反馈者优先）。
- 名单由业务负责人指定并记录在 Release 说明中（不写客户隐私，只记编号）。

## 2. 灰度包

- 与全量包同源（同一 DMG + 同一 SHA256SUMS），仅分发对象不同。
- 发灰度前复核：`shasum -a 256 -c SHA256SUMS`，再对**挂载后**的 app 验签：
  `codesign --verify --deep --strict "/Volumes/DSH Desktop LUTE <ver>/DSH Desktop.app"`。
  用 `codesign` 而非 `pkgutil --check-signature`：签名是**自签证书**（非 Developer ID），且 `pkgutil` 只认 `.pkg`——
  本版起交付面没有 `.pkg`（见 [INSTALL-CARD](../packaging/INSTALL-CARD.md) 完整性说明）。
  2.3.0 起还应连带验**身份**（ADR-0063）：`codesign -d -r-` 的指定要求必须是
  `identifier "…" and certificate leaf = H"…"`，**不得出现 `cdhash`**——adhoc 的指定要求
  字面上就是二进制哈希，那正是「每升一版 TCC 就重授一次」的根因。

## 3. 观察指标（一周窗口）

| 指标 | 数据源 | 阈值 |
|---|---|---|
| 启动成功率 | 客户反馈 + 日志（startup.jsonl rendererStatus） | 100%（任何一次 failed 即中止灰度） |
| 白屏/恢复模式报障 | 客户反馈 | 0 |
| 插件缺失报障 | 客户反馈（对照 patches-manifest-v2 锚点） | 0 |
| 会话/数据可读 | 客户目视 + 投影缓存重建 | 全部可读 |
| 灵枢可用性 | 客户反馈（aeis-venv 自检日志） | 可用 |
| 回滚请求 | 客户主动提出 | 任何 1 起即启动全量回滚预案 |

## 4. 回滚触发与预案

- 触发：任一指标超阈值。
- 预案：客户重装上一版安装包（数据目录按安装器备份语义保留）；**注意 seeded 子代理会话的降级风险**（rc.1 seeded header 扩展，alpha.1 解析器不支持——回滚后此类会话可能读不全，需人工导出）。

## 5. 全量发布

- 灰度期 7 天无超阈值事件 → 全量（GitHub Release 公开 + 安装卡更新）。
- 灰度结论写入 packaging/CHANGELOG.md 对应版本条目（「灰度：通过/中止 + 观察摘要」）。

## 6. 灰度期紧急响应

- 客户报障 → 优先远程收日志（`~/Library/Application Support/LUTE Agentic System/logs/` 与 `~/.dsh/profiles/desktop/` 的 verify 输出）→ 对照 dsh-dev-platform-diagnostics 判定表 → 可远程修复的（补丁锚点重放）远程修，不可远程的走回滚。
