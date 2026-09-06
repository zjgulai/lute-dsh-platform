#!/usr/bin/env python3
"""
GTM战略规划 - 自包含 CLI。

读取产品/目标市场/预算输入，输出一份 GTM 战略计划骨架（本地生成，不依赖共享库或外部 LLM）。

Usage:
    python3 scripts/run.py --input "产品: 蓝牙音箱; 目标市场: 美国; 预算: $50K" --output result.json
    python3 scripts/run.py --input input.json --output result.json
    python3 scripts/run.py --input "描述..."            # 打印到 stdout
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def _read_input(raw: str) -> str:
    p = Path(raw)
    if p.exists() and p.is_file():
        return p.read_text(encoding="utf-8")
    return raw


def _extract_field(text: str, *keys: str) -> str:
    low = text.lower()
    for k in keys:
        for line in text.splitlines():
            line_l = line.lower()
            if line_l.startswith(k + ":") or line_l.startswith(k + "："):
                return line.split(":", 1)[-1].split("：", 1)[-1].strip()
    # 兜底：整段包含关键词时返回整段
    for k in keys:
        if k.lower() in low:
            return text.strip()
    return ""


def build_gtm_plan(input_text: str) -> dict:
    product = _extract_field(input_text, "产品", "product")
    market = _extract_field(input_text, "目标市场", "市场", "market", "target market")
    budget = _extract_field(input_text, "预算", "budget")

    missing = []
    if not product:
        missing.append("产品信息")
    if not market:
        missing.append("目标市场")
    if not budget:
        missing.append("预算范围")

    if missing:
        return {
            "status": "need_clarification",
            "missing": missing,
            "message": f"请补充缺失信息：{'、'.join(missing)}，以便生成完整的 GTM 战略计划。",
        }

    return {
        "status": "ok",
        "plan": {
            "市场进入策略": {
                "进入模式": "跨境电商直营 + DTC 独立站",
                "首发阵地": "平台旗舰店首发（Amazon/天猫/京东）",
                "本地化": "语言、包装、客服、合规认证",
            },
            "渠道策略": {
                "线上": "平台旗舰店 + 社媒种草",
                "私域": "邮件列表/企微社群沉淀复购",
            },
            "定价策略": "对标中高端竞品，留 15-20% 首销折扣空间",
            "上市时间表": ["M-4 准备", "M-2 内容", "M-1 预热", "M0 上市", "M+1 投放"],
            "预算分配": {"广告": "60%", "KOL": "25%", "内容": "15%"},
            "KPI": ["首月销售", "ACoS", "ROAS", "评价数", "复购率"],
        },
        "输入": {"产品": product, "目标市场": market, "预算": budget},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="GTM战略规划 CLI（自包含，本地生成）")
    parser.add_argument("--input", required=True, help="任务描述或输入文件路径")
    parser.add_argument("--output", default=None, help="输出 JSON 文件路径（可选）")
    parser.add_argument("--format", choices=["json", "text"], default="json", help="输出格式")
    args = parser.parse_args()

    try:
        input_text = _read_input(args.input)
    except OSError as e:
        print(f"Error: 读取输入失败 {e}", file=sys.stderr)
        sys.exit(1)

    if not input_text.strip():
        print("Error: 输入为空，请提供产品/目标市场/预算描述。", file=sys.stderr)
        sys.exit(1)

    plan = build_gtm_plan(input_text)
    if args.format == "json":
        out = json.dumps(plan, indent=2, ensure_ascii=False)
    else:
        out = plan.get("message") or json.dumps(plan, ensure_ascii=False, indent=2)

    if args.output:
        try:
            Path(args.output).write_text(out, encoding="utf-8")
            print(f"[ok] 结果已写入 {args.output}")
        except OSError as e:
            print(f"Error: 写入失败 {e}", file=sys.stderr)
            sys.exit(1)
    else:
        print(out)


if __name__ == "__main__":
    main()
