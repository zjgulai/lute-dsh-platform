# Workstream 01 · 安全与运行时边界

## 总体顺序

```text
SEC-RT-001 Shopify hostname ───────────┐
SEC-RT-002 外部执行物固定供应链 ───────┤
SEC-RT-003 child env allowlist ────────┤
SEC-RT-003A 破坏性路径与事务边界 ─────┤
SEC-RT-004 Team Hub default-deny ──────┤
SEC-RT-005 body limit ─────────────────┤
SEC-RT-006 atomic persistence ─→ 007 ──┤
SEC-RT-008 session store ───────→ 009 ─┤
                                      ↓
                           SEC-RT-010 总门禁
```

所有测试使用临时 HOME、假凭证、本地 mock 和随机端口。任何真实 Shopify/Getnote/PixPix 凭证、TLS 部署和远端账号操作均需要单独授权。

## SEC-RT-001 · Shopify hostname 规范化与凭证外传阻断

- 优先级：P0
- 估算：S
- 依赖：BASE-001
- 可并行：可与 SEC-RT-002..006、008 并行

### 目标

确保 Shopify client secret/access token 只会发送到经过规范化验证的官方店铺 hostname。

### 范围

- 凭证保存时的 domain 校验。
- 历史凭证读取和每次网络使用前的二次校验。
- token exchange、Admin API probe 和错误呈现。

### 非范围

- 不改变 Shopify OAuth/API scope。
- 不自动“修复”无法确定含义的历史域名。
- 不扩展到其他 Shopify 域名类型，除非有官方依据和单独决策。

### TODO

- [x] 查证当前 Shopify 官方 hostname 与 client-credentials 约束。
- [x] 先为当前字符串拼接实现写一个能触发外传路径的本地 mock Red 测试。
- [x] 建立单一纯函数 `normalizeShopifyHost`，返回规范化 hostname 或结构化错误。
- [x] 只接受预期的 `<shop>.myshopify.com`；明确子域字符、长度与大小写规则。
- [x] 拒绝 scheme、userinfo、path、query、fragment、port、IP、尾随点、空 label、伪后缀和 Unicode 混淆。
- [x] 保存时校验；每次 fetch 前再次校验，阻止历史脏值绕过。
- [x] 用 `URL` 组合请求地址，不拼接未验证字符串。
- [x] 强制拒绝 HTTP redirect，调用方不能通过 307/308 把 secret/token 带到第二个 origin。
- [x] 非法旧值保持 fail-closed，UI 提示重新填写；不回显密钥。
- [x] 对拒绝错误做 secret canary 验证。

### 自动验收

- [x] 合法 hostname 的空白/大小写被规范化。
- [x] `shop.myshopify.com.evil`、userinfo、IP、port、path、尾随点、Unicode 混淆全部拒绝。
- [x] 所有非法输入下 mock fetch 调用次数为 0。
- [x] exchange 与 Admin API 共用同一验证函数。
- [x] 拒绝错误与测试输出不含 secret canary；真实服务日志仍待 live 验收。

### 人工验收

- [ ] 测试店铺合法域名可保存并完成只读连接测试。
- [ ] 非法历史值有明确修复提示，连接仍关闭。

### 失败与回滚

合法域名出现兼容问题时，只能凭官方证据扩充规则。紧急处置是禁用 Shopify 连接，不得恢复任意 host 请求。

## SEC-RT-002 · MCP、LoopX 与第三方技能的不可变供应链

- 优先级：P0
- 估算：L
- 依赖：BASE-001、DEC-009；最终运行验收同时依赖 SEC-RT-003；第三方技能 promotion 的落盘事务依赖 SEC-RT-003A
- 可并行：供应链调查可与其他安全卡并行

### 目标

让所有会被宿主或模型执行的外部字节都绑定到不可变来源、逐文件 digest、许可证和批准记录；移除 Shopify/Getnote MCP 的运行时 `npx -y`、LoopX 启动时的浮动 `pip install loopx>=...`，并把第三方技能从“抓到即安装”改为 quarantine 后按 digest promotion。

### 范围

- `shopify-mcp`、`@getnote/mcp` 的精确版本、来源、许可证和 bin 入口。
- LoopX wheel 与全部传递依赖的精确版本、hash、离线安装物和升级边界。
- `fullstack-extra` / `third-party-intake` 指向的第三方技能：immutable commit、tree/blob、原始资源、许可证、provenance、quarantine 和 promotion。
- profile/packaging 投影、manifest、SBOM、completeness 和门禁。
- clean-machine 重建、live profile 对账和固定版本升级 SOP。

### 非范围

- 不更换 MCP 产品或重做工具能力。
- 不重写第三方技能正文，不因结构 lint 通过就判定语义安全。
- 不在本卡决定某条技能是否具备模型/用户调用权限；本卡只要求未获批内容保持 quarantine 与不可调用。
- 不以缓存过一次的 latest/HEAD 或“长度相同”结果假装固定版本。
- 不自动接受未知、冲突或缺失的许可证。
- 不顺带升级无关 npm 依赖。

### TODO

- [ ] 先冻结三层事实：分别列出 `origin/main`、local HEAD、dirty/untracked candidate 和 `~/.dsh` live 中的 MCP、LoopX、第三方技能字节；未能追溯的 live 技能先标 quarantine，不倒推为已批准。
- [ ] 查证两个 MCP 与 LoopX 的官方来源、maintainer、release、许可证、依赖树和再分发条件。
- [ ] 为每个第三方技能解析一个 immutable commit；tree API 和 raw/blob 下载必须使用同一个 commit，不再使用 `HEAD`、branch 或 tag 作为最终证据。
- [ ] 对每个文件按 Git object 规则重算 blob OID，并另算 SHA-256；cache hit 与新下载走同一验证，禁止只比 size。
- [ ] 二进制资源按原始 bytes 获取，不经 `text()` 往返；拒绝 truncated tree、缺 blob、路径漂移和 commit/tree 不一致。
- [ ] 建立唯一 provenance schema：repo、commit、tree path、Git blob OID、SHA-256、size、license/SPDX、fetchedAt、reviewer、review status、promotion digest；manifest 和实际文件必须双向 completeness。
- [ ] 明确许可证决策：repo 级与文件级声明冲突、无许可证、非商业/不可再分发都保持 quarantine，不能进入 profile、preset 或 DMG。
- [ ] quarantine 内容默认 `disable-model-invocation: true` 且 `user-invocable: false`；promotion 必须由显式批准记录触发，并把批准绑定到内容 digest，任一字节变化自动退回 quarantine。
- [ ] 决定 MCP 的 vendored tarball、离线 node_modules 或受控 executable，以及 LoopX 的 wheelhouse/lock 归属位置；产物必须在 Git 或受版本控制的 artifact store 中可重建，不能只存在 ignored `staging/` 或开发机 HOME。
- [ ] 将 LoopX 依赖改为精确版本与完整传递依赖 hash；安装使用离线 wheelhouse 和 hash enforcement，宿主 `apply()` 不再隐式联网升级。
- [ ] MCP 默认配置改为 profile 内固定入口，不使用网络解析；装配前验证 artifact hash、bin、依赖 completeness、SBOM 和 license。
- [ ] packaging 先冻结技能/MCP/LoopX 输入快照并记录 digest；选择、复制、打包只读该快照，结束时复核，不从可变 live HOME 直接取件。
- [ ] 给出精确升级流程：获取新 immutable release/commit、审查 upstream diff、复核许可证、更新 hash、重新批准、跑离线与 live 回归、独立 Note。
- [ ] 新增静态门禁，禁止运行或出货配置出现 `HEAD`/latest、无精确版本的 `npx -y`/`npm exec`、无 hash 的 pip range、未批准技能进入可调用面或 release。

