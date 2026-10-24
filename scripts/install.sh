#!/bin/sh
set -eu

anatomy_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)/skills/skill-anatomy
anatomy_agent=${1-both}
anatomy_dry_run=${2-}
case "$anatomy_agent" in
    codex) anatomy_agents=codex ;;
    claude) anatomy_agents=claude ;;
    both) anatomy_agents="codex claude" ;;
    *) echo '使い方: sh scripts/install.sh [codex|claude|both] [--dry-run]' >&2; exit 1 ;;
esac
if [ "$#" -gt 2 ] || { [ -n "$anatomy_dry_run" ] && [ "$anatomy_dry_run" != --dry-run ]; }; then
    echo '使い方: sh scripts/install.sh [codex|claude|both] [--dry-run]' >&2
    exit 1
fi

anatomy_target() {
    case "$1" in
        codex) printf '%s/.agents/skills/skill-anatomy\n' "$HOME" ;;
        claude) printf '%s/.claude/skills/skill-anatomy\n' "$HOME" ;;
    esac
}

# Check every destination before creating anything. Never overwrite another skill.
for anatomy_item in $anatomy_agents; do
    anatomy_link=$(anatomy_target "$anatomy_item")
    if [ -e "$anatomy_link" ] || [ -L "$anatomy_link" ]; then
        anatomy_existing=$(CDPATH= cd -- "$anatomy_link" 2>/dev/null && pwd -P) || anatomy_existing=
        if [ "$anatomy_existing" != "$anatomy_root" ]; then
            printf '別のスキルが存在するため停止しました: %s\n' "$anatomy_link" >&2
            exit 1
        fi
    fi
done

for anatomy_item in $anatomy_agents; do
    anatomy_link=$(anatomy_target "$anatomy_item")
    if [ "$anatomy_dry_run" = --dry-run ]; then
        printf '%s -> %s\n' "$anatomy_link" "$anatomy_root"
    elif [ -e "$anatomy_link" ]; then
        printf '登録済み: %s\n' "$anatomy_link"
    else
        mkdir -p -- "$(dirname -- "$anatomy_link")"
        ln -s -- "$anatomy_root" "$anatomy_link"
        printf '登録しました: %s\n' "$anatomy_link"
    fi
done
