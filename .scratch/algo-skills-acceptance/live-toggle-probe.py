#!/usr/bin/env python3
"""Exercise the ONLY write path of the algo-skills plugin against the LIVE host.

Why this exists: `routes.spec.ts` drives `toggle` with a fake TreeSource, and
`corpus-write.spec.ts` reads the real corpus *without writing anything*. So the
combination "real process + real trust fence + real 1338-file corpus + real
cache invalidation + real write" was never run end to end. It is also the one
route a user can trigger with a single click, so a failure here is the first
thing they would hit.

Safety: one card is toggled off -> on -> back. The original bytes are held in
memory and compared by sha256; if anything at all differs at the end the file
is restored from the backup. Read-only for every other file.

Usage:  python3 live-toggle-probe.py [base-url]
Exit 0 = every expectation held AND the corpus is byte-identical to the start.
"""

import hashlib
import json
import os
import sys
import urllib.error
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:43120"
SKILLS = os.path.expanduser("~/.dsh/skills")
CARD = "p2s-a-mem-agentic-memory-system"
FILE = os.path.join(SKILLS, CARD, "SKILL.md")

results = []


def check(label, got, want):
    ok = got == want
    results.append(ok)
    print(f"{'PASS' if ok else 'FAIL'}  {label}\n        got  = {got!r}\n        want = {want!r}")


def call(path, method="GET", body=None):
    """Return (status, parsed-json-or-text)."""
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        BASE + path, data=data, method=method,
        headers={"content-type": "application/json"} if data else {})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            status = r.status
    except urllib.error.HTTPError as e:
        raw, status = e.read(), e.code
    try:
        return status, json.loads(raw)
    except Exception:
        return status, raw.decode("utf8", "replace")


def sha(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def find_card(payload, name):
    """Locate a card row anywhere in the tree, plus where it sits."""
    for plane in payload["planes"]:
        for domain in plane["domains"]:
            for role in domain["roles"]:
                for card in role["skills"]:
                    if card["name"] == name:
                        return card, f"{plane['name']} / {domain['name']} / {role['agt']}"
    for card in payload["unplaced"]:
        if card["name"] == name:
            return card, "unplaced"
    return None, None


def flag(text):
    """Read the raw on-disk spelling of disable-model-invocation."""
    for line in text.splitlines():
        if line.startswith("disable-model-invocation:"):
            return line.split(":", 1)[1].strip()
    return None


print(f"host      : {BASE}")
print(f"probe card: {CARD}")
print(f"file      : {FILE}\n")

original_bytes = open(FILE, "rb").read()
original_sha = hashlib.sha256(original_bytes).hexdigest()
original_text = original_bytes.decode("utf8")
backup = "/tmp/algo-live-toggle-backup.md"
with open(backup, "wb") as f:
    f.write(original_bytes)
print(f"backup    : {backup}")
print(f"sha256    : {original_sha}")
print(f"on disk   : disable-model-invocation: {flag(original_text)}\n")

try:
    # ---- 0. the card is where the tree says it is --------------------------
    status, tree = call("/api/dsh-algo-skills/tree")
    check("GET tree -> 200", status, 200)
    card, where = find_card(tree, CARD)
    check("probe card is in the payload", card is not None, True)
    print(f"        filed under: {where}")
    check("card starts disabled", card["modelEnabled"], False)

    # ---- 1. flip it on (the real click) ------------------------------------
    status, body = call("/api/dsh-algo-skills/toggle", "POST", {"name": CARD, "enabled": True})
    check("POST toggle enabled=true -> 200 {ok:true}", (status, body),
          (200, {"ok": True, "name": CARD, "enabled": True}))

    after = open(FILE, "rb").read()
    check("frontmatter now reads false", flag(after.decode("utf8")), "false")
    check("body bytes untouched (only the flag moved)",
          after.decode("utf8").split("---", 2)[2], original_text.split("---", 2)[2])

    # cache invalidation: no sleep, no restart — the very next read must show it
    status, tree2 = call("/api/dsh-algo-skills/tree")
    card2, _ = find_card(tree2, CARD)
    check("tree reflects the write immediately (cache dropped)", card2["modelEnabled"], True)

    # ---- 2. flip it back ---------------------------------------------------
    status, body = call("/api/dsh-algo-skills/toggle", "POST", {"name": CARD, "enabled": False})
    check("POST toggle enabled=false -> 200", status, 200)
    check("file is byte-identical to the start", sha(FILE), original_sha)

    # ---- 3. the fence, from the live process -------------------------------
    status, body = call("/api/dsh-algo-skills/toggle", "POST", {"name": "agent-browser", "enabled": True})
    check("a hand-authored neighbour is refused (400)", (status, body.get("error")),
          (400, "invalid name"))

    status, body = call("/api/dsh-algo-skills/toggle", "POST", {"name": "p2s-no-such-card-here", "enabled": True})
    check("an unknown p2s name is 404, not 400", (status, body.get("error")), (404, "not found"))

    status, body = call("/api/dsh-algo-skills/toggle", "POST", {"name": "../../.credentials", "enabled": True})
    check("traversal is refused", (status, body.get("error")), (400, "invalid name"))

    status, body = call("/api/dsh-algo-skills/toggle")
    check("GET on toggle -> 405", status, 405)

    status, body = call("/api/dsh-algo-skills/tree", "POST", {})
    check("POST on tree -> 405", status, 405)

    status, body = call("/api/dsh-algo-skills/health")
    check("health still 200 after all of it", (status, body.get("ok")), (200, True))

finally:
    # ---- 4. leave no trace -------------------------------------------------
    final_sha = sha(FILE)
    if final_sha != original_sha:
        with open(FILE, "wb") as f:
            f.write(original_bytes)
        print(f"\nRESTORED from backup (was {final_sha[:16]}…)")
        final_sha = sha(FILE)
    print(f"\ncorpus unchanged: {final_sha == original_sha}  ({final_sha[:16]}…)")

ok = all(results) and final_sha == original_sha
print(f"\n{'PASS' if ok else 'FAIL'} — {sum(results)}/{len(results)} checks"
      f"{' + corpus byte-identical' if final_sha == original_sha else ' + CORPUS DIRTY'}")
sys.exit(0 if ok else 1)