### Red / Green

- [ ] Red：保留当前 `git/trees/HEAD` + `raw/.../HEAD`，让 HEAD 在两次响应间前进；测试必须复现 tree/raw 混搭并判红。
- [ ] Red：cache 文件改成同长度不同内容、Git blob OID 正确但 SHA-256 错误、approval digest 过期、许可证缺失，四类都必须阻止 promotion。
- [ ] Red：保留 `loopx>=0.5.4` 或未锁传递依赖，静态门禁必须点名；空 cache/断网启动不得悄悄联网或换版本。
- [ ] Red：quarantine 技能被写成 model/user invocable，或 ignored staging 成为唯一来源，门禁必须失败。
- [ ] Green：固定 commit 的 tree/blob、双 digest、license、批准记录和安装物逐项闭合；重复取件得到完全相同 manifest 与 bytes。
- [ ] Green：MCP 和 LoopX 在无网络、空 npm/pip cache 的 clean machine 从受控 artifact 启动；第三方技能只有 approved digest 能进入可调用面。

### 故障注入

- [ ] 在 tree 与 blob 读取之间推进 upstream HEAD、返回 truncated tree、404/429、同长度截断正文、损坏 cache，均不得留下可 promotion 的半批次。
- [ ] 在 provenance/内容落盘中注入 ENOSPC、EACCES、进程终止；旧批准集保持完整，新批次保持 quarantine。
- [ ] 替换 wheel/tarball 一个字节、增加未锁传递依赖、模拟 package registry 返回更高版本；安装必须在执行外部代码前失败。
- [ ] promotion 后改变任一资源文件或许可证文件；下次 gate/profile sync 必须撤销其 approved/live 等价声明。

### 自动验收

- [ ] 网络断开且 npm cache 为空时两个 MCP 均能启动。
- [ ] 网络断开且 pip cache 为空时 LoopX 可从固定 wheelhouse 启动；缺 artifact 时 typed fail-closed，不联网自修复。
- [ ] 任一 MCP、wheel、技能资源改一个字节即在装配、promotion 或挂载前失败。
- [ ] 出货与运行配置扫描不到原来的两条 `npx -y`、`loopx>=...`、GitHub `HEAD` 取件。
- [ ] manifest 可解析出精确版本/commit、来源、Git blob OID、SHA-256、license、review 与 promotion 状态。
- [ ] 来源树与 manifest 双向逐文件闭合；cache 命中与首次下载结果一致。
- [ ] 未批准、digest 漂移、无许可证技能不出现在 live 可调用列表与出货技能树。
- [ ] 对应包 test/typecheck/build、profile sync 和 gate 通过。

### 人工验收

- [ ] 用测试账户分别调用一个只读 Shopify 和 Getnote 工具。
- [ ] 在测试 profile 调用固定 LoopX CLI，确认版本、来源 digest 与 manifest 一致。
- [ ] 审核一条无脚本技能完成 quarantine → approved → live，再改一个字节确认它退回 quarantine。
- [ ] UI 中状态、版本、工具数和失败提示与实际一致。

### clean-machine / live 证据边界

- [ ] clean-machine 证据必须来自空 HOME、空 npm/pip cache、无既有 `~/.dsh/skills` 的临时环境，并从仓库/受控 artifact store 重建；开发机已有 cache 或 live 目录不能代替。
- [ ] live 证据只证明当前 profile 的固定 artifact 能启动及 UI/工具可用；不把测试账号调用提升为许可证批准、供应商真实性或正式发布验收。
- [ ] DMG/release 证据必须另行给出出货 manifest、签名和安装后 digest；本地 profile 对账不等于已出货。

### 失败与回滚

若供应商包不能合法再分发、来源无法固定或无法离线运行，保持连接/技能禁用并升级为产品决策；回滚只能恢复上一组已批准 digest，不能回退到运行时下载、移动 HEAD 或未审批 live 副本。

### 退出条件

- [ ] MCP、LoopX、第三方技能三条链均不存在运行时版本解析或唯一来源落在 ignored/live HOME 的情况。
- [ ] 每个可执行/可调用外部字节均有 immutable source、双 digest、license、SBOM/provenance 与批准状态。
- [ ] 全部 Red 与故障注入能稳定判红，Green、clean-machine、profile 和 release 分层证据齐全。
- [ ] 任一来源、license、hash 或 approval 未闭合时，能力保持禁用且发布阻塞，无 exemption。

## SEC-RT-003 · 子进程环境变量 allowlist 与 LoopX 启动边界

- 优先级：P1
- 估算：M
- 依赖：BASE-001；外部 artifact 固定与离线安装依赖 SEC-RT-002
- 可并行：高

### 目标

LoopX、pip/Python、MCP 和后续子进程只继承运行所需变量，不继承 DSH 宿主里的任意凭证、代理、解释器注入或包管理器配置。

### 范围

- 全仓 `spawn`/exec/Python/CLI 启动入口清点。
- 自动 LoopX 初始化、显式 `/loopx-init`、CLI probe/driver、MCP stdio 与系统 `open` 等不同进程类别的显式 allowlist。
- 必需系统变量、目标专属业务变量、危险解释器/包管理变量的 deny-by-default 规则。
- 日志脱敏。

### 非范围

- 不改变 LoopX 命令协议。
- 不在本卡决定 LoopX/MCP 的版本、hash 或再分发方式；由 SEC-RT-002 负责。
- 不轮换真实凭证。
- 不在本卡创建复杂跨仓库进程框架。
- 不用清空所有环境变量制造不可诊断的兼容性回归。

### TODO

