# 平台价格监控完整工作流示例

以下是从零配置到持续监控的完整工作流，演示如何在无 API 凭证时用 Mock 模式快速验证，再切换到真实 API 生产运行。

## 步骤 1：理解需求

用户说："帮我监控 Amazon 上 3 个竞品 ASIN 的价格，降价 5% 就通知我。"

### 分析
- 监控目标：3 个 ASIN（B08N5WRWNW, B07PW9VBKZ, B08D3N5NML）
- 平台：Amazon
- 监控类型：价格下降预警
- 阈值：5%

## 步骤 2：配置 Mock 模式测试

```bash
python3 scripts/run.py --provider mock --products "B08N5WRWNW,B07PW9VBKZ,B08D3N5NML" --threshold 0.05
```

输出示例：
```
[平台价格监控] 使用 Mock 模式
B08N5WRWNW: $24.99 (mock数据)
B07PW9VBKZ: $39.99 (mock数据)
B08D3N5NML: $15.49 (mock数据)
```

## 步骤 3：配置真实 API

```bash
export AMAZON_ACCESS_KEY="AKID..."
export AMAZON_SECRET_KEY="SECRET..."
export AMAZON_PARTNER_TAG="tag-20"
```

## 步骤 4：生产运行

```bash
python3 scripts/run.py --provider amazon --products "B08N5WRWNW,B07PW9VBKZ,B08D3N5NML" --threshold 0.05 --alert
```

AI 输出：
- 价格对比表（当前价 vs 上次价 vs 变动%）
- 触发预警的 ASIN 列表
- 建议动作（跟价/观望/促销响应）

## 步骤 5：持续监控与导出

```bash
# 导出 CSV 供数据分析
python3 scripts/run.py --export csv --output prices.csv

# 查看历史趋势
python3 scripts/run.py --report history --days 30
```

## 常见问题

### Q: 没有 API 凭证怎么办？
A: 使用 `--provider mock` 模式先验证流程。Mock 数据会标注 `source=mock`，避免与真实数据混淆。

### Q: API 配额不够？
A: 降级策略自动生效：缓存回退 → Mock 模式 → 跳过失败。可调整监控频率（`--interval`）降低调用量。