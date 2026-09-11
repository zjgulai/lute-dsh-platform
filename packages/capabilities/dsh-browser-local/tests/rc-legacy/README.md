# rc-legacy specs（冷冻中，不进默认收集）

这两个 spec 写于 rc 宿主时代：
- `composition.spec.ts`: 组合测试，经真实 Loader 启完整 cordis.yml，依赖 rc 包
  `@deepseek-ai/dsh-host-apiproxy` 的 createApiProxy 完整工厂。
- `bridge-extension.e2e.spec.ts`: 端到端，--load-extension 加载扩展产物 + playwright-core。

当前宿主为 alpha.1（2.0.5 基座），apiproxy 已并入 TypertGateway（src/apiproxy-shim.ts
为运行时兼容层），这两个 spec 需按 alpha 组合形态重写后才能回迁 tests/。
归属：docs/panorama-code-diagnosis-report.md 段⑤（2.0.5 升级窗口）。
重跑方式：`npx vitest run tests/rc-legacy/<spec>`（需先修复相应依赖）。