- [ ] 用静态扫描生成所有 child-process 入口清单，并记录 owner、argv、cwd、env builder、网络能力、timeout、输出上限与调用时机。
- [ ] 按进程类别记录真正需要的 PATH、HOME、TMPDIR、LANG/LC_ALL、PYTHON_BIN、LOOPX、MCP 变量；默认类别之间不共享业务变量。
- [ ] 明确拒绝继承 `OPENAI_*`、云凭证、Git token，以及 `NODE_OPTIONS`、`PYTHONPATH`、`PYTHONSTARTUP`、`PIP_CONFIG_FILE`、`PIP_INDEX_URL`、`NPM_CONFIG_USERCONFIG` 等可注入执行或改变取件来源的变量，除非某一入口有单独设计与测试。
- [ ] 为当前 `env: options.env ?? process.env` 和 `{ ...process.env }` 写 `SENTINEL_SECRET` 可见的 Red 测试，分别覆盖 LoopX 自动初始化、repair、probe/runtime 和 MCP。
- [ ] 用包内最小纯函数构造 child env：从空对象开始，按 allowlist 从宿主复制，再逐项合并调用方显式值；禁止 fallback/展开完整 `process.env`。
- [ ] MCP 密钥只注入对应 server，不允许 Shopify/Getnote/PixPix/Apify 之间横向可见；无目标密钥时拒绝启动而非传空值。
- [ ] LoopX 安装/运行使用不同 env：离线安装不继承 registry/proxy 凭证，正常 CLI 不继承 pip/npm 配置。
- [ ] 对 PATH 中的 executable 做解析与来源约束；显式 `PYTHON_BIN` 需要可执行、版本与允许位置验证，不能借 env 覆盖为任意 wrapper。
- [ ] 日志只列必要变量名、来源类别和缺失状态，不打印值、完整 env、子进程原始敏感输出。
- [ ] 增加静态门禁覆盖新 spawn/exec 入口，并要求每个入口引用登记的 env policy id。

### Red / Green

- [ ] Red：当前实现下向宿主注入 `SENTINEL_SECRET`、`OPENAI_API_KEY`、`AWS_SECRET_ACCESS_KEY`，测试先证明子进程可见。
- [ ] Red：注入 `NODE_OPTIONS=--require ...`、`PYTHONPATH`、`PIP_INDEX_URL`、`NPM_CONFIG_USERCONFIG` 和恶意 `PYTHON_BIN`，测试必须证明旧实现可受影响并由新门禁判红。
- [ ] Green：每类 child 只看到其 policy 明列的变量；MCP A 的 secret 对 MCP B 和 LoopX 不可见。
- [ ] Green：必要 PATH/HOME/TMPDIR/locale、固定 Python/LoopX/MCP 变量仍可工作；缺失时返回 typed error，不打印 env。

### 故障注入

- [ ] 删除 PATH/HOME/TMPDIR、提供不可执行 binary、错误 Python 版本、子进程超时/超量输出/非零退出，确认清理、错误分类和日志脱敏。
- [ ] 在 spawn 前后改变宿主 `process.env`，证明已构造的 env snapshot 不受竞态污染。
- [ ] 模拟用户 env 与系统 allowlist 同名冲突，验证显式优先级和禁止覆盖项。
- [ ] 模拟包含 secret 的 stderr/exception，确认截断、脱敏后才进入日志和 UI。

### 自动验收

- [ ] `SENTINEL_SECRET`、`OPENAI_API_KEY` 等在子进程不可见。
- [ ] PATH、HOME、PYTHON_BIN、LOOPX_BIN 等必要变量仍可用。
- [ ] 所有 spawn 入口被清单覆盖。
- [ ] 不再存在 `env: process.env` 或等价全量展开。
- [ ] 危险解释器/包管理器变量在所有未授权入口均不可见。
- [ ] 静态门禁对新增未登记 spawn 与完整 env 展开能稳定报错。

### 人工验收

- [ ] 真实 profile 中 LoopX/Python/MCP 正常启动。
- [ ] 缺少必要变量时错误只说明缺什么，不显示环境内容。

### clean-machine / live 证据边界

- [ ] clean-machine 使用临时 HOME 与仅含最小系统变量的环境，分别证明自动 LoopX init、repair、runtime 和两个 MCP 的必要变量清单充分。
- [ ] live 只做假凭证 canary 与进程可用性对账；不得读取、打印或比较真实 secret 值，也不因子进程启动成功声称供应链已固定。
- [ ] SEC-RT-002 未完成前，live 测试保持网络安装和未 pin MCP 禁用，避免用环境修复掩盖供应链缺口。

### 失败与回滚

兼容缺失只能逐项增加有证据的变量；不得通过恢复完整 `process.env` 回滚。

### 退出条件

- [ ] 所有 child-process 入口均有 owner、policy id、最小 env、timeout/output 与 secret-redaction 契约。
- [ ] 完整 env 展开、危险注入变量和跨连接 secret 可见性三类 Red 均能判红，Green 在 clean-machine 与测试 profile 成立。
- [ ] live 日志、错误和快照不含 canary/真实凭证；SEC-RT-002 的固定 artifact 不依赖宿主私有 registry env 才能运行。

## SEC-RT-003A · 破坏性 preset/skill 操作的路径封闭与全批事务

- 优先级：P0
- 估算：L
- 依赖：BASE-001；可复用 SEC-RT-006 的 atomic writer/故障注入约定，但不得形成实现循环依赖
- 可并行：设计与 SEC-RT-002/006 并行；落盘协议确定后再接 promotion

> 2026-09-16 状态：**local implementation complete / live 与 UI 人工验收 deferred**。共享路径与事务层、
> remover/restore/recovery、existing skill whole-directory swap 和统一 gate 已落地；第三方 promotion 的 mutation
> 入口已接事务协议，但在 SEC-RT-002 immutable approval/license/source-digest ledger 完成前按设计 fail-closed。
> 本轮所有 mutation 仅发生在临时根；真实 `~/.dsh` 只跑 installer dry-run 与 approval 拒绝验证。

### 目标

使 `remove-preset` 与第三方 skill installer 无法通过 `--ids`、`installAs`、symlink 或路径竞态逃逸各自根目录；所有目标先完成全批 preflight，再以可恢复的同文件系统 swap 提交，任一失败恢复到批次开始前状态。

### 范围

- `scripts/role-presets/remove-preset.mjs` 的 user root、archive root、最终 preset id、归档、移除与恢复契约。
- `install-fullstack-skills.mjs` 的最终安装名、skill root、源目录、目标目录、资源复制与 promotion 写入。
- final-name 校验、canonical containment、symlink/硬链接边界、并发锁、全批 preflight、staging、atomic swap、rollback journal 和恢复工具。

### 非范围

- 不删除、迁移或改写任何真实用户 preset、session 或 live skill。
- 不改变 session 引用判定、技能正文、分类或 invocation 权限语义。
- 不把本卡扩成通用文件事务框架，也不承诺跨文件系统原子 rename。
- 不把 `--force` 解释为可绕过路径、安全、归档完整性或恢复能力；它最多绕过已有 session 引用的产品决策。

### TODO

