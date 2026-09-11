# dsh-team-hub · 使用说明（本机 Desktop 定制版）

> 上游：https://github.com/zhoujianbin/dsh-team-hub（pin `24eb47ea1d`，v0.2.7）
> 本机 fork：`~/project/Magpie-Horch/dsh-team-hub`（browser-auth 桥 + Desktop 适配）

## 是什么

把本机 DSH Desktop（127.0.0.1:43120）变成局域网团队服务的安全网关：
浏览器 → 网关 `:3090`（登录/角色/工作区隔离/RPC 过滤/审计）→ Desktop。

## 本机 fork 相对上游的改动

| 文件 | 改动 | 原因 |
|---|---|---|
| `src/browser-auth.mjs`（新增） | 读 `~/.dsh/.credentials.yaml` 的 browser-session 密钥，按 Desktop 算法铸签名 cookie，附加到所有上游请求 | Desktop 比 standalone dsh web 多一层 cookie 墙 |
| `src/upstream.mjs` | RPC 请求带桥 cookie + 401 自动重铸重试 | 同上 |
| `src/server.mjs` | ① 通用转发带桥 cookie ② WS 升级带 cookie + 错误处理 ③ 新增 `/api/remote.mux` admin 直通 ④ settings 补丁改为 `enableSettingsPatch` 白名单（默认关） | ① ② ③ Desktop 协议适配；④ **白屏教训：补丁绝不自动打** |

## 启动 / 停止

**开机自启（launchd，已注册）**：`~/Library/LaunchAgents/com.dshteamhub.gateway.plist`
（RunAtLoad + KeepAlive，崩溃自动拉起；日志 `~/.dsh-team-hub/logs/service.log`）

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.dshteamhub.gateway.plist   # 手动启动
launchctl bootout gui/$(id -u)/com.dshteamhub.gateway                                  # 停止
launchctl list | grep dshteamhub                                                       # 状态
# 重新安装（代码升级后无需）：cd ~/project/Magpie-Horch/dsh-team-hub && node bin/dsh-team-hub.js service install
# 临时前台运行：node bin/dsh-team-hub.js start
```

- 端口 `3090`，upstream `http://127.0.0.1:43120`（`~/.dsh-team-hub/config.json`）
- 数据目录 `~/.dsh-team-hub`（配置/审计 `logs/audit.jsonl`/会话）
- 成员管理：`node bin/dsh-team-hub.js user add <name> [--role member|admin] [--display-name 显示名]`（运行中热生效）
- 重启顺序无要求：Desktop 未就绪时网关 3 秒重试直到上游可达

## 已验证（2026-09-07）

- ✅ admin 登录 → 强制改密 → 经网关加载 Desktop SPA（shim 注入）
- ✅ RPC 透明代理：`session/list` 返回真实会话（187 条）
- ✅ WS 隧道：`/api/remote.mux` 上游握手成功（audit `ws.upstream-open`）
- ✅ 53/53 单元测试（含新增 browser-auth 4 项）

## 边界与限制

- **admin 模式完整可用**：透明代理 + 远程访问 Desktop。
- **member 角色已上线（阶段 2）**：Desktop 协议全量移植——
  - RPC 策略层：斜杠命名 + `{args}` 信封 + 会话归属守卫 + 响应过滤（`src/policy.mjs`）
  - 流过滤层：`/api/remote.mux` Typert 流协议按流授权 + 帧级过滤（`src/ws-filter.mjs`）
  - 所有权学习：session/list cwd 扫描 + `api-session/added` 事件 + create/fork 响应
