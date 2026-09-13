# 变量名被全角括号吞掉：装配在 §5 中断，而这条陷阱早就写在注释里

> 决策：[ADR-0064](../../../adr/ADR-0064.md) · 分类：contract · 生命周期：implemented

## Problem

### 症状：一行 `say` 让整轮装配作废

2026-09-13 首次装配 2.3.0（`VERSION=2.3.0 ./assemble.sh`）跑到 §5「装配安装器与工具」时退出码 1：

```
/Users/lute/project/Magpie-Horch/packaging/scripts/build-setup-app.sh: line 43: APP<坏字节>: unbound variable
```

此前 §0~§4 全部通过——打包源快照（profile 728M、presets 52 个）、app 证书深签名、profile 压缩、349 个技能、aeis 便携化都已经落盘，唯独最后一步的安装器签名脚本炸了。

### 定位：不是变量名拼错，是 bash 把多字节字节并进了名字

出错行本身看着毫无问题：

```bash
say "编译完成: $APP（身份：${LUTE_SIGN_IDENTITY}）"
```

同一行里 `${LUTE_SIGN_IDENTITY}` 加了花括号、`$APP` 没加——差别就在这里。`（` 的 UTF-8 字节是 `EF BC 88`，`/bin/bash` 3.2.57 把它们当作标识符字符继续读取，于是变量名成了「`APP（`」，一个从未定义过的名字；脚本开头是 `set -euo pipefail`，未定义变量立即终止进程。

在构建机同版本 bash 上实测：

```
$ /bin/bash -c 'set -u; APP=/tmp/x; echo "done: $APP（身份：y）"'
/bin/bash: APP?: unbound variable
$ /bin/bash -c 'set -u; APP=/tmp/x; echo "done: ${APP}（身份：y）"'
done: /tmp/x（身份：y）
```

加花括号即解——它把变量名的右边界钉死。

### 这不是一处笔误：全仓还有 3 处，其中 1 处最凶

用逐字节匹配（`\$[A-Za-z_][A-Za-z0-9_]*` 紧跟码点 ≥ 0x80）扫全仓 `*.sh` 与「非 `.sh` 但带 shell shebang」的文件，得到 4 处**参与展开**的命中：

| 位置 | 形态 | 为什么危险 |
| --- | --- | --- |
| `packaging/scripts/build-setup-app.sh:43` | `$APP（` | 本次装配中断的直接成因 |
| `packaging/scripts/release-publish-guard-test.sh:107` | `$RC，` | 断言**失败分支**自身炸掉，测试报不出真实原因 |
| `packaging/scripts/release-publish-guard-test.sh:131` | `$RC，` | 同上 |
| `packaging/installer/pkg-postinstall.sh:46` | `$RC）` | **错误报告行**自身炸掉 |

最后一条的形状最值得记：它只在 `install.sh` 已经失败时才执行，也就是**专门用来解释失败的那一行**。它一炸，客户看到的是无关的 `unbound variable`，而原始安装失败原因被顶掉了——缺陷把一个可读错误换成了一个误导性错误。

另有 3 处命中只在注释里（`ensure-signing-identity.sh:27`、`sign-and-dmg.sh:204`、`dsh-task-board-local/reinstall.sh:8`），注释不参与展开，无害，不应报红。

### 关键点：这条陷阱在本仓库有「成文的认知」

`packaging/scripts/ensure-signing-identity.sh:27` 里写着：

> `$IDENTITY」` 会被解析成变量名 "IDENTITY」" 并报 unbound variable。

也就是说，同一位作者（同一天早些时候）已经踩过、想清楚、并写进了注释——然后在此后又新写了 4 次。**知道 ≠ 拦住。** 这与 ADR-0057 在「产物原子就位」上得出的结论是同一条：一条必然发生、且失败时有误导性的缺陷，记在人的记性上不是工程解。

## Decision

1. 修复 4 处现场，统一改为 `${VAR}` 形式。
2. 新增门禁校验 `shell-var-multibyte`（纯函数 `checkShellVarAdjacentMultibyte` + `collectShellScripts()` 采集），随 `pnpm run gate` 的 quick 模式执行，命中即红。
3. 判定边界按「是否参与展开」精确划线：**注释不算**（行尾注释同样要跳过）、**位置参数不算**（`$1（` 合法）、**只扫 shell**（其他语言无此陷阱）。
4. 校验自带 `node:test` 用例，覆盖「坏写法命中」「花括号/ASCII 边界/位置参数通过」「注释跳过」「引号内 `#` 不是注释起点」四种情形。

## Alternatives considered

- **只修 4 处，不加门禁。** 最省事，但被 ADR-0057 的既有判据否决：连写进注释的认知都没拦住新犯，说明缺的不是知识而是强制力。
- **全仓补花括号做风格统一。** 会连带要求改写 3 处有说明价值的注释（`ensure-signing-identity.sh:27` 那条注释正是在解释这条陷阱），为了整齐删掉解释是负收益。
- **靠 `shellcheck`。** 本机 `command not found`，未实测其对这一形态的判定；且引入仓库外二进制会让门禁多一个版本不受控的依赖。本仓库门禁的既有形状是「自带纯函数 + `node:test`」，本校验沿用。
- **写成 git pre-commit 钩子。** 可被 `--no-verify` 绕过，不在「一条命令给证据」（ADR-0014）的强制面内。

## Consequences

- **正面**：这一族缺陷（变量名被后续字符吞掉）从此进不了树干；其中两处收益最大的是**错误报告路径**——它们原本会把真实故障替换成误导性故障，属于排障成本被静默放大的那一类。校验纯文本、无外部依赖，开销可忽略。
- **负面**：门禁多一条需维护的判定，且其边界规则按 `/bin/bash` 3.2.57 的实测标定——若 bash 行为或写法习惯演进，需复核规则而非放宽为警告。
- **实施状态（如实记录）**：4 处现场修复与本守卫同批落盘；2.3.0 的装配在修复后重跑，**首轮中断于 §5 的这一步应当通过**——这是本次修复的第一条实测判据，由该轮装配的完成情况给出。
