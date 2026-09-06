# dsh-overseas-skills

DSH Desktop 设置页「出海技能」插件：从 Accio 导入的跨境电商技能目录（12 分类 / 110 项已安装），
提供分组栅格浏览、搜索与「模型可见 + `/` 菜单可见」开关。

## 结构

| 文件 | 职责 |
| --- | --- |
| `lib/index.js` | Host：`/api/dsh-overseas-skills/{list,toggle}`（loopback 栅栏）；toggle 写 frontmatter 的 `disable-model-invocation` + `user-invocable` |
| `lib/catalog.js` | 12 分类 × 130 项目录（由 `scripts/build_manifest.py` 从 `manifest/skills.json` 生成） |
| `lib/client.js` | settings.section 页面（id `overseas-skills`、order 26、label「出海技能」）：搜索 + 分组栅格 + 开关，全部 `dsw-*` 语义 Token |
| `manifest/skills.json` | 权威映射（name / 中文 title / 分类 / toolBacked），由 Accio 截图 OCR + 安装缓存生成 |
| `scripts/build_manifest.py` | 重建 manifest |
| `scripts/import-accio.mjs` | 一次性幂等导入器：`/Users/lute/.accio/accounts/1786471462/skills` → `~/.dsh/skills`（工具型跳过，frontmatter 归一化 + 中文 title） |

## 安装（已完成）

- profile `~/.dsh/profiles/desktop/package.json`：`dependencies` 加 `"dsh-overseas-skills": "file:../../../project/Magpie-Horch/dsh-overseas-skills"` + `dsh.profile.bundles` 加条目；`pnpm install --no-frozen-lockfile`；重启。

## ⚠️ 修改 lib/ 后的同步方式（重要）

pnpm 的 `file:` 安装是**硬链接**；但 AI 编辑工具（edit/write）是原子替换（新 inode），会**断开硬链接**，
profile 里的副本将停留在旧内容，宿主热更检测不到。

每次改完 `lib/*.js`，必须**原地覆写** profile 副本（保留 inode）；**先判断是否同一 inode**（硬链接同 inode 时 `cat >` 会自截断为 0 字节）：

```bash
SRC=/Users/lute/project/Magpie-Horch/dsh-overseas-skills
for f in lib/index.js lib/catalog.js lib/client.js; do
  if [ "$SRC/$f" -ef ~/.dsh/profiles/desktop/node_modules/dsh-overseas-skills/$f ]; then
    echo "skip (same inode)";
  else
    cat "$SRC/$f" > ~/.dsh/profiles/desktop/node_modules/dsh-overseas-skills/$f;
  fi
done
```

中文简介：`scripts/apply_summaries.py` 给 manifest 追加 `summaryZh`（110 条简明业务简介）并重建 `lib/catalog.js`；卡片显示 `descriptionZh`（宿主 list 输出），空简介兜底英文 description。

- 客户端 bundle（`lib/client.js`）：覆写后宿主 `client-hmr` 500ms 轮询自动 rebuilt（rev 从随机 nonce
  变 12-hex 内容哈希），渲染器热更；必要时 Cmd+R。
- 宿主入口（`lib/index.js`）：需重启桌面 app 才生效（宿主无热更）。

## 开关语义（A1 · 已生效）

- 页面开关 = **模型调用开关**：开 → `disable-model-invocation: false`；关 → `true`。
- `user-invocable` 恒 true：`/` 菜单始终全量可见，用户显式 `/调用` 不受模型开关影响。
- 默认策略（O1）：导入技能默认 `disable-model-invocation: true`（仅用户侧）；业务员在页面手动开启后才进入模型目录。
- 卡片 `toolGap` 徽标：「需外部工具」= 本机未接入对应 API/MCP（Exa/Jungle Scout/Klaviyo/Printify 等），技能正文含降级说明。
- 工具型 20 项（cli.py/scripts）按决策不导入，页面不显示。

## 优化脚本

| 脚本 | 作用 |
| --- | --- |
| `scripts/optimize_data.py` | O1 默认关闭 + O2 互斥边界（description 尾部 + whenToUse）+ O3 环境说明块 + 描述压缩（幂等） |
| `scripts/route_bench.mjs` | O4 路由基准快筛（词法档）；基准集在 `eval/routing-benchmark.json`（44 条，含簇内负例） |
| `scripts/import-accio.mjs` / `build_manifest.py` / `apply_summaries.py` | 导入、目录、中文简介 |
