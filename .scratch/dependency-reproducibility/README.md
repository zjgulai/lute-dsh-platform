# 依赖可复现 · 本轮口径与测量

本文件不入库（`.scratch` 有明文密钥待外科式降级）。它只记「怎么量的、量到了什么」，供复跑与反驳。

## 口径

- 工具：`pnpm 11.8.0`、`node v26.0.0`（本机）。包管理口径以仓库现有 20/21 个 `pnpm-lock.yaml` 为准。
- 受管包 = `packages/<group>/<name>/package.json`，共 24 个。
- 「锁文件与清单一致」的判据：在该包目录跑
  `pnpm install --frozen-lockfile --lockfile-only --ignore-scripts`，退出码 0 即一致。
  `--lockfile-only` 不碰 `node_modules`；`--frozen-lockfile` 保证不一致时**报错而不改写**。
  实测：21 个有锁文件的包跑完，`git status -- '*lock*'` 为空——**测量本身没有副作用**。

## 第一次测量（HEAD = c1f9572 + 当时工作树）

```
PKG                                        LOCK   pkgManager     结果
capabilities/dsh-browser-local             pnpm   -              FAIL ERR_PNPM_OUTDATED_LOCKFILE
capabilities/dsh-deepresearch-local        pnpm   -              OK
capabilities/dsh-loopx-plugin              none   -              无锁文件
capabilities/dsh-overseas-skills           none   -              无锁文件
capabilities/dsh-overseas-tools            pnpm   -              OK
capabilities/dsh-paper2skills              pnpm   -              OK
capabilities/dsh-wanzh-hulian              pnpm   -              OK
contract/dsh-preset-lint-local             pnpm   -              OK（首轮曾 FAIL，见「§ 未解」）
contract/dsh-skill-subset                  pnpm   -              FAIL ERR_PNPM_OUTDATED_LOCKFILE
infra/dsh-team-hub                         npm    -              FAIL ERR_PNPM_NO_LOCKFILE
platform/dsh-auto-compact-local            pnpm   -              FAIL ERR_PNPM_OUTDATED_LOCKFILE
platform/dsh-cost-guard-local              pnpm   -              OK
platform/dsh-file-upload-local             pnpm   -              OK
platform/dsh-rename-conversations          pnpm   -              OK
platform/dsh-root-brand-local              pnpm   -              OK
platform/dsh-theme-local                   pnpm   pnpm@10.16.1   OK
platform/dsh-ui-polish-local               pnpm   -              OK
surfaces/dsh-agent-team-gui-local          pnpm   pnpm@9.15.4    OK
surfaces/dsh-algo-skills-local             pnpm   -              OK
surfaces/dsh-my-quotes                     pnpm   -              OK
surfaces/dsh-newapp-local                  pnpm   -              OK
surfaces/dsh-role-matrix-local             none   -              无锁文件
surfaces/dsh-skill-center-local            pnpm   -              OK
surfaces/dsh-task-board-local              pnpm   -              OK
```

**结论：24 个包里 7 个的锁文件契约是坏的**——3 个没有（loopx-plugin / overseas-skills /
role-matrix-local），4 个与清单不符（browser-local / skill-subset / auto-compact-local /
team-hub）。上一轮口头说的「7 个缺锁文件」措辞不准：缺的是 3 个，坏的是 7 个。

## 逐条失败原因（`Failure reason:` 原文）

| 包 | 原因 |
| --- | --- |
| browser-local | `@types/node`（锁 ^22.20.0 / 清单 ^22.20.2）、`typescript`（锁 ^6.0.3 / 清单 5.6.3） |
| skill-subset | `typescript`（锁 ^5.6.3 / 清单 5.6.3） |
| auto-compact-local | 3 条 peerDependencies 不在锁里：`@deepseek-ai/cordis@^4.0.1`、`@deepseek-ai/dsh-compaction@^0.1.0-rc.6`、`@deepseek-ai/dsh-tools@^0.1.0-rc.6` |
| team-hub | `ERR_PNPM_NO_LOCKFILE`：只有 `package-lock.json`（npm，lockfileVersion 3），pnpm 完全不读它 |

