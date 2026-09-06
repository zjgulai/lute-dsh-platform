# 工作流示例

## 端到端示例：从一本书中提取知识单元

### 输入

```json
{
  "chunks": [
    {
      "id": "chunk_001",
      "content": "供应链管理的核心是平衡效率与韧性。传统\">just-in-time\"模式追求零库存和高效率，但在面对供应链中断时缺乏缓冲。现代供应链管理引入\"just-in-case\"理念，在关键节点保持安全库存...",
      "book_index": 1,
      "start_line": 12,
      "end_line": 45
    }
  ],
  "config": {
    "language": "zh",
    "output_language": "English",
    "rate_limit": 3.0,
    "validate_schema": true
  }
}
```

### 步骤 1：密度估算

```bash
python3 scripts/run.py --input chunks.json --generate-prompts --format json
```

输出：估算目标数量为 3 个 SKU。

### 步骤 2：LLM 提取

将生成的 Prompt 发送给 LLM，获取 JSON 响应。

### 步骤 3：解析响应

```bash
python3 scripts/run.py --input chunks.json --sku-response llm-response.json --format json
```

### 步骤 4：验证

脚本自动验证 Schema 合规性，输出以下结构：

```json
{
  "summary": {
    "total_skus": 3,
    "valid_count": 3,
    "invalid_count": 0,
    "pass_rate": 100
  },
  "validated_skus": [
    {
      "sku_id": "...",
      "is_valid": true,
      "errors": [],
      "warnings": []
    }
  ]
}
```

### 完整工作流

```
输入 JSON → 密度估算 → 生成 Prompt → LLM 提取 → 解析响应 → Schema 验证 → 输出 SKU 列表
```

> 注意：LLM 调用步骤不在本脚本中执行（`run.py` 生成 Prompt 供使用者自行调用 LLM），避免 API 密钥管理与速率限制耦合。