- [x] 记录两个当前根因的 fail-first fixture：`join(root, "../outside")` 通过 exists 检查后进入 `rmSync`；只校验 `name`、实际以未校验 `installAs` 组成删除目标。
- [x] 建立单一 `validateFinalName`：拒绝空值、`.`/`..`、任意分隔符、绝对路径、NUL/control、Unicode 非规范形式；同时检测 macOS 大小写/NFC 冲突和批内重名。
- [x] 建立 `resolveContainedTarget(root, finalName)`：root 先 canonicalize；目标 parent 必须精确等于 root；源、目标、archive 各自独立验证，不能用一次校验替代另一根。
- [x] 对 root、现有目标和每一层 parent 使用 `lstat`/`realpath`；默认拒绝 symlink、junction/alias 和无法证明边界的 hard-link 文件，打开/rename 前再次核验 inode/content。
- [x] 全批 preflight 在首次 payload 写盘前完成：name/path、来源、引用面、批准状态、manifest、目标冲突、空间/权限与同文件系统能力均通过；第三方批准缺失时整批拒绝。
- [x] 引入同一 root 的排他锁，第二个 installer/remover fail-fast；锁含 owner/pid/startedAt，orphan lock 只能经 journal 绑定的明确恢复流程处理。
- [x] 完整批次复制到 root 的 sibling staging，逐文件 hash/size/mode/completeness 验证并 fsync；staging 不在目标子目录且不追随 source link。
- [x] 采用“旧目标 rename 到 backup → staged rename 到目标”的逐项 journal，失败逆序恢复；文档明确不宣称多目录整体原子。
- [x] preset 移除先完成全部归档与 SHA-256 manifest，再把源移动到同文件系统 quarantine；本层不提供 GC，恢复前不做不可逆删除。
- [x] skill 更新保留完整旧目录而非只重写 `SKILL.md`；版本与 resources 作为一个单元 swap，第三方 approval digest 待 SEC-RT-002 后才放行 mutation。
- [x] 每次事务记录 batch id、允许根、目标 final-name、before/after digest、阶段与恢复动作；journal 不含 session 内容、skill prompt 或 secret。
- [x] 提供 `--dry-run`/preflight JSON，输出 canonical 目标和计划动作；live mutation 需要显式 `--apply`、独立授权与可恢复备份。

### Red / Green

- [x] Red：`../x`、`a/b`、`a\\b`、绝对路径、`.`/`..`、NUL/control、NFC/NFD 与大小写碰撞作为 `--ids`/`installAs` 均由新 validator 在文件操作前拒绝。
- [x] Red：user/archive/skill root、现有目标或中间 parent 为 symlink；测试证明根外 canary 不变且 live rename 为 0。
- [x] Red：批次最后一项无效或重复，前面所有项也零写入，打掉“边循环边修改、最后统一退出”的实现。
- [x] Green：合法单项/多项在同文件系统完成 staging、digest 校验、swap 和 journal close；旧版本可从 backup 完整恢复。
- [x] Green：`--force` 只影响已知 session-reference gate，扫描失败、零会话与安全 Red 仍保持拒绝。

### 故障注入

- [x] 在第 N 个 copy、manifest/journal 写、fsync、旧目录 rename、新目录 rename、journal close 注入 ENOSPC/EACCES/EIO；另以真实子进程在 rename 后硬退出，显式 orphan adoption 后恢复完整 before。
- [x] 在 preflight 与 swap 之间把目标替换成 symlink，事务中止、保留锁与 journal，根外目标逐字不变。
- [x] 两个真实进程同时操作相同 root，持锁批唯一提交，另一批 fail-fast 且无 workspace/部分副作用。
- [x] 归档少文件/同 size 不同 hash 判红；rollback 中途 EACCES 保留 journal、lock、backup 与 quarantine，并给出显式恢复命令。

### 自动验收

- [x] 路径逃逸、symlink、hard-link 边界、Unicode/case collision 与 TOCTOU fixtures 全部 fail-closed。
- [x] 任一 payload preflight 失败时，workspace/lock/live target 均保持不存在或逐字不变；实现不含递归 rm。
- [x] 所有 swap fault point 的恢复结果满足“完整 before 或完整 after”，不存在混合版本和丢失 resources；rollback 自身失败则明确停在 manual recovery。
- [x] archive/staging manifest 使用内容 hash，不以文件数与总字节数代替完整性；第三方 promotion 因 SEC-RT-002 未满足而不落盘。
- [x] 并发测试只允许一个 batch commit，另一批无部分副作用。

### 本轮本地证据（2026-09-16）

- `node --test` 定向事务套件：50/50 通过，覆盖 path/link、同尺寸篡改、fault、硬退出恢复与真实双进程争锁。
- `dsh-overseas-skills`：82/82 包级测试通过，`tsc -p tsconfig.json --pretty false` 通过。
  - **superseded（2026-09-16 重采）**：按包自身脚本 `npm test`（`node --test test/*.spec.mjs`）实测 **113/113 pass / 0 fail**，exit 0；原 82 是陈旧读数。注意 `node --test test/`（目录形式）会拣到非 spec fixture 并报 fail，必须用包声明的 glob。
- `pnpm run gate:full`：71/71 仓库契约通过，含 `destructive-preset-skill-transactions`、自检与 Node interpreter 门禁。
  - **superseded（2026-09-16 重采）**：`gate:full` 现为 **76 项 / 75 pass / 1 typed skip / 0 fail**，exit 0；分母 71 是注册表扩容前的旧值（HEAD 注册 75 条，工作树 76 条）。同一命令含 `destructive-preset-skill-transactions`、自检与 Node interpreter 门禁，结论不变。
- 真实 HOME 只执行 dry-run 与第三方 `--apply` 拒绝验证；后者以 `APPROVAL_LEDGER_MISSING`、退出码 2 结束且无写入。

### 人工验收

- [ ] 仅在临时 HOME 创建 disposable presets/skills，执行 dry-run、合法 install/remove、故障恢复和 restore；逐文件对比前后 digest。
- [ ] UI/DSH 在成功 swap 后只看到一个完整版本；rollback 后恢复旧版本，无半更新目录。

### clean-machine / live 证据边界

- [x] clean-machine 证据使用临时 userRoot/archiveRoot/skillsRoot 和随机外部 canary，根外 canary 在恶意输入与故障点保持逐字节不变。
- [x] 未获单独删除授权前，live 证据止于 installer `--dry-run` 与 approval 拒绝；未用真实 `~/.dsh` 执行 remove/install mutation。
- [x] 临时 HOME/root 的成功 mutation 只证明事务机制；真实 session 引用、运营备份和用户可恢复性仍需单独 live change approval。

### 失败与回滚

任何路径或事务不确定性都必须在 mutation 前失败。commit 后异常先按 journal 自动逆序恢复；自动恢复失败时保持锁、backup、staging/quarantine 和 journal，停止 GC 与后续批次并升级人工恢复，禁止继续 `rmSync` 或重新跑安装器覆盖现场。

### 退出条件

- [x] 两个入口共用同一套 final-name/canonical-containment 契约，且没有未经验证的 `join(root,input)` 进入递归删除、复制或 rename。
- [x] 全批 preflight、排他锁、staging、内容完整性、swap、journal、rollback 与 retained evidence 均有 Red/Green 和 fault-point 证据。
- [x] clean-machine 的根外 canary 零变化；live 仅有授权范围内证据，未执行真实破坏性操作。
- [x] 任一 rollback 无法证明完成时任务保持阻塞并保留 lock/evidence，不以文件数/总字节相同或口头确认收口。

## SEC-RT-004 · Team Hub 插件 HTTP 路由 default-deny

- 优先级：P0
- 估算：M
- 依赖：DEC-003
- 可并行：高；SEC-RT-009 必须在其后

### 目标

任何新插件 HTTP/upgrade 路由对 member 默认拒绝，只有显式登记的 method/path/capability 才开放。

### 范围

- Team Hub 的 DSH 插件代理策略。
- Wanzh、task-board、SSH、skill explorer 等现有路由盘点。
- HTTP、SSE、WebSocket/upgrade 的一致策略。

### 非范围

- 不重做 Team Hub 用户角色模型。
- 不新增 member 产品权限。
- 不改变必要的 DSH 核心静态资源和核心事件通道。

### TODO

- [ ] 收集当前所有 `/api/<plugin>` host route 及 method。
- [ ] 区分 DSH 核心 route、插件 route、admin-only、允许 member 的 RPC。
- [ ] 建立机读 route registry：path/prefix、method、最低角色、可选 capability、owner。
- [ ] 未登记插件 GET/POST/upgrade 一律拒绝或 admin-only。
- [ ] 在代理前执行策略，不依赖上游 loopback/Host/Origin 判断。
- [ ] 迁移当前硬编码前缀，每个放行项写明业务理由。
- [ ] deny 审计只记录 user/method/route/reason，不记录 body、query secret 或凭证。
- [ ] 为路径编码、尾随斜杠、大小写、prefix collision 写绕过测试。

### 自动验收

- [ ] member GET `/api/dsh-wanzh-hulian/topics`、`/mcp-servers` 返回 403。
- [ ] admin 同路径保持原行为。
- [ ] 新增未知测试路由在 GET/POST/upgrade 均拒绝。
- [ ] 已登记 member RPC 只能访问声明的方法与路径。
- [ ] 编码斜杠、双斜杠、query、大小写等不能绕过。

### 人工验收

- [ ] admin/member 各走一遍设置、任务板和允许的成员操作。
- [ ] 审计日志可解释拒绝原因且没有敏感值。

### 失败与回滚

出现漏登记时只补最窄条目；不得恢复未知路由直接代理，紧急方案为相关 route admin-only。

## SEC-RT-005 · HTTP body 大小、时间和解析边界

- 优先级：P1
- 估算：S
- 依赖：BASE-001
- 可并行：高

### 目标

阻止 Wanzh/Team Hub 无限累积请求体导致内存压力或长期占用事件循环。

### TODO

- [x] 清点每个 endpoint 的正常 payload 大小和内容类型。wanzh 12 条路由中 7 条读 body，全部为小型设置形态（id / 开关布尔 / 一条凭证字符串 / 一个 URL），最大者远小于 64 KiB；team-hub 分「透传面（代理与 `/api/*`）／网关自有面（登录改密表单、admin 控制台）」两档。
- [x] 建立有硬上限、deadline、abort 和结构化错误的 bounded reader。`lib/bounded-body.js`（wanzh）与 `src/bounded-body.mjs`（team-hub），错误码 `BODY_TOO_LARGE` / `BODY_TIMEOUT` / `BODY_ABORTED` / `BODY_PARSE_ERROR`，各自带 `status`。两份实现是**结构约束**不是偏好：两个包都无构建步，运行时导入不了 `.ts` 共享源（见 ADR-0100 备选方案）。
- [x] 小型设置/API 初始建议 64 KiB；代理或特殊端点必须单独声明上限。wanzh 统一 64 KiB；team-hub 透传 32 MiB、表单 8 KiB、admin 64 KiB。**32 MiB 有测量依据**：Desktop profile 实际挂载 `dsh-file-upload`，其 `MAX_JSON_BYTES = 18 MiB`，取 32 MiB 留 ~1.8× 余量。
- [x] 同时检查 Content-Length 和实际累计字节，覆盖 chunked 绕过。头部声明超限走快路径（一个字节都不读）；**放行一律以实际累计字节为准**，`Content-Length` 只用于提前拒绝。
- [x] 超限 413、超时 408/504、parse error 400；错误不回显原 body。用 408 而非 504（超时发生在读取阶段，不是上游未响应）。错误文本只含上限数值，另有断言证明响应里不含 secret canary。
- [x] 超限后停止缓存并销毁/排空请求，确保 handler 不执行。拒绝时立即清空已读 chunk、`req.pause()`，响应带 `connection: close`；有断言证明 `connections.json` 一个字节都没被改写。

### 自动验收

- [x] 边界值、+1 byte、chunked 和 slow body 全覆盖。**「伪造长度」不在其中且不可表达**——HTTP/1.1 下 Node 把 `Content-Length` 当帧边界，多出的字节会被当成下一个管线请求，拿到的是解析层 400 而不是我们的 413（初版用例正是这么写错的，见 CHANGELOG 更正）。替代覆盖两个真实对抗形态：无 `Content-Length` 的分块传输、多小块逐个合法但累计超限。
- [x] 超限不会进入业务 handler 或写配置。team-hub 侧断言审计里**没有** `auth.login-failed`（超限请求根本没进入认证逻辑）且**有** `system.body-rejected`；wanzh 侧断言状态文件字节不变。
- [ ] 受控并发下 RSS 不随传输总量线性增长。**未实测**——本轮只验证了单请求的上限生效，未做并发压测。
- [x] 正常登录、改密、设置、代理测试不回归。两侧全量套件 wanzh 86/86、team-hub 87/87；`typecheck` 与 `pnpm run gate` 均 exit 0。

### 人工验收

- [x] 超限提示明确且请求不永久挂起。由真实 socket 用例覆盖（`hung === false` 断言）。
- [ ] 正常交互无变化。**需重启后人工确认**：wanzh 已同步到 profile 装载点（重启 DSH 生效）；team-hub 的部署形态是**仓库源码**（launchd `com.dshteamhub.gateway` 直接跑仓库路径，实测运行时持有的 profile 副本 fd 数为 0），需重启该服务生效。

### 失败与回滚

真实业务超阈值时按 endpoint 调整有测量依据的值；不得恢复无限读取。

### 实施证据（2026-09-16）

- 新增 `packages/capabilities/dsh-wanzh-hulian/lib/bounded-body.js` 与
  `packages/infra/dsh-team-hub/src/bounded-body.mjs`。
- 接线：wanzh 的 7 个调用点经 `readBody` 统一收口、`sendError` 映射错误码；
  team-hub 的 6 个调用点分档，并把 `createRequestHandler` 从 `startServer()` 提取成可测的缝
  （`startServer()` 不返回 server 句柄且 listen 后不返回，测试起它会让进程挂住）。
- 新增测试 25 条（wanzh 10 + team-hub 15），全部走**真实 socket 与真请求处理器**——
  假 req 对象造不出 chunked、slow body、「超限后连接不挂起」这些形态。
- **变异自测 3/3 判红**：把三处 `return await` 分别改回 `return`，对应用例全部失败。
  这一步抓到了初版的问题：最初只有「代理面超限」一条用例，而它走的是 `handleApiPost`，
  **根本没在守 `proxyRequest`**——判据数与修复数相等不代表覆盖面相等。