共同病根是**同一个**：清单被改过（把 `^5.6.3` 收成精确的 `5.6.3`、加了 peerDeps）而没有重新生成锁文件。
不是七个病。

## browser-local：本轮唯一「钉与消费方配置互相矛盾」的包

三个数字互不相同：

| 来源 | typescript |
| --- | --- |
| `package.json`（已提交） | `5.6.3` |
| `pnpm-lock.yaml`（已提交） | `^6.0.3` → 6.0.3 |
| `node_modules`（本机） | `5.7.3` |

它的 `tsconfig.json` 要 `"target": "ES2024"` 与 `"rewriteRelativeImportExtensions": true`——两者都要 TS ≥ 5.7。

**可证伪的一枪**（在 /tmp 干净副本里，按已提交清单装）：

```
$ pnpm install --ignore-scripts          # 装出清单钉的 5.6.3
+ typescript 5.6.3 (7.0.2 is available)
$ ./node_modules/.bin/tsc --version
Version 5.6.3
$ ./node_modules/.bin/tsc -p tsconfig.json --pretty false
src/index.ts(217,42): error TS2802: ... '--target' of 'es2015' or higher.
src/server.ts(264,26): error TS2802: ...
src/server.ts(559,33): error TS2802: ...
src/session-deferral.ts(54,31): error TS2802: ...
src/session-purge.ts(32,100): error TS1501: This regular expression flag is only available when targeting 'es6' or later.
tsconfig.json(3,15): error TS6046: Argument for '--target' option must be: ... 'es2023', 'esnext'.
tsconfig.json(18,5): error TS5023: Unknown compiler option 'rewriteRelativeImportExtensions'.
exit=2
```

也就是说：**照已提交清单装出来的树，这个包的 typecheck 是红的**；主仓之所以绿，是因为它的
`node_modules` 里躺着清单根本不许可的 5.7.3。

### 同一包的第二个病：11 条 devDependency 写的是本机绝对路径

```
"@deepseek-ai/dsh-tools": "/Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh-tools"
```

24 个包里**只有这一个**这么写（`grep -rln '"file:/\|": "/Applications\|": "/Users' packages/*/*/package.json` 只命中它）。
连带后果：pnpm 把这条 `file:` 目标的**相对形式**写进锁文件，而相对前缀取决于安装深度——
上一轮在另一深度重现时它从 `../../../../../Applications/…` 变成 `../../../../../../…`。锁文件因此不可能跨目录移植。

**它需要的版本全都在 npm 上，且与宿主一模一样**：

```
$ npm view @deepseek-ai/dsh-tools versions --json | tail
… 0.1.2-rc.1, 0.1.3-alpha.2, 0.1.5-alpha.1, 0.1.5-alpha.2, 0.1.5-rc.1, 0.1.5-rc.2
$ 宿主 app.asar.unpacked/node_modules/@deepseek-ai/dsh-tools/package.json → 0.1.2-rc.1
```

11 个包逐一对过：10 个是 `0.1.2-rc.1`、`@deepseek-ai/cordis` 是 `4.0.2`、`schemastery` 是 `3.18.2`，
**全部有对应发行版**。仓库里另外 6 个包（deepresearch / agent-team-gui / algo-skills / newapp /
role-matrix / skill-center）本来就是用注册表区间声明同一批包——绝对路径是本包里唯一的例外。

### 换掉之后的实测（同一 /tmp 副本，重装）

```
devDeps: 11 条绝对路径 → 0.1.2-rc.1（cordis 4.0.2 / schemastery 3.18.2）
typescript: 5.6.3 → ~5.7.3

$ rm -rf node_modules pnpm-lock.yaml && pnpm install
+ typescript 5.7.3 (7.0.2 is available)
Done in 2.8s
$ ./node_modules/.bin/tsc -p tsconfig.json --pretty false
typecheck exit=0                       # 零错误，源码一个字没动
$ pnpm test
Test Files 9 passed (9) / Tests 111 passed (111)
$ pnpm build
✔ Build complete in 39ms
$ grep -nE "Applications|/Users/|file:" pnpm-lock.yaml
5:  excludeLinksFromLockfile: false    # 只剩这条 settings 键，没有任何机器路径
```

## 未解：preset-lint-local 的抖动

