# pixpix MCP（OAuth2 型）接入分析 · 讨论稿 v1

> 目标：把 https://api.pixpix.media/pixpix/mcp/oauth2 接入万物互联 MCP TAB（系统默认浏览器手动授权）。
> 状态：协议级探测完成，讨论稿，未改代码。

## 1. 协议级探测结果（实锤数据）

| 端点 | 结果 |
| --- | --- |
| MCP 端点（= 该 URL） | HTTP 401 + `www-authenticate: Bearer resource_metadata="…/oauth-protected-resource/mcp/oauth2", scope="mcp:connect"` → **streamable HTTP + Bearer 头**（MCP 2025 规范受保护资源形态） |
| 受保护资源元数据 | resource / authorization_servers / scopes_supported: mcp:connect / bearer_methods: header |
| AS 元数据 | issuer `https://api.pixpix.media/pixpix`；authorization_endpoint（authorize-site）、**device_authorization_endpoint（设备流）**、token_endpoint（auth_methods: none=公共客户端）、**PKCE S256**、**refresh_token + offline_access**、registration_endpoint（DCR）、revocation/introspection |
| ⚠️ 关键风险点 | `tls_client_certificate_bound_access_tokens: true` —— 令牌可能绑定客户端证书（mTLS）。公共客户端（PKCE/设备流）拿到的 token 是否可脱离证书使用**必须实测**（T1） |
| 服务端形态 | istio-envoy 生产网关、标准 OAuth2 实现、最小 scope（mcp:connect）——协议稳定性好 |
| 能力面 | pixpix = AI 图像生成/编辑服务；**具体工具清单需授权后 tools/list 确认**（未授权不可见，如实标注） |

## 2. 对当前基座的适配性

| 层 | 现状 | 适配 |
| --- | --- | --- |
| 传输 | dsh-mcp-client 支持 streamable-http（url + headers） | ✅ 直接匹配 |
| 认证 | **dsh-mcp-client 不支持 OAuth 流**（headers 静态） | 需在 P3 基座上加「OAuth 预授权层」（见方案） |
| 授权交互 | 用户要求**系统默认浏览器**手动授权 | 设备流天然匹配：宿主 /open 已有系统浏览器能力 |
| token 存储 | credentials 服务适合简单字符串 | token 对（access/refresh + expiry）存 0600 文件（同 getnote CLI config 先例），模型不可见 |
| 刷新 | dsh-mcp-client 静态 headers | 挂载时检查过期 → refresh_token 换新；运行期过期表现为工具 401 → 状态灯提示重授权（讨论点） |
| 稳定性风险 | — | ① tls 证书绑定（T1 实测）② 设备流轮询 5s/次、expires ~15min ③ refresh 依赖 offline_access |

## 3. 安装方案

**方案 1（推荐）：P3 基座扩展「OAuth 型 MCP 条目」+ 设备流预授权层**
1. mcp-servers.json 条目扩展 auth 字段：`{type:"oauth-device", deviceEndpoint, tokenEndpoint, registrationEndpoint?, scopes:["mcp:connect","offline_access"]}`。
2. 宿主新路由：`/oauth-device/start`（POST device_authorization → 返回 verification_uri + user_code + device_code）→ 客户端卡片显示 user_code + 「打开授权页」按钮（/open 系统浏览器）→ `/oauth-device/status`（轮询 token_endpoint grant_type=device_code）→ 成功后 token 落 0600 文件。
3. 挂载：读 token 文件 → 过期则 refresh_token 换新 → 注入 `headers:{authorization:"Bearer …"}` → ctx.plugin(McpClient, streamable-http)。
4. 设置页 MCP 卡：OAuth 型条目显示「浏览器授权 / 重新授权」按钮 + 状态灯（未授权/已授权/令牌过期/授权页已打开）。
5. 零新依赖（Node fetch）；不碰壳内 UI；静态挂载重启生效语义不变。

**方案 2**：外部 mcp-oauth CLI/gateway 代理 —— 引入外部依赖，违背轻量，不推荐。
**方案 3**：直连 pixpix REST 自研工具 —— 若 tls 证书绑定不可行时的备选（丢弃 MCP 桥，改 getnote 式自研）。

## 4. 执行 TODO（待决策后）