- **同批修掉两个既有缺陷**（非本卡引入，做本卡时被测试逼出）：
  1. team-hub 三条主通路（admin 控制台 / RPC / 代理）`try` 内 `return promise` 不 `await`，
     任何异常都退化成「永远没有响应」而非 500 → 登记为 P-33；
  2. `dsh-wanzh-hulian` 的 `files` 清单漏了 `lib/atomic-store.js` 与 `lib/oauth-flow.js`
     （`npm pack --dry-run` 实测不含），属 **P-24 复发** → 已补齐清单并补记。
- 决策记录：[ADR-0100](../../../../docs/adr/ADR-0100.md)、
  [Note](../../../../docs/notes/implemented/capability/2026-09-16-bounded-request-bodies.md)。


## SEC-RT-006 · Wanzh 配置与 token 原子持久化

- 优先级：P1
- 估算：M
- 依赖：BASE-001
- 可并行：高；SEC-RT-007 依赖本卡

### 目标

状态、connections、MCP 配置和 OAuth token 在崩溃/并发时不截断、不丢更新，损坏时 fail-closed。

### TODO

- [x] 列出 Wanzh 所有持久化文件和 owner（见下方实施证据；清单即 `test/persistence-inventory.spec.mjs` 的 `INVENTORY`，新增一处不登记就判红）。
- [x] 建立同目录 temp、0600、flush/fsync、rename、目录 fsync 的 atomic writer（`lib/atomic-store.js`）。
- [x] 每个文件的 read-modify-write 在同一串行 mutation queue 中完成（`updateJson`；**边界**：串行只覆盖同进程，跨进程互斥未做）。
- [x] 写后校验最终权限，既有 0644 必须收紧（校验在 **rename 之前**，失败即不 rename）。
- [ ] JSON 损坏时保留原字节，连接保持关闭，设置页显示结构化健康错误 → **host 侧已完成**（原字节不改写、能力逐条关闭、`/list` 返回结构化 health）；**设置页渲染未做**（客户端需重启 app 才取得真实页面证据，登记为剩余项）。
- [x] 不再把损坏 state 回退到 `enabled:true`。
- [x] 新旧 schema 只做有明确规则的兼容读取（规则＝缺失用内置默认、可用则归一化读取、损坏或顶层不是对象一律 fail-closed；**无投机迁移**，见 ADR-0099 备选方案）。

### 自动验收

- [x] kill-before-rename 后旧文件完整。
- [x] 100 次并发 toggle/set 不损坏 JSON、不丢已确认更新。
- [x] 预建 0644 文件，成功写入后为 0600。
- [x] 损坏 JSON 下能力关闭，原文件仍可取证。
- [x] 静态清单禁止直接覆盖最终路径（`lib/` 下除写入器外零直写调用 ＋ 清单双向登记）。

### 人工验收

- [ ] 配置连接后重启 DSH，状态/token 正常保留。（需重启，本轮未做）
- [ ] 在测试 profile 人工损坏配置，UI 显示修复指引且不启用连接。（**host 侧读数已具备**；UI 渲染未实现，未做）

### 失败与回滚

写失败必须保留旧文件并向调用方返回失败；不得出现“内存显示成功、磁盘未成功”。

### 2026-09-16 实施证据（SEC-RT-006）

- 持久化清单与 owner：`~/.dsh/integrations/getnote/config.json`（连接总开关/模型自动调用/默认知识库）、
  `~/.dsh/integrations/wanzh-hulian/connections.json`（连接注册表）、`…/mcp-servers.json`（MCP 清单）、
  `…/oauth-pixpix.json`（PixPix token，**仅真实 token 交换写**）、
  `~/.dsh/skills/{getnote-brain,pixpix-ecommerce,shopify-store-ops,apify-mcp}/SKILL.md`。
  改动前有 **13 处**直写最终路径（4 JSON + 9 技能写点），任务清单只点了前 4 处。
- Red/Green（把工作树换成 `git show HEAD:…lib/index.js` 重放）：`test/persistence.spec.mjs`
  **9 tests / 0 pass / 9 fail**；恢复后 **9/9 pass**。旧版下 `node --test` 不退出，需 `--test-force-exit`
  才拿得到读数（新版正常退出）。
- 变异自测（恒真桩突变必须变红）：去掉 `chmod` → umask 用例红；去掉 rename 前权限校验 → 越权用例红；
  改回直写最终路径 → 静态清单用例红 ＋ 三个动态用例红；去掉串行队列 → 并发用例红；
  **目录 fsync 去掉不变红**（进程级无判别力，只做显式标注射程的结构性断言）。
- 静态清单判据：`test/persistence-inventory.spec.mjs` 把「13 个家」变成两个方向的断言——`lib/` 下除写入器外
  零直写调用（变异：把一处改回 `writeFile` → 4 条用例变红）＋ 每个文件在真实写入口之后按权限存在且无临时残留。
  清单里唯一标 `live:true` 的是 token 文件（离线没有写出它的路径），并**断言它不会被任何离线路径写出**。
- 包内 `node --test test/*.spec.mjs` **76 tests / 76 pass / 0 fail**；`tsc -p tsconfig.json` exit 0。
- 第二轮（独立审证后修订）：见文末「2026-09-16 复审修订」小节。

## SEC-RT-007 · OAuth flow 生命周期、超时和 disposer

- 优先级：P1
- 估算：M
- 依赖：SEC-RT-006
- 可并行：可与 SEC-RT-009 并行

### 目标

每个 PixPix OAuth flow 有唯一所有者和到期时间；成功、拒绝、异常、超时、dispose 都关闭端口并清理敏感状态。

### TODO

- [x] 把 state/verifier/server/timer/expiresAt 收进单一 flow 对象（`lib/oauth-flow.js`）。
- [x] 明确重复 start 行为：**关闭旧 flow 后新建**（原因 `superseded`，回执带 `superseded: true`）。
- [x] 到期自动关闭 server 并清理 state/verifier（定时器 `unref()`，不吊住进程退出）。
- [x] 成功、provider error、客户端断开、dispose 共用幂等 cleanup。**state mismatch 例外**：明确**不**消耗当前 flow（400 + 由到期定时器收尾），因为过期标签页的回调不该打断用户正在进行的授权；取舍见 ADR-0099。
- [x] 清点并调用 OAuth start/status、MCP list 等全部 route disposer（实测注册 12 条只 dispose 9 条，已补齐为 12/12）。
- [x] token 写入统一走 SEC-RT-006（`writeOauthToken` → 原子 store）。

### 自动验收

- [x] 连续 start 两次最多一个 listener（真实 loopback：旧 server `listening === false` 且端口拒连）。
- [x] 时间推进到过期后端口关闭、状态清空（注入时钟确定性重放 + 真实端口用例）。
- [x] 成功/拒绝/error/state mismatch 不泄漏 active handle（四类终止路径都回到 `active() === null`；mismatch 按上条保留但受 TTL 约束）。
- [x] plugin dispose 后路由失效、端口不可连接（12/12 回收 ＋ registry `dispose()` 关闭进行中的 flow；端口拒连由 flow 单元的真实端口用例证明）。

### 人工验收

- [ ] 正常授权、用户关闭浏览器、拒绝、超时后均能重新发起，不必重启 DSH。（需要真实 PixPix 授权与本机浏览器，本轮未做）

### 失败与回滚