首轮 `--frozen-lockfile` 扫描里 `contract/dsh-preset-lint-local` 报过
`ERR_PNPM_OUTDATED_LOCKFILE`；第二轮扫描与随后单包连跑三次都是 `Already up to date`，
该锁文件在 git 里始终干净（`git status -- '*lock*'` 空）。

最可能是并发写入：本仓此刻有多个会话在改（`git status` 70 条），有人在该包跑过一次 install。
**没有找到能稳定复现的路径，所以记为未解**，不作为结论使用。新门禁若用「解析锁文件 + 比 specifier」
的离线判据（不 shell 出 pnpm），就绕开了这层不确定性——见下。

## 复跑

```sh
cd /Users/lute/project/Magpie-Horch
for d in packages/*/*/; do
  [ -f "$d/package.json" ] || continue
  if [ -f "$d/pnpm-lock.yaml" ]; then
    (cd "$d" && pnpm install --frozen-lockfile --lockfile-only --ignore-scripts >/dev/null 2>&1) \
      && echo "OK      ${d#packages/}" || echo "FAIL    ${d#packages/}"
  else
    echo "NOLOCK  ${d#packages/}"
  fi
done
git status --porcelain -- '*lock*'   # 必须为空：测量不得有副作用
```

---

# 修复记录（提交 b529823）

## 修完之后的读数

- `pnpm install --frozen-lockfile --lockfile-only --ignore-scripts` 逐包扫描：**24/24 OK**（修复前 16 OK / 3 FAIL / 4 装不上）。
- 新增门禁 `deps-reproducible`：**24 包 0 违规**；门禁 quick 从 16 项变 17 项，全绿。
- 新规则单元测试：`node --test scripts/gates/dependency-reproducibility.test.mjs` → **22 tests / 22 pass / 0 fail**。

## 可证伪对照（同一条命令，两个时刻）

把 `package.json` 与 `pnpm-lock.yaml` 都用 `git show HEAD:<path>` 倒回 `c1f9572`，喂给同一条规则：

| 时刻 | passed | 违规数 | 覆盖的包 |
| --- | --- | --- | --- |
| 倒回 `c1f9572` | false | **25** | browser-local(15) / deepresearch-local(2) / loopx-plugin / overseas-skills / skill-subset / team-hub / auto-compact-local(3) / role-matrix-local ——即全部 7 个坏包 |
| 提交后 | true | **0** | — |

复跑：

```sh
cd /Users/lute/project/Magpie-Horch
node --input-type=module -e "
import { execFileSync } from 'node:child_process'
import { checkDependencyReproducibility } from './scripts/gates/dependency-reproducibility.mjs'
import { collectPackages } from './scripts/gates/package-collect.mjs'
const root = process.cwd()
const head = (p) => { try { return execFileSync('git', ['-C', root, 'show', 'HEAD:' + p], { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }) } catch { return null } }
const packages = collectPackages(root).packages.map((p) => {
  const m = head(p.relPath + '/package.json')
  return { relPath: p.relPath, manifest: m === null ? p.manifest : JSON.parse(m), lockfileText: head(p.relPath + '/pnpm-lock.yaml') }
})
const r = checkDependencyReproducibility({ packages })
console.log(r.passed, r.violations.length); r.violations.forEach((v) => console.log(' -', v))
"
```

## browser-local 换完之后（按已提交清单全新装）

```
$ rm -rf node_modules pnpm-lock.yaml && pnpm install --frozen-lockfile
$ ./node_modules/.bin/tsc --version
Version 5.7.3
$ pnpm run typecheck
exit=0
$ pnpm test
Test Files 9 passed (9) / Tests 111 passed (111)
$ pnpm build
✔ Build complete in 44ms
$ grep -nE "Applications|/Users/|file:/" pnpm-lock.yaml
5:  excludeLinksFromLockfile: false
```

## 两处附带发现（不是本轮的目标，但顺手修了）

