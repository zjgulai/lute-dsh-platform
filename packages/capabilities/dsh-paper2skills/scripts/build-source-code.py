#!/usr/bin/env python3
"""build-source-code.py — 从 vault 的 git 明文恢复每张卡的**完整实现代码**。

为什么需要它
------------
卡页 ⑦ 段是**代码预览节选**（源站自述上限 60 行，见 `data/code-availability.json`）。
上一轮据此判过「完整实现已丢失」——**那个判断是错的**：完整实现一直在 vault 卡里，
只是 iCloud 工作区的 1,353 个 `.md` 自 2026-07 起被改写成了二进制容器，
所以只看工作区就什么都看不到。

本脚本**一律经 `git cat-file` 从历史取明文，绝不读工作区**——
真读到工作区那份，会在 `looks_like_container()` 处响亮失败，而不是静默产出一堆二进制。

选取口径（以卡面节选为 oracle）
------------------------------
vault 卡里可能有多个代码围栏。卡页发布的那一段，其正文**就是**某个围栏的开头
（实测 1,262 张的偏移恒为第 1 行）。因此逐个围栏做「节选是否为该围栏的连续行前缀」判定，
命中即取——这是自校验，不是猜。

**候选是全部围栏，不问语言标注**：源站发布的是卡里第一个块（`Skill-MAS-Orchestrator`
首块就是 ```bash 的 `cd … && python orchestrator.py`）。但交付物是
`references/implementation.py`，所以只有 Python 围栏能当结果；命中非 Python 围栏的
记为 `EXCERPT_MATCHES_NON_PYTHON_FENCE`——那张卡发布的是运行方式，不是实现。

没有节选可作 oracle 时（40 张），退化为「取最长的 **Python** 围栏」，并标 `tier=unverified`：
**不加断言，如实降级**，不混进确证集。

入 / 出
-------
入：$P2S_VAULT_GIT（默认 iCloud 的 paper_to_skills 仓库）、$P2S_VAULT_REV（默认 HEAD）
    generated/cards.json、data/code-availability.json
出：generated/source-code.json（派生，可重建；**含未脱敏原文，不得入库**）
    data/code-recovery.json（入库的小索引：分层、行数、sha256、围栏位次、校验方式）

脱敏不在这里做：出口只有一个，在 lib/secret-scrub.js（装配器与安装器共用）。
"""
from __future__ import annotations

import ast
import hashlib
import json
import os
import re
import subprocess
import sys
from collections import Counter

PKG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS = os.path.join(PKG, 'generated', 'cards.json')
AVAIL = os.path.join(PKG, 'data', 'code-availability.json')
OUT_FULL = os.path.join(PKG, 'generated', 'source-code.json')
OUT_INDEX = os.path.join(PKG, 'data', 'code-recovery.json')

DEFAULT_REPO = os.path.expanduser(
    '~/Library/Mobile Documents/com~apple~CloudDocs/paper_to_skills')
VAULT_REL = 'paper2skills-vault'
SECTION = '7. 代码模板'

#: 围栏**边界行**：行首 ``` + 可选语言标注。
#:
#: 这里曾经是 `r'```[ \t]*(?:python|py)?[ \t]*\r?\n(.*?)```'`，有两个缺陷，
#: 2026-09-12 实测各造成真实损失：
#:  1. 不锚行首 → 前一个围栏的**收尾** ``` 被当成开栏，配对整体错位；
#:     被错位吞掉的开栏再也不会作为候选出现。Skill-Context-Kubernetes-KB-Orchestration
#:     那张卡有 338 行实现，旧正则一个都没取到，卡被判成「源站卡 ≠ vault 卡」。
#:  2. 只认 python/py → ```bash ```yaml ```text 的块完全不进候选，而源站发布的
#:     就是**第一个**块（不问语言）。`Skill-MAS-Orchestrator` 首块是
#:     `cd … && python orchestrator.py` 的 bash 块，于是节选无处可寻。
BOUNDARY_RE = re.compile(r'^[ \t]*```[ \t]*([A-Za-z0-9_+#.-]*)[ \t]*\r?\n', re.M)

#: 能当作 Python 实现交付的语言标注（空标注按 Python 处理，沿用既有口径）。
PY_LANGS = frozenset({'', 'python', 'py', 'py3', 'python3'})

#: 二进制容器的头 3 字节（工作区那份的形态）。读到它说明源取错了。
CONTAINER_MAGIC = b'\x88\x7d\x1c'

#: 覆盖率下限：低于它说明源或口径变了，**响亮失败**而不是静默少恢复。
MIN_ORACLE_CARDS = 1200
#: 确证集里偏移只允许是 1（节选是完整代码的开头）。
EXPECTED_OFFSET = 1

# ── parses=False 的归类：**卡写坏了** 还是 **判据没定出终点** ──────────────
#
# `parses` 只回答「这段能不能跑」，不回答「这段是不是实现」。2026-09-12 实测：
# 20 张 parses=False 里，5 张是卡里的源码本身写坏（终点由围栏唯一确定，取到的
# 就是全部），15 张是无 oracle 时判据定不出终点、把卡正文一起圈了进来。
# 两者要修的地方完全不同，所以在这里分开记，不再每轮重新发现「有 20 张」。
#
# 判据与实测（20/20 无例外）：
#   after<=1 → 被选中的围栏之后只剩收栏，正文终点**唯一确定**，取到多少就是多少
#              → 解析失败只能来自源码本身。
#   after>1  → 终点不唯一，恢复区可能一路吃到卡正文 → 记 WINDOW_TRUNCATED。
DEFECT_WINDOW = 'WINDOW_TRUNCATED'
DEFECT_UNKNOWN = 'UNLABELED'