OAuth 控制面异常时关闭新授权入口并保留已有有效 token；不得保留无限期 listener。

### 2026-09-16 实施证据（SEC-RT-007）

- Red/Green：`test/oauth-routes.spec.mjs` 对 HEAD 版重放 **4 tests / 0 pass / 4 fail**；恢复后 **4/4 pass**。
  `test/oauth-flow.spec.mjs` 对旧实现为**模块不存在**（新模块），其判别力由变异自测证明：
  去掉到期定时器（3 红）、去掉 supersede（2 红）、去掉 `closeAllConnections`（3 红）、去掉 `unref`（1 红）。
  其中 `closeAllConnections` 的判别力**在「既存连接有没有被断开」上**（真实 loopback 用例以 `waitFor` 超时变红），
  不在「端口还能不能被连上」——初版自评把这两者混为一谈，独立审证纠正。
- 无法在测试内重放的旧缺陷：旧实现「连点两次泄漏 listener」需要真的走 `/oauth/start`，而它会
  `spawn("open", …)` 打开系统浏览器——因此该条只有源码事实（`pendingOauth` 覆盖 + 无定时器）与新实现的
  真实端口用例，没有旧行为的运行时重放。这条限制写在这里，不当作已验证。
- 包内全量 **76/76**；`tsc` exit 0；根门禁 quick 70 项（69 pass / 1 skip / 0 fail）、full 77 项（76 pass / 1 skip / 0 fail），
  两者 exit 0；新增门禁项 `wanzh-persistence-and-oauth` 收编 6 个 spec（恒真桩突变下会红）。
- 第二轮（独立审证后修订）：见文末「2026-09-16 复审修订」小节。

## SEC-RT-008 · Team Hub session 原子存储、清理和性能

- 优先级：P1
- 估算：M
- 依赖：BASE-001
- 可并行：高；SEC-RT-009 依赖稳定接口

### 目标

移除每请求同步全量读取 session 文件，保证并发 issue/revoke、过期清理和崩溃恢复一致。

### TODO

- [ ] 启动时读取、schema 校验并清理全部过期 session。
- [ ] 请求路径改查内存 Map，不同步读磁盘。
- [ ] issue/revoke/revoke-user 串行更新并原子持久化；持久化成功后才确认。
- [ ] 周期清理和最大 session 数/文件大小上限。
- [ ] 损坏文件 fail-closed，保留取证副本，旧 token 全部失效。
- [ ] 保持旧 JSON 可读取；允许安全回滚为“全部重新登录”。

### 自动验收

- [ ] 10 万 session lookup 的请求路径文件读取次数为 0。
- [ ] p95 lookup 低于预先确认的预算。
- [ ] 并发 issue/revoke/revoke-user 后重启状态一致。
- [ ] 所有过期项被清理。
- [ ] 写中断后旧文件完整；损坏文件下旧 token 不被接受。

### 人工验收

- [ ] 登录、刷新、注销、禁用用户和服务重启行为正确。

### 失败与回滚

迁移失败可让全部 session 失效并要求重新登录；不得在解析失败时接受旧 token。

## SEC-RT-009 · Team Hub 暴露模式、TLS、cookie 与登录防护

- 优先级：P1；若用于不可信 LAN/跨网段则为 P0
- 估算：L
- 依赖：DEC-003、SEC-RT-004、SEC-RT-008
- 可并行：低

### 目标

默认不暴露 LAN；正式共享时具备加密传输、可信代理、Secure cookie、CSRF/Origin 和抗暴力登录边界。

### TODO

- [ ] 默认 bind `127.0.0.1`。
- [ ] LAN 模式显式开启；正式多用户要求本地 TLS 或受信 TLS reverse proxy。
- [ ] 只信任配置内 proxy 的 forwarded proto/IP。
- [ ] HTTPS 下 cookie 加 `Secure; HttpOnly; SameSite=Lax` 和合理 TTL。
- [ ] 登录按 IP + username 限速、指数退避和有界清理。
- [ ] 改密、注销和其他状态写增加 Origin/CSRF；注销使用 POST。
- [ ] 正式模式遇到 `0.0.0.0 + HTTP` 直接拒绝启动。
- [ ] 为现有 LAN 用户提供迁移与风险说明。

### 自动验收

- [ ] 默认服务从第二台机器不可访问。
- [ ] 正式 LAN 无 TLS/可信代理时拒绝启动。
- [ ] HTTPS cookie 有 Secure；伪造 forwarded header 无效。
- [ ] 暴力登录触发 429/退避。
- [ ] 跨 Origin 状态变更被拒绝。

### 人工验收

- [ ] 两台机器通过真实 TLS 入口登录、使用和注销。
- [ ] 抓包中没有明文密码/session token。
- [ ] 证书、代理、限速错误提示可操作。

### 失败与回滚

TLS 部署失败只能回退 loopback-only，不能回退默认明文 LAN。

## SEC-RT-010 · 安全契约总门禁

- 优先级：P0 收口
- 估算：M
- 依赖：SEC-RT-001..009、SEC-RT-003A
- 可并行：低

### 目标

把前述边界从代码约定固化成可重复 mutation、gate、clean-machine 重建和分层 live 验收；任何动态外部执行物、根目录逃逸或未授权破坏性操作都必须在发布前被阻断。

### 范围

- SEC-RT-001..009 与 SEC-RT-003A 的静态契约、mutation、故障注入、包级验证、profile/live 和 release 分层证据。
- 快速 gate、完整 gate、clean-machine/offline gate、需授权的 live acceptance 之间的归属与真实分母。
- 安全失败的发布阻塞、证据索引和回归 owner。

### 非范围

- 不在本卡重新实现各子任务修复，不用总门禁掩盖缺失的包内测试。
- 不把未运行、skip、开发机 cache 命中、dry-run 或静态分析提升为 live/发布通过。
- 不使用真实凭证、真实用户目录删除、正式账号 mutation 或 TLS 部署来完成默认自动验收。
- 不允许 exemption、日志描述或人工口头确认替代 P0/P1 安全契约。

### TODO

- [ ] 建立安全契约清单：contract id、owner、实现任务、Red fixture、Green test、fault point、运行层、发布阻塞级别和证据路径一一对应。
- [ ] 为 hostname 外传、移动 HEAD/同长度技能篡改、未 pin MCP/LoopX、过期 approval、未知 route、路径逃逸/symlink、批次半提交、截断写、OAuth 泄漏、超限 body、secret env、明文 LAN/session 并发分别建立 fail-first mutation。
- [ ] 先保存未修实现下的真实 Red；随后同一 fixture 对修复实现 Green。禁止只提交“测试最终是绿”的单边证据。
- [ ] 将纯函数、静态扫描和低成本 mutation 接入 `gate`；离线空 cache、全故障点、clean-machine、TLS/双机和 release 重建接入 `gate:full` 或 release gate。
- [ ] 门禁输出实际发现数、检查数、预期分母、失败数和 skip 原因；目标文件/入口为 0 时必须失败，不能静默通过。
- [ ] clean-machine 从受控 Git/artifact 起点重建 profile、MCP、LoopX 与 approved skills，生成 digest ledger；不得读取开发机既有 `~/.dsh`、npm/pip cache 或 ignored staging。
- [ ] profile/live 验收先对账 repo artifact、vendor、loadpoint 与进程实际版本/digest，再执行测试账号或临时 HOME 场景；字节不一致时停止行为验收。
- [ ] release gate 复算出货 tar/DMG 内 manifest、license、SBOM、skill approval 和可执行物 hash，并与 clean-machine ledger 对账。
- [ ] 保存完整 Red→Green、故障注入、clean-machine、profile/live、release 证据并更新正式 ADR/Note；每层明确“证明了什么/未证明什么”。
- [ ] 在单独授权下做一次 Shopify、两个 MCP、LoopX、PixPix、Team Hub admin/member、TLS、重启恢复，以及临时 HOME preset/skill transaction 的人工场景验收。