- **member 限制（默认拒绝）**：凭据读写、设置写面、工作区管理、目录选择器、动态 Cordis、
  Goal 控制面；宿主级转发事件（commands/change、cordis/* 等）对成员丢弃；`/permission`
  切换被锁定为 workspace-write。
- 设置页经局域网访问会报「settings are unavailable」（上游已知问题）——本机直连不受影响。
- 仅限可信局域网；密码强度 + 局域网边界是实际安全线。

## 阶段 2 验证记录（2026-09-08 实测）

- ✅ 成员工作区自动创建（`~/.dsh-team-hub/workspaces/<name>`）
- ✅ 登录 → 强制改密 → SPA 加载
- ✅ `session/list` 隔离：成员可见 0/203，仅见自己创建的会话
- ✅ `session/create` 网关注入工作区（Desktop 不接受 workspaceId+cwd 同给）
- ✅ `session/prompt` 本会话 accepted → 真实 turn 完成（"回复 ok" → "ok"）
- ✅ 越权 prompt admin 会话 → 拒绝（"会话归属未知"）
- ✅ WS：`$events` ready 放行、`session/control` baseline 裁剪为仅含本人会话、
  `credentials/set` 流拒绝（error forbidden）
- ✅ 61/61 单元测试

## 修复记录（2026-09-08，成员 UI 缺陷）

- **拒绝信封**：rpcError 补 `details: {}`（Desktop 客户端严格校验 code/message/details，
  缺失即报 `connection: invalid server-response failure`）
- **预设页**：`agentPresets/list` 只读放行；`agentPresets/select` 按 agentId 归属守卫；
  copy/deletePreset/read 维持拒绝（UI 优雅降级）
- **胶囊卡片**：`pluginInventory/list` + `dynamicCordisRunner/inventory` +
  `dynamicCordisRunner/syncInspectManifest` 只读放行（上游原版策略，移植回归修复）；
  `invoke`/`resolveRequestRun` 维持拒绝
- **WS emit**：`commands/change`（全局通知）放行；`agent-preset/selected` 按会话归属放行；
  credentials/cordis/settings 事件继续丢弃

## 修复记录（2026-09-08，成员设置页）

- **问题**：经局域网访问时设置页报「settings are unavailable in this browser」，模型页显示「关闭」。
  根因：DSH 客户端硬编码 `connection.isLoopback ? "host" : "memory"`（无配置开关），
  局域网 IP → memory 模式 → 设置目录为空。
- **为什么磁盘补丁白屏**：Desktop 把 50+ 客户端包打成一个大 combo（9.3MB），
  URL 带 `rev=sha1 内容哈希`，主机侧拒绝 rev 与字节不匹配的服务——改任何 bundle 字节都会
  让整个 combo（含全部核心 UI）加载失败 → 白屏。**Desktop app 内 bundle 字节永远不能改。**
- **方案**：`src/settings-transform.mjs` 在网关响应层做 in-flight 转换——JS 响应内容嗅探到
  目标三元串即全量替换为 host 模式（gzip/br 自动解压/压回），只改发往浏览器的字节；
  Desktop 磁盘与 rev 哈希管线零接触。实测：经网关 combo 三元串 0 处、字节差 70（恰 2 处替换）。
- 效果：成员设置页只读可用（settings/describe 已放行，写操作被策略干净拒绝）；admin 经局域网访问同样修复。

## 修复记录（2026-09-08 二次，浏览器强缓存）

- **问题**：转换已上线但成员设置页仍报错。根因：上游 combo 响应带
  `cache-control: public, max-age=31536000, immutable`——浏览器缓存了转换前的旧字节，
  网关输出的新字节根本不会被重新拉取。
- **方案**：① SPA HTML 响应加 `cache-control: no-store`（网关层）；② combo URL 注入
  缓存破坏参数 `&thub=<TRANSFORM_VERSION>`（URL 变化 → 浏览器必然重新拉取）；③ 转发上游前
  纯字符串剥离 thub（**不能用 URL/URLSearchParams——combo 的 `??` 会被重编码 %3F，上游 404**）。
- 实测：带 thub 的 URL 经网关 → 200 → 剥离转发 → 转换输出 9267813 字节，三元串 0 处。
- 转换行为变更时：`src/settings-transform.mjs` 里 `TRANSFORM_VERSION` +1。

## 修复记录（2026-09-08 三次，工作区选择入口）

- **问题**：成员点击 composer 上方「选择工作区」报 `directory picker failed: 方法
  directoryPicker/pick 对 Member 禁用`。`pick` 会在宿主 Mac 弹原生目录对话框——对成员
  维持拒绝是正确策略；问题是 UI 不感知成员限制，按钮可点。
- **一次修正（已回退）**：隐藏「选择工作区」触发入口——**错误**：composer 输入元素在
  未选工作区状态自带该 aria-label，且 React 不清理外部 display:none → composer 永久
  消失（UI 错位）。教训：**不要按 aria-label 隐藏多状态元素**。
- **二次修正（现行）**：真正的 pick 触发链是「添加工作区」路径（目录选择器是无渲染流，
  打开即 pick）：隐藏 ① 侧栏 + 按钮（aria-label="添加工作区"/"Add workspace"）
  ② 菜单「添加工作区…」条目（文本前缀匹配）；chip 保留显示成员工作区名，仅占位态隐藏。
  composer 元素绝不触碰。
- 68/68 测试通过。

## 修复记录（2026-09-08 四次，工作区加载 + 崩溃防护）

- **「加载工作区」卡住**：工作区列表数据源是 `workspace/follow` 流（无参全局流，
  baseline/upsert/remove/order/archived 帧）——成员流白名单漏了它（审计 4× 拒绝）。
  修复：放行 + 帧级归属裁剪（baseline/order/archived 过滤、upsert 先 learn 再按归属、
  remove 按归属）。实测 alice baseline 只含自己的工作区。
- **connection lost 真相**：网关进程曾因未捕获异常崩溃（undici UND_ERR_BODY_TIMEOUT，
  上游长流/慢响应超时）→ launchd KeepAlive 拉起 → 全员断连。修复：startServer 注册
  uncaughtException/unhandledRejection 处理器，记 crash.log 不退出进程。
- console 的「message channel closed」是本机浏览器扩展桥在成员浏览器缺失所致，良性噪音。
- 70/70 测试通过。

## 修复记录（2026-09-08 五次，标题闪烁）

- **问题**：成员侧栏会话标题持续闪烁后消失。根因：AUTO_SELECT_SHIM（上游为 standalone
  web 编写）用 `document.querySelector("textarea")` 探测 composer 就绪——Desktop 的 composer
  是 contenteditable div（data-composer-input）→ 停止条件永不成立 → **每秒点击一次工作区
  treeitem，持续 90 秒** → 反复重渲染。
- **修复**：composer 探测兼容 textarea 与 [data-composer-input]；占位符读 placeholder 或
  data-placeholder 属性（正则匹配「选择工作区/Choose workspace」判定未选中）；每个目标
  treeitem 只点击一次（Set 幂等），选中后由占位符检查停止。
- 71/71 测试通过。

## 修复记录（2026-09-08 六次，深度研究只读放行）

- **问题**：成员点「深度研究」报 `deepResearch/list 不在 Member 白名单`。
- **检查结论**：deepResearch 是宿主全局能力（项目表无 sessionId/owner 字段），
  放行 list/get 会让成员看到全部研究项目（含 admin 的研究内容）——已向用户明确此
  跨租户可见性，**用户决策放行只读**（list/get）；写操作 start/resume/complete/fail/
  delete/updatePlan/updateQuestion/confirmPlan/addEvidence/writeReport 维持拒绝。
- 实测：alice list 返回 1 个项目（done）；start 拒绝。72/72 测试。

## 回滚 / 卸载

```bash
# 网关本身零安装：删目录即卸载
rm -rf ~/.dsh-team-hub ~/project/Magpie-Horch/dsh-team-hub
```

Desktop 本体从未被本 fork 修改（settings 补丁默认禁用，无写入）。
