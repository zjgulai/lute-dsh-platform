#!/usr/bin/env python3
"""把 cards.json 里所有 arXiv ID 全量核验一遍（只读源数据，产物落 .scratch）。

分两段：
  1) harvest —— 批量打 arXiv API，原始 Atom XML 原样落盘（可重入：已有的批次跳过）
  2) parse   —— 解析成 id → {title, abstract, categories, published}

限流处理：arXiv API 会返回 503 / "Rate exceeded"，脚本按 3s 起步、指数退避重试。
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(ROOT, "arxiv", "raw")
CARDS = ("/Users/lute/project/Magpie-Horch/packages/capabilities/dsh-paper2skills/"
         "generated/cards.json")
UA = "p2s-provenance-audit/1.0 (local read-only audit)"
BATCH = 40


def all_ids() -> list[str]:
    cards = json.load(open(CARDS, encoding="utf-8"))["cards"]
    seen: dict[str, None] = {}
    for c in cards:
        s = (c["sections"].get("8. 论文来源") or "").strip()
        for g in re.findall(r"\d{4}\.\d{4,5}", s):
            seen.setdefault(g, None)
    return sorted(seen)


def harvest() -> int:
    os.makedirs(RAW, exist_ok=True)
    ids = all_ids()
    batches = [ids[i:i + BATCH] for i in range(0, len(ids), BATCH)]
    print(f"唯一 ID {len(ids)}　批次 {len(batches)}　每批 {BATCH}", flush=True)
    done = 0
    for n, b in enumerate(batches):
        out = os.path.join(RAW, f"{n:03d}.xml")
        if os.path.exists(out) and os.path.getsize(out) > 400:
            done += 1
            continue
        url = ("https://export.arxiv.org/api/query?id_list=" + ",".join(b)
               + f"&max_results={len(b)}")
        for attempt in range(6):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": UA})
                body = urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "replace")
                if "Rate exceeded" in body[:200] or len(body) < 400:
                    raise RuntimeError(f"rate limited ({len(body)} B)")
                with open(out, "w", encoding="utf-8") as fh:
                    fh.write(body)
                done += 1
                print(f"  [{n + 1}/{len(batches)}] {len(b)} ID → {len(body)} B", flush=True)
                break
            except Exception as e:  # noqa: BLE001
                wait = 5 * (2 ** attempt)
                print(f"  [{n + 1}/{len(batches)}] 第 {attempt + 1} 次失败：{e}；等 {wait}s",
                      flush=True)
                time.sleep(wait)
        else:
            print(f"  [{n + 1}/{len(batches)}] 放弃", flush=True)
        time.sleep(3)
    print(f"harvest 完成：{done}/{len(batches)} 批", flush=True)
    return 0 if done == len(batches) else 1


def parse() -> int:
    import html as _html

    out_path = os.path.join(ROOT, "arxiv", "metadata.json")
    meta: dict[str, dict] = {}
    for f in sorted(os.listdir(RAW)):
        if not f.endswith(".xml"):
            continue
        t = open(os.path.join(RAW, f), encoding="utf-8").read()
        for m in re.finditer(r"<entry>(.*?)</entry>", t, re.S):
            e = m.group(1)
            aid = re.search(r"<id>https?://arxiv\.org/abs/([^<]+)</id>", e)
            if not aid:
                continue
            key = aid.group(1).split("v")[0]
            # Atom 是 XML：标题/摘要里的 & < > 是实体，必须解，否则会原样进卡片
            # （实测 `Fast&amp;Focused-Net`）
            ti = re.search(r"<title>(.*?)</title>", e, re.S)
            su = re.search(r"<summary>(.*?)</summary>", e, re.S)
            meta[key] = {
                "title": _html.unescape(" ".join(ti.group(1).split())) if ti else "",
                "abstract": _html.unescape(" ".join(su.group(1).split())) if su else "",
                "categories": re.findall(r'term="([^"]+)"', e),
                "published": (re.search(r"<published>([^<]+)</published>", e) or [None, ""])[1]
                if re.search(r"<published>([^<]+)</published>", e) else "",
            }
    json.dump(meta, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"解析出 {len(meta)} 篇论文 → {out_path}")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("stage", choices=["ids", "harvest", "parse"])
    a = ap.parse_args()
    if a.stage == "ids":
        ids = all_ids()
        print(f"{len(ids)} 个唯一 ID")
    sys.exit(harvest() if a.stage == "harvest" else parse() if a.stage == "parse" else 0)