PAIR_CLOSE = {')': '(', ']': '[', '}': '{'}
CJK_RE = re.compile(r'[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]')
#: 形如 `"key": """` 或 `"key": '''` 的行尾三引号（值是一段多行串）。
TRIPLE_VALUE_RE = re.compile(r':[ \t]*("""|\'\'\')[ \t]*$')


def _control_char_defect(code: str):
    for idx, ch in enumerate(code):
        o = ord(ch)
        if (o < 32 and ch not in '\n\r\t') or o == 127:
            return (idx, ch)
    return None


def scan_delimiters(code: str):
    """字符级括号/三引号扫描（不用 tokenize：它会在更早处就放弃）。

    返回 (种类, 行号, 详情) 或 None。种类 ∈ {BRACKET_MISMATCH, BRACKET_EXTRA_CLOSE,
    BRACKET_UNCLOSED, TRIPLE_QUOTE_UNCLOSED}。
    """
    i, n, line = 0, len(code), 1
    stack: list[tuple[str, int]] = []
    quote, qline = None, 0
    while i < n:
        ch = code[i]
        if ch == '\n':
            line += 1
            if quote and len(quote) == 1:
                quote = None
            i += 1
            continue
        if quote:
            if quote in ('"""', "'''"):
                if code.startswith(quote, i):
                    quote = None
                    i += 3
                    continue
                i += 1
                continue
            if ch == '\\':
                i += 2
                continue
            if ch == quote:
                quote = None
            i += 1
            continue
        if ch == '#':
            j = code.find('\n', i)
            i = n if j < 0 else j
            continue
        if code.startswith('"""', i) or code.startswith("'''", i):
            quote, qline = code[i:i + 3], line
            i += 3
            continue
        if ch in '"\'':
            quote, qline = ch, line
            i += 1
            continue
        if ch in '([{':
            stack.append((ch, line))
            i += 1
            continue
        if ch in ')]}':
            if not stack:
                return ('BRACKET_EXTRA_CLOSE', line, f'多余的 {ch!r}')
            op, oline = stack.pop()
            if op != PAIR_CLOSE[ch]:
                return ('BRACKET_MISMATCH', line,
                        f'收尾 {ch!r} 与第 {oline} 行的开符号 {op!r} 不匹配')
            i += 1
            continue
        i += 1
    if quote:
        return ('TRIPLE_QUOTE_UNCLOSED', qline, f'第 {qline} 行的 {quote} 到末尾仍未收尾')
    if stack:
        op, oline = stack[-1]
        return ('BRACKET_UNCLOSED', oline,
                f'第 {oline} 行的 {op!r} 未闭合（共 {len(stack)} 层）')
    return None


def nested_triple_defect(code: str):
    """三引号串体里又出现三引号 —— Python 的串不嵌套，外层会被**提前收尾**。

    实测 Skill-CodeXEmbed-Code-Semantic-Embedding 第 204 行 `"code": \"\"\"` 开串，
    第 208 行 docstring 又写三引号，于是外层在第 208 行的**开引号**处就断了，
    裸标识符触发 SyntaxError。这与「卡被翻译过」「批量替换标点」都无关，是写法本身。
    返回 (内层三引号所在行, 开串所在行) 或 None。
    """
    lines = code.split('\n')
    for i, l in enumerate(lines):
        if not TRIPLE_VALUE_RE.search(l):
            continue
        for j in range(i + 1, len(lines)):
            if lines[j].strip() in ('"""', "'''"):
                break
            if '"""' in lines[j] or "'''" in lines[j]:
                return (j + 1, i + 1)
        break
    return None


def import_defect(code: str):
    """模块名不是合法标识符 —— 逐字抄了文件系统路径当模块名。返回 (行号, 模块名)。"""
    for m in re.finditer(r'^[ \t]*(?:from|import)[ \t]+([^\s#]+)', code, re.M):
        mod = m.group(1)
        head = mod.split('.')[0]
        if '-' in head or (CJK_RE.search(head) and not re.fullmatch(r'[\w.]+', head)):
            return (code.count('\n', 0, m.start()) + 1, mod)
    return None


def defect_of(code: str, text: str, fence_index, parses: bool):
    """给 parses=False 的恢复区归类：源码缺陷 还是 判据未定终点。

    返回 (defect, line, detail)；`parses=True` 返回 (None, None, None)。
    """
    if parses:
        return (None, None, None)

    ctl = _control_char_defect(code)
    if ctl:
        return (DEFECT_UNKNOWN, code.count('\n', 0, ctl[0]) + 1,
                f'首处控制字符 U+{ord(ctl[1]):04X}')

    nest = nested_triple_defect(code)
    if nest:
        return (DEFECT_UNKNOWN, nest[0],
                f'第 {nest[1]} 行的三引号串体内第 {nest[0]} 行又出现三引号，外层被提前收尾')

    imp = import_defect(code)
    if imp:
        return (DEFECT_UNKNOWN, imp[0], f'模块名 {imp[1]!r} 不是合法标识符')

    brk = scan_delimiters(code)
    if brk and brk[0] in ('BRACKET_MISMATCH', 'BRACKET_EXTRA_CLOSE', 'TRIPLE_QUOTE_UNCLOSED'):
        return (DEFECT_UNKNOWN, brk[1], brk[2])

    marks = list(BOUNDARY_RE.finditer(text))
    after = len(marks) - 1 - fence_index if fence_index is not None else -1
    if after <= 1:
        # 终点唯一却仍不能 parse —— 源码本身的问题，但没有单一字符级原因可指认。
        if brk:
            return (DEFECT_UNKNOWN, brk[1], brk[2])
        return (DEFECT_UNKNOWN, 0, '终点由围栏唯一确定，未定位到单一字符级原因')
    if brk and brk[0] == 'BRACKET_UNCLOSED':
        return (DEFECT_WINDOW, brk[1], f'{brk[2]}（疑似恢复区把卡正文圈了进来）')
    return (DEFECT_WINDOW, 0, f'被选中围栏之后还有 {after} 个围栏边界，正文终点不唯一')


