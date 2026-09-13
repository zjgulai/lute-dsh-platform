#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""归位判定的**语义校验器** —— 回答「这份判定是不是真的」，而不只是「它有没有变形」。

## 为什么它必须存在（R4）

包内原本只有 `scripts/build_role_map.py --check`，它断言的是
**「`lib/role-map.js` 是 `manifest/role-assignments.json` 的精确投影」**。
那是一条**一致性**断言：两边一致，它就绿。而页面所有数字的上游是
「329 条挂载 + 逐条逐字证据」——`evidence.from_skill` 一旦被改写成一句
**论文里、技能原文里都不存在**的话，`--check` 会照样绿，因为它比对的是
导出物与源文件，**不是源文件与事实**。

这个脚本只做后者。判定规则与 `paper2skills` 侧的「门禁必须先自证可信」同源：
每条判据都要能被一份构造样本打红（见 `--selftest`）。

## 判据（全部确定性，无模型参与）

| # | 判据 | 打的是什么 |
|---|------|-----------|
| J1 | 词表：`roles[].id` ∈ 岗位快照；`responsibility` **逐字**属于该岗三条之一 | 凭印象写责任名 |
| J2 | 证据：`evidence.from_skill` / `from_role` 必须是两侧原文的**连续子串** | 伪造/拼接证据 |
| J3 | 置信：`confidence` ∈ {high,medium,low}；**≥3 岗不得 high** | 多岗硬凑还标高置信 |
| J4 | 无岗：`roles` 为空 ⇒ 必须给合法 `no_role_kind` + 非空 `no_role_reason`；反之二者必须为空 | 静默丢卡 / 无岗伪装成有岗 |
| J5 | 去重：同一技能不得重复挂同一岗位 | 重复计入行数 |
| J6 | 删除留痕：`dropped[].id` 必须指向真实岗位且带 reason | 静默删掉既有映射 |

## ⚠️ 覆盖率是一等输出（本仓库的既有纪律）

`from_skill` 只在**技能证据语料覆盖到的条目**上可判。脚本**先报覆盖率**，
覆盖不到的按「不可复核」单独计数 —— **绝不计入通过**。
（原型：`paper2skills-research/scripts/registry_consistency.py` 的前身
静默跳过了 3 条记录却报「无不一致」。）

## 用法

    python3 scripts/validate_assignments.py              # 全量校验
    python3 scripts/validate_assignments.py --json-out x.json
    python3 scripts/validate_assignments.py --check-roles-live   # 快照 vs 运行时 preset 漂移
    python3 scripts/validate_assignments.py --selftest   # 用构造样本自证 6 条判据都会红

退出码：0 = 全部可复核项通过且覆盖率为 100%；1 = 有判据失败；2 = **语料缺失/为空**
（「没东西可查」不等于「查过了没问题」）。
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "manifest" / "role-assignments.json"
ROLE_RECORDS = ROOT / "manifest" / "role-records.json"
CORPUS = ROOT / "manifest" / "skill-evidence-corpus.json"

CONFIDENCE = ("high", "medium", "low")
NO_ROLE_KINDS = ("GENERIC_METHOD", "TOOL_ONLY", "OUT_OF_SCOPE", "OTHER")
# 证据引文的形式约束（沿用原一次性脚本的口径：短、单行、不含引号/反引号）
Q_MIN, Q_MAX = 4, 30

# ⚠️ 岗位快照与运行时读取**必须用同一份字段表**。
#    第一版把它们各写一遍（快照多一个 `group`），于是 `--check-roles-live`
#    报「50/50 全部漂移」—— 那不是 preset 变了，是**两个读取点口径不一致**。
#    与本仓库 K1 的 `ORPHAN_DEP`/`MIGRATED_DEP` 用两套索引同族：判据只能有一处。
ROLE_FIELDS = ("alias", "title", "mission", "skills", "artifact", "boundary", "group")


# ---------------------------------------------------------------------------
# 判据实现（纯函数，便于 --selftest 直接喂构造样本）
# ---------------------------------------------------------------------------
def role_text(rec: dict) -> str:
    """岗位原文 —— 与判定时用的那几段一致（mission / artifact / 三条责任 / alias / title / boundary）。"""
    parts = [rec.get("mission") or "", rec.get("artifact") or ""]
    parts += list(rec.get("skills") or [])
    parts += [rec.get("alias") or "", rec.get("title") or "", rec.get("boundary") or ""]
    return "\n".join(parts)


