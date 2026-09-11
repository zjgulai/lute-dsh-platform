# DSH Desktop 2.0.4 基座 + Magpie-Horch 产品扩展 — 全量盘点报告

> 采集时间：2026-09-09 23:51 CST（`date` 输出：`Wed Sep 9 23:51:45 CST 2026`）
> 采集方式：只读 `ls/cat/find` + read 工具，未修改任何目标文件（仅创建本报告）。
> 采集对象：
> - 宿主 App：`/Applications/DSH Desktop.app`（实际代码副本：`Contents/Resources/app.asar.unpacked/`，即官方 asarUnpack 机制）
> - Profile 基座：`~/.dsh/profiles/desktop/`
> - 产品侧：`/Users/lute/project/Magpie-Horch/`

---

## 1. 宿主基座核心元数据

**`app.asar.unpacked/package.json` 全文要点**：

| 字段 | 值 |
|---|---|
| name | `dsh-plugin-desktop` |
| version | **2.0.4** |
| description | "DSH Desktop: an Electron shell composed as a DeepSeek Harness Cordis plugin" |
| license | MIT |
| repository | `git+https://github.com/anywhere-labs/deepseek-harness-desktop.git`（directory: dsh-plugin-desktop） |
| type | module；main `lib/main.js`；types `lib/types/index.d.ts` |
| bin | `dsh-desktop` / `dsh-plugin-desktop` → `lib/bin.js` |
| engines | node `^22.19.0 || >=24.0.0` |
| peerDependencies | **electron 43.3.0** |
| dependencies | 共 **147 项**，其中 `@deepseek-ai/dsh-*` 129 项齐锁 **0.1.2-alpha.1** |
| dsh.client.inject | 6 个 client 插件（api-remotes/connection/locale/ui-renderer/ui-settings/ui-theme），platform: web |
| dsh.bundle.patch | `./cordis.patch.yml` |

关键依赖版本（非 dsh-* 部分）：
```
@deepseek-ai/cordis 4.0.1           @deepseek-ai/cordis-plugin-group 1.0.1
@deepseek-ai/cordis-plugin-include 1.0.6   @deepseek-ai/cordis-plugin-loader 1.0.2
@deepseek-ai/cordis-plugin-timer 1.1.3     @deepseek-ai/schemastery ^3.18.1
@deepseek-ai/dsh 0.1.2-alpha.1      adm-zip ^0.6.0
dsh-community-market 0.1.0-dev.0    dshmarket 1.17.1
koffi 3.1.5                         pnpm 11.8.0
react 18.3.1                        selfsigned 5.5.0
semver ^7.8.5                       sonner ^2.0.8   yaml ^2.9.0
node-addon-require-builtin ^0.1.4
```

exports 子路径：`.`、`./profile`、`./client`、`./webserver`、`./windows-pwsh-sandbox`、`./windows-subprocess`、`./terminal`、`./pnpm`、`./profile-service`、`./desktop-plugins`、`./profiles`、`./diagnostics`、`./notifications`、`./updates`、`./package.json`。

**`lib/` 顶层结构**（100 项；仅列核心，完整清单见附录）：
- 入口层：`index.js`、`main.js`（224KB，mtime 9/4 13:42 **被直补**）、`runtime.js`、`bin.js`
- 主进程块：`client.js`（1.2MB，9/3 18:28 **被直补**）、`electron-runtime-DS52LbUW.js`（97KB，9/5 13:06 **被直补**）、`desktop-plugins.js`、`desktop-terminal.js`、`desktop-runtime-environment.js`、`module-resolution.js`、`packaged-runtime-path-C75iwUbT.js`、`package-overlay-CMBrTgnt.js`
- 功能模块：`profile-manager.js`、`profile-service.js`、`profiles.js`、`updates.js`、`update-download.js`（9/2 **被直补**）、`update-checker-Mw2EmLOX.js`、`notifications.js`、`pnpm.js`、`diagnostics.js`、`diagnostic-export-worker.js`（9/2 **被直补**）、`webserver.js`、`mask-secrets-PbcsUPNF.js`、`log-files-Dkagxu5q.js`、`tray-locale-CyKag4v-.js`、`window-material-Cz9gAbwB.js`、`windows-acl-relay-Z8aw3fd7.js`、`windows-pwsh-sandbox.js`、`windows-subprocess.js`、`preload.cjs`
- `native-ui/`：`assets/`、`desktop-dialog.html`、`profile-create.html`、`recovery.html`、`setup-wizard.html`、`recovery-override.js`
- ⚠️ `lib/types/` **不存在**（与 package.json 的 files/types 声明不符）

