#!/usr/bin/env python3
"""
Backfill script: parse blind test subagent output and create results.json
"""
import json
import re
import sys

def parse_blind_output(output_text: str) -> list[dict]:
    """
    Parse a blind test subagent's output.
    Expected format per item:
    [LOADED: <skill_name or NONE>]
    <response text>
    
    Returns list of {conclusion, response} dicts.
    """
    items = []
    # Split by [LOADED: marker
    parts = re.split(r'\[LOADED:\s*([^\]]+)\]', output_text)
    
    # parts[0] = text before first marker (should be empty)
    # parts[1] = skill name, parts[2] = response, parts[3] = skill name, ...
    
    for i in range(1, len(parts), 2):
        skill_name = parts[i].strip()
        response = parts[i+1].strip() if i+1 < len(parts) else ""
        
        # Determine conclusion
        if skill_name == "JTBD分析器" or skill_name == "pp-jtbd-analyzer":
            conclusion = "触发"
        elif skill_name == "NONE":
            conclusion = "不触发"
        else:
            # Another skill was loaded
            conclusion = "不触发"  # Not our skill
            if "加载" in response[:50]:
                pass  # Keep as is
        
        items.append({
            "conclusion": conclusion,
            "response": response,
            "loaded_skill": skill_name
        })
    
    return items


def create_results_json(excel_data: list[dict]) -> dict:
    """
    Create results.json from Excel data + backfill results.
    excel_data: list of dicts with keys: id, type, title, expected, tags, rounds
    """
    return {
        "skill_name": "JTBD分析器",
        "results": excel_data
    }


if __name__ == "__main__":
    print("Backfill script ready")