- `dsh-role-matrix-local` 与 `dsh-skill-center-local` 的 `pnpm-workspace.yaml` 是 pnpm 交互式审批留下的占位串，**`pnpm install` 直接退出 1**。对照实测：写 `true` 的两个同类包退出 0。改一个词即可。
- `dsh-loopx-plugin` 有 5 个传递依赖带构建脚本（`@deepseek-ai/dsh-subprocess-local`、`@google/genai`、`koffi`、`node-pty`、`protobufjs`）。原来这个决定是悬空的（`ERR_PNPM_IGNORED_BUILDS`，退出 1），现在在新建的 `pnpm-workspace.yaml` 里显式写 `false`，退出 0。选 `false` 的理由：门禁跑的是 typecheck/test，native 构建不在其中；真需要时再逐条打开，比默认打开安全。

## 数字订正（上一轮的口头结论）

- 上一轮说「7 个包缺锁文件」→ 缺的是 **3** 个，坏的是 **7** 个。
- 上一轮说「lib/ 未入库的 6 个包」→ 是 **5** 个（`dsh-skill-center-local` 是近似项：同样未入库、同样配置，但测试从不读产物，所以今天绿）。

---

# 第二笔（提交 8f8cbdd 之后）：接受标准没有达成，以及为什么

## 干净检出验收（`git worktree add --detach 8f8cbdd` + 逐包 `pnpm install --frozen-lockfile`）

```
install: 23 OK / 1 FAIL / 0 EMPTY      # 唯一 FAIL：agent-team-gui-local 的 prepare 里 typecheck 报 TS2305/TS2554
gate（quick）: 16/16 项通过
gate:full:    19/20 项通过             # 唯一红：scripts-runnable，5 个包
```

`scripts-runnable` 红的是这 5 个（原文见 /tmp/accept2-out.txt 与实际输出）：

| 包 | 报错 |
| --- | --- |
| `dsh-deepresearch-local` | `TS2741` Property 'labels' is missing（`src/client/ResearchView.tsx:559`） |
| `dsh-overseas-tools` | `TS2307` Cannot find module '@deepseek-ai/dsh-tools'（`lib/index.js:9`） |
| `dsh-wanzh-hulian` | `TS2307` 同上 + `@deepseek-ai/dsh-mcp-client` |
| `dsh-theme-local` | `TS7006` Parameter 'state' implicitly has an 'any' type ×3 |
| `dsh-agent-team-gui-local` | `TS2305` `ConnectionRpcResult` 不存在 / `TS2554` 参数个数；且 `prepare` 让 install 退出 1 |

## 根因：这 5 个包的 DSH 类型来自机器本地符号链接，而 ADR-0017 早就判过

实测（`find <pkg>/node_modules -maxdepth 3 -type l` + `readlink` + 查清单声明）：

| 包 | 指向 | 清单里声明了吗 |
| --- | --- | --- |
| `dsh-overseas-skills` | `/Applications/DSH Desktop.app/…` ×2 | **未声明** |
| `dsh-overseas-tools` | `/Applications/DSH Desktop.app/…` ×2 | **未声明** |
| `dsh-wanzh-hulian` | `/Applications/DSH Desktop.app/…` ×3 | **未声明** |
| `dsh-deepresearch-local` | `/Applications/DSH Desktop.app/…` ×3 | 2 条有、1 条无 |
| `dsh-theme-local` | `<repo>/.dsh-types/` ×5 | **未声明** |
| `dsh-agent-team-gui-local` | `<repo>/.dsh-types/` ×24 | 有声明，但被链接覆盖 |

`.dsh-types/` 本身是合规的：`.gitignore:78` 写着「ADR-0017：从内建运行时 tgz 解出的 DSH 类型来源，可重建，不入库」，实测 252 项、内容是 `@deepseek-ai/dsh-tools@0.1.2-rc.1` 等**目录副本**（不是硬链接，inode 不同）。问题只在于：**没有任何入库的东西记录它怎么重建，也没有哪个包的清单声明它。**

而 ADR-0017（2026-09-11，accepted）的决策 1 逐字写着：

> 需要 DSH API 类型的包，从 `vendor/dsh-desktop/vendor/dsh-runtime/0.1.2-rc.1/*.tgz` 安装对应依赖（自包含、可复现、与交付运行时同版本），**不依赖 `/Applications/DSH Desktop.app` 的路径**。

