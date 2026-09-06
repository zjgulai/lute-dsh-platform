#!/bin/bash
# preset_mount_probe.sh — 验证「品牌营销增长官」是否被真实会话挂载过
# 扫描 ~/.dsh/sessions 下的 session.jsonl.zstd 头行与事件，统计引用该预设的会话。
set -u
ROOT="$HOME/.dsh/sessions"
echo "扫描会话中的 brand-marketing-growth 引用…"
hits=0
for f in $(find "$ROOT" -name "session.jsonl.zstd" 2>/dev/null); do
  if zstd -dc "$f" 2>/dev/null | grep -q "brand-marketing-growth"; then
    hits=$((hits+1))
    echo "  ✓ $f"
    zstd -dc "$f" 2>/dev/null | grep "agent-preset" | tail -1 | sed 's/^/      /'
  fi
done
if [ "$hits" = "0" ]; then
  echo "未发现挂载记录：请切换预设「品牌营销增长官」并新建/继续一次对话后再跑本脚本。"
else
  echo "共 $hits 个会话挂载过该预设。"
fi
