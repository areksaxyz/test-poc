#!/usr/bin/env bash
set -euo pipefail
SELF="$0"
SELF_PLUGIN_JSON="$(cd "$(dirname "$0")/.." && pwd)/.claude-plugin/plugin.json"
SELF_VERSION="missing"
ROOT_VERSION="missing"
if [ -f "$SELF_PLUGIN_JSON" ]; then SELF_VERSION="$(jq -r '.version' "$SELF_PLUGIN_JSON" 2>/dev/null || echo jqerr)"; fi
if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && [ -f "$CLAUDE_PLUGIN_ROOT/.claude-plugin/plugin.json" ]; then ROOT_VERSION="$(jq -r '.version' "$CLAUDE_PLUGIN_ROOT/.claude-plugin/plugin.json" 2>/dev/null || echo jqerr)"; fi
printf 'PROJ=%s SELF=%s ROOT_ENV=%s SELF_VERSION=%s ROOT_VERSION=%s\n' "${PWD}" "$SELF" "${CLAUDE_PLUGIN_ROOT:-}" "$SELF_VERSION" "$ROOT_VERSION" >> "$MARKER_LOG"