def skill_text(corpus_rec: dict) -> str:
    return "\n".join([corpus_rec.get("title") or "", corpus_rec.get("summary_zh") or "",
                      corpus_rec.get("description") or "", corpus_rec.get("body_excerpt") or ""])


def check_quote_form(q: str) -> str | None:
    """返回不合规的原因；合规返回 None。"""
    if not q:
        return "为空"
    if not (Q_MIN <= len(q) <= Q_MAX):
        return f"长度 {len(q)} 不在 {Q_MIN}–{Q_MAX}"
    if "\n" in q:
        return "含换行"
    if '"' in q or "`" in q:
        return "含引号/反引号"
    return None


def validate(manifest: dict, records: dict, corpus: dict) -> dict:
    """对整份归位表跑 J1–J6，返回 findings 与**覆盖率**。"""
    findings: list[dict] = []
    warnings: list[dict] = []
    stat = {"skills": 0, "with_roles": 0, "without_roles": 0, "mounts": 0}
    cov = {"from_skill_total": 0, "from_skill_checkable": 0,
           "from_role_total": 0, "from_role_checkable": 0,
           "responsibility_total": 0, "responsibility_checkable": 0,
           "skill_missing_in_corpus": [], "role_missing_in_records": []}

    def bad(code, card, detail):
        findings.append({"code": code, "card": card, "detail": detail})

    def warn(code, card, detail):
        warnings.append({"code": code, "card": card, "detail": detail})

    for name, e in sorted(manifest.get("skills", {}).items()):
        stat["skills"] += 1
        recs = e.get("roles") or []
        stat["mounts"] += len(recs)
        stat["with_roles" if recs else "without_roles"] += 1

        # --- J5 去重 ---
        ids = [r.get("id") for r in recs]
        dup = {i for i in ids if ids.count(i) > 1}
        for i in sorted(dup):
            bad("J5-DUP-ROLE", name, f"同一技能重复挂 {i}")

        # --- J4 无岗/有岗的字段互斥 ---
        if not recs:
            if e.get("no_role_kind") not in NO_ROLE_KINDS:
                bad("J4-NO-ROLE-KIND", name, f"无岗却给非法分型 {e.get('no_role_kind')!r}")
            if not (e.get("no_role_reason") or "").strip():
                bad("J4-NO-ROLE-REASON", name, "无岗却未写 no_role_reason")
        else:
            if e.get("no_role_kind") is not None:
                bad("J4-KIND-ON-ASSIGNED", name,
                    f"有岗却仍写着 no_role_kind={e.get('no_role_kind')!r}（两种状态混在一起）")
            if e.get("no_role_reason") is not None:
                bad("J4-REASON-ON-ASSIGNED", name, "有岗却仍写着 no_role_reason")

        # --- J6 删除留痕 ---
        for d in (e.get("dropped") or []):
            if d.get("id") not in records:
                bad("J6-DROP-UNKNOWN", name, f"dropped 指向未知岗位 {d.get('id')!r}")
            if not (d.get("reason") or "").strip():
                bad("J6-DROP-NO-REASON", name, f"删除 {d.get('id')} 未写理由")

        # --- J3 多岗不得 high ---
        if len(recs) >= 3:
            for r in recs:
                if r.get("confidence") == "high":
                    bad("J3-MULTI-HIGH", name,
                        f"{len(recs)} 个岗位却把 {r.get('id')} 标成 high")

        s_corpus = corpus.get(name)
        if s_corpus is None and recs:
            cov["skill_missing_in_corpus"].append(name)
        stext = skill_text(s_corpus) if s_corpus else None

        for r in recs:
            rid = r.get("id")
            # --- J1 词表 ---
            rec = records.get(rid)
            if rec is None:
                bad("J1-UNKNOWN-ROLE", name, f"未知岗位 {rid!r}")
                if rid not in cov["role_missing_in_records"]:
                    cov["role_missing_in_records"].append(rid)
            resp = r.get("responsibility")
            if rec is not None:
                cov["responsibility_total"] += 1
                if resp:
                    if resp in (rec.get("skills") or []):
                        cov["responsibility_checkable"] += 1
                    else:
                        bad("J1-RESP-NOT-IN-ROLE", f"{name}/{rid}",
                            f"责任名 {resp!r} 不在该岗三条之内 {(rec.get('skills') or [])}")
                else:
                    # ⚠️ 空责任名**分两种**，不能一刀切判红（2026-09-13 由实测发现）：
                    # 实测 `handoff/AGT-049` 的 responsibility 是空的，而它自己的 `note`
                    # 写明了理由：「只对上使命层的『任务状态可解释并能接管恢复』；
                    # 运行监测/容量管理/失败恢复三条责任名都不字面成立，故留空」——
                    # **这是诚实标注，不是缺陷**。判红会制造假红灯，
                    # 而假红灯会推着人去「修」一个本来就对的东西（本仓库的既有教训）。
                    # ⇒ 有说明 ⇒ 🟡 待人工确认；**没说明 ⇒ 🔴**（那才是这条规则要抓的静默漏填）。
                    note = (r.get("note") or "").strip()
                    if note:
                        warn("W1-RESP-EMPTY-EXPLAINED", f"{name}/{rid}",
                             f"责任名为空但已写明理由（{note[:60]}…）—— 待人工确认，不判失败")
                    else:
                        bad("J1-RESP-EMPTY-UNEXPLAINED", f"{name}/{rid}",
                            "责任名为空**且未写 note 说明** —— 无法判断是漏填还是有意留白")

            if r.get("confidence") not in CONFIDENCE:
                bad("J3-BAD-CONFIDENCE", f"{name}/{rid}", f"confidence 非法 {r.get('confidence')!r}")

            # --- J2 证据 ---
            ev = r.get("evidence") or {}
            for key, text, label in (("from_skill", stext, "技能原文"),
                                     ("from_role", role_text(rec) if rec else None, "岗位原文")):
                q = ev.get(key) or ""
                total_key = f"{key}_total"
                cov[total_key] += 1
                if text is None:
                    continue                      # 源头缺失 → 只计不可复核，不计通过
                reason = check_quote_form(q)
                if reason:
                    bad("J2-FORM", f"{name}/{rid}", f"{key} 形式不合规（{reason}）：{q!r}")
                    continue
                if q not in text:
                    bad("J2-NOT-SUBSTRING", f"{name}/{rid}",
                        f"{key} 不是{label}的连续子串（疑似伪造/拼接）：{q!r}")
                else:
                    cov[f"{key}_checkable"] += 1

    return {"findings": findings, "warnings": warnings, "stats": stat, "coverage": cov}