def run(*args: str, **kw) -> bytes:
    p = subprocess.run(args, capture_output=True, **kw)
    if p.returncode != 0:
        sys.stderr.write(p.stderr.decode('utf-8', 'replace'))
        raise SystemExit(f'命令失败（{p.returncode}）：{" ".join(args[:3])} …')
    return p.stdout


def looks_like_container(raw: bytes) -> bool:
    """True = 这是被改写过的二进制容器，不是卡正文。"""
    if raw[:3] == CONTAINER_MAGIC:
        return True
    # 正文必然以 YAML frontmatter 或 Markdown 标题起头
    head = raw[:256].lstrip()
    return not (head.startswith(b'---') or head.startswith(b'#') or head.startswith(b'\xef\xbb\xbf---'))


def list_vault_md(repo: str, rev: str) -> dict[str, str]:
    """{path: sha}，用 -z 以免 non-ASCII 路径被 git 转义成八进制。"""
    out = run('git', '-C', repo, 'ls-tree', '-r', '-z', rev, VAULT_REL + '/')
    blobs: dict[str, str] = {}
    for rec in out.split(b'\0'):
        if not rec:
            continue
        meta, path = rec.split(b'\t', 1)
        _mode, typ, sha = meta.decode().split()
        p = path.decode('utf-8')
        if typ == 'blob' and p.endswith('.md'):
            blobs[p] = sha
    return blobs


def cat_batch(repo: str, rev: str, specs: list[str]) -> dict[str, bytes]:
    """一次 cat-file --batch 取回全部正文。二进制模式解析，避免换行转换破坏字节偏移。"""
    if not specs:
        return {}
    inp = ('\n'.join(specs) + '\n').encode()
    p = subprocess.run(['git', '-C', repo, 'cat-file', '--batch'],
                       input=inp, capture_output=True)
    if p.returncode != 0:
        sys.stderr.write(p.stderr.decode('utf-8', 'replace'))
        raise SystemExit(f'cat-file --batch 失败（{p.returncode}）')
    raw = p.stdout
    out: dict[str, bytes] = {}
    pos = 0
    for spec in specs:
        nl = raw.index(b'\n', pos)
        hdr = raw[pos:nl].split()
        if len(hdr) < 3:
            raise SystemExit(f'cat-file 未返回 {spec}')
        size = int(hdr[2])
        out[spec] = raw[nl + 1:nl + 1 + size]
        pos = nl + 1 + size + 1
    return out


def boundaries(text: str) -> list[tuple[int, int, str]]:
    """[(行首位置, 正文起始, 语言标注)]，按出现次序。"""
    return [(m.start(), m.end(), m.group(1).lower()) for m in BOUNDARY_RE.finditer(text)]


def longest_parseable(text: str, marks: list, i: int):
    """从 marks[i] 起，取**最长**的、能过 `ast.parse` 的连续区间。

    为什么不能只取「到下一个边界为止」：卡里的 Python 会把**整张 markdown 卡**
    塞进三引号字符串（`return '''---\\ntitle: …\\n```python\\n…`），那串里就有 ```。
    于是「下一个边界」落在字符串中间，取出来的实现三引号没闭合、根本不是合法模块。
    实测 Skill-Skill-Card-API-Serving 因此只取到 66 行，真身 304 行。

    取法：从最长的终点往回退，第一个能 parse 的就是答案；一个都不 parse 时
    退回自然块（见下）。
    """
    body_from = marks[i][1]
    ends = [m[0] for m in marks[i + 1:]] + [len(text)]
    for end in reversed(ends):
        cand = text[body_from:end].rstrip('\n')
        if not cand:
            continue
        try:
            ast.parse(cand)
        except SyntaxError:
            continue
        return cand
    # 一个都不 parse → 退回「到下一个边界为止」的自然块，**不退回最长的那段**。
    # 卡尾常跟着 `- **优先级**：⭐⭐⭐⭐⭐…` 这类正文，退回最长等于把散文当实现交付
    # （实测 5 张卡的尾行正是这种散文）。代码本身写坏的卡就保持自然块，
    # parses=False 由调用方如实记下。
    natural_end = marks[i + 1][0] if i + 1 < len(marks) else len(text)
    return text[body_from:natural_end].rstrip('\n') or None


