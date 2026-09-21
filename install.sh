#!/usr/bin/env bash
# Install the Frontend Migration Impact Workflow into a repo.
#
# From inside the repo you want it in, with nothing cloned:
#
#   curl -fsSL https://raw.githubusercontent.com/venkatesh-turtile/fem-tool/main/install.sh | bash
#
# Or, if you already have a clone:
#
#   ./install.sh /path/to/your-repo
#
# Copies the skills into <repo>/.claude/skills/ and, if the repo has no
# fem.config.json yet, drops the example in for you to edit. It touches nothing
# else: no git operations, no dependencies, no build.
set -euo pipefail

REPO="${FEM_REPO:-venkatesh-turtile/fem-tool}"
REF="${FEM_REF:-main}"

# Where the skills are coming from. Piped through a shell there is no script
# directory to speak of, so fetch the tree instead of asking anyone to clone it
# first. Running from a clone keeps using that clone, which is what a person
# testing a change expects.
here="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || true)"
tmp=""
if [ -d "${here:-}/skills" ]; then
  src="$here"
else
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  echo "fetching ${REPO}@${REF}…"
  curl -fsSL "https://codeload.github.com/${REPO}/tar.gz/refs/heads/${REF}" \
    | tar -xz -C "$tmp" --strip-components=1
  src="$tmp"
fi

if [ ! -d "$src/skills" ]; then
  echo "could not find the skills to install — is ${REPO}@${REF} right?" >&2
  exit 1
fi

# Piped, there is no argument to read, so the current directory is the target.
# That is the common case: you are standing in the repo you want it in.
target="${1:-$PWD}"

if [ ! -d "$target" ]; then
  echo "no such directory: $target" >&2
  exit 1
fi
if [ ! -e "$target/.git" ] && [ ! -e "$target/package.json" ]; then
  # Installing into the wrong directory is the one real hazard of defaulting to
  # the current one, and it is silent. Say so rather than scattering folders.
  echo "warning: $target does not look like a repository root (no .git, no package.json)" >&2
  echo "         pass the path explicitly if that is wrong: install.sh /path/to/repo" >&2
fi

mkdir -p "$target/.claude/skills"
cp -R "$src"/skills/fem-* "$target/.claude/skills/"
echo "skills   → $target/.claude/skills/  ($(find "$src"/skills -maxdepth 1 -name 'fem-*' | wc -l | tr -d ' ') skills)"

if [ -f "$target/fem.config.json" ]; then
  echo "config   → already present, left alone"
else
  cp "$src/fem.config.example.json" "$target/fem.config.json"
  echo "config   → $target/fem.config.json (edit the paths for your repo)"
fi

cat <<'NEXT'

Next:
  1. Edit fem.config.json — the top half says where your apps, server and
     tests live. The bottom half is the estimating rubric; leave it alone.
  2. In Claude Code, from inside this repo:
       /fem-run <app> <module> ~/Downloads/<design>.html

That is the whole thing. The run files the design, builds its own index and
asks you whatever it cannot decide — there is nothing to prepare by hand.

To keep the tool out of your git history:
  printf '.claude/skills/fem-*\nfem.config.json\n' >> .git/info/exclude

To update later, run the same command again. Your fem.config.json is left
alone.
NEXT
