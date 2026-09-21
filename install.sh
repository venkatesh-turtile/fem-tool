#!/usr/bin/env bash
# Install the Frontend Migration Impact Workflow into a repo.
#
#   ./install.sh /path/to/your-repo
#
# Copies the skills into <repo>/.claude/skills/ and, if the repo has no
# fem.config.json yet, drops the example in for you to edit.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
target="${1:-}"

if [ -z "$target" ]; then
  echo "usage: ./install.sh /path/to/your-repo" >&2
  exit 1
fi
if [ ! -d "$target" ]; then
  echo "no such directory: $target" >&2
  exit 1
fi

mkdir -p "$target/.claude/skills"
cp -R "$here"/skills/fem-* "$target/.claude/skills/"
echo "skills   → $target/.claude/skills/"

if [ -f "$target/fem.config.json" ]; then
  echo "config   → already present, left alone"
else
  cp "$here/fem.config.example.json" "$target/fem.config.json"
  echo "config   → $target/fem.config.json (edit the paths for your repo)"
fi

cat <<'NEXT'

Next:
  1. Edit fem.config.json — the top half says where your apps, server and
     tests live. The bottom half is the estimating rubric; leave it alone.
  2. Build the index once:
       bun .claude/skills/fem-index/scripts/build-index.ts
  3. Put a design at docs/fe-migration/designs/<app>/<module>/<module>.html
  4. In Claude Code:  /fem-run <app> <module>
NEXT