def fences(text: str) -> list[tuple[str, str]]:
    """候选代码块 [(语言标注, 正文)]，按出现次序。

    **这不是 Markdown 解析器**，故意的。目标是「把 Python 实现找出来」，不是
    还原文档结构：卡里出现过孤立的多余 ``` 行（Skill-BERT-SRL-Event-Frame-Extraction
    第 188 行），严格按 Markdown 配对会让它把后面的 ```python 开栏吞成收尾，
    374 行实现整块消失。

    所以规则改成**宽松枚举边界**：每个行首 ``` 行都是边界，相邻两个边界之间
    就是一个候选块，语言取开边界上的标注。开栏、收栏一视同仁 —— 是不是真实现，
    交给 oracle（节选必须是该块的开头，逐行相等）判定，不靠配对猜。
    """
    marks = [(m.start(), m.end(), m.group(1).lower()) for m in BOUNDARY_RE.finditer(text)]
    out: list[tuple[str, str]] = []
    for i, (_s, e, lang) in enumerate(marks):
        end = marks[i + 1][0] if i + 1 < len(marks) else len(text)
        out.append((lang, text[e:end]))
    return out


def prefix_offset(needle: str, hay: str):
    """needle 是否作为连续行块出现在 hay 的**开头**；是则返回起始行号（1 基），否则 None。

    只判开头：节选是完整代码的头部，不是中段。这条比「包含」强得多，
    也正是它能当 oracle 的原因。

    返回**实测**行号而非常量：此前这里 `return 0 if … else None`，而调用方写死
    `offset = EXPECTED_OFFSET(=1)`，于是 index 里的 `offset` 看起来是量出来的、
    实际是常量，下面那条「偏移必须恒为 1」的守卫因此**永远不可能触发**。
    """
    nl = [x.rstrip() for x in needle.split('\n')]
    hl = [x.rstrip() for x in hay.split('\n')]
    return 1 if hl[:len(nl)] == nl else None


def prefix_offset_partial(needle: str, hay: str, min_lines: int = 3):
    """同 prefix_offset，但允许**最后一行只对上前缀**。

    为什么需要：源站自己那份节选抽取器也踩了行内 ``` 的坑，把预览**从行中间**切断
    （`Skill-CodeRAG-Repository-Level-Retrieval` 的节选最后一行停在
    `code_blocks = re.findall(r'`，而实现里那行是
    `code_blocks = re.findall(r'```python\\n(.*?)```', content, re.DOTALL)`）。
    于是节选不是实现的干净行前缀，但前 N-1 行逐行相等、第 N 行是它的前缀。

    这是**更弱**的判据，所以：只在前一条完全失败时才用；要求前 N-1 行精确相等；
    节选至少 min_lines 行；并在 cross_check 里标成 `prefix@1+partial`，
    不冒充完全确证。
    """
    nl = [x.rstrip() for x in needle.split('\n')]
    hl = [x.rstrip() for x in hay.split('\n')]
    if len(nl) < min_lines or len(hl) < len(nl):
        return None
    if hl[:len(nl) - 1] != nl[:len(nl) - 1]:
        return None
    return 1 if hl[len(nl) - 1].startswith(nl[-1]) else None


def paired_fences(text: str) -> list[tuple[str, str]]:
    """**成对**围栏：开边界（可带语言标注）↔ 下一个边界，两两配对；落单的开边界丢弃。

    只给「没有 oracle 可校验」的降级路径用。为什么降级路径不能也走宽松枚举：
    宽松候选在围栏不闭合的卡上会一路吃到后面的散文，而 `ast.parse` 挡不住它 ——
    `## ④ 技能关联`、`### 前置技能` 都是合法 Python **注释**，实测 15 张卡
    因此把整段正文当成了实现。没有 oracle 时，语法这把尺子不够用，只能退回到
    「配对」这个结构性的判据，配对不成就如实说取不到。
    """
    marks = [(m.start(), m.end(), m.group(1).lower()) for m in BOUNDARY_RE.finditer(text)]
    out: list[tuple[str, str]] = []
    for i in range(0, len(marks) - 1, 2):
        (_s, body_from, lang), (close_at, _e, _lang) = marks[i], marks[i + 1]
        out.append((lang, text[body_from:close_at]))
    return out


def split_section(sec: str):
    """与 scripts/build-code-availability.py 同口径：⑦ 段 → (meta, 第二行, 正文)。"""
    lines = (sec or '').split('\n')
    if len(lines) < 3:
        return (lines[0] if lines else None), None, None
    if re.search(r'请查看原始|未自动抽取|未抽取', lines[2]):
        return lines[0], lines[2], None
    code = re.sub(r'^\n+|\n+$', '', '\n'.join(lines[3:]))
    return lines[0], lines[2], (code or None)


CHECK = '--check' in sys.argv