# ---------------------------------------------------------------------------
# 数据装载
# ---------------------------------------------------------------------------
def load_inputs() -> tuple[dict, dict, dict]:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    rr = json.loads(ROLE_RECORDS.read_text(encoding="utf-8"))
    cp = json.loads(CORPUS.read_text(encoding="utf-8"))
    return manifest, rr["roles"], cp["skills"]


def roles_live() -> dict:
    """运行时 preset 里的岗位词表（页面自己读的那份，见 lib/preset-roles.js）。"""
    out = {}
    for d in sorted(glob.glob(os.path.expanduser("~/.dsh/.agent-presets/agt-*"))):
        mp = Path(d) / "manifest.json"
        if not mp.is_file():
            continue
        m = json.loads(mp.read_text(encoding="utf-8"))
        r = ((m.get("material") or {}).get("role_catalog") or {}).get("record")
        if isinstance(r, dict):
            out[str(r.get("id") or "").upper()] = {k: r.get(k) for k in ROLE_FIELDS}
    return out


# ---------------------------------------------------------------------------
# 自检：用构造样本证明六条判据都会红
# ---------------------------------------------------------------------------
def _selftest() -> int:
    """用构造样本证明六条判据**各自**会打红，且合规样本不误报。

    设计纪律：**一条样本只申明它要打的那组码**。
    第一版把多条判据搅在一份样本里，于是 J3 用例实得 4 条码 ——
    `ok = codes == [expect]` 判红。那是**样本脏**，不是判据坏：
    测 J3 就必须让 J1/J2 在该样本上全部成立，否则测到的是别的东西。
    """
    records = {
        # ⚠️ 001/002/003 的 mission/artifact/skills 刻意相同：J3 要构造「一技挂 3 岗」，
        #    就必须让同一份 evidence 在三个岗位上都合法。
        **{rid: {"alias": f"别{rid[-1]}", "title": "经营目标与资源统筹",
                 "mission": "把经营目标转成资源方案", "artifact": "目标与资源决策包",
                 "skills": ["经营目标拆解", "资源情景比较", "月度经营复盘"],
                 "boundary": "预算调整需走既定审批。"}
           for rid in ("AGT-001", "AGT-002", "AGT-003")},
    }
    corpus = {"good-skill": {"title": "好技能", "summary_zh": "做经营目标拆解与资源情景比较",
                             "description": "支持经营目标拆解与资源情景比较。",
                             "body_excerpt": "月度经营复盘。"}}

    def mk(name, roles, **kw):
        e = {"catalog": "overseas", "scenario": "a-market", "sub": "a1",
             "roles": roles, "no_role_kind": None, "no_role_reason": None}
        e.update(kw)
        # ⚠️ 必须包一层 `{"skills": …}` —— `validate` 读的是 `manifest["skills"]`。
        #    第一版直接返回 `{name: e}`，于是**每条样本都零 findings**，
        #    自检把「判据恒真」误报成了「基准通过、其余待查」。
        return {"skills": {name: e}}

    good = {"id": "AGT-001", "responsibility": "经营目标拆解", "source": "assigned",
            "confidence": "medium",
            "evidence": {"from_skill": "经营目标拆解", "from_role": "经营目标拆解"}}

    T: list[tuple[str, dict, list[str], list[str]]] = []   # (说明, manifest, 期望红, 期望黄)

    T.append(("基准：合规样本（红黄都必须为空）", mk("good-skill", [good]), [], []))
    T.append(("J1 责任名不属该岗三条",
              mk("good-skill", [dict(good, responsibility="渠道拓展")]),
              ["J1-RESP-NOT-IN-ROLE"], []))
    T.append(("J1 未知岗位 id", mk("good-skill", [dict(good, id="AGT-999")]),
              ["J1-UNKNOWN-ROLE"], []))
    T.append(("J2 技能证据不是原文子串（伪造）",
              mk("good-skill", [dict(good, evidence={
                  "from_skill": "一句话总结五种方法", "from_role": "经营目标拆解"})]),
              ["J2-NOT-SUBSTRING"], []))
    T.append(("J2 岗位证据形式不合规（跨行）",
              mk("good-skill", [dict(good, evidence={
                  "from_skill": "经营目标拆解",
                  "from_role": "把经营目标转成资源方案\n第二行"})]),
              ["J2-FORM"], []))
    # ⚠️ 拼接：两个碎片各自都在原文里，但**拼起来**不是连续子串
    T.append(("J2 拼接证据（两碎片都在原文里，拼起来不是）",
              mk("good-skill", [dict(good, evidence={
                  "from_skill": "经营目标拆解与商品分层", "from_role": "经营目标拆解"})]),
              ["J2-NOT-SUBSTRING"], []))

    three_high = [dict(good, id=i, confidence="high") for i in ("AGT-001", "AGT-002", "AGT-003")]
    T.append(("J3 ≥3 岗却标 high", mk("good-skill", three_high), ["J3-MULTI-HIGH"], []))
    # 反向：同样三岗但都不标 high → 必须**不**报，否则 J3 退化成「多岗即报」
    three_ok = [dict(good, id=i, confidence="medium") for i in ("AGT-001", "AGT-002", "AGT-003")]
    T.append(("J3 反向：≥3 岗但都不是 high（不得报）", mk("good-skill", three_ok), [], []))
    T.append(("J3 confidence 非法", mk("good-skill", [dict(good, confidence="中")]),
              ["J3-BAD-CONFIDENCE"], []))

    # J4 四条各自独立可打红
    T.append(("J4 无岗却无分型",
              mk("good-skill", [], no_role_kind=None, no_role_reason="有理由"),
              ["J4-NO-ROLE-KIND"], []))
    T.append(("J4 无岗却无理由",
              mk("good-skill", [], no_role_kind="TOOL_ONLY", no_role_reason="  "),
              ["J4-NO-ROLE-REASON"], []))
    T.append(("J4 有岗却仍留 no_role_kind（两态混淆）",
              mk("good-skill", [good], no_role_kind="TOOL_ONLY"),
              ["J4-KIND-ON-ASSIGNED"], []))
    T.append(("J4 有岗却仍留 no_role_reason（两态混淆）",
              mk("good-skill", [good], no_role_reason="当初没岗"),
              ["J4-REASON-ON-ASSIGNED"], []))
    T.append(("J4 无岗样本基线（合法分型+理由 ⇒ 不得报）",
              mk("good-skill", [], no_role_kind="TOOL_ONLY", no_role_reason="工具型，不产出岗位产物"),
              [], []))

    # ⚠️ 空责任名的**两种**结局必须分开可测（2026-09-13 由实测 handoff/AGT-049 发现）
    T.append(("W1 责任名为空但已写明理由（🟡 待确认，不判失败）",
              mk("good-skill", [dict(good, responsibility="",
                                     note="三条责任名都不字面成立，故留空")]),
              [], ["W1-RESP-EMPTY-EXPLAINED"]))
    T.append(("J1 责任名为空且无任何说明（🔴 静默漏填）",
              mk("good-skill", [dict(good, responsibility="", note="")]),
              ["J1-RESP-EMPTY-UNEXPLAINED"], []))

    T.append(("J5 同岗重复挂载", mk("good-skill", [good, dict(good)]), ["J5-DUP-ROLE"], []))
    T.append(("J6 dropped 指向未知岗位",
              mk("good-skill", [good], dropped=[{"id": "AGT-888", "reason": "不匹配"}]),
              ["J6-DROP-UNKNOWN"], []))
    T.append(("J6 dropped 无理由",
              mk("good-skill", [good], dropped=[{"id": "AGT-002", "reason": "  "}]),
              ["J6-DROP-NO-REASON"], []))

    ok = True
    print("--- 判据分辨力（红 = findings，黄 = warnings；每样本只申明它要打的那组）---")
    for desc, man, exp_red, exp_yellow in T:
        rep = validate(man, records, corpus)
        reds = sorted({f["code"] for f in rep["findings"]})
        yels = sorted({x["code"] for x in rep["warnings"]})
        passed = reds == sorted(exp_red) and yels == sorted(exp_yellow)
        ok = ok and passed
        print(("✅" if passed else "❌") + f" {desc:44s} 期望 红{exp_red or '—'} 黄{exp_yellow or '—'}"
              f" ｜ 实得 红{reds or '—'} 黄{yels or '—'}")

    # --- 覆盖率不得冒充通过 ---
    print("\n--- 覆盖率口径 ---")
    man = mk("good-skill", [good])
    man["skills"]["corpus-less-skill"] = {
        "roles": [dict(good)], "no_role_kind": None, "no_role_reason": None,
        "catalog": "overseas", "scenario": "a-market", "sub": "a1"}
    c = validate(man, records, corpus)["coverage"]
    cov_ok = (c["from_skill_total"] == 2 and c["from_skill_checkable"] == 1
              and "corpus-less-skill" in c["skill_missing_in_corpus"])
    print(("✅" if cov_ok else "❌") +
          " 语料覆盖不到的技能计入「不可复核」而不计入通过"
          f"（from_skill {c['from_skill_checkable']}/{c['from_skill_total']} 可复核）")
    ok = ok and cov_ok

    # --- 空输入必须判失败（「没东西可查」≠「没问题」）---
    empty_ok = _empty_inputs_exit_code() == 2
    print(("✅" if empty_ok else "❌") + " 输入为空时退出码 2（而不是 0）")
    ok = ok and empty_ok

    print()
    print("SELFTEST " + ("PASS —— 六条判据各自可打红、合规样本不误报、覆盖率口径不冒充通过"
                        if ok else "FAIL —— 判据静默失效，勿信其绿灯"))
    return 0 if ok else 1