**`cordis.patch.yml` 全文**（宿主编排补丁）：
```yaml
# Desktop Host operations compose around the existing Web bundle. Compatibility
# mode keeps upstream ownership of the browser carrier and rendered UI.
- insert:
    - id: desktop-shell
      name: dsh-plugin-desktop
      config:
        mode: compatibility
    - id: desktop-terminal
      name: dsh-plugin-desktop/terminal
      disabled: !!js process.platform === 'linux'
    - id: desktop-diagnostics
      name: dsh-plugin-desktop/diagnostics
    - id: desktop-notifications
      name: dsh-plugin-desktop/notifications
    - id: desktop-pnpm
      name: dsh-plugin-desktop/pnpm
    - id: desktop-profiles
      name: dsh-plugin-desktop/profiles
    - id: desktop-updates
      name: dsh-plugin-desktop/updates

- id: web-runtime
  config:
    openBrowser: false
    printUrl: false
    surfaceContext: true
    trustedHosts: []
```

---

## 2. 依赖版本全景（app.asar.unpacked/node_modules）

- 顶层条目：**30 个 @scope 目录 + 265 个无 scope 包**。
- ⚠️ 任务预期中的 `@cordisjs`、`@koishijs`、`@minatojs`、`@anywhere-labs` scope **在本机不存在**；Cordis 系列实际在 `@deepseek-ai` scope 下。

**@scope 全景（包数 → 代表版本）**：

| scope | 包数 | 代表包/版本 |
|---|---|---|
| @deepseek-ai | **223** | dsh-* 全系 0.1.2-alpha.1；cordis 4.0.1；schemastery 3.18.1；cosmokit 1.8.2；cordis-plugin-hmr 1.0.16；node-addon-landlock-run 0.1.1 |
| @aws-sdk | 19 | client-bedrock-runtime 3.1048.0、token-providers 3.1108.0、nested-clients 3.997.42 |
| @aws-crypto | 5 | sha256-* 5.2.0 |
| @smithy | 9 | core 3.32.0 |
| @peculiar | 12 | x509 1.14.3、asn1-* 2.9.4 |
| @opentelemetry | 11 | api 1.9.1、core 2.9.0、logs 0.220.0 |
| @shikijs | 9 | 全 4.4.3 |
| @lexical | 11 | 全 0.49.0 |
| @octokit | 7 | webhooks 14.2.0、types 17.0.0 |
| @modelcontextprotocol | 1 | sdk 1.30.0 |
| @anthropic-ai | 1 | sdk 0.91.1 |
| @google | 1 | genai 1.52.0 |
| @earendil-works | 2 | **pi-ai 0.84.3、pi-telemetry 0.84.3** |
| @img | 4 | sharp-darwin-arm64/x64 0.35.3、sharp-libvips 1.3.2 |
| @xterm | 1 | headless 6.0.0 |
| @vscode | 3 | ripgrep(+darwin 双平台) 1.18.0 |
| @koromix | 2 | koffi-darwin-* 3.1.5 |
| @hono | 1 | node-server 2.1.0 |
| @protobufjs | 9 | 1.1.x |
| @tanstack | 2 | react-virtual 3.14.9、virtual-core 3.17.7 |
| @types | 9 | node 26.2.0 等 |
| 其余 | — | @agentclientprotocol/sdk 1.4.0、@babel/runtime 7.29.7、@joplin/turndown-plugin-gfm 1.0.67、@mixmark-io/domino 2.2.0、@noble/hashes 1.4.0、@preact/signals-core 1.14.4、@standard-schema/spec 1.1.0、@ungap/structured-clone 1.3.3 |

