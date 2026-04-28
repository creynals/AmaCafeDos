#!/usr/bin/env bash
# Install amaCafe git hooks into .git/hooks/ (Cycle 87 — G4).
#
# Hooks are tracked under scripts/git-hooks/ so they live in version control;
# this script symlinks them into the active .git/hooks/ directory. Re-runnable.

set -euo pipefail

repo_root=$(git rev-parse --show-toplevel)
src_dir="$repo_root/scripts/git-hooks"
dst_dir="$repo_root/.git/hooks"

if [ ! -d "$src_dir" ]; then
  echo "no hooks to install ($src_dir missing)" >&2
  exit 1
fi

mkdir -p "$dst_dir"

installed=0
for hook in "$src_dir"/*; do
  name=$(basename "$hook")
  target="$dst_dir/$name"

  # Make the source executable (in case it was checked out without +x).
  chmod +x "$hook"

  # Backup any existing non-symlink hook once.
  if [ -e "$target" ] && [ ! -L "$target" ]; then
    cp "$target" "$target.backup-$(date +%s)"
    rm "$target"
  elif [ -L "$target" ]; then
    rm "$target"
  fi

  ln -s "$hook" "$target"
  echo "installed: $name -> $hook"
  installed=$((installed + 1))
done

echo "done — $installed hook(s) active in $dst_dir"
