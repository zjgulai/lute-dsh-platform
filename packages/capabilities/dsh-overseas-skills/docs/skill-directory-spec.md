# 出海技能目录规范（统一目录 · 萃取版）

## 权威事实（DSH skill-filesystem 源码）

- 技能注册只看根目录一层：目录技能 = `<目录>/SKILL.md`；单文件技能 = `<名>.md`。**子目录永不递归注册**。
- 技能目录即 `resourceBase`：模型调用 skill 时拿到 SKILL.md 全文 + 目录路径，子文件经 fs 按需读取（渐进式披露）。
- 因此目录结构 = 资源组织约定（非硬约束）：多装不注册、不报错；`.system` 隐藏目录会被 skipSystem 跳过。

## 统一目录规范

```
<skill-name>/
├── SKILL.md          # 唯一注册入口（必需）：DSH frontmatter + 81 风格正文
├── README.md         # 标题/摘要/快速开始/文件结构（存量由 unify-directories.mjs 生成）
├── LICENSE           # 授权（81 源生 38 个，有则装）
├── references/       # 参考资料 + README.md 路由边界速查（存量自动摘录，零虚构）
├── scripts/          # 可执行脚本（Python CLI，全部 py_compile 通过）
├── examples/         # 示例/模板
├── assets/           # 素材（含 skill-creator 的模板）
├── tests/            # 回归测试（81 生态）
├── eval-reports/     # 评估报告（81 生态）
└── .skill-meta/      # 元数据 manifest.yaml（DSH 忽略，保真）
```

## 分布策略

| 来源 | 结构 | 说明 |
| --- | --- | --- |
| 81 系 77 个 | 源生全量（除 .DS_Store/.command/.doctor-backup） | D1 决策：除垃圾外全量装 |
| 存量单文件 | SKILL.md + README.md + references/README.md | D2 决策：内容全部从已精修正文摘录 |
| 非 81 有子目录 | 补 README.md（已存在不覆盖） | D3 决策 |
| 81 系 deferred | 旧版不动，源文件补齐时按 D1 全量装 | — |

## 维护

- 81 系重装/增量：`bash scripts/pipeline.sh --import`
- 存量目录统一：`node scripts/unify-directories.mjs`（幂等）
- 技能文件层实时生效，无需重启；catalog/图标/摘要变更才需重启