实测：该目录下有 **242 个 tgz**，而 `grep -rn "dsh-runtime" packages/*/*/package.json` **一条都没有**。也就是说 ADR-0017 的决策 1 至今没有被执行过一次——browser-local 是第一例。

## 所以 browser-local 改成了内建运行时 tgz 路线（第二笔）

11 个宿主依赖拆成两类：

- **9 个 `@deepseek-ai/dsh-*`** → `file:../../../vendor/dsh-desktop/vendor/dsh-runtime/0.1.2-rc.1/deepseek-ai-<name>-0.1.2-rc.1.tgz`
- **`@deepseek-ai/cordis`（`4.0.2`）与 `schemastery`** → 注册表。运行时包里**没有**这两个：`ls vendor/…/0.1.2-rc.1/ | grep cordis` 只有 `deepseek-ai-dsh-client-ui-cordis`、`deepseek-ai-dsh-cordis-{host,client}-runner`、`deepseek-ai-dsh-tool-cordis` 这些插件，没有 cordis 本体。

实测（真仓，全新装）：`pnpm install` 干净 → `tsc -p tsconfig.json` **exit 0** → `pnpm test` **111 passed** → `pnpm build` 成功 → `--frozen-lockfile` 复核 OK → 锁文件里 9 条 `file:` 目标全在仓库内、机器路径 0 条。

## 顺带修掉的一个规则缺陷

第一版的 `MACHINE_ABSOLUTE_TEXT` 判的是「`file:`/`link:` 目标以 `../` 开头就违规」——那会**把 ADR-0017 指定的正确做法一起禁掉**（`file:../../../vendor/…tgz` 就是以 `../` 开头）。改成按包目录解析、只判「有没有逃出仓库根」（`escapesRepo`）。补了两条单测：仓库内的 `../` 放行、逃出仓库的 `../` 与绝对路径拦住。

同一轮还发现并修掉一个会漏判的正则缺陷：原来的 `(\S+)` 会在**含空格的目标**上整条失配，而 `/Applications/DSH Desktop.app/…` 恰好含空格——也就是这条规则原本对它要抓的那个真实病例是瞎的。改成 `(.+?)`，并由单测钉住。

## 复跑

```sh
# 干净检出验收
bash /tmp/accept-deps2.sh            # worktree + 逐包 frozen 安装 + gate + gate:full

# 规则单测
cd /Users/lute/project/Magpie-Horch && node --test scripts/gates/dependency-reproducibility.test.mjs   # 25 tests / 25 pass
```



---

# 第三笔（当前工作树，尚未提交）：5 个包的宿主类型改走内建运行时 tgz

## 逐包做法与实测

| 包 | 改动 | 实测 |
| --- | --- | --- |
| `dsh-overseas-tools` | `dsh-tools` 一条 tgz（原为 app 绝对链接）+ `renderExa` 显式 `@returns` | typecheck 0 / test 8 passed / frozen OK |
| `dsh-wanzh-hulian` | `dsh-tools`、`dsh-mcp-client` 两条 tgz；输出 schema 由 `additionalProperties:true` 改成闭合五键 + `renderText` 显式返回 | typecheck 0（此前 38 条 `TS2322`）/ test 10 passed |
| `dsh-theme-local` | 5 个 client 包 tgz（原为 `.dsh-types/` 链接） | typecheck 0 / test 20 passed |
| `dsh-deepresearch-local` | 24 条注册表 `^0.1.5-rc.1`/`^0.1.1-rc.2` 整条换成 tgz；补 `dsh-session` 一条（原来是 peer 自动装出来的 **0.1.0-rc.8**，与运行时的 `dsh-llm` 对不上：`CallId` 在 0.1.2-rc.1 已改名 `ToolCallId`） | typecheck 0（`tsc -b`）/ test 38 passed |
| `dsh-agent-team-gui-local` | 见下 | typecheck 0 / test 66+119 passed / client program 解析失败 0 条 |

## `dsh-agent-team-gui-local` 为什么要整份闭包（这是本轮最重要的发现）

