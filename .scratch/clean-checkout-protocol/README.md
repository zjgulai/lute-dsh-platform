# 干净检出门禁 · 复跑协议与读数（2026-09-12 实测）

给下一轮省掉重新发现的时间。**结论先写在这里，命令在后，别反过来读。**

## 一、这一轮量到的数（HEAD = `c1f9572`）

| 场景 | quick | full | 红在哪 |
| --- | --- | --- | --- |
| 主仓工作树 | **15/15** | **19/19** | — |
| 干净检出 · 装本机那套依赖 + 重建 `lib/` | **15/15** | **19/19** | — |
| 干净检出 · 依赖**按仓库清单全新解析** | 15/15 | **18/19** | `scripts-runnable`：9 个包 |

第三行是关键：**「干净检出全绿」只在第二行的口径下成立**。别把第二行说成「全新克隆可复现」。

## 二、为什么全新解析的那一份会红（已证到文件级）

`packages/capabilities/dsh-browser-local/` 的**已提交**两份文件互相矛盾：

- `tsconfig.json`（提交于 `a813982`，2026-09-11 11:53）：`"target": "ES2024"` +
  `"rewriteRelativeImportExtensions": true` —— 两者都要求 TypeScript **≥ 5.7**
- `package.json`（提交于 `465e541`，2026-09-11 19:23）：`"typescript": "5.6.3"` —— 精确钉死

实测：

```
主仓       node_modules/typescript = 5.7.3   （Sep 11 17:20 装的，早于那次 pin 提交的锁文件）
干净检出   node_modules/typescript = 5.6.3   （严格照 package.json 装出来的）
           → tsconfig.json(3,15): TS6046 Argument for '--target' ... 不含 es2024
           → tsconfig.json(18,5): TS5023 Unknown compiler option 'rewriteRelativeImportExtensions'
```

也就是说：**主仓的绿，有一部分是那份「与清单不符的 node_modules」给的**。同一轮里还有 8 个包
（deepresearch-local 的 `MarkdownLabels`、overseas-tools / wanzh-hulian 的 `@deepseek-ai/dsh-tools`
解析不到、root-brand-local 的 bundle 哈希断言、theme-local 的隐式 any、agent-team-gui-local 的
`ConnectionRpcResult`、algo-skills-local 的 `.bin/tsc` 缺失）在同一口径下红——同一个病，
不是八个病。

**另一半是锁文件**：全新安装改写了 3 份已入库的锁文件（browser-local 72 行、
auto-compact-local 292 行、skill-subset 2 行），并新建了 4 份从未入库的
（loopx-plugin / overseas-skills / team-hub / role-matrix-local）。browser-local 那份的
`version: link:../../../../../Applications/...` 与重新解析出的 `../../../../../../...`
差一级——**锁文件里的相对 link 路径不随目录深度可移植**。

## 三、`lib/` 已入库的包只有 17/23，且门禁是 `test` 先于 `build`

`scripts/gate.mjs:367` 的顺序写死 `['typecheck', 'test', 'build']`。而 `lib/`（客户端 bundle 的
构建产物）**没有入库**的 6 个包恰好就是那几个：`dsh-root-brand-local`、`dsh-agent-team-gui-local`、
`dsh-algo-skills-local`、`dsh-newapp-local`、`dsh-role-matrix-local`、`dsh-skill-center-local`。

后果：干净检出里 `test` 看到的是**上一次 `prepare` 留下的旧 bundle**（或什么都没有）。这一轮
真实踩到一次：algo-skills 的 `client-runtime-mount.spec.ts` 7/133 失败，在包内跑一次
`pnpm run build` 之后 132 passed / 1 skipped —— **同一份源码，两次读数相反**。

## 四、复跑命令

```sh
cd /Users/lute/project/Magpie-Horch
rm -rf /tmp/mh-verify && git worktree prune && git worktree add --detach /tmp/mh-verify HEAD

# vendor 是 .gitignore 掉的嵌套仓库，pin 门禁要求 HEAD == lute-sha / upstream-sha
cp -Rc vendor/dsh-desktop   /tmp/mh-verify/vendor/dsh-desktop     # -c = APFS clone，14s/725MB
cp -Rc vendor/dsh-worktable /tmp/mh-verify/vendor/dsh-worktable

# 依赖：要的是「本机那套」（第二行口径），不是全新解析（第三行口径）
for d in $(find packages -maxdepth 4 -name node_modules -type d -prune); do
  rm -rf "/tmp/mh-verify/$d"; cp -Rc "$d" "/tmp/mh-verify/$d"
done

cd /tmp/mh-verify
pnpm run gate        # quick 15/15
pnpm run gate:full   # full 19/19；若 scripts-runnable 红且报 mount 类失败，先在报红的包里 pnpm run build 再重跑
```

## 四之二、项数会动：这台机器上不止一个会话

本节所有读数都取自**已提交**的 `scripts/gate.mjs`（`c1f9572`，quick 15 项 / full 19 项）。
同一天 18:33→18:52 之间，另一个会话往 `scripts/gate.mjs` 里加了一项未提交的
`profile-bundle-sync`，于是主仓工作树变成 quick **16/16**、full **20/20**。
**报数前先 `git status -- scripts/gate.mjs`**：项数变了不代表有东西坏了。

## 五、顺带记下的两条环境事实

- `packages/capabilities/dsh-memory-local/` 在磁盘上**只有一个 `node_modules/`**，没有
  `package.json`、没有任何源码、也不在 git 里 —— 是五组归位（ADR-0011）之后留下的孤儿依赖目录。
  正因为它没有清单，`collectManifests()` 不认它，目录墙的 25 也对得上：**它不构成未入库面**，
  但 `find packages -name node_modules` 数出来是 25 而不是 24，看到别慌。
- `.gitignore` 有一条未入库改动 `packages/**/eval/out/`（mtime 09-12 18:27）。它是忽略项不是白名单项，
  与「幽灵白名单条目」无关；`gitignore-whitelist` 与 `index-drift` 在两种口径下都绿。
