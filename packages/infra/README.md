# infra — 工程与交付

工程与交付：成员协作网关、宿主补丁素材。服务于开发与交付流程，而非终端用户功能。

## 组成员

本组包清单由 `scripts/gen-catalog.mjs` 生成并写入 [docs/catalog/packages.md](../../docs/catalog/packages.md)，**不要在 README 中手抄**：同一事实只保留一个 home（ADR-0009）。

```bash
# 查看本组当前成员
node scripts/gen-catalog.mjs && grep -G '^| infra |' docs/catalog/packages.md
```

## 归属规则

组的划分与命名规则见 [ADR-0011](../../docs/adr/ADR-0011.md)；包的治理性质（self / internalized / npm-pinned）写在各自 `package.json` 的 `luteOrigin` 字段（[ADR-0010](../../docs/adr/ADR-0010.md)、[ADR-0012](../../docs/adr/ADR-0012.md)）。