### Red / Green

- [ ] Red：逐项恢复旧缺陷或注入 mutant，所有对应 contract 必须在预期层判红并点名；删除/绕过一个 gate 注册项也必须由 completeness 判红。
- [ ] Red：把 clean-machine 偷换为开发机 HOME/cache、把 skip 计 pass、把 live digest 改成未提交字节、把未批准 skill 加入 preset/release，证据门禁必须拒绝。
- [ ] Green：无 mutation 时 quick/full/release 各层只运行其登记范围并给出真实分母；所有固定 artifact、权限和原子性契约闭合。
- [ ] Green：临时 HOME 的合法安装/移除与故障恢复、测试 profile 的 MCP/LoopX、Team Hub admin/member 均符合子任务契约。

### 故障注入

- [ ] 总门禁按登记表调度 SEC-RT-002、003、003A、006、007、008 的 fault points；任一注入未执行、未判红或无恢复后状态都视为失败。
- [ ] 在证据写入、digest ledger、profile sync 和 release assembly 中途注入终止/ENOSPC，旧证据和旧 release 保持可识别，新候选不得被标为通过。
- [ ] 模拟网络不可达、registry 返回漂移版本、TLS 配置错误、并发 session/preset/skill 操作，验证失败归属清楚且无 fallback 放宽安全边界。
- [ ] secret canary 同时放入 env、HTTP body、OAuth error、subprocess stderr，扫描所有 stdout/stderr/log/snapshot/report 均不得泄漏。

### 自动验收

- [ ] contract registry 与 SEC-RT-001..009、SEC-RT-003A 双向全等；每个登记项均有 Red、Green、fault point、分母和退出码，删除一个注册项会判红。
- [ ] quick/full/release 三层在临时根与固定 artifact 上可重复，任一 mutation、unexpected skip、secret canary 或 before/after 状态漂移都会非零退出。

### 人工验收

- [ ] 在单独授权下逐项抽查 Shopify、MCP、LoopX、Team Hub、TLS 与 preset/skill transaction；每项记录实际 loadpoint/digest、操作人、范围和未覆盖项。
- [ ] 安全 owner 与 fallback owner 能仅凭证据索引复现一个 Red、一次恢复和发布阻塞，不依赖原实现者口头补充。

### clean-machine / live 证据边界

- [ ] clean-machine 证明可重建、离线性、manifest/digest/license/completeness 和临时数据安全；它不证明真实账号、真实 LAN/TLS 或 DSH UI 行为。
- [ ] live/profile 证明当前安装字节与进程行为；它不证明 Git 可重建、供应商许可证、DMG 出货或组织批准。
- [ ] release 证明待发布字节、签名和 manifest；它不自动证明已经部署、真实用户迁移或生产运行。
- [ ] 所有真实凭证、正式 TLS、真实用户 preset/session mutation 都需要单独授权；未授权时明确记为“未运行”，不阻碍完成可自动化层，但发布仍按对应决策保持阻塞。

### 退出条件

- [ ] 每个 mutation 均能把对应门禁打红。
- [ ] 正常状态包测试、typecheck、build、gate/full 全绿。
- [ ] 环境缺失只显示 typed skip，不计 pass。
- [ ] 任何 secret fixture 不出现在输出、日志和快照。
- [ ] clean-machine、profile/live、release 三层证据分别有 digest 与边界声明；不存在用 live HOME 代替 Git 重建或用 dry-run 代替 mutation recovery 的记录。
- [ ] SEC-RT-003A 所有路径、symlink、并发与 fault-point 测试闭合，且未对真实用户目录执行未授权破坏性操作。
- [ ] SEC-RT-002 的 MCP、LoopX、第三方技能均绑定 immutable source/hash/license/approval，未知内容保持 quarantine。
- [ ] 任一安全契约未闭合时发布保持阻塞；禁止通过 exemption 收口。

### 失败与回滚

总门禁或证据链自身失败时，不修改产品状态、不重跑破坏性 live 场景、不覆盖上一份有效证据；候选保持未发布。只能修复门禁后从对应 Red/Green 层重新执行，不能通过删测试、降级为 warn、计入 skip 或恢复动态下载来收口。

### 2026-09-16 复审修订（SEC-RT-006 / 007）

与实现上下文分离的独立审证复现了全部 Red/Green 与三条自选变异（哈希前后一致），结论「有条件放行」，
给出 4 条 Important，经核对**全部成立并已修复**：

- **I-1** 损坏 token 文件 + 回调无错误边界 = 「重新授权」永远不可能成功（浏览器空白页、listener 留到 TTL）。
  修：回调 `try/catch/finally`（`finally` 无条件 `flow.close`）＋ token 走「归档后重写」（原字节留证）。
- **I-2** fail-closed 只覆盖不可解析字节：`null`/`[]`/`123`/`"str"` 被读成开启，而同一文件写路径却 409（两把尺子）；
  `connections.json` 的 `{}` 回退到默认清单。修：谓词从 store 导出共用；四个 store 统一「形状不对 = 损坏」。
- **I-3** `/oauth/status` 是唯一没有错误边界的路由，本次改动给它的读路径会抛 → 请求悬挂（**本次引入的回归**）。
  修：`readStoreJson` 把 I/O 失败降级成 `*_unreadable` 健康读数；该路由补 `catch → sendError`。
- **I-4** 「所有写入口在同一条链上」不成立：并发 toggle **两边 200 而磁盘只落一条**。修：`runExclusive` 排他槽位
  ＋ toggle 全或无（先查两份清单健康度再落盘）＋ 队列重入即报错。
- Minor 5 条同样修掉（token excerpt 回显、gate 指引指向不存在的界面、spec 依赖 cwd、注释数字、spec 不在门禁射程）。
  最后一条按「知道 → 拦住」处理：新增门禁项并做恒真桩突变验证。

修订后读数：包内 **76/76**；门禁 quick **70 项 69/1/0**、full **77 项 76/1/0**，均 exit 0；装载点已再次同步并逐字节复核。

**仍未解决**：跨进程互斥；真实 OAuth 回调端到端复现（需真实 tokenEndpoint）；客户端渲染 `health`；
宿主对未处理 rejection 的策略（审证未定位到 `ctx.webServer` 派发实现）。
