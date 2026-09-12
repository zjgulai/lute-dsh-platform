#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 `manifest/role-assignments.json` 编译成 `lib/role-map.js`（宿主直接 import）。

为什么要编译而不是运行期读 manifest：宿主是已安装的 npm 包，`manifest/` 不在
`package.json` 的 `files` 白名单里（与 `lib/catalog.js` 由 manifest 生成同理）。
manifest 是**事实的家**（可读、可 diff、可复核），lib 里这份是**构建产物**。

用法：python3 scripts/build_role_map.py [--check]
  --check：只验证 lib/role-map.js 与 manifest 一致，不一致则非零退出（门禁用）
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "manifest", "role-assignments.json")
OUT = os.path.join(ROOT, "lib", "role-map.js")
CHECK = "--check" in sys.argv

if not os.path.exists(SRC):
    sys.exit(f"✗ 缺少 {SRC}（先跑 Phase A：.scratch/overseas-skills-refactor/merge-assignments.py）")

data = json.load(open(SRC, encoding="utf-8"))
skills = data["skills"]

lines = []
for name, rec in skills.items():
    roles = ",".join(json.dumps({"id": r["id"], "source": r.get("source", "assigned")}, ensure_ascii=False, separators=(",", ":")) for r in rec.get("roles", []))
    kind = rec.get("no_role_kind")
    kind_js = "null" if not kind else json.dumps(kind)
    lines.append(f"  {json.dumps(name)}: {{ roles: [{roles}], noRoleKind: {kind_js} }},")

cov = data.get("coverage", {})
text = f"""/**
 * 技能 → 岗位 归位表（**构建产物，不要手改**）。
 *
 * 由 `python3 scripts/build_role_map.py` 从 `manifest/role-assignments.json` 生成。
 * 判定口径、证据与覆盖度都在那份 manifest 里；本文件只是把它变成宿主可 import 的形状。
 *
 * 注意：这是**归位**（这个技能属于哪些岗位），不是**接线**（preset 实际挂载了哪些技能）。
 * 接线名单来自 `~/.dsh/.agent-presets/agt-NNN/manifest.json` 的 `x_lute.skills.subset`，
 * 两件事在页面上分开显示。
 */

/** 技能名 → {{ roles: [{{id, source}}], noRoleKind }}；source ∈ skill-map | assigned。 */
export const ROLE_ASSIGNMENTS = {{
{chr(10).join(lines)}
}};

/** 覆盖面计数，供页面页脚与验收脚本回溯（数字由 manifest 决定，不在这里重算）。 */
export const ROLE_ASSIGNMENT_META = {json.dumps({
    "skills": cov.get("skills"),
    "withRoles": cov.get("with_roles"),
    "withoutRoles": cov.get("without_roles"),
    "roleIdsWithSupply": cov.get("role_ids_with_supply"),
}, ensure_ascii=False)};
"""

if CHECK:
    if not os.path.exists(OUT):
        sys.exit(f"✗ {OUT} 不存在：先跑 python3 scripts/build_role_map.py")
    if open(OUT, encoding="utf-8").read() != text:
        sys.exit(f"✗ {OUT} 与 manifest/role-assignments.json 不一致：重跑 python3 scripts/build_role_map.py")
    print(f"✓ {os.path.relpath(OUT, ROOT)} 与 manifest 一致（{len(skills)} 条）")
    sys.exit(0)

open(OUT, "w", encoding="utf-8").write(text)
print(f"✓ 写入 {os.path.relpath(OUT, ROOT)}（{len(skills)} 条技能）")
