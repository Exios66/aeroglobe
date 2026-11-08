#!/usr/bin/env bash
# Install the in-repo autoresearch skill into the global agent config directories so it is
# available in every session (Claude Code, OpenCode, and harnesses such as T3 Code that
# run on OpenCode). Idempotent; safe to re-run after refreshing the in-repo copies.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"

claude_config="${CAESIUM_CLAUDE_CONFIG:-$HOME/.claude}"
opencode_config="${CAESIUM_OPENCODE_CONFIG:-$CONFIG_HOME/opencode}"

installed=0

if [ -d "$REPO_ROOT/.claude/skills/autoresearch" ]; then
  mkdir -p "$claude_config/skills" "$claude_config/commands"
  rm -rf "$claude_config/skills/autoresearch"
  cp -R "$REPO_ROOT/.claude/skills/autoresearch" "$claude_config/skills/"
  rm -rf "$claude_config/commands/autoresearch" "$claude_config/commands/autoresearch.md"
  cp -R "$REPO_ROOT/.claude/commands/autoresearch" "$claude_config/commands/"
  cp "$REPO_ROOT/.claude/commands/autoresearch.md" "$claude_config/commands/autoresearch.md"
  echo "installed for Claude Code: $claude_config"
  installed=1
fi

if [ -d "$REPO_ROOT/.opencode/skills/autoresearch" ]; then
  mkdir -p "$opencode_config/skills" "$opencode_config/commands"
  rm -rf "$opencode_config/skills/autoresearch"
  cp -R "$REPO_ROOT/.opencode/skills/autoresearch" "$opencode_config/skills/"
  rm -f "$opencode_config"/commands/autoresearch*.md
  cp "$REPO_ROOT"/.opencode/commands/autoresearch*.md "$opencode_config/commands/"
  echo "installed for OpenCode:    $opencode_config"
  installed=1
fi

if [ "$installed" -ne 1 ]; then
  echo "no in-repo autoresearch copies found; run the upstream installer first" >&2
  exit 1
fi

echo "new sessions will discover /autoresearch and its subcommands globally"
