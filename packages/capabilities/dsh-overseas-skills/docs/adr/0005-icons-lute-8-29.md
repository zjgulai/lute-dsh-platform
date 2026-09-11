# ADR-0005：图标 = 8 分类 + 29 技能专属 LUTE 头像

- Context：与出海技能体系保持同一视觉语言（用户已验收 LUTE 头像方案）。
- Decision：lute-brand-icons 生成器新增 8 枚分类头像 + 29 枚技能专属头像（sk-fs-<name> 条目），assign 脚本扩展 fullstack 分配。
- Consequences：设置页与卡片墙风格统一；生成器 catalog 再扩 37 条（幂等重建）；deferred/未来技能可继续追加。