**无 scope 顶层依赖（265 个，前 80 名）**：
```
accepts adm-zip agent-base ajv ajv-formats anser argparse asn1js async-function
async-generator-function base64-js bignumber.js body-parser bowser
buffer-equal-constant-time bundle-name bytes bytestreamjs call-bind-apply-helpers
call-bound ccount character-entities character-entities-html4 character-entities-legacy
chokidar clsx comma-separated-tokens commander compressible compression
content-disposition content-type cookie cookie-signature cors cross-spawn
data-uri-to-buffer debug decode-named-character-reference default-browser default-browser-id
define-lazy-prop depd dequal detect-libc devlop diff dsh-community-market dshmarket
dunder-proto ecdsa-sig-formatter ee-first encodeurl es-define-property es-errors
es-object-atoms escape-html escape-string-regexp etag eventsource eventsource-parser
express express-rate-limit extend fast-deep-equal fast-uri fetch-blob fflate
finalhandler formdata-polyfill forwarded fresh function-bind gaxios gcp-metadata
generator-function get-intrinsic get-proto google-auth-library google-logging-utils
```
（其余 185 个：hono/express 生态、katex/micromark/mdast 渲染栈、openai/undici/node-fetch、sharp/koffi/node-pty/native addon 运行栈、zod/zustand/immer、selfsigned/jose/run-applescript、ws/eventsource、shiki、turndown、lexical 等）

---

## 3. 本地直补 / 补丁痕迹（本平台关键机制）

> 机制：官方 asarUnpack —— `app.asar` 仅 4.9M，`app.asar.unpacked` 267M（见 package-manifest.json），该目录可写并遮蔽 asar 内同名路径，是本地直补的官方载体。所有补丁由 `dsh-patches/patches-manifest.md` 权威登记。

### 3.1 node_modules 内 `.orig`（8 个）
```
Sep  2 18:10  @deepseek-ai/dsh-client-hmr/lib/client.js.orig (4.6K)
Sep  2 19:11  @deepseek-ai/dsh-client-ui-settings-plugin-inventory/lib/client.js.orig (17K)
Sep  2 18:04  @deepseek-ai/dsh-cordis-host-runner/lib/index.js.orig (105K)
Sep  7 23:24  @deepseek-ai/dsh-client-ui-renderer/lib/client.js.orig (57K)
Sep  2 19:10  @deepseek-ai/dsh-host-plugin-inventory/lib/typert.host.js.orig (1.3K)
Sep  2 19:11  @deepseek-ai/dsh-host-plugin-inventory/lib/index.js.orig (4.4K)
Sep  2 19:10  @deepseek-ai/dsh-host-plugin-inventory/lib/typert.remote-client.js.orig (1.3K)
Sep  2 18:03  @deepseek-ai/cordis-plugin-loader/lib/index.js.orig (25K)
```

### 3.2 node_modules 内 `.bak*`（2 个）
```
Sep  5 19:00  @deepseek-ai/dsh-client-ui-skill/lib/client.js.bak-cn-slash (16K)
Sep  8 15:09  @deepseek-ai/dsh-session-log-export/lib/client.js.bak-pre-hidefix-20260908 (15K)
```

### 3.3 lib/ 内直补备份（宿主自身，10+ 个）
```
client.js.orig (Sep 2)                       main.js.orig2 / main.js.orig3 (Sep 2)
main.js.p07.bak (Sep 4)                      profile-CS14Ht13.js.orig (Sep 2)
electron-runtime-DS52LbUW.js.orig (Sep 2)    electron-runtime-DS52LbUW.js.bak2 (Sep 2)
electron-runtime-DS52LbUW.js.buggy-loginfo-20260902
electron-runtime-DS52LbUW.js.syntax-error-backup-20260903
electron-runtime-DS52LbUW.js.bak-preclipboard-20260903
electron-runtime-DS52LbUW.js.bak-prerendererheal-20260904-102931
electron-runtime-DS52LbUW.js.bak-prerecoveryfix-20260905-130615
diagnostic-export-worker.js.orig (Sep 2)     update-download.js.orig (Sep 2)
```

