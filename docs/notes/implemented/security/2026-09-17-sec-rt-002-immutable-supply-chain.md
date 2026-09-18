# 决策记录 · SEC-RT-002 第三方技能与 MCP/LoopX 供应链不可变性固化

- 日期：2026-09-17
- 状态：implemented
- 对应 ADR：[ADR-0113](../../../adr/ADR-0113.md)

## Problem

在 LUTE Agentic System 安全运行时一期审计中，发现系统存在多处动态拉取与未锁版本的供应链风险：
1. **MCP 动态拉取风险**：`dsh-wanzh-hulian` 默认配置中执行 `npx -y shopify-mcp`、`npx -y @getnote/mcp` 与 `@getnote/cli auth login`，未显式声明版本，且存在潜在的 `@latest` 漂移风险。若上游包发布恶意更新，将在运行时直接执行未经验证的代码。
2. **LoopX 运行时范围依赖与在线升包**：`dsh-loopx-plugin` 的 `LOOPX_REQUIREMENT` 声明为 `loopx>=0.5.4`，且通过 `pip install --upgrade` 进行安装，导致每次安装都可能拉取最新的上游 wheel 及其动态子依赖，违背了确定性装配原则。
3. **第三方技能 HEAD 浮动取件与大小比对脆弱性**：`dsh-overseas-skills` 的拉取脚本直接从 GitHub API 获取 `trees/HEAD`，并从 `/HEAD/` 取 raw 文件；若在枚举树与下载文件之间上游发生提交更新，会导致内容与树结构不匹配；且本地缓存只比对 `stat.size`，同尺寸篡改无法被识别；`import-fullstack.mjs` 中甚至包含了 `/tmp/mattpocock-skills/skills` 本地开发机临时路径回退。

## Decision

按用户批准的 DEC-009 准入决策与 SEC-RT-002 规范，实施全链路不可变性固化：
1. **MCP 精确版本钉住**：
   - `shopify-mcp` 锁定至确切版本 `1.0.8`。
   - `@getnote/mcp` 锁定至确切版本 `1.7.2`。
   - `oauthCmd` 锁定至确切版本 `@getnote/cli@1.7.2`。
   - 增加单元测试 `supply-chain-integrity.spec.mjs` 强制核对。
2. **LoopX 依赖不可变与去在线化**：
   - `LOOPX_REQUIREMENT` 改为严格等于 `loopx==0.5.4`。
   - `pip install` 去除 `--upgrade`，增加 `--no-deps` 保证不拉取未受控的传递依赖。
   - 同步更新 `README.md` 中的设计规范与命令行示例。
   - 增加单元测试 `supply-chain-pinned.spec.mjs` 锁定该规范。
3. **第三方技能绑定不可变 Commit SHA 与双重 Hash 算法**：
   - 清单中所有第三方仓库明确绑定 40 位 hex commit SHA：
     - `phuryn/pm-skills` → `8607e3b077817f89bf4a9b623246219734ac3be0`
     - `mattpocock/skills` → `74ca5fe077456a0b3b2f5310cf9430999fd0b5fd`
   - 重构 `fetch-third-party-skills.mjs`，消除所有 `HEAD` 引用，改用不可变 commit 树查询；改用 byte buffer 取件（拒绝 `res.text()`）；在本地比对和远程下载时同时比对文件大小和 Git blob OID (`sha1("blob " + len + "\0" + buf)`)；导出 `sha256`、`gitBlobOid` 等工具函数供测试复查。
   - 剔除 `import-fullstack.mjs` 中的 `/tmp/` 回退路径，修改 `pipeline.sh` 移除静默吞错的 `|| true`。
   - 增加单元测试 `immutable-supply-chain.spec.mjs`。
4. **统一自动化门禁**：
   - 新建 `scripts/gates/immutable-supply-chain.mjs` 与反向自测试 `scripts/gates/immutable-supply-chain.test.mjs`。
   - 注册门禁 `immutable-supply-chain` 与 `immutable-supply-chain-selftest` 到 `scripts/gate.mjs`，纳入 quick/full 门禁保护。

## Alternatives considered

- 允许在开发环境下临时使用 HEAD 分支取件：被否决。开发期与发布期必须保持同等不可变性，否则必然导致「在我机器上是好的」与不可审计问题。
- 仅校验 SHA-256，不计算 Git blob OID：被否决。GitHub Trees API 直接返回对象的 Git blob OID，如果不比对 Git blob OID，就无法直接检验下载内容与 API 声明的对象是否一致。

## Consequences

- 彻底根除了 MCP、LoopX 及海外技能包构建过程中的不可见在线漂移风险。
- `packages/capabilities/dsh-overseas-skills` 单元测试达到 116 项，全部通过。
- `scripts/sync-profile.mjs --apply --loadpoint` 成功将固化后的受管包同步到运行时。
- `node scripts/gate.mjs --mode quick` 83/84 项全部通过（1 项为合法的 live-presets 运行时跳过），0 fail。
