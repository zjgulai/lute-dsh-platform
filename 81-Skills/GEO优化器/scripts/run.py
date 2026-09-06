#!/usr/bin/env python3
"""
seo-geo-optimizer - CLI entry point.

Usage:
    python run.py --product product.json --output schema.json
    python run.py --faqs faqs.json --format pretty
    python run.py --product p.json --faqs f.json --howto h.json --business b.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

try:
    from .core import (
        generate_product_schema,
        generate_faq_schema,
        generate_howto_schema,
        generate_local_business_schema,
        validate_schema,
    )
except ImportError:  # 作为脚本直接运行时（python3 run.py），退回绝对导入
    from core import (
        generate_product_schema,
        generate_faq_schema,
        generate_howto_schema,
        generate_local_business_schema,
        validate_schema,
    )


def _load_json(path: str | None) -> Any:
    if not path:
        return None
    path_obj = Path(path)
    if not path_obj.exists():
        raise FileNotFoundError(f"File not found: {path}")
    return json.loads(path_obj.read_text(encoding="utf-8"))


def _output_json(data: Any, output_path: str | None) -> None:
    if isinstance(data, str):
        payload = data  # Already a schema string
    else:
        payload = json.dumps(data, indent=2, ensure_ascii=False)
    if output_path:
        Path(output_path).write_text(payload)
    else:
        print(payload)


def _output_pretty(data: Any, output_path: str | None) -> None:
    """Pretty-print schemas with formatted JSON."""
    if isinstance(data, str):
        # It's a JSON-LD snippet, extract and pretty-print the JSON part
        import re
        match = re.search(r"<script[^>]*>\s*(\{.*\})\s*</script>", data, re.DOTALL)
        if match:
            try:
                parsed = json.loads(match.group(1))
                payload = json.dumps(parsed, indent=2, ensure_ascii=False)
            except json.JSONDecodeError:
                payload = data
        else:
            payload = data
    else:
        payload = json.dumps(data, indent=2, ensure_ascii=False)

    if output_path:
        Path(output_path).write_text(payload)
    else:
        print(payload)


def main() -> None:
    parser = argparse.ArgumentParser(description="SEO Geo Optimizer - Schema Generator")
    parser.add_argument("--product", help="Path to Product info JSON")
    parser.add_argument("--faqs", help="Path to FAQs JSON (array of {question, answer})")
    parser.add_argument("--howto", help="Path to HowTo steps JSON")
    parser.add_argument("--business", help="Path to LocalBusiness info JSON")
    parser.add_argument("--validate", help="Path to schema JSON for validation")
    parser.add_argument("--validate-type", help="Expected schema @type for validation")
    parser.add_argument("--output", help="Output file path")
    parser.add_argument(
        "--format", choices=["json-ld", "pretty"], default="json-ld",
        help="Output format (default: json-ld, which includes <script> tags)",
    )
    args = parser.parse_args()

    results: dict[str, Any] = {}
    has_output = False

    # Generate schemas
    if args.product:
        data = _load_json(args.product)
        if data:
            try:
                schema = generate_product_schema(data)
                results["product_schema"] = schema
                has_output = True
                print("Product schema generated.", file=sys.stderr)
            except ValueError as e:
                print(f"Error generating Product schema: {e}", file=sys.stderr)
                sys.exit(1)

    if args.faqs:
        data = _load_json(args.faqs)
        if data:
            try:
                schema = generate_faq_schema(data)
                results["faq_schema"] = schema
                has_output = True
                print("FAQ schema generated.", file=sys.stderr)
            except ValueError as e:
                print(f"Error generating FAQ schema: {e}", file=sys.stderr)
                sys.exit(1)

    if args.howto:
        data = _load_json(args.howto)
        if data:
            try:
                schema = generate_howto_schema(data)
                results["howto_schema"] = schema
                has_output = True
                print("HowTo schema generated.", file=sys.stderr)
            except ValueError as e:
                print(f"Error generating HowTo schema: {e}", file=sys.stderr)
                sys.exit(1)

    if args.business:
        data = _load_json(args.business)
        if data:
            try:
                schema = generate_local_business_schema(data)
                results["local_business_schema"] = schema
                has_output = True
                print("LocalBusiness schema generated.", file=sys.stderr)
            except ValueError as e:
                print(f"Error generating LocalBusiness schema: {e}", file=sys.stderr)
                sys.exit(1)

    # Validation
    if args.validate:
        schema_data = _load_json(args.validate)
        if schema_data:
            validation = validate_schema(schema_data, args.validate_type or "")
            results["validation"] = validation
            has_output = True
            print(f"Schema validation: {'PASS' if validation.get('is_valid') else 'FAIL'}. "
                  f"Errors: {len(validation.get('errors', []))}. "
                  f"Warnings: {len(validation.get('warnings', []))}.",
                  file=sys.stderr)

    if not has_output:
        print("No schema data provided. Use --product, --faqs, --howto, --business, or --validate.",
              file=sys.stderr)
        parser.print_help()
        sys.exit(1)

    # If only one schema generated, output it directly (as string) rather than wrapped
    if len(results) == 1:
        key = list(results.keys())[0]
        # Determine if value is a string (schema snippet) or dict (validation result)
        single_result = results[key]
        if isinstance(single_result, str):
            if args.format == "pretty":
                _output_pretty(single_result, args.output)
            else:
                _output_json(single_result, args.output)
        else:
            _output_json(single_result, args.output)
    else:
        if args.format == "pretty":
            # Pretty print all results
            pretty_results = {}
            for key, value in results.items():
                if isinstance(value, str):
                    import re
                    match = re.search(r"<script[^>]*>\s*(\{.*\})\s*</script>", value, re.DOTALL)
                    if match:
                        try:
                            pretty_results[key] = json.loads(match.group(1))
                        except json.JSONDecodeError:
                            pretty_results[key] = value
                    else:
                        pretty_results[key] = value
                else:
                    pretty_results[key] = value
            _output_json(pretty_results, args.output)
        else:
            _output_json(results, args.output)


if __name__ == "__main__":
    main()