### 3.4 branding-backup 与 build
- `branding-backup-1788078003/`（epoch=2026-08-29 16:20 首装时点）：`bin.js`、`recovery-CcF1mk2A.js`、`recovery-override.js`（60KB, mode 600）、`setup-wizard-f4JKJv7q.js` —— 品牌改造前的原始 UI 资产备份。
- `build/`：app-icon.png/-mac.png（47K，8/30 11:23 已换品牌图标）、tray-icon.svg + blue 系列 5 枚 PNG + Template 2 枚。

### 3.5 node_modules 内真实改动（mtime > 2026-08-29 23:59，排除解包时间戳）
共 **35 个文件**、跨 **25 个包**（`-mtime -30` 总数 10504 中绝大多数是 8/29 解包时间，真实改动仅 35）：

| mtime | 包 | 文件 |
|---|---|---|
| Sep 8 15:09 | dsh-session-log-export | lib/client.js（log 按钮迁移） |
| Sep 8 01:59 | dsh-client-ui-skill | lib/client.js（中文标题） |
| Sep 7 23:24 | dsh-client-ui-renderer | lib/client.js |
| Sep 7 23:08 | dsh-client-ui-settings | lib/client.js |
| Sep 5 13:06 | lib/electron-runtime-DS52LbUW.js | （lib 内） |
| Sep 4 11:13 | dsh-client-ui-agent-preset | lib/client.js（PR 头像通道） |
| Sep 4 10:35 | dsh-agent-presets | lib/index.js（icon 透传） |
| Sep 3 17:37 | dsh-web-frontend | dist/assets/index-D-eoFxDP.js（品牌词标） |
| Sep 3 16:46 | dsh-client-ui-model-selection | lib/client.js |
| Sep 3 16:34 | dsh-api-session-controller | lib/client.js + 2 types |
| Sep 3 16:26 | dsh-api-gateway | lib/client.js |
| Sep 3 14:53 | **cordis** | lib/index.js |
| Sep 3 | dsh-api-workspace-controller / dsh-api-remotes | lib/client.js |
| Sep 2 | cordis-plugin-loader、dsh-cordis-host-runner、dsh-host-plugin-inventory(×3)、dsh/lib/profile-boot、dsh-skill(9/1) | lib/*.js |
| Sep 1 | dsh-tool-skill、dsh-skill-filesystem、dsh-file-reference-local(×2) | lib/*.js |
| Aug 31 | dsh-client-ui-chat、dsh-client-ui-conversation、dsh-client-ui-primitives、dsh-tool-subagent | lib/*.js |
| Aug 30 20:12 | dsh-client-ui-chat | lib/client.js |

### 3.6 profile 内补丁痕迹
```
apply-patches.mjs (12.8K, Sep 7) + apply-patches.mjs.orig
cordis.patch.yml (1.1K, Sep 3) + cordis.patch.yml.bak-1788442218
package.json.bak-20260907-224635 / package.json.bak-20260908-120255
pnpm-lock.yaml.bak-20260907-224658
```
`apply-patches.mjs` 由 postinstall 钩子自动执行（幂等），9 条规则：dsh-memory 去 roleplay / deepresearch http 守卫 / agent-team-gui / dsh-theme inject / file-reference-local override / better-sidebar 文案等。

---

## 4. profile 基座（~/.dsh/profiles/desktop/）

**package.json**：`dsh-profile-desktop`（private），`postinstall: node apply-patches.mjs`。

- **dependencies 共 30 项**：16 个 `file:` 链接指向 `../../../project/Magpie-Horch/`（本仓库本地包），14 个 npm 版依赖：
```
@changfenhuang/dsh-genui 0.9.6        @zseven-w/dsh-noema 0.1.0-rc.3
@linxin666/dsh-client-ui-git-graph 0.3.6   @linxin666/dsh-client-ui-skill-explorer 0.3.6
@liustack/modlens 3.25.2              @liustack/modsearch 5.10.0
@tt-a1i/archify-dsh 0.1.0             @dhicoc/dsh-reverse-skill 1.0.5
@xmanrui/dsh-im 4.1.0                 dsh-better-sidebar 0.17.1
dsh-pocket 2.8.0                      dsh-context 0.38.1
dsh-vision-router 2.0.1               dshmarket 1.36.0
```
file: 链接（16）：dsh-auto-compact-local、dsh-deepresearch-local、dsh-memory-local、dsh-browser-local、dsh-agent-team-gui-local、dsh-file-upload-local、dsh-theme-local、dsh-root-brand-local、dsh-overseas-skills、dsh-preset-lint-local、dsh-skill-subset、dsh-overseas-tools、dsh-rename-conversations、dsh-loopx-plugin、dsh-wanzh-hulian、dsh-my-quotes。

- **dsh.profile.bundles 共 30 项**（`@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app` 起头，含全部产品插件），**`patchReload: "live"`**。
- ⚠️ `cordis.yml` 内容为 `[]` —— patches-manifest 明确：该文件会被应用重置为 `[]`，**插件注册真实入口是 package.json 的 dsh.profile.bundles + dependencies（file:）**。
- `pnpm-lock.yaml`：存在，**3599 行 / 125KB**（9/8 12:03）。
- `node_modules`：**269 个顶层条目**（scopes：@changfenhuang/@deepseek-ai(10 包)/@dhicoc/@furongjun1999/@linxin666/@liustack/@mermaid-js/@modelcontextprotocol/@puppeteer/@tt-a1i/@univerjs-pro/@wecom/@xmanrui/@yuxianglin/@zseven-w/@iconify/@jimp/@libsql/@neon-rs/@firecrawl/@huggingface/@hono/@img/@antfu 等）。
- `pnpm-workspace.yaml`：`nodeLinker: hoisted`；allowBuilds：node-pty / better-sqlite3 / onnxruntime-node / protobufjs / sharp。
- `data/`（会话/记忆数据）、`.dsh-market/`、`.dsh-module-fallback/` 子目录。

**~/.dsh/ 顶层概览**：
```
.agent-presets(15 个预设)   .anonymous-user-id   .credentials.yaml
aeis-venv(灵枢 Python venv 43M)  attachments  browser-sessions  cache
dsh-pocket  ext-bridge-token  integrations(dsh-feishu/dsh-weixin/getnote/wanzh-hulian)
llm-deepseek  logs  my-quotes  profiles(desktop + node_modules※)  research-artifacts
sessions  settings.yaml(+bak)  skills(252)  storages(9)
```
※ `~/.dsh/profiles/node_modules` 顶层条目（hoisted 根），属 pnpm workspace 结构，非独立 profile。

---

## 5. 产品侧扩展清单（/Users/lute/project/Magpie-Horch/）

### 5.1 一级子目录含 package.json（20 个）

| 目录名 | 包名 | 版本 | 描述一句话 |
|---|---|---|---|
| dsh-agent-team-gui-local | dsh-agent-team-gui | 1.0.1 | Persistent multi-model squads with durable orchestration |
| dsh-auto-compact-local | @deepseek-ai/dsh-auto-compact | 1.0.0 | 自动压缩插件（本地实现） |
| dsh-bridge-protocol-local | @yuxianglin/dsh-bridge-browser | 0.0.3-alpha.1-port | Protocol-only stub（wire 类型） |
| dsh-browser-extension-local | dsh-browser-extension | 0.1.2 | Chrome/Firefox MV3 扩展：侧边栏聊天接本地 dsh |
| dsh-browser-local | @yuxianglin/dsh-bridge-browser | 0.0.3-alpha.1-port | alpha.1 本地移植：rc apiproxy 面替换 |
| dsh-deepresearch-local | @deepseek-ai/dsh-deepresearch | 0.2.2 | Evidence-first 调研工作流（durable state + Web workspace） |
| dsh-file-upload-local | dsh-file-upload | 0.1.0-local.1 | Composer 上传按钮 → workspace uploads/ |
| dsh-loopx-plugin | dsh-loopx-plugin | 0.1.1-beta.4 | One-step LoopX bootstrap + 同会话 driver + GoalBar |
| dsh-memory-local | @furongjun1999/dsh-memory | 0.4.0 | 灵枢：长期记忆/知识飞轮/自我认知接入 DSH |
| dsh-my-quotes | dsh-my-quotes | 0.1.0 | 「我说」：聚合用户 ≥30 字消息，9 类意图分类+检索 |
| dsh-noema-local | @zseven-w/dsh-noema | 0.1.0-rc.3 | Noema 长期记忆：durable/inspectable 记忆文件 |
| dsh-overseas-skills | dsh-overseas-skills | 0.1.0 | 出海技能页：Accio 导入的跨境电商技能目录（12 分类） |
| dsh-overseas-tools | dsh-overseas-tools | 0.1.0 | 出海工具接入：exa_search + Jungle Scout/Klaviyo 等 |
| dsh-preset-lint-local | dsh-preset-lint-local | 0.1.0 | cordis.yml 组合词汇静态校验钩子 |
| dsh-rename-conversations | dsh-rename-conversations | 0.1.0 | 会话标题批量规范化（rc_probe/rc_batch_rename） |
| dsh-root-brand-local | dsh-root-brand | 0.1.0-local.1 | ROOT 路特创新品牌皮肤（侧栏/主题） |
| dsh-skill-subset | dsh-skill-subset | 0.1.0 | Preset 技能子集打包：运行时重注册 |
| dsh-team-hub | dsh-team-hub | 0.2.7 | 单用户实例转 workspace 级协作中心 |
| dsh-theme-local | dsh-theme | 0.1.0-local.1 | Live theme editor（curated palettes + typography） |
| dsh-wanzh-hulian | dsh-wanzh-hulian | 0.1.0 | 万物互联：MCP/API/企业应用/知识库统一管理（首个连接：得到大脑） |

其他无 package.json 的一级目录：dsh-chatui-fix-backup、dsh-renderer-heal、dsh-reverse-skill-local、dsh-rootoutlet-heal、dsh-skill-title-fix、81-Skills（85 项技能库）、archify-local、dist、doc、generated、scripts、assets、uploads、deepseek-harness-studio-presets、explore-unknowns-local、write-spec-local 等 + 若干根级 JS/HTML 工具脚本（build-*.js、patch-*.js 等，shell 重定向事故残片如 `*.jsnecho`/`*.jsnnode` 亦散落根目录）。

### 5.2 dsh-patches/（补丁工程目录，23 项）

| 文件 | 用途 |
|---|---|
| `patches-manifest.md` | **全部本地补丁唯一权威登记簿**：P0-1~8、UI-1~4、FIX-1、MOD-1~2、PR-1~5、SK-1~6、MQ-1~4、LB-1~3 + 升级重放顺序 |
| `verify-patches.sh` | 补丁锚点校验（升级后漂移检测，退出码 0/1；现 32 锚点） |
| `brand-replay.sh` | 品牌重放（LUTE Agentic System 显示名、wordmark、Info.plist，11 锚点） |
| `profile-apply-patches.mjs` | profile 补丁一键重放（幂等，4 类） |
| `assemble-bundle.sh` | 「C 形态完整打包」汇编器（app+profile+skills-presets） |
| `chatui-apply-fixes.sh` | 对话页修复（加载更早 + ⬆️ 回填，--check/--rollback） |
| `package-manifest.json` | 打包资产/排除清单（dsh-desktop-lute-bundle 2.0.4） |
| `P0-remediation-checklist.md` | P0 修复清单；`REGRESSION-GUARD.md` 回归护栏；`submission-guide.md` 提交指南；`upstream-issues.md` 上游问题登记 |
| `archive/` | 5 类历史备份（chatui-orig-bundles/checkout-backups/lan-https-stale-ca/overseas-skills-typography/profile-backups） |
| `issues/` | 21 篇问题记录（A-1~8、B-1~7、C-1/2/5/6） |
| `UI-UX-audit/` | 10 个 `.patched` 快照（client.js/desktop-dialog/index.html/dsh-theme.css 等） |
| `chatui-fix/` | apply-fixes.sh + README |
| 其他 | `.git.disabled`（git 目录已禁用）、`brand-payload-wordmark.txt`、`lint-preset.mjs`、`UI-UX-audit-patch.tar.gz`(319K) |

### 5.3 packaging/ 与 release/

- `packaging/`：assemble.sh、sign-and-dmg.sh、INSTALL-CARD.md、CHANGELOG.md、PLAN.md、README.md、RETROSPECTIVE.md、SOLUTION.md；`scripts/`（build-app-icon/build-pkg/build-setup-app/release/reloc-aeis/rewrite-file-deps/smoke-test）；`installer/`（install.sh、**LUTE-Setup.swift**、pkg-postinstall.sh）；`release/`（**1.0.0 → 1.2.2 五个发版目录**）；`staging/`（5 版本 + assemble/smoke/dmg 日志）；`vendor/`；`assets/`。
- `packaging/release/1.2.2/`：**DSH-Desktop-LUTE-1.2.2-mac-arm64.dmg（685MB）**、INSTALL-CARD.md、manifest.json、SHA256SUMS、PKG-SHA256SUMS、VERSION。
- 工作区根 `release/`：仅 README（DMG 哈希清单目录说明——DMG 走 GitHub Releases 附件）。

### 5.4 docs/ 与 _doc-notes/

- `docs/`：`adr/README.md`、architecture.md、dsh-desktop-white-screen-playbook.md、README.md、release-process.md、skill-contract-plan.md、skillopt-optimization-plan.md、skillopt-optimization-report.md、skillopt-skill-optimizer-merge-plan.md。**docs/research/ 原不存在（本报告首次创建）**。
- `_doc-notes/`：badge-test.html、dsh-browser-local、dsh-desktop-white-screen-playbook.md、dsh-genui-local、dsh-im-local、dsh-modsearch-local、dsh-pocket-local、github-plan.md。
  - **2026-09-11 时序注记**：`_doc-notes/` 已解散收编——6 篇第三方插件安装说明移入 `docs/install-notes/`（经 git 重命名保留历史），4 个草稿（`github-plan.md`、`skill-descs-81.json`、`user-summaries-draft.md`、`badge-test.html`）归档至 `~/project/_archive/Magpie-Horch-20260911/doc-notes-drafts/`，白名单条目同步移除。至此文档脊柱收敛为 ADR-0009 定的三层（`AGENTS.md` → `docs/architecture.md` → `docs/notes/`）。
- 另存在单数 `doc/`（assets/index/plugins/presets/skills.html —— 静态目录页）与根级 CHANGELOG.md（1.2.2 版本记录：P0-8 pi-ai lazy import 磁盘化修复 + 品牌 app 图标）。

---

## 6. 技能基座

| 位置 | 数量 | 内容 |
|---|---|---|
| `~/.dsh/skills/` | **252** | 电商/营销/AI 工程大套件。平台关键技能：`dsh-dev-platform-diagnostics`、`dsh-plugin-acquire`、`dsh-desktop-release`、`build-deepseek-harness-plugin`、`cocoloop`、`genui`、`research`、`agent-browser`、`macos-harness`、`lute-brand-icons`、`rename-conversations`、`getnote-brain`、`loopx*` 等；其余为 amazon-*/ecommerce-*/marketing-*/seo-* 业务技能群 |
| `~/.agents/skills/` | **12** | dsh-desktop-diagnostics、loopx/loopx-benchmark/loopx-doc-registry/loopx-pr-program/loopx-pr-review/loopx-project/loopx-self-repair、understand/understand-chat/understand-diff/understand-explain |
| `~/.agents/skills.disabled/` | 6 | agent-reach、understand-dashboard/domain/figma/knowledge/onboard |

