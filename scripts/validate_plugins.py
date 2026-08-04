#!/usr/bin/env python3
"""Fast, dependency-free validation for the bundled host plugins."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def load_json(path: Path) -> dict:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain an object")
    return value


def validate_skill(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n") or "\n---\n" not in text[4:]:
        raise ValueError(f"{path} needs YAML frontmatter")
    frontmatter = text.split("---", 2)[1]
    if "name: bootstrap-project" not in frontmatter or "description:" not in frontmatter:
        raise ValueError(f"{path} needs name and description")
    if "[TODO:" in text:
        raise ValueError(f"{path} contains a TODO placeholder")


def main() -> None:
    codex = ROOT / "plugins" / "bb-code"
    claude = ROOT / "plugins" / "claude" / "bb-code"
    codex_manifest = load_json(codex / ".codex-plugin" / "plugin.json")
    claude_manifest = load_json(claude / ".claude-plugin" / "plugin.json")
    if codex_manifest.get("name") != "bb-code" or claude_manifest.get("name") != "bb-code":
        raise ValueError("plugin names must be bb-code")
    load_json(codex / ".mcp.json")
    load_json(codex / "hooks" / "hooks.json")
    load_json(claude / ".mcp.json")
    load_json(claude / "hooks" / "hooks.json")
    load_json(ROOT / ".agents" / "plugins" / "marketplace.json")
    load_json(ROOT / ".claude-plugin" / "marketplace.json")
    validate_skill(codex / "skills" / "bootstrap-project" / "SKILL.md")
    validate_skill(claude / "skills" / "bootstrap-project" / "SKILL.md")
    print("Codex and Claude plugins are valid.")


if __name__ == "__main__":
    main()