- [ ] T1 实测（只读协议）：公共客户端注册 → 设备流全链路 → **验证 token 是否可脱离 mTLS 使用**（curl 带 Bearer 打 401 端点，成功=可行）
- [ ] T2 宿主：mcp-servers.json auth 字段扩展 + oauth 路由组 + token 文件 + 挂载注入
- [ ] T3 客户端：MCP 卡 OAuth 按钮 + user_code 展示 + 状态灯
- [ ] T4 冒烟：授权后 tools/list 确认能力面 + 一次真实工具调用
- [ ] T5 文档 + ADR

## 5. 待决策问题

1. 方案选 1（基座扩展 OAuth 设备流，推荐）？
2. 授权方式：设备流（verification_uri + user_code，推荐，最贴合「系统浏览器手动授权」）vs 授权码+PKCE（需本地回环回调，桌面端复杂）？
3. token 存储：0600 文件 pixpix-oauth.json（推荐）？
4. 刷新策略：挂载时刷新 + 过期手动重授权（推荐）vs 宿主定时器自动刷新？
5. 实施时机：先做 T1 实测再定（推荐）？还是直接实施（若 tls 绑定不过则方案 3）？

## 6. T1 预检实况（2026-09-06 · 只读协议探测）

| 探测 | 结果 |
| --- | --- |
| DCR（注册公共客户端） | ✅ 成功：client_id = pixpix-09f96e473d35412a9517873b895413b5（public，PKCE） |
| 设备流（device_authorization POST） | ❌ 400 Bad Request（内部路由 /molili-agent/...，未按标准放行） |
| device_authorization + resource 参数 | 返回**网页授权站 HTML**（Next.js authorize-site）——实际是**网页授权流**而非标准设备流 |
| authorize-site GET（无参） | 400（需 client_id/redirect_uri/code_challenge 等参数） |

**结论：该服务实际走「authorize-site 网页授权 + PKCE + redirect_uri 回调」**，设备流端点是广告性存在。与用户「系统默认浏览器手动授权」的要求仍完全一致——回调用**本机 loopback 端口**（随机端口监听 + /open 打开系统浏览器 + 回调收 code + token 交换），与 getnote CLI 的授权机制同款先例。

## 7. 方案微调（待确认）

- 授权流：authorization_code + PKCE（S256）+ loopback 回调（`http://127.0.0.1:<随机端口>/callback`）
- 交互：宿主生成 code_verifier/challenge → `/open` 系统浏览器打开 authorize-site（带 client_id/redirect_uri/challenge/resource/scope）→ 用户手动授权 → 浏览器 302 到 loopback → 宿主收 code → token 端点换 access+refresh → 0600 落盘
- 其余不变：0600 存储 / 挂载刷新 + 手动重授权 / MCP 卡「浏览器授权」按钮 + 状态灯
- 实施 TODO 微调：T1 改为「authorize-site 参数实测 + loopback 全链路」（实施时做）；T2-T5 不变

## 8. 实施与冒烟结果（2026-09-06 完成）

| 项 | 结果 |
| --- | --- |
| 授权链路 | ✅ 全通：DCR → PKCE+state → SPA 确认页（直开 www.pixpix.art/mcp/authorize）→ Allow → loopback 收 code → token 交换（含 resource 参数，RFC 8707）→ 0600 落盘 |
| token | Bearer，TTL 1h，scope offline_access mcp:connect（refresh 可用）；**tls 证书绑定未强制**（公共客户端 token 直接可用，风险解除） |
| MCP 验证 | initialize 200（pixpix-oauth2 v1.0.0，协议 2025-06-18）；tools/list = **37 个工具**（文生图/文生视频/TTS + 上传/轮询/渲染 + 电商垂直工具：product-suite/product-recolor/bestseller-replica/viral-ecommerce-video/video-replication/remove-bg/高清放大等） |
| 踩坑记录（重要） | ① authorize-site 端点登录回跳丢 state → 用 www.pixpix.art/mcp/authorize 直开；② token 交换必须带 resource（invalid_target）；③ 请求需 Accept: application/json, text/event-stream；④ 无状态 HTTP 需 Mcp-Session-Id（tools/list 前先 initialize） |
| 剩余步骤 | 设置页 MCP 板块 PixPix 卡「已授权」→ 打开启用开关 → 重启 → 37 个 mcp__pixpix_* 工具就绪 |