---

## 7. 版本一致性检查（app node_modules vs profile node_modules）

| 包 | app.asar.unpacked | profile | 判定 |
|---|---|---|---|
| **dsh-plugin-desktop** | **2.0.4**（app 根即该包本体） | 无此目录 | 宿主插件不随 profile 安装，一致（唯一权威来源） |
| dshmarket | 1.17.1 | **1.36.0** | 不一致——profile 更新（有意：市场客户端新版本） |
| @deepseek-ai/dsh | 0.1.2-alpha.1 | 无 | profile 不重装宿主平台包 |
| @deepseek-ai/cordis | 4.0.1 | 无 | 同上 |
| @deepseek-ai/dsh-agent-presets | 0.1.2-alpha.1 | 无 | 同上 |
| @zseven-w/dsh-noema | 无 | 0.1.0-rc.3 | 仅 profile（产品插件） |
| @liustack/modsearch / modlens | 无 | 5.10.0 / 3.25.2 | 仅 profile |
| dsh-vision-router / dsh-pocket / dsh-context / @xmanrui/dsh-im | 无 | 2.0.1 / 2.8.0 / 0.38.1 / 4.1.0 | 仅 profile |

结论：平台包（dsh-* 0.1.2-alpha.1、cordis 4.0.1）由宿主 asar.unpacked 独占提供；产品插件只装在 profile；dshmarket 双版本并存属正常分层（宿主内置 1.17.1 兜底 + profile 覆盖 1.36.0）。