def main() -> int:
    repo = os.environ.get('P2S_VAULT_GIT', DEFAULT_REPO)
    rev = os.environ.get('P2S_VAULT_REV', 'HEAD')
    if not os.path.isdir(os.path.join(repo, '.git')):
        raise SystemExit(f'$P2S_VAULT_GIT 不是 git 仓库：{repo}')

    cards = json.load(open(CARDS, encoding='utf-8'))['cards']
    avail = json.load(open(AVAIL, encoding='utf-8'))['cards']
    by_id = {c['id']: c for c in cards}

    head = run('git', '-C', repo, 'rev-parse', rev).decode().strip()
    head_ts = run('git', '-C', repo, 'log', '-1', '--format=%ad', '--date=iso', head) \
        .decode().strip()

    blobs = list_vault_md(repo, rev)
    by_name: dict[str, list[str]] = {}
    for p in blobs:
        by_name.setdefault(os.path.basename(p)[:-3], []).append(p)

    # 解析：优先**域根**那一份。坑：18 张卡在 `<dom>/00-知识库-Skill卡片/` 下有旧副本，
    # 两者都含 `/<dom>/`，按插入序取会静默拿到旧副本（实测把 16 张有代码的卡判成无代码）。
    want: dict[str, str] = {}
    unrecovered: dict[str, str] = {}
    for cid, c in by_id.items():
        root = f'{VAULT_REL}/{c.get("src_domain")}/{cid}.md'
        cands = by_name.get(cid, [])
        pick = root if root in blobs else next(
            (p for p in cands if f'/{c.get("src_domain")}/' in p), cands[0] if cands else None)
        if pick is None:
            unrecovered[cid] = 'NO_VAULT_CARD'
        else:
            want[cid] = pick

    specs = [f'{head}:{p}' for p in want.values()]
    raw_by_spec = cat_batch(repo, head, specs)

    full: dict[str, dict] = {}
    index: dict[str, dict] = {}
    tiers: Counter[str] = Counter()
    reasons: Counter[str] = Counter()

    for cid in sorted(by_id):
        path = want.get(cid)
        rec = {'card': cid, 'vault_path': path}
        if path is None:
            rec.update(tier='unrecovered', reason=unrecovered[cid], lines=0)
            tiers['unrecovered'] += 1
            reasons[unrecovered[cid]] += 1
            index[cid] = rec
            continue

        raw = raw_by_spec[f'{head}:{path}']
        if looks_like_container(raw):
            # 这是本脚本存在意义的守卫：源取错时立刻停，不产二进制。
            raise SystemExit(
                f'读到的不是卡正文而是二进制容器：{path}\n'
                f'（说明源指向了工作区而非 git 历史；检查 $P2S_VAULT_REV）')
        text = raw.decode('utf-8', 'replace')

        fs = fences(text)
        if not fs:
            rec.update(tier='unrecovered', reason='NO_FENCE_IN_VAULT', lines=0)
            tiers['unrecovered'] += 1
            reasons['NO_FENCE_IN_VAULT'] += 1
            index[cid] = rec
            continue

        excerpt = split_section(by_id[cid]['sections'].get(SECTION, ''))[2]
        code = None
        fence_idx = None
        offset = None
        if excerpt:
            # 候选 = **全部**围栏，不问语言标注：源站发布的就是第一个块。
            # 但交付物是 `references/implementation.py`，所以只有 Python 围栏能当结果；
            # 命中非 Python 围栏时如实记为另一个 reason，不伪装成「没找到」。
            langs = [lang for lang, _ in fs]
            partial = None
            for k, (lang, f) in enumerate(fs):
                off = prefix_offset(excerpt, f)
                cross_kind = f'prefix@{off}' if off is not None else None
                if off is None:
                    off = prefix_offset_partial(excerpt, f)
                    if off is None:
                        continue
                    cross_kind = f'prefix@{off}+partial'
                    if partial is None:
                        partial = (k, lang, f, off, cross_kind)
                if lang in PY_LANGS:
                    code, fence_idx, offset = f, k, off
                    matched_cross = cross_kind
                else:
                    rec.update(tier='unrecovered', reason='EXCERPT_MATCHES_NON_PYTHON_FENCE',
                               lines=0, fences=len(fs), fence_langs=langs,
                               matched_fence_index=k, matched_fence_lang=lang,
                               excerpt_lines=len(excerpt.split('\n')))
                    tiers['unrecovered'] += 1
                    reasons['EXCERPT_MATCHES_NON_PYTHON_FENCE'] += 1
                    index[cid] = rec
                break
            if code is None and rec.get('tier') != 'unrecovered' and partial is not None:
                k, lang, f, off, cross_kind = partial
                if lang in PY_LANGS:
                    code, fence_idx, offset, matched_cross = f, k, off, cross_kind
            if code is None and rec.get('tier') != 'unrecovered':
                rec.update(tier='unrecovered', reason='EXCERPT_NOT_FOUND_IN_VAULT',
                           lines=0, fences=len(fs), fence_langs=langs,
                           excerpt_lines=len(excerpt.split('\n')))
                tiers['unrecovered'] += 1
                reasons['EXCERPT_NOT_FOUND_IN_VAULT'] += 1
                index[cid] = rec
                continue
            if code is None:
                continue
            # oracle 只定了**起点**；终点要按语法定：卡里的 Python 常把整张 markdown 卡
            # 塞进三引号字符串，那串里的 ``` 会被当成边界，导致实现被截在字符串中间。
            # 从同一个起点往后取「最长且能 parse」的区间。
            marks = boundaries(text)
            if fence_idx < len(marks) - 1:
                ext = longest_parseable(text, marks, fence_idx)
                if ext is not None and ext != code.rstrip('\n'):
                    grew = len(ext.split('\n')) - len(code.rstrip('\n').split('\n'))
                    code = ext
                    if grew > 0:
                        matched_cross = f'{matched_cross}+extended{grew}'
            tier, cross = 'oracle', matched_cross
        else:
            # 无 oracle：走**成对**围栏（不走宽松候选，见 paired_fences 的说明），
            # 取最长的 Python 块。交付物是 .py，图/配置块不能当实现。
            pairs = paired_fences(text)
            tagged = [i for i, (lang, _) in enumerate(pairs) if lang in PY_LANGS]
            if not tagged:
                rec.update(tier='unrecovered', reason='NO_PAIRED_PYTHON_FENCE', lines=0,
                           fences=len(fs), paired=len(pairs),
                           fence_langs=[lang for lang, _ in fs])
                tiers['unrecovered'] += 1
                reasons['NO_PAIRED_PYTHON_FENCE'] += 1
                index[cid] = rec
                continue
            fence_idx = max(tagged, key=lambda i: len(pairs[i][1]))
            code = pairs[fence_idx][1]
            # 降级路径**保持改前语义**：取最长的 Python 成对块，不额外加 parse 门槛。
            # 加了门槛会凭空丢掉 5 张原本已交付的卡（如 EvoSC 的 6 行块）——
            # 那是另一件事，不该混进「修围栏判据」这一改里。`parses` 字段照旧如实记录。
            tier, cross = 'unverified', 'none'

        clean = code.rstrip('\n')
        lines = len(clean.split('\n'))
        try:
            ast.parse(clean)
            parses = True
        except Exception:
            parses = False

        defect, defect_line, defect_detail = defect_of(clean, text, fence_idx, parses)

        full[cid] = {'code': clean, 'vault_path': path, 'fence_index': fence_idx,
                     'offset': offset, 'tier': tier, 'lines': lines, 'parses': parses}
        index[cid] = {'card': cid, 'vault_path': path, 'tier': tier, 'lines': lines,
                      'parses': parses, 'cross_check': cross, 'fence_index': fence_idx,
                      'offset': offset,
                      'sha256': hashlib.sha256(clean.encode('utf-8')).hexdigest()}
        if defect:
            index[cid]['defect'] = defect
            index[cid]['defect_line'] = defect_line
            index[cid]['defect_detail'] = defect_detail
        tiers[tier] += 1

    # ── 守卫：任何一条不成立就停，不静默降级 ──────────────────────
    problems: list[str] = []
    oracle_off = {r['offset'] for r in index.values() if r.get('tier') == 'oracle'}
    if oracle_off != {EXPECTED_OFFSET}:
        problems.append(f'确证集出现非 {EXPECTED_OFFSET} 的偏移：{sorted(oracle_off)}')
    if tiers['oracle'] < MIN_ORACLE_CARDS:
        problems.append(f'确证集 {tiers["oracle"]} < 下限 {MIN_ORACLE_CARDS}（源或口径可能已变）')
    missing_lines = [c for c, r in index.items() if r.get('tier') != 'unrecovered' and not r['lines']]
    if missing_lines:
        problems.append(f'{len(missing_lines)} 张已恢复却行数为 0')
    # 记账不变量：有节选的卡必须**恰好**落进三个出口之一。
    # 上面那个 `continue` 分支写错时不会报错、只会静默少统计 —— 这条能抓住。
    with_excerpt = sum(1 for c in by_id
                       if split_section(by_id[c]['sections'].get(SECTION, ''))[2])
    accounted = tiers['oracle'] + reasons['EXCERPT_MATCHES_NON_PYTHON_FENCE'] \
        + reasons['EXCERPT_NOT_FOUND_IN_VAULT']
    if with_excerpt != accounted:
        problems.append(f'有节选的卡 {with_excerpt} 张，但三出口合计 {accounted} 张 —— 有卡漏记')
    if problems:
        for p in problems:
            sys.stderr.write(f'✗ {p}\n')
        return 1

    stats = {
        'cards': len(by_id),
        'recovered': tiers['oracle'] + tiers['unverified'],
        'oracle': tiers['oracle'],
        'unverified': tiers['unverified'],
        'unrecovered': tiers['unrecovered'],
        'unrecovered_reasons': dict(reasons),
        'total_lines': sum(r['lines'] for r in index.values()),
        'parses': sum(1 for r in index.values() if r.get('parses')),
        'parses_of_recovered': sum(
            1 for r in index.values() if r.get('tier') != 'unrecovered' and r.get('parses')),
        # parses=False 的两个去向：卡里源码写坏（终点唯一）vs 判据未定终点（吞了正文）。
        # 这个分解是 2026-09-12 那一轮的结论落点，见下面 note_index。
        'defects': dict(Counter(r['defect'] for r in index.values() if r.get('defect'))),
    }

    note_full = ('恢复自 vault 的 git 明文（不读工作区：那批 .md 自 2026-07 起是二进制容器）。'
                 'tier=oracle 表示卡面节选已校验为该候选块的开头；tier=unverified 表示卡面无节选、'
                 '无 oracle 可校验，取最长的 Python 成对块。**本文件含未脱敏原文，不得入库**；'
                 '出口脱敏见 lib/secret-scrub.js。')
    note_index = ('每卡完整实现的可得性与校验方式（小索引，入库）。'
                  '正文在 generated/source-code.json（派生，不入库）。'
                  'parses=false 的卡带 defect：UNLABELED = 卡里的源码本身写坏（围栏唯一确定终点，'
                  '已定位到具体行）；WINDOW_TRUNCATED = 无 oracle 可定时终点不唯一，'
                  '恢复区把卡正文一起圈了进来，**这段不是实现**。')

    if CHECK:
        return check_against_disk(index, stats, head, note_index)

    json.dump({
        'generated_from': {'repo': repo, 'rev': head, 'rev_date': head_ts,
                           'vault': VAULT_REL},
        'note': note_full,
        'stats': stats,
        'cards': full,
    }, open(OUT_FULL, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    json.dump({
        'generated_from': {'rev': head, 'rev_date': head_ts},
        'note': note_index,
        'stats': stats,
        'cards': index,
    }, open(OUT_INDEX, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    print(f'源：{repo} @ {head[:12]} ({head_ts})')
    print(f'vault 卡 {len(blobs)} 条路径')
    print(f'  确证（oracle，节选=围栏开头）  {tiers["oracle"]:5d}')
    print(f'  降级（unverified，无 oracle）  {tiers["unverified"]:5d}')
    print(f'  未恢复                        {tiers["unrecovered"]:5d}  {dict(reasons)}')
    print(f'  行数合计 {stats["total_lines"]:,}；可解析 {stats["parses_of_recovered"]}'
          f'/{stats["recovered"]}')
    if stats['defects']:
        print(f'  不可解析的分解 {stats["defects"]}')
    print(f'→ {os.path.relpath(OUT_FULL, PKG)}（派生，不入库）')
    print(f'→ {os.path.relpath(OUT_INDEX, PKG)}（入库索引）')
    return 0


def check_against_disk(index: dict, stats: dict, head: str, note: str) -> int:
    """`--check`：重算一遍，与入库的 data/code-recovery.json 逐卡对账，不写盘。

    存在的意义：这张索引决定 ① 每张卡 skill 里 ⑦ 段怎么写、② 要不要落
    `references/implementation.py`。改了判据却忘了重跑，正文与索引就会各说各话。
    """
    if not os.path.exists(OUT_INDEX):
        sys.stderr.write(f'✗ {os.path.relpath(OUT_INDEX, PKG)} 不存在，先跑一次不带 --check 的\n')
        return 1
    old = json.load(open(OUT_INDEX, encoding='utf-8'))
    if old.get('generated_from', {}).get('rev') != head:
        sys.stderr.write(f'✗ 索引记的修订号 {old.get("generated_from", {}).get("rev")}'
                         f' ≠ 当前 {head}\n')
        return 1

    fields = ('tier', 'lines', 'sha256', 'cross_check', 'fence_index', 'offset', 'reason',
              'parses', 'defect', 'defect_line', 'defect_detail')
    diffs: list[str] = []
    for cid in sorted(set(index) | set(old.get('cards', {}))):
        a, b = index.get(cid), old.get('cards', {}).get(cid)
        if a is None or b is None:
            diffs.append(f'{cid}: 只在一侧出现')
            continue
        for f in fields:
            if a.get(f) != b.get(f):
                diffs.append(f'{cid}.{f}: 盘上 {b.get(f)!r} ≠ 重算 {a.get(f)!r}')
    if old.get('stats') != stats:
        for k in sorted(set(stats) | set(old.get('stats', {}))):
            if stats.get(k) != old.get('stats', {}).get(k):
                diffs.append(f'stats.{k}: 盘上 {old["stats"].get(k)!r} ≠ 重算 {stats.get(k)!r}')
    if old.get('note') != note:
        diffs.append('note: 盘上与脚本里的说明不一致')

    if diffs:
        sys.stderr.write(f'✗ 完整实现恢复索引与重算结果不一致（{len(diffs)} 处）：\n')
        for d in diffs[:25]:
            sys.stderr.write(f'    {d}\n')
        if len(diffs) > 25:
            sys.stderr.write(f'    … 其余 {len(diffs) - 25} 处\n')
        return 1
    print(f'✓ 完整实现恢复索引一致（{len(index)} 张 · oracle {stats["oracle"]} · '
          f'recovered {stats["recovered"]}）')
    return 0


def selftest() -> int:
    """`--selftest`：围栏判据的回归用例。

    这三条都是 2026-09-12 实测踩出来的，不是假想：
      · 正文里出现行内 ``` （卡自己写了个抓围栏的正则）→ 旧判据把块截断；
      · 卡里多一个孤立的裸 ``` 行 → 旧判据把后面的 ```python 开栏吞成收尾；
      · 第一个块是 ```bash（运行方式）→ 只认 python 的判据根本看不到它。
    """
    fails: list[str] = []
    checked: list[str] = []

    def _parses(src: str) -> bool:
        try:
            ast.parse(src)
            return True
        except SyntaxError:
            return False

    def eq(what, got, want):
        checked.append(what)
        if got != want:
            fails.append(f'{what}: got {got!r} want {want!r}')

    def lines_of(blocks, i):
        """第 i 个块的行数；块不存在返回 None。

        判据退回旧正则时候选会变少，这里要像普通失败一样**报出来**，
        而不是抛 IndexError —— 崩溃也算红，但红得没有信息量。
        """
        if i >= len(blocks):
            return None
        return len(blocks[i][1].rstrip('\n').split('\n'))

    # ① 行内 ``` 不该结束代码块
    t1 = ('```python\nimport re\n'
          "pat = re.findall(r'```python\\n(.*?)```', s)\n"
          'print(pat)\n```\n## ④ 技能关联\n')
    fs1 = fences(t1)
    eq('① 候选块数', len(fs1), 2)
    eq('① 首块语言', fs1[0][0] if fs1 else None, 'python')
    eq('① 首块行数', lines_of(fs1, 0), 3)
    eq('① 成对块行数', lines_of(paired_fences(t1), 0), 3)

    # ② 孤立的裸 ``` 行不该吞掉后面的开栏
    t2 = ('```python\na = 1\n```\n'
          '```\n'
          '## ③ 代码模板\n'
          '```python\nb = 2\n```\n')
    cands = fences(t2)
    hit = [f for _l, f in cands if prefix_offset('b = 2', f) == 1]
    eq('② 实现块仍可被找到', len(hit), 1)
    eq('② 找到的正文', hit[0].rstrip('\n') if hit else None, 'b = 2')

    # ③ bash 首块：候选要含它，且语言标注认得出不是 Python
    t3 = '```bash\ncd x\npython y.py\n```\n\n```python\nreal = 1\n```\n'
    fs3 = fences(t3)
    eq('③ 候选块数', len(fs3), 4)
    eq('③ 首块语言', fs3[0][0] if fs3 else None, 'bash')
    eq('③ bash 不在 PY_LANGS', 'bash' in PY_LANGS, False)

    # ④ 节选被从行中间切断时，弱判据能认出来，且前 N-1 行不等就不认
    ex = 'import re\npat = 1\nprint(r'
    hay = "import re\npat = 1\nprint(r'```x', s)\nprint('done')\n"
    eq('④ 强判据不该命中', prefix_offset(ex, hay), None)
    eq('④ 弱判据命中', prefix_offset_partial(ex, hay), 1)
    eq('④ 前 N-1 行不等则不认', prefix_offset_partial('import re\npat = 2\nprint(r', hay), None)
    eq('④ 行数太短不认', prefix_offset_partial('print(r', hay), None)

    # ⑤ offset 是量出来的，不是常量
    eq('⑤ 命中偏移', prefix_offset('b = 2', 'b = 2\nc = 3'), 1)
    eq('⑤ 非开头不命中', prefix_offset('b = 2', 'a = 1\nb = 2'), None)

    # ⑥ 三引号里再出现三引号：外层被内层开引号提前收尾
    t6 = 'x = [\n    {"code": """\nimport numpy as np\ndef g():\n    """doc"""\n    return 1\n"""\n    },\n]\n'
    eq('⑥ 认得出嵌套三引号', bool(nested_triple_defect(t6)), True)
    eq('⑥ 定位到内层那行', nested_triple_defect(t6)[0], 5)
    eq('⑥ 无嵌套时不报', nested_triple_defect('a = """\nx\n"""\nb = 1\n'), None)
    eq('⑥ 嵌套确实 parse 不过', _parses(t6), False)

    # ⑦ 括号不匹配：收尾符号与开符号不同类
    t7 = 'd = {\n    "k": min(len(x.get("a", 0) or\n                     x.get("a", 0), y),\n}\n'
    eq('⑦ 认出括号不匹配', scan_delimiters(t7)[0], 'BRACKET_MISMATCH')
    eq('⑦ 指到收尾那一行', scan_delimiters(t7)[1], 4)
    eq('⑦ 正常嵌套不误报', scan_delimiters('d = {"k": min(len(x), y)}\n'), None)

    # ⑧ 三引号到末尾没收尾
    eq('⑧ 认出未收尾三引号', scan_delimiters('"""\ndoc\n')[0], 'TRIPLE_QUOTE_UNCLOSED')
    eq('⑧ 收尾正常不报', scan_delimiters('"""\ndoc\n"""\n'), None)
    # 注释与字符串里的括号不该进栈
    eq('⑧ 注释里的括号不入栈', scan_delimiters('x = 1  # )))\ny = 2\n'), None)
    eq('⑧ 字符串里的括号不入栈', scan_delimiters('x = "((( "\ny = 2\n'), None)

    # ⑨ 模块名不是合法标识符（逐字抄了文件系统路径）
    eq('⑨ 认出非法模块名', bool(import_defect('from paper2skills-code.a.b import (X)\n')), True)
    eq('⑨ 定位到第 1 行', import_defect('from paper2skills-code.a.b import (X)\n')[0], 1)
    eq('⑨ 合法模块名不报', import_defect('from a.b import X\nimport os\n'), None)

    # ⑩ 控制字符
    eq('⑩ 认出 U+0001', _control_char_defect('a = 1\nhealth_\x01\n') is not None, True)

    # ⑪ 归类：终点唯一 → 源码缺陷；终点不唯一 → 窗口截断
    #    卡里只有一对围栏（after=0），取到的就是全部，parse 不过只能是源码写坏
    t11 = '```python\nx = [\n```\n'
    d11 = defect_of('x = [', t11, 0, False)
    eq('⑪ 终点唯一归源码缺陷', d11[0], 'UNLABELED')
    #    后面还有 3 个边界 → 定不出终点，归窗口截断
    t12 = '```python\nx = 1\n```\n\n## ④ 关联\n```\nbody\n```\n```\nmore\n```\n'
    d12 = defect_of('x = 1\n## ④ 关联', t12, 0, False)
    eq('⑪ 终点不唯一归窗口截断', d12[0], 'WINDOW_TRUNCATED')
    eq('⑪ 能 parse 就不归类', defect_of('x = 1', t11, 0, True), (None, None, None))
    #    同一条路径也要把「源码缺陷的具体原因」带出来，否则归了类也说不清是什么病
    bad_nest = 'x = [\n    {"code": """\na = 1\ndef g():\n    """d"""\n    return 1\n"""\n    },\n]\n'
    d13 = defect_of(bad_nest, '```python\n' + bad_nest + '```\n', 0, False)
    eq('⑪ 源码缺陷归类', d13[0], 'UNLABELED')
    eq('⑪ 源码缺陷带出具体行', d13[1], 5)
    eq('⑪ 源码缺陷带出具体原因', '又出现三引号' in (d13[2] or ''), True)

    if fails:
        sys.stderr.write(f'✗ 判据自测未过（{len(fails)} 条）：\n')
        for f in fails:
            sys.stderr.write(f'    {f}\n')
        return 1
    print(f'✓ 判据自测通过（{len(checked)} 条断言）')
    return 0


if __name__ == '__main__':
    if '--selftest' in sys.argv:
        raise SystemExit(selftest())
    raise SystemExit(main())