def _empty_inputs_exit_code() -> int:
    """把语料换成空对象跑一遍 CLI 路径，取退出码。"""
    import subprocess
    import tempfile
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        (td / "m.json").write_text(json.dumps({"skills": {}}), encoding="utf-8")
        (td / "r.json").write_text(json.dumps({"roles": {}}), encoding="utf-8")
        (td / "c.json").write_text(json.dumps({"skills": {}}), encoding="utf-8")
        p = subprocess.run([sys.executable, str(Path(__file__).resolve()),
                            "--manifest", str(td / "m.json"), "--records", str(td / "r.json"),
                            "--corpus", str(td / "c.json"), "--quiet"],
                           capture_output=True, text=True, timeout=120)
        return p.returncode


# ---------------------------------------------------------------------------
def main() -> int:
    ap = argparse.ArgumentParser(description="归位判定的语义校验器（R4）")
    ap.add_argument("--manifest", type=Path, default=MANIFEST)
    ap.add_argument("--records", type=Path, default=ROLE_RECORDS)
    ap.add_argument("--corpus", type=Path, default=CORPUS)
    ap.add_argument("--json-out", type=Path)
    ap.add_argument("--check-roles-live", action="store_true",
                    help="比对岗位快照与运行时 preset，报告漂移（不改任何文件）")
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    if args.selftest:
        return _selftest()

    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    records = json.loads(args.records.read_text(encoding="utf-8"))["roles"]
    corpus = json.loads(args.corpus.read_text(encoding="utf-8"))["skills"]

    if args.check_roles_live:
        live = roles_live()
        if not live:
            print("✗ 读不到运行时 preset（~/.dsh/.agent-presets/agt-*）—— 无法比对，按失败处理")
            return 2
        drift = []
        for rid in sorted(set(records) | set(live)):
            a, b = records.get(rid), live.get(rid)
            if a is None:
                drift.append(f"{rid}: 快照缺失，运行时已有")
            elif b is None:
                drift.append(f"{rid}: 运行时缺失，快照仍有")
            elif a != b:
                diff = [k for k in set(a) | set(b) if a.get(k) != b.get(k)]
                drift.append(f"{rid}: 字段漂移 {diff}")
        print(f"岗位快照 {len(records)} 条 / 运行时 {len(live)} 条 → 漂移 {len(drift)} 条")
        for d in drift[:20]:
            print("  ⚠", d)
        return 1 if drift else 0

    # ⚠️ 空语料不是「通过」：没东西可查 ≠ 查过了没问题
    if not manifest.get("skills") or not records or not corpus:
        print(f"✗ 输入为空（manifest {len(manifest.get('skills', {}))} 条 / "
              f"岗位 {len(records)} 条 / 语料 {len(corpus)} 条）—— 拒绝给出结论")
        return 2

    rep = validate(manifest, records, corpus)
    f, w = rep["findings"], rep["warnings"]
    s, c = rep["stats"], rep["coverage"]
    by_code: dict[str, int] = {}
    for x in f:
        by_code[x["code"]] = by_code.get(x["code"], 0) + 1

    if not args.quiet:
        print(f"技能 {s['skills']} 条（有岗 {s['with_roles']} / 无岗 {s['without_roles']}）"
              f"，挂载 {s['mounts']} 条")
        print(f"可复核率："
              f"责任名 {c['responsibility_checkable']}/{c['responsibility_total']}"
              f" · 技能证据 {c['from_skill_checkable']}/{c['from_skill_total']}"
              f" · 岗位证据 {c['from_role_checkable']}/{c['from_role_total']}")
        if c["skill_missing_in_corpus"]:
            print(f"⚠️ 语料未覆盖 {len(c['skill_missing_in_corpus'])} 条技能，"
                  f"其证据**按不可复核计**（不计入通过）：{c['skill_missing_in_corpus'][:5]}")
        if c["role_missing_in_records"]:
            print(f"⚠️ 岗位快照缺失 {c['role_missing_in_records'][:5]}")
        if w:
            print(f"\n🟡 待人工确认 {len(w)} 条：")
            for x in w:
                print(f"  🟡 [{x['code']}] {x['card']}: {x['detail']}")
        if f:
            print(f"\n✗ 判据失败 {len(f)} 条：" + "；".join(f"{k}×{v}" for k, v in sorted(by_code.items())))
            for x in f[:40]:
                print(f"  ✗ [{x['code']}] {x['card']}: {x['detail']}")
            if len(f) > 40:
                print(f"  … 另有 {len(f) - 40} 条")
        else:
            print("\n✓ 六条判据全部通过")

    # ⚠️ 「全部通过」只在**覆盖率为 100%** 时才敢说 —— 否则只敢说「查到的那部分通过」
    total = c["from_skill_total"] + c["from_role_total"] + c["responsibility_total"]
    checkable = (c["from_skill_checkable"] + c["from_role_checkable"]
                 + c["responsibility_checkable"])
    full = total > 0 and checkable == total
    if not args.quiet:
        print(f"复核覆盖 {checkable}/{total}"
              + ("（100%，结论覆盖全部断言）" if full
                 else "（**未达 100%：结论只覆盖被复核到的那部分**）"))

    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(json.dumps(
            {"findings": f, "warnings": w, "stats": s, "coverage": c,
             "coverage_full": full,
             "note": "coverage 是一等输出：未被语料覆盖的证据按「不可复核」计数，绝不计入通过。"},
            ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"JSON → {args.json_out}")

    return 1 if f else 0


if __name__ == "__main__":
    sys.exit(main())
