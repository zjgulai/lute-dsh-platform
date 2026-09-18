# Note · 打包链版本凭据单一事实源化 + T-00 备份树迁出仓库

- 日期：2026-09-17
- 对应 ADR：[ADR-0111](../../../adr/ADR-0111.md)
- 关联主线：基座 2.0.10 升级（docs/research/13）§12/§14 之后的 T-10 出货前置

## Problem

2.0.10 基座落定后、T-10 组装开跑前，三个缺陷先后暴露（全部是本轮装配预检与
quick gate 的真实读数，不是推断）：

1. **`2.0.5` 是打包链里的一代写死的常量**：`CFBundleVersion` 戳、
   `build-setup-app.sh` 向导版本与其复核、`VERSION` 的 `DSH_BASELINE`、
   `manifest.json` 的 `dsd_baseline` 四处联动产出一个 2.0.5 世代的标记，
   而 T-10 装的是 2.0.10 基座——产物将携带 `2.0.5-lute.2.5.0` 这种谎报基线的
   版本戳。消费端 `profile-channel-admission` / `setup-wizard-state` 按戳记
   凭据，假凭据跟随客户机长期存在。
2. **`smoke-test.sh` 把 app 侧 node_modules 写死为 `app.asar.unpacked/`**：
   T-06 双形态收敛时漏掉的第 5 个消费面（§12 当时只处理了 4 个）。
   对 2.5.0（no-ASAR）载荷跑完整性比对时读的是不存在的路径。
3. **`packaging/backup/pre-2.0.10-migration/`（7.9G，1288 个 untracked 文件）
   把 `repo-attest`（ADR-0103）的快照拖到 174.8s**：`runNodeTestFile` 上限
   120s，selftest 退出码 124 必超时——与 2.0.10 无关，但把 T-10 依赖的
   gate:full 整个卡死。

## Decision

详见 [ADR-0111](../../../adr/ADR-0111.md)。执行面：

- `assemble.sh`：`DSH_BASELINE` 从 staged app 的 `CFBundleShortVersionString`
  派生；写戳后当场复核；`CFBundleVersion` 与向导 plist 一致性检查改为
  `${DSH_BASELINE}-lute.${VERSION}`；`build-setup-app.sh` 第三参数接基线。
- `DSH_RUNTIME` 新增为载荷凭据，事实源 = staged app 的
  `@deepseek-ai/dsh/package.json`（第一版读 `$PROFILE/node_modules` 取空——
  运行时 bundle 在 app 侧，live profile 侧没有这个包；实测后修正为 `$NM_DIR`）。
- `install.sh` 3b 预写向导 skip 状态改读载荷 VERSION；缺字段跳过整段，
  不编造。
- `smoke-test.sh` 5b 比对改走 `app-resources.mjs` 布局探测 + 新增
  「app node_modules 根可判定」断言（探测失败落红，不猜）。
- 备份树 `mv` 至 `~/project/Magpie-Horch-backups/`；仓库内
  `packaging/backup/README.md` 记录去向；`docs/research/13` 的 T-00a 行改指
  外置家。

## Alternatives considered

- **换新硬编码 2.0.10**：拒绝。下次升级同一缺陷原样复发；本改的全部意义是
  把「哪一代基线」从常量变成读数。
- **`DSH_RUNTIME` 同样写死 0.1.5-rc.2**：拒绝。运行时与基座分别演进时两字段
  失锁；且 install.sh 消费端会把它写进客户机的 setup-wizard 凭据。
- **备份走 `.gitignore` 登记**：拒绝。只是让判据看不见 7.9G；克隆/tar 的税
  照付。调 selftest 超时到 45min：拒绝——那把 T-10 排期拖垮且 I/O 无意义。
- **smoke 布局写成「两种路径都试」**：拒绝。四候选猜路径正是 T-06 收敛掉
  的形态；判不了必须落红。

## Consequences

- 验证读数（全部新鲜执行）：
  - quick gate 三轮：第一轮 77/82（node-interpreter 抓 `app-resources.test.mjs`
    的 `process.execPath` 直用——A0_8 同根因，§12 新增 helper 面欠的债；随改
    `real-node.mjs` 的 command+env 两半都要拿），第二轮 78/82（shell-var-multibyte
    抓我新写的四处 `$VAR（`——ADR-0064 门禁当场拦住自己的作者），第三轮
    **80/82、failed=0、exit 0**。
  - `app-resources.test.mjs` 4/4；smoke 布局探测 live 2.0.5（form=asar）与
    vendor dist 2.0.10（form=no-asar）双绿。
  - `build-setup-app.sh` 干跑 2.5.0/2.0.10：向导 `CFBundleVersion`
    `2.0.10-lute.2.5.0`、ShortVersion `2.0.10`，签名 `LUTE Code Signing`。
  - `repo-attest.test.mjs` 重跑 9/9（17.5s，此前单路径 311~356s）；
    snapshotRepo 单次 174.8s → 0.5s。
- **过程事故（如实记录）**：迁出 `mv` 与一轮在跑的 repo-attest 并发，SIGTERM
  路径报一次红；diff 的 to 值与 `sha256('missing\0<path>\0UNKNOWN')` 精确吻合
  （after 快照逐文件 stat 时文件正在消失），迁出完成后重跑 9/9 全绿。按
  ADR-0103 的 transient 语义归档，非产品缺陷。
- **迁移期暂态（登记不修）**：`patch-anchors` 对本机 `/Applications`（2.0.5）
  跑 v3 锚报 2 红（PR-2/5 CSS 前缀差 + P0-2v2 上游拆分文件缺）——T-11 切换
  后自消，不给 10 天窗口状态建永久机制。
- **顺带处置**：`agent-fullstack` 预设按用户拍板登记 `shipped-presets.json`
  allow（ADR-0092 的留白闭环），2.5.0 起随包出货。