1. 它的 client 半 `import` 6 个宿主入口包。这些包的 `lib/types/**/*.d.ts` **互相 import**，闭包实测 **54 个包**；并入它们的 `dependencies`/`peerDependencies` 中运行时存在者得 **72 个**。
2. 少一个不是「警告」，是**静默变 any**：`dsh-client-ui-slots` 的 `SessionStandardProps` 是**空接口**，`sessionId`/`useSessions` 全靠 `dsh-client-ui-session` 的 `declare module` 合并进来；该包不在树里时 `skipLibCheck` 把未解析的 import 静默转成 `any`，错误落在源码上（`TS2339`），看不出病根。
3. 旧的绿是靠 `.dsh-types` 的**扁平完整集**（`.dsh-types/node_modules/@deepseek-ai/` 251 个包）：`node_modules/@deepseek-ai/<pkg>` 是 symlink，TS 解析 realpath 落在那棵树里再往上走，传递 import 全能解析。一旦同名包以**实体目录**装进 `node_modules`，realpath 不再落在供给树里，机制就失效——干净检出里 5 个包红正是这个。
4. 试过并否掉的两条路：
   - `paths` 回落到 `.dsh-types` → **不可行**。`paths` 替换是字面路径、不走 `exports`，`@deepseek-ai/dsh-client-ui-session/client` 会去找不存在的目录（真路径是 `lib/types/client`）。
   - 只装直接依赖、传递交给 `skipLibCheck` → 就是上面第 2 条的静默 any，不叫通过。

## 上游声明的三条缺口（运行时真有、`.d.ts` 里没有）

`Session.events`、`SessionHeader.seedLength`、`JsonValue` 重导出。`scripts/gates/dsh-types.mjs::augmentDeclarations()` 一直在 `.dsh-types/` 里补这三条；走 tgz 直装的包看不到那份生成物，所以同样三条改成**入库的模块增强**：`packages/surfaces/dsh-agent-team-gui-local/types/upstream-declaration-gaps.d.ts`。两个坑实测过：

- 增强块里的声明必须显式 `export`，否则不并进目标模块；
- `SessionHeader` 在 `lib/types/types.d.ts` 里声明、主入口只 `import type` 使用不重导出，模块增强只能并进**声明它的模块** → 必须用 tsconfig `paths` 把它映射成一个可寻址的 specifier。

## 判据：不是「tsc 绿」，是「没有解析失败」

`skipLibCheck` 让残缺的类型图照样绿。所以验收看 `--traceResolution`：

```sh
cd packages/surfaces/dsh-agent-team-gui-local
./node_modules/.bin/tsc -p tsconfig.client.json --noEmit --traceResolution 2>/dev/null \
  | grep -E "^======== Resolving module '@deepseek-ai/" -A 40 | grep -c "was not resolved"
# 实测：0
```

## 类型的语义首次真实生效（顺带修掉的真缺陷）

- `dsh-overseas-tools`：`renderExa` 返回 `{type: string}` 未收窄 → `TS2322`。
- `dsh-wanzh-hulian`：19 个工具共用 `additionalProperties: true` 的输出 schema → `InferValue` 推成 `Record<string, JsonValue>`，而「可能缺席的可选字段」归一成 `?: undefined`，`undefined` 不是 `JsonValue` → 19×2 条错误。改成闭合五键（`ok`/`text`/`error`/`data`/`disconnected`，即全部 execute 返回值的并集；运行时 schema 因此收紧，键集合是静态枚举过的）。

## 第四笔：`tsc -b` 的假绿（这一条差点让我报错结论）

`dsh-deepresearch-local` 的 `typecheck` 是 `tsc -b`。主仓里它退出 **0**，而：

```sh
cd packages/capabilities/dsh-deepresearch-local && ./node_modules/.bin/tsc -b --force --pretty false
# src/client/ResearchView.tsx(559,50): error TS2741: Property 'labels' is missing ...
```

干净检出（没有 `lib/*.tsbuildinfo`）报的正是后者。**判「绿」只能用 `--force` 或干净检出**，否则量到的是缓存。修法：`MarkdownText` 的 `labels` 按 locale 供一次（新增 `markdown.codeCopy` / `markdown.codeCopied` / `markdown.footnotes` 三个键），`useMemo(..., [t])` 保证引用稳定（上游声明写明换身份会丢流式渲染缓存）。修后 `tsc -b --force` 退出 0、`vitest` 6 files / **48 passed**。
