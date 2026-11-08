# Provenance

- **Skill:** autoresearch v2.3.0 — Autonomous goal-directed iteration (modify → verify → keep/discard → repeat).
- **Installed from:** https://github.com/uditgoenka/autoresearch (commit at install time; cloned 2026-11-08).
- **Licence:** MIT — see the upstream repository `LICENSE`. This local copy keeps its files unchanged; findings and project-specific configuration live outside this directory (`docs/autoresearch/`) so the skill can be refreshed from upstream freely.
- **Upstream credits (per upstream README):** Andrej Karpathy — for the original autoresearch; Anthropic — for Claude Code and the skills system; Udit Goenka — for this skill.
- **Installed for:** Claude Code (`.claude/skills/autoresearch/`, `.claude/commands/autoresearch*`) and OpenCode (`.opencode/skills/autoresearch/`, `.opencode/commands/autoresearch*.md`).
- **Not installed (optional):** the Claude Code hook set (`.claude/hooks/autoresearch/` in upstream) — these wire into Claude Code settings and are additive safety rails; add later if wanted.

To update: re-clone the upstream repo and replace this directory's `SKILL.md`, `references/`, and `scripts/`, then re-apply nothing else — project configuration never lives here.
