# A-1 PR 草案：更新安装器签名/哈希校验（上游源码级改动方案）

> 目标仓库：`dsh-plugin-desktop`（对应 issue：`issues/A-1-update-installer-no-signature.md`）
> 现状：`validateArtifact` 仅校验容器 magic，下载产物被 `openPath`/`spawn` 直接执行，version 端点不提供哈希。

## 设计（两段式：服务端下发哈希 + 客户端强制校验）

### 服务端（dshdesktop.cn，与本 PR 配套）
`GET /api/desktop/version` 响应新增每平台工件元数据：

```json
{
  "version": "2.1.0",
  "artifacts": {
    "darwin": { "url": "https://www.dshdesktop.cn/api/downloads/mac", "sha512": "<hex>", "size": 123456789 },
    "win32": { "url": "https://www.dshdesktop.cn/api/downloads/windows", "sha512": "<hex>", "size": 123456789 }
  }
}
```

## 客户端改动（3 个文件）

### 1. `update-checker-Mw2EmLOX.js`（src: update-checker.ts）

`parseVersionResponse` 增加 artifacts 校验与携带；`checkForStableUpdate` 结果增加 `artifactSha512`（按当前平台）：

```js
function parseVersionResponse(body) {
  const parsed = /* 现有 version 解析 */;
  // 新增：artifacts 形状校验（防注入）
  const artifacts = body.artifacts;
  if (artifacts !== void 0) {
    for (const platform of ["darwin", "win32"]) {
      const a = artifacts[platform];
      if (a === void 0) continue;
      if (typeof a.sha512 !== "string" || !/^[0-9a-f]{128}$/.test(a.sha512)) return null;
      if (a.size !== void 0 && (!Number.isSafeInteger(a.size) || a.size <= 0)) return null;
    }
  }
  return { version: parsed.version, artifacts };
}
```

`checkForStableUpdate` 的返回对象增加：
```js
return {
  status: ...,
  currentVersion: current.version,
  latestVersion: latest.version,
  artifactSha512: latest.artifacts?.[options.platform]?.sha512, // 新增 platform 入参
};
```

### 2. `update-download.js`（src: update-download.ts）

`downloadDesktopUpdate` 增加 `expectedSha512` 入参，下载完成后、`validateArtifact` 之前做字节级比对：

```js
async function downloadDesktopUpdate(options) {
  // ...现有：validatedPlatform / validatedVersion / prepareDownloadPaths / 下载循环...
  if (options.expectedSha512 !== void 0) {
    const actual = await sha512File(paths.temporary);
    if (actual !== options.expectedSha512) {
      throw new UpdateDownloadError("invalid-artifact",
        "The downloaded installer failed SHA-512 verification.");
    }
  }
  await validateArtifact(paths.temporary, platform);
  // ...现有：rename 到目标路径...
}

async function sha512File(filename) {
  const hash = createHash("sha512"); // 头部 import 增加 node:crypto
  const handle = await open(filename, "r");
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    await handle.close();
  }
  return hash.digest("hex");
}
```

### 3. `electron-runtime-DS52LbUW.js`（src: electron-runtime 的 downloadAndOpen）

把版本检查结果携带的哈希传入下载；macOS 追加公证校验，失败即阻止自动打开：

```js
// 版本检查阶段缓存 artifactSha512，downloadAndOpen 传入：
await downloadDesktopUpdate({
  platform, version, destinationPath,
  request: (url, init) => net.fetch(url, init),
  signal,
  expectedSha512: this.pendingArtifactSha512, // 来自 checkForStableUpdate
});

// macOS：openPath 之前追加（spawn 同步执行 + 超时 30s）：
if (platform === "darwin") {
  const assessed = await assessArtifact(artifactPath); // spctl --assess --type open --context context:primary-signature
  if (!assessed) {
    this.logError(`dsh-plugin-desktop: update artifact failed notarization assessment: ${artifactPath}`);
    await this.showUpdateMessageBox({
      type: "warning",
      title: copy.updateDownloadedTitle,
      message: copy.updateReady(version),
      detail: copy.verificationFailed, // 新增文案：签名校验失败，已阻止自动打开，请从 Downloads 手动核验
      buttons: [copy.ok], defaultId: 0, noLink: true,
    });
    return;
  }
  const openError = await shell.openPath(artifactPath);
  // ...
}
```

## 测试计划

1. 单元：`sha512File` 对已知字节流输出正确摘要；`expectedSha512` 不匹配 → `invalid-artifact`；未提供哈希（旧服务端）→ 跳过校验（向后兼容）。
2. 集成：篡改 DMG 一个字节 → 下载被拒、日志可见 `failed SHA-512 verification`。
3. 公证：合法签名+公证 DMG 通过 `spctl`；未签名 DMG 被阻止自动打开、仅提示手动核验。
4. 回归：正常升级流程（合法工件 + 正确哈希）完整走通。

## 安全边界说明

- 哈希来自 HTTPS 固定端点（`dshdesktop.cn`），配合 TLS 即建立信任链；后续可加 Ed25519 签名以抗服务端被篡改。
- 本地止血（已合入 Desktop 2.0.4 的机器）：移除自动执行、改手动安装——本 PR 恢复自动化时以校验为前置条件。
