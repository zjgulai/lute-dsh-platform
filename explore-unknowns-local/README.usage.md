# explore-unknowns · 本地安装说明

> 本文件是本机安装说明。上游：https://github.com/dzhng/skills/tree/main/skills/engineering/explore-unknowns（dzhng/skills，MIT，778★，2026-08-25 活跃）。上游 SKILL.md 保留不动。

## 一、使用方法

- **触发**：需求含糊/欠规格、代码库或领域陌生、要移植参考实现、开发中途偏离计划要记录、改动上线前要买账确认时——AI 自动启用，引导你做「四象限走查」
- **五阶段走查**（一次一阶段，每阶段亮明当前象限）：
  1. **Known knowns**（已知的已知）——先扫代码领土，开场亮出已确定的地面
  2. **Known unknowns**（已知的未知）——能说得出名字的问题，一个个解决（按架构爆炸半径排序，每次给推荐答案 + 字母选项，你回几个字符即可）
  3. **Unknown knowns**（未知的已知）——你/代码里「没人说出口」的品味、惯例、隐性约束
  4. **Unknown unknowns**（未知的未知）——扫雷：静默陷阱、不成文惯例、半途而废的前人尝试
  5. **Hand over the map**——把完整的四象限地图交到你手上（地图 = 唯一交付物；实现是之后单独的任务）
- **两条铁律**：①「反应胜过想象」——给具体东西让你反应（可点的 mock、决策表），而不是让你描述需求；②「每个产物都预写好你的下一条回复」——芯片/选项/决策表，你的反应就是下一条消息
- **后续**：构建期偏离记录、上线前买账文档、合并前测验（见 references/after-the-walk.md）

## 二、相关说明

- **形态**：Agent skill（纯对话引导，SKILL.md + 6 个 reference 文件，无脚本无依赖）
- **安装**：`~/.dsh/skills/explore-unknowns/`（user-dsh 技能根），watcher 实时生效，无需重启；安装后技能目录已出现
- **冗余评估**：与 grill-me（决策树澄清，预设绑定）和 to-spec（写规格，预设绑定）相邻但分工不同——本技能是「开工前的未知测绘」，且全会话通用（那两个只在 AI 产品开发工程师预设内）；互补不冲突
- **已知观察**：SKILL.md description 里提到「Pairs with write-spec」——**write-spec 已一并安装**（同仓库配对技能），「走查 → 规格」闭环已通：explore-unknowns 烧掉迷雾，write-spec 把地图切成可验证的开发切片
- **更新**：重新从上游 raw 拉取 SKILL.md + references/ 覆盖即可
- **回滚**：`rm -rf ~/.dsh/skills/explore-unknowns`，零残留
- **许可证**：MIT

## 三、迭代优化方向

1. **真机走查**：拿一个真实含糊需求走一遍五阶段，验证「反应胜过想象」的交互在本机效果
2. **配对 write-spec**：如需「走查 → 规格」闭环，安装同仓库 write-spec 技能
3. **与业务预设整合**：如需绑定到某数字员工（如 AI 产品开发工程师），可在其 preset skills 目录加一份
