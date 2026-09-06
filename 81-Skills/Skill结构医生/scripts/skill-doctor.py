#!/usr/bin/env python3
"""
Skill Doctor - 检测并修复 Skill 目录结构问题

用法:
    python skill-doctor.py /path/to/skill           # 单 Skill 检测+修复
    python skill-doctor.py /path/to/skill --check   # 仅检测
    python skill-doctor.py /path/to/skill --dry-run # 预览修复
    python skill-doctor.py /path/to/skills --batch  # 批量处理全部 Skill
    python skill-doctor.py /path/to/skill --rollback # 回滚到最近一次备份
"""

import argparse
import json
import re
import shutil
import subprocess
import sys
from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional


@dataclass
class Issue:
    """检测发现的问题"""
    code: str
    severity: str  # error, warning, info
    message: str
    auto_fixable: bool
    fix_action: Optional[str] = None
    path: Optional[str] = None


@dataclass
class FixResult:
    """修复结果"""
    success: bool
    action: str
    detail: str
    backup_path: Optional[str] = None


class SkillDoctor:
    """Skill 结构医生"""

    # 允许的根目录项
    ALLOWED_ROOT_ITEMS = {
        "SKILL.md", "README.md", ".skill-meta",
        "references", "examples", "scripts", "tests", "assets", "templates",
        "eval-reports",
    }

    # 特定文件名后缀优先于通用扩展名映射。
    SUFFIX_TO_DIR = {
        "-evaluation-report.yaml": "eval-reports",
        "-evaluation-report.yml": "eval-reports",
    }

    # 文件扩展名到目标目录的映射
    EXT_TO_DIR = {
        ".py": "scripts",
        ".sh": "scripts",
        ".js": "scripts",
        ".md": "references",
        ".yaml": "references",
        ".yml": "references",
        ".json": "references",
        ".txt": "references",
        ".csv": "references",
        ".png": "assets",
        ".jpg": "assets",
        ".jpeg": "assets",
        ".gif": "assets",
        ".svg": "assets",
    }

    def __init__(self, dry_run: bool = False):
        self.dry_run = dry_run
        self.issues: List[Issue] = []
        self.fix_results: List[FixResult] = []
        self.backup_dir: Optional[Path] = None

    # ------------------------------------------------------------------
    # 扫描诊断
    # ------------------------------------------------------------------

    def scan(self, skill_path: Path) -> List[Issue]:
        """扫描单个 Skill，返回问题列表"""
        self.issues = []
        skill_path = Path(skill_path).resolve()

        if not skill_path.exists():
            self.issues.append(Issue("E001", "error", f"路径不存在: {skill_path}", False))
            return self.issues

        if not self._is_skill_directory(skill_path):
            self.issues.append(Issue("E002", "error", f"非 Skill 目录（缺少 SKILL.md）: {skill_path}", False))
            return self.issues

        # 1. 调用 validate-skill.py 获取基础问题
        self._run_validator(skill_path)

        # 2. Doctor 特有检测：根目录杂乱文件
        self._detect_clutter(skill_path)

        # 3. Doctor 特有检测：空目录缺少 .gitkeep
        self._detect_missing_gitkeep(skill_path)

        # 4. Doctor 特有检测：路径引用失效
        self._detect_broken_references(skill_path)

        return self.issues

    def scan_batch(self, skills_dir: Path) -> Dict[str, List[Issue]]:
        """批量扫描目录下的全部 Skill"""
        skills_dir = Path(skills_dir).resolve()
        results = {}

        for item in sorted(skills_dir.iterdir()):
            if item.is_dir() and not item.name.startswith(".") and not item.name.endswith(".md"):
                if self._is_skill_directory(item):
                    results[item.name] = self.scan(item)

        return results

    def _is_skill_directory(self, path: Path) -> bool:
        return (path / "SKILL.md").exists()

    def _run_validator(self, skill_path: Path):
        """调用 validate-skill.py 获取问题"""
        validator_path = Path(__file__).resolve().parents[2] / "lute-skills-creator" / "scripts" / "validate-skill.py"
        if not validator_path.exists():
            self.issues.append(Issue(
                "V_UNAVAILABLE",
                "warning",
                f"validate-skill.py 不存在: {validator_path}",
                False,
            ))
            return

        try:
            result = subprocess.run(
                [sys.executable, str(validator_path), str(skill_path), "--json"],
                capture_output=True,
                text=True,
                timeout=30,
            )

            if result.returncode != 0 and not result.stdout:
                detail = result.stderr.strip() or f"exit code {result.returncode}"
                self.issues.append(Issue(
                    "V_RUN",
                    "warning",
                    f"validate-skill.py 执行失败: {detail}",
                    False,
                ))
                return

            data = json.loads(result.stdout)

            # 解析 errors
            for e in data.get("errors", []):
                self.issues.append(Issue(
                    code="V_ERR",
                    severity="error",
                    message=f"[{e['location']}] {e['message']}",
                    auto_fixable=False,
                ))

            # 解析 warnings → 映射到 doctor 问题码
            for w in data.get("warnings", []):
                msg = w["message"]
                loc = w["location"]

                if "README.md" in msg:
                    self.issues.append(Issue("D001", "warning", "缺少 README.md", True, "generate_readme"))
                elif ".skill-meta" in msg:
                    self.issues.append(Issue("D003", "warning", "缺少 .skill-meta/manifest.yaml", True, "generate_manifest"))
                elif "Missing recommended directory for complex skill: references" in msg:
                    self.issues.append(Issue("D004", "warning", "complex Skill 缺少 references/", True, "create_references"))
                elif "Empty directory" in msg:
                    dir_name = msg.split(":")[0].replace("Empty directory: ", "").strip().rstrip("/.")
                    self.issues.append(Issue("D007", "info", f"空目录缺少 .gitkeep: {dir_name}", True, "add_gitkeep", path=dir_name))
                elif "Unknown directory" in msg:
                    pass  # 将在 _detect_clutter 中处理
                elif msg.startswith(".gitkeep:"):
                    pass  # .gitkeep 是占位文件，不需要 shebang 或可执行权限
                else:
                    self.issues.append(Issue("V_WARN", "warning", f"[{loc}] {msg}", False))

        except subprocess.TimeoutExpired:
            self.issues.append(Issue(
                "V_TIMEOUT",
                "warning",
                "validate-skill.py 执行超时",
                False,
            ))
        except json.JSONDecodeError as exc:
            self.issues.append(Issue(
                "V_JSON",
                "warning",
                f"validate-skill.py 输出不是合法 JSON: {exc}",
                False,
            ))
        except OSError as exc:
            self.issues.append(Issue(
                "V_RUN",
                "warning",
                f"validate-skill.py 无法执行: {exc}",
                False,
            ))

    def _detect_clutter(self, skill_path: Path):
        """检测根目录中的杂乱文件"""
        clutter = []
        for item in skill_path.iterdir():
            if item.name in self.ALLOWED_ROOT_ITEMS:
                continue
            if item.name.startswith("."):
                continue
            clutter.append(item)

        if clutter:
            names = ", ".join(c.name for c in clutter)
            self.issues.append(Issue(
                "D005", "warning",
                f"根目录存在杂乱文件: {names}",
                True, "migrate_clutter",
            ))

    def _detect_missing_gitkeep(self, skill_path: Path):
        """检测空目录是否缺少 .gitkeep"""
        for dir_name in [
            "references", "examples", "scripts", "tests", "assets", "eval-reports",
        ]:
            dir_path = skill_path / dir_name
            if dir_path.exists() and not any(dir_path.iterdir()):
                gitkeep = dir_path / ".gitkeep"
                if not gitkeep.exists():
                    self.issues.append(Issue(
                        "D007", "info",
                        f"空目录缺少 .gitkeep: {dir_name}/",
                        True, "add_gitkeep", path=dir_name,
                    ))

    def _detect_broken_references(self, skill_path: Path):
        """检测 SKILL.md 中的失效路径引用"""
        skill_md = skill_path / "SKILL.md"
        if not skill_md.exists():
            return

        content = skill_md.read_text(encoding="utf-8")
        content = re.sub(r"```.*?```", "", content, flags=re.DOTALL)

        # 匹配引用路径
        patterns = [
            r'`([^`]+/(?:references|scripts|examples|assets|eval-reports)/[^`]+)`',
            r'\(([^)]+/(?:references|scripts|examples|assets|eval-reports)/[^)]+)\)',
        ]

        for pattern in patterns:
            for match in re.finditer(pattern, content):
                ref_path = match.group(1)
                if not self._reference_exists(skill_path, ref_path):
                    self.issues.append(Issue(
                        "D006", "warning",
                        f"路径引用失效: {ref_path}",
                        True, "fix_reference", path=ref_path,
                    ))

    def _reference_exists(self, skill_path: Path, ref_path: str) -> bool:
        """支持 skill 内相对路径和仓库根路径两类引用。"""
        ref = Path(ref_path)
        if ref_path.startswith(("skills/", "layout/", "docs/", "archive/")):
            repo_root = Path(__file__).resolve().parents[3]
            return (repo_root / ref).exists()
        return (skill_path / ref).exists()

    # ------------------------------------------------------------------
    # 修复执行
    # ------------------------------------------------------------------

    def fix(self, skill_path: Path) -> List[FixResult]:
        """执行自动修复"""
        self.fix_results = []
        skill_path = Path(skill_path).resolve()

        if not self._is_skill_directory(skill_path):
            self.fix_results.append(FixResult(False, "skip", "非 Skill 目录"))
            return self.fix_results

        # 创建备份
        if not self.dry_run:
            self._create_backup(skill_path)

        for issue in self.issues:
            if not issue.auto_fixable:
                continue

            result = self._apply_fix(skill_path, issue)
            self.fix_results.append(result)

        return self.fix_results

    def _apply_fix(self, skill_path: Path, issue: Issue) -> FixResult:
        """应用单个修复"""
        action = issue.fix_action

        if action == "generate_readme":
            return self._fix_generate_readme(skill_path)
        elif action == "generate_manifest":
            return self._fix_generate_manifest(skill_path)
        elif action == "create_references":
            return self._fix_create_dir(skill_path, "references")
        elif action == "migrate_clutter":
            return self._fix_migrate_clutter(skill_path)
        elif action == "fix_reference":
            return self._fix_reference(skill_path, issue.path or "")
        elif action == "add_gitkeep":
            return self._fix_add_gitkeep(skill_path, issue.path or "")

        return FixResult(False, "unknown", f"未知修复动作: {action}")

    def _fix_generate_readme(self, skill_path: Path) -> FixResult:
        """生成 README.md 模板"""
        readme_path = skill_path / "README.md"

        # 从 SKILL.md 提取基本信息
        skill_md = skill_path / "SKILL.md"
        name = skill_path.name
        description = ""
        if skill_md.exists():
            content = skill_md.read_text(encoding="utf-8")
            # 简单提取第一行非空文本作为描述
            for line in content.split("\n"):
                line = line.strip()
                if line and not line.startswith("#") and not line.startswith("-"):
                    description = line[:100]
                    break

        template = f"""# {name}

{description}

## 快速开始

```
/{name}
```

## 参考资源

- `references/` — 详细文档
- `examples/` — 使用示例
"""

        if self.dry_run:
            return FixResult(True, "generate_readme", f"[DRY-RUN] 将要生成 README.md", None)

        readme_path.write_text(template, encoding="utf-8")
        return FixResult(True, "generate_readme", f"生成 README.md", str(self.backup_dir))

    def _fix_generate_manifest(self, skill_path: Path) -> FixResult:
        """生成 manifest.yaml"""
        meta_dir = skill_path / ".skill-meta"
        manifest_path = meta_dir / "manifest.yaml"

        # 从 SKILL.md frontmatter 提取信息
        name = skill_path.name
        version = '"1.0.0"'
        complexity = "standard"

        skill_md = skill_path / "SKILL.md"
        if skill_md.exists():
            content = skill_md.read_text(encoding="utf-8")
            if content.startswith("---"):
                fm_end = content.find("---", 3)
                if fm_end > 0:
                    fm = content[3:fm_end].strip()
                    for line in fm.split("\n"):
                        if line.startswith("name:"):
                            name = line.split(":", 1)[1].strip()
                        elif line.startswith("version:"):
                            version = line.split(":", 1)[1].strip()
                        elif line.startswith("complexity:"):
                            complexity = line.split(":", 1)[1].strip().strip('"')

        template = f"""name: {name}
description: |
  {{从 SKILL.md 提取 description}}
version: {version}
complexity: {complexity}
compatibility:
  claude: {{ status: native }}
  kimi: {{ status: native }}
  cursor: {{ status: native }}
  gpt: {{ status: bridge }}
  minimax: {{ status: bridge }}
"""

        if self.dry_run:
            return FixResult(True, "generate_manifest", f"[DRY-RUN] 将要生成 .skill-meta/manifest.yaml", None)

        meta_dir.mkdir(exist_ok=True)
        manifest_path.write_text(template, encoding="utf-8")
        return FixResult(True, "generate_manifest", f"生成 .skill-meta/manifest.yaml", str(self.backup_dir))

    def _fix_create_dir(self, skill_path: Path, dir_name: str) -> FixResult:
        """创建目录"""
        dir_path = skill_path / dir_name
        if self.dry_run:
            return FixResult(True, "create_dir", f"[DRY-RUN] 将要创建 {dir_name}/", None)

        dir_path.mkdir(exist_ok=True)
        return FixResult(True, "create_dir", f"创建 {dir_name}/", str(self.backup_dir))

    def _fix_migrate_clutter(self, skill_path: Path) -> FixResult:
        """迁移根目录杂乱文件"""
        moves = []
        for item in skill_path.iterdir():
            if item.name in self.ALLOWED_ROOT_ITEMS:
                continue
            if item.name.startswith("."):
                continue

            target_dir_name = self._target_dir_for_file(item)
            target_dir = skill_path / target_dir_name

            if self.dry_run:
                moves.append(f"{item.name} -> {target_dir_name}/")
                continue

            target_dir.mkdir(exist_ok=True)
            shutil.move(str(item), str(target_dir / item.name))
            moves.append(f"{item.name} -> {target_dir_name}/")

        if self.dry_run:
            return FixResult(True, "migrate_clutter", f"[DRY-RUN] 将要迁移: {', '.join(moves)}", None)

        # 更新路径引用
        self._update_path_references(skill_path, moves)

        return FixResult(True, "migrate_clutter", f"迁移 {len(moves)} 个文件", str(self.backup_dir))

    def _target_dir_for_file(self, item: Path) -> str:
        """根据文件名语义优先分类，再回退到扩展名。"""
        name = item.name.lower()
        for suffix, dir_name in self.SUFFIX_TO_DIR.items():
            if name.endswith(suffix):
                return dir_name
        return self.EXT_TO_DIR.get(item.suffix.lower(), "references")

    def _fix_reference(self, skill_path: Path, ref_path: str) -> FixResult:
        """修复失效路径引用"""
        skill_md = skill_path / "SKILL.md"
        if not skill_md.exists():
            return FixResult(False, "fix_reference", "SKILL.md 不存在")

        content = skill_md.read_text(encoding="utf-8")
        # 尝试找到正确的路径（在允许的目录中搜索同名文件）
        file_name = Path(ref_path).name
        for dir_name in ["references", "scripts", "examples", "assets", "eval-reports"]:
            candidate = skill_path / dir_name / file_name
            if candidate.exists():
                new_path = f"{dir_name}/{file_name}"
                if self.dry_run:
                    return FixResult(True, "fix_reference", f"[DRY-RUN] 将要更新引用: {ref_path} -> {new_path}", None)

                content = content.replace(ref_path, new_path)
                skill_md.write_text(content, encoding="utf-8")
                return FixResult(True, "fix_reference", f"更新引用: {ref_path} -> {new_path}", str(self.backup_dir))

        return FixResult(False, "fix_reference", f"找不到 {file_name} 的替代路径")

    def _fix_add_gitkeep(self, skill_path: Path, dir_name: str) -> FixResult:
        """添加 .gitkeep"""
        dir_path = skill_path / dir_name
        gitkeep = dir_path / ".gitkeep"

        if self.dry_run:
            return FixResult(True, "add_gitkeep", f"[DRY-RUN] 将要创建 {dir_name}/.gitkeep", None)

        gitkeep.write_text("", encoding="utf-8")
        return FixResult(True, "add_gitkeep", f"创建 {dir_name}/.gitkeep", str(self.backup_dir))

    def _update_path_references(self, skill_path: Path, moves: List[str]):
        """更新 SKILL.md 和 README.md 中的路径引用"""
        for md_file in ["SKILL.md", "README.md"]:
            md_path = skill_path / md_file
            if not md_path.exists():
                continue

            content = md_path.read_text(encoding="utf-8")
            original = content

            for move in moves:
                # 解析 "filename -> dir/"
                if " -> " in move:
                    file_name = move.split(" -> ")[0].strip()
                    dir_name = move.split(" -> ")[1].strip().rstrip("/")
                    # 替换根目录引用为子目录引用
                    content = content.replace(f"`{file_name}`", f"`{dir_name}/{file_name}`")
                    content = content.replace(f"]({file_name})", f"]({dir_name}/{file_name})")

            if content != original:
                md_path.write_text(content, encoding="utf-8")

    # ------------------------------------------------------------------
    # 备份与回滚
    # ------------------------------------------------------------------

    def _create_backup(self, skill_path: Path) -> Path:
        """创建备份"""
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup_dir = skill_path / ".doctor-backup" / timestamp
        backup_dir.mkdir(parents=True, exist_ok=True)
        self.backup_dir = backup_dir

        # 备份所有将要修改的文件
        for item in skill_path.iterdir():
            if item.name.startswith(".") and item.name != ".skill-meta":
                continue
            if item.is_file():
                shutil.copy2(str(item), str(backup_dir / item.name))

        # 备份 .skill-meta/
        meta_dir = skill_path / ".skill-meta"
        if meta_dir.exists():
            backup_meta = backup_dir / ".skill-meta"
            backup_meta.mkdir(exist_ok=True)
            for f in meta_dir.iterdir():
                if f.is_file():
                    shutil.copy2(str(f), str(backup_meta / f.name))

        # 记录操作日志
        log_path = backup_dir / "operation.log"
        log_path.write_text(f"备份时间: {timestamp}\n", encoding="utf-8")

        return backup_dir

    def rollback(self, skill_path: Path) -> List[FixResult]:
        """回滚到最近一次备份"""
        skill_path = Path(skill_path).resolve()
        backup_root = skill_path / ".doctor-backup"

        if not backup_root.exists():
            return [FixResult(False, "rollback", "无备份可回滚")]

        # 找最新的备份
        backups = sorted(backup_root.iterdir(), key=lambda p: p.name, reverse=True)
        if not backups:
            return [FixResult(False, "rollback", "无备份可回滚")]

        latest = backups[0]
        results = []

        # 恢复文件
        for item in latest.iterdir():
            if item.name == "operation.log":
                continue
            target = skill_path / item.name
            if item.is_file():
                shutil.copy2(str(item), str(target))
                results.append(FixResult(True, "rollback", f"恢复 {item.name}"))
            elif item.is_dir():
                if target.exists():
                    shutil.rmtree(str(target))
                shutil.copytree(str(item), str(target))
                results.append(FixResult(True, "rollback", f"恢复 {item.name}/"))

        return results

    # ------------------------------------------------------------------
    # 报告生成
    # ------------------------------------------------------------------

    def generate_report(self, skill_path: Path) -> str:
        """生成检测报告"""
        lines = [f"# Skill Doctor 报告: {skill_path.name}", ""]

        errors = [i for i in self.issues if i.severity == "error"]
        warnings = [i for i in self.issues if i.severity == "warning"]
        infos = [i for i in self.issues if i.severity == "info"]

        lines.append(f"**检测时间**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        lines.append(f"**问题统计**: ❌ {len(errors)}  error | ⚠️  {len(warnings)} warning | ℹ️  {len(infos)} info")
        lines.append("")

        if errors:
            lines.append("## Errors")
            for e in errors:
                lines.append(f"- ❌ [{e.code}] {e.message}")
            lines.append("")

        if warnings:
            lines.append("## Warnings")
            for w in warnings:
                fix_tag = "(可自动修复)" if w.auto_fixable else "(需手动处理)"
                lines.append(f"- ⚠️  [{w.code}] {w.message} {fix_tag}")
            lines.append("")

        if infos:
            lines.append("## Info")
            for i in infos:
                fix_tag = "(可自动修复)" if i.auto_fixable else ""
                lines.append(f"- ℹ️  [{i.code}] {i.message} {fix_tag}")
            lines.append("")

        if self.fix_results:
            lines.append("## 修复结果")
            for r in self.fix_results:
                icon = "✅" if r.success else "❌"
                lines.append(f"- {icon} {r.action}: {r.detail}")
            lines.append("")

        auto_fixable = [i for i in self.issues if i.auto_fixable]
        if auto_fixable:
            lines.append(f"**可自动修复**: {len(auto_fixable)} 项")
            lines.append("")
            if not self.dry_run and not any(r.action != "skip" for r in self.fix_results):
                lines.append("运行 `skill-doctor.py --fix` 执行自动修复。")
        else:
            lines.append("**无自动修复项。**")

        return "\n".join(lines)

    def generate_batch_report(self, results: Dict[str, List[Issue]]) -> str:
        """生成批量检测报告"""
        today = datetime.now().strftime("%Y-%m-%d")
        lines = [
            "---",
            "title: Skill Doctor 批量检测报告",
            "doc_type: analysis",
            "module: lute-skills-doctor",
            "topic: batch-structure-health",
            "status: stable",
            f"created: {today}",
            f"updated: {today}",
            "owner: self",
            "source: ai",
            "---",
            "",
            "# Skill Doctor 批量检测报告",
            "",
        ]

        total = len(results)
        total_errors = sum(len([i for i in issues if i.severity == "error"]) for issues in results.values())
        total_warnings = sum(len([i for i in issues if i.severity == "warning"]) for issues in results.values())
        total_infos = sum(len([i for i in issues if i.severity == "info"]) for issues in results.values())
        total_auto_fixable = sum(len([i for i in issues if i.auto_fixable]) for issues in results.values())
        auto_fixable_warnings = sum(
            len([i for i in issues if i.severity == "warning" and i.auto_fixable])
            for issues in results.values()
        )
        auto_fixable_infos = sum(
            len([i for i in issues if i.severity == "info" and i.auto_fixable])
            for issues in results.values()
        )

        lines.append(f"**扫描 Skill 总数**: {total}")
        lines.append(f"**问题汇总**: ❌ {total_errors} error | ⚠️  {total_warnings} warning | ℹ️  {total_infos} info")
        lines.append(f"**可自动修复**: {total_auto_fixable} 项（warning {auto_fixable_warnings} / info {auto_fixable_infos}）")
        lines.append("")

        issue_counter = Counter(
            (issue.code, issue.severity, issue.auto_fixable)
            for issues in results.values()
            for issue in issues
        )
        if issue_counter:
            lines.append("## 问题类型分布")
            lines.append("")
            lines.append("| Code | Severity | Count | Auto-fixable |")
            lines.append("|------|----------|------:|--------------|")
            for (code, severity, auto_fixable), count in sorted(issue_counter.items(), key=lambda item: (-item[1], item[0])):
                lines.append(f"| {code} | {severity} | {count} | {'yes' if auto_fixable else 'no'} |")
            lines.append("")

        # 按问题数量排序
        sorted_results = sorted(results.items(), key=lambda x: len(x[1]), reverse=True)

        lines.append("| Skill | Errors | Warnings | Info | 可自动修复 |")
        lines.append("|-------|--------|----------|------|-----------|")
        for name, issues in sorted_results:
            e = len([i for i in issues if i.severity == "error"])
            w = len([i for i in issues if i.severity == "warning"])
            info = len([i for i in issues if i.severity == "info"])
            a = len([i for i in issues if i.auto_fixable])
            lines.append(f"| {name} | {e} | {w} | {info} | {a} |")

        lines.append("")
        lines.append("**建议**: 优先修复 error 和可自动修复的 warning。")

        return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Skill Doctor - 检测并修复 Skill 目录结构")
    parser.add_argument("path", type=Path, help="Skill 目录或 skills 父目录")
    parser.add_argument("--batch", action="store_true", help="批量处理目录下的全部 Skill")
    parser.add_argument("--check", action="store_true", help="仅检测，不修复")
    parser.add_argument("--dry-run", action="store_true", help="预览修复操作，不实际修改")
    parser.add_argument("--rollback", action="store_true", help="回滚到最近一次备份")
    parser.add_argument("--fix", action="store_true", help="执行自动修复（默认行为）")

    args = parser.parse_args()
    target = Path(args.path).resolve()

    doctor = SkillDoctor(dry_run=args.dry_run)

    # 回滚模式
    if args.rollback:
        if args.batch:
            print("批量回滚暂不支持，请逐个 Skill 回滚。")
            sys.exit(1)
        results = doctor.rollback(target)
        for r in results:
            icon = "✅" if r.success else "❌"
            print(f"{icon} {r.action}: {r.detail}")
        sys.exit(0)

    # 批量模式
    if args.batch:
        if not target.is_dir():
            print(f"❌ 批量模式需要目录路径: {target}")
            sys.exit(1)

        results = doctor.scan_batch(target)
        report = doctor.generate_batch_report(results)
        print(report)

        # 保存报告
        report_path = target.parent / "docs" / "skill-doctor-batch-report-current.md"
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(report, encoding="utf-8")
        print(f"\n💾 报告已保存: {report_path}")
        sys.exit(0)

    # 单 Skill 模式
    if not target.exists():
        print(f"❌ 路径不存在: {target}")
        sys.exit(1)

    issues = doctor.scan(target)

    if args.check:
        report = doctor.generate_report(target)
        print(report)
        sys.exit(0)

    # 检测 + 修复
    if not args.dry_run:
        print(f"🔍 扫描 {target.name}...")
        errors = [i for i in issues if i.severity == "error"]
        warnings = [i for i in issues if i.severity == "warning"]
        infos = [i for i in issues if i.severity == "info"]
        print(f"  发现: ❌ {len(errors)} error | ⚠️  {len(warnings)} warning | ℹ️  {len(infos)} info")

        auto_fixable = [i for i in issues if i.auto_fixable]
        if auto_fixable:
            print(f"\n🔧 执行 {len(auto_fixable)} 项自动修复...")

    doctor.fix(target)
    report = doctor.generate_report(target)
    print(report)

    # 保存报告
    report_path = target / f".doctor-backup/doctor-report-{datetime.now().strftime('%Y%m%d-%H%M%S')}.md"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(report, encoding="utf-8")


if __name__ == "__main__":
    main()
