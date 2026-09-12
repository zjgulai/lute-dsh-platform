#!/usr/bin/env python3
"""探针：为 20 张 parses=False 逐卡给出「外部可核」的缺陷定位。

不用 tokenize（它会在更早处放弃），直接用字符级扫描：跳注释、跳字符串，
遇到括号就配对，遇到三引号就找收尾。这样能对 4 类缺陷给出精确行号：
  - 控制字符
  - 括号不匹配（收尾符号与开符号不同）
  - 三引号未收尾
  - 括号/引号在文件结束前没关

再用相邻行「像不像代码」判定该处是不是恢复区误吞的散文。
"""
from __future__ import annotations

import ast
import json
import os
import re
import sys
import unicodedata

PKG = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                    '..', '..', 'packages', 'capabilities', 'dsh-paper2skills'))

PAIR = {')': '(', ']': '[', '}': '{'}
CJK = re.compile(r'[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]')
DOTTED_REF = re.compile(r'^[A-Za-z_][\w\.]*$')


def scan_delimiters(code: str):
    """返回 (缺陷种类, 行号, 说明) 或 None。"""
    i = 0
    n = len(code)
    line = 1
    stack = []  # (char, line)
    quote = None  # 当前三引号
    qline = 0
    while i < n:
        ch = code[i]
        if ch == '\n':
            line += 1
            # 单行字符串在换行处结束（裸换行不会到这里，因为已在字符串分支处理）
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
            if op != PAIR[ch]:
                return ('BRACKET_MISMATCH', line,
                        f'收尾 {ch!r} 与第 {oline} 行的开符号 {op!r} 不匹配')
            i += 1
            continue
        i += 1
    if quote:
        return ('TRIPLE_QUOTE_UNCLOSED', qline, f'{qline} 行的 {quote} 到文件结束仍未收尾')
    if stack:
        op, oline = stack[-1]
        return ('BRACKET_UNCLOSED', oline, f'{oline} 行的 {op!r} 未闭合（共 {len(stack)} 层未闭合）')
    return None


def control_char_defect(code: str):
    for idx, ch in enumerate(code):
        o = ord(ch)
        if o < 32 and ch not in '\n\r\t' or o == 127:
            line = code.count('\n', 0, idx) + 1
            return ('CONTROL_CHAR', line,
                    f'首处 {unicodedata.name(ch, "?")} (U+{o:04X})')
    return None


def import_defect(code: str):
    for m in re.finditer(r'^[ \t]*(?:from|import)[ \t]+([^\s#]+)', code, re.M):
        mod = m.group(1)
        head = mod.split('.')[0]
        if '-' in head or (CJK.search(head) and not re.fullmatch(r'[\w.]+', head)):
            line = code.count('\n', 0, m.start()) + 1
            return ('IMPORT_NOT_IMPORTABLE', line, f'模块名 {mod!r} 不是合法标识符')
    return None


TRIPLE_VAL_RE = re.compile(r':[ \t]*("""|\'\'\')[ \t]*$')


def nested_triple_defect(code: str, close_only_line: str = '"""'):
    """三引号里再出现三引号：Python 的串不嵌套，内层收尾会把外层**提前关掉**。

    形态：``"code": \"\"\"`` 开串，串体里又有 ``\"\"\"doc\"\"\"``；于是 open 行之后
    第一个出现的三引号成了收尾（落在 docstring 的开引号上），外层在 docstring
    中间就断了，剩下的裸标识符触发 SyntaxError。
    精确位置 = 内层第一个三引号出现的那一行。
    """
    lines = code.split('\n')
    for i, l in enumerate(lines):
        if not TRIPLE_VAL_RE.search(l):
            continue
        for j in range(i + 1, len(lines)):
            lj = lines[j]
            if lj.strip() == close_only_line:
                break
            k = lj.find('"""')
            if k >= 0:
                return ('NESTED_TRIPLE_QUOTE', j + 1,
                        f'{i + 1} 行的三引号串体内第 {j + 1} 行又出现三引号，'
                        f'外层会在内层开引号处被提前收尾')
        break
    return None


def is_code_like(s: str) -> bool:
    s = s.strip()
    if not s:
        return False
    if s.startswith('```') or re.match(r'^#{1,6}\s', s) or s in ('---', '***', '___'):
        return False
    if re.match(r'^[-*]\s|^\d+\.\s|^\|', s) or s.startswith('**'):
        return False
    if CJK.search(s):
        return False
    if '=' in s or '(' in s or s.endswith(':') or s.startswith(('import ', 'from ', 'def ', 'class ', 'return ', 'print(')):
        return True
    return bool(DOTTED_REF.match(s)) and False


def window_is_deterministic(text: str, fence_index: int):
    """被选中的围栏能否唯一定出正文终点：后面只剩下**一个**边界（收栏）。"""
    marks = [m.start() for m in re.finditer(r'^```(.*)$', text, re.M)]
    after = len(marks) - 1 - fence_index
    return after <= 1, after


def main() -> int:
    here = os.path.dirname(os.path.abspath(__file__))
    full = json.load(open(os.path.join(PKG, 'generated', 'source-code.json'), encoding='utf-8'))['cards']
    rec = json.load(open(os.path.join(PKG, 'data', 'code-recovery.json'), encoding='utf-8'))['cards']
    rows = []
    for cid, r in sorted(full.items(), key=lambda kv: (rec[kv[0]].get('tier', ''), kv[0])):
        if r['parses']:
            continue
        code = r['code']
        lines = code.split('\n')
        ctl = control_char_defect(code)
        imp = import_defect(code)
        nest = nested_triple_defect(code)
        brk = scan_delimiters(code)
        if ctl:
            kind, ln, detail = ctl
        elif nest:
            kind, ln, detail = nest
        elif imp:
            kind, ln, detail = imp
        elif brk and brk[0] in ('BRACKET_MISMATCH',):
            kind, ln, detail = brk
        elif brk and brk[0] == 'TRIPLE_QUOTE_UNCLOSED':
            kind, ln, detail = brk
        else:
            kind, ln, detail = (brk or ('UNLABELLED', 0, ''))
        ctx = lines[ln - 1][:90] if 0 < ln <= len(lines) else ''
        nxt = lines[ln] if 0 <= ln < len(lines) else ''
        rows.append({
            'card': cid, 'tier': rec[cid].get('tier'),
            'defect': kind, 'line': ln, 'detail': detail,
            'at': ctx, 'next_line': nxt[:70],
            'next_is_code': is_code_like(nxt),
            'lines': len(lines),
        })
    json.dump(rows, open(os.path.join(here, 'probe-defects.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    print('%-52s %-10s %-24s %-5s %s' % ('card', 'tier', 'defect', 'line', 'detail'))
    for r in rows:
        print('%-52s %-10s %-24s %-5s %s' % (r['card'], r['tier'], r['defect'], r['line'], r['detail'][:60]))
    print()
    from collections import Counter
    print('缺陷分布:', dict(Counter(r['defect'] for r in rows)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