---

## 8. 异常发现汇总

1. **直补深度超出节点层**：除 profile override 外，宿主自身 `lib/`（main.js/client.js/electron-runtime 等 10+ 备份）与 25 个 @deepseek-ai 平台包被直改（35 个文件），P0-8 甚至依赖 app.asar.unpacked 磁盘路径加载。
2. **lib/types/ 缺失**：package.json 声明 types/exports 但目录不存在（原装如此，非补丁造成）。
3. **profile cordis.yml = `[]`**：易误判；真实 bundle 入口在 package.json `dsh.profile.bundles`（官方会重置 cordis.yml）。
4. **双市场包**：宿主同时装 dsh-community-market 0.1.0-dev.0 与 dshmarket 1.17.1。
5. **~/.dsh/profiles/node_modules**：workspace hoist 根，非 profile。
6. **根目录杂物**：`.tmp-*.png/txt`、`*.jsnecho`/`*.jsnnode`（shell 重定向事故残片）、`dsh-memory-local-patch.shn#`、`extract.js*` 等。
7. **打包体量**：1.2.2 DMG 685MB（unpacked 267M + profile node_modules 474M 不在包内）。
8. **agent-presets 15 个**（已品牌化 12 角色 + 3 扩展），与 package-manifest 记载的「7 个」已过期。

---

## 附录：采集命令记录（关键证据）

```bash
cat "/Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/package.json"
ls -la "/Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/lib"
cat "/Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/cordis.patch.yml"
# 依赖全景（scope 循环 + 无 scope 前 80）
for d in "$NM"/@*/; do ...; done
# 补丁痕迹
find "$A/node_modules" -name "*.orig" -exec ls -la {} \;
find "$A/node_modules" -name "*.bak*" -exec ls -la {} \;
find "$A/node_modules" -newermt "2026-08-29 23:59" \( -name "*.js" -o -name "*.mjs" -o -name "*.json" \) ! -name "*.orig"
ls "$A"/branding-backup-* "$A/build"
# profile
cat ~/.dsh/profiles/desktop/package.json
wc -l ~/.dsh/profiles/desktop/pnpm-lock.yaml     # 3599
ls ~/.dsh/  ~/.dsh/skills/  ~/.agents/skills/
# 产品
cd /Users/lute/project/Magpie-Horch && for d in */; do [ -f "$d/package.json" ] && python3 -c '...'; done
# 版本比对
for p in dshmarket @deepseek-ai/dsh ...; do 对比 app/profile 两处 package.json version; done
```
