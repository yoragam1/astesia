#!/usr/bin/env bash
set -eo pipefail

TARGET=""
DRY_RUN=false
UNINSTALL=false
FORCE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --uninstall)
      UNINSTALL=true
      shift
      ;;
    --force)
      FORCE=true
      shift
      ;;
    *)
      echo "Error: Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

if [[ -z "$TARGET" ]]; then
  DEST_DIR="$HOME/.gemini/antigravity/plugins/astesia"
else
  # Resolve absolute path
  DEST_DIR="$(python3 -c "import os,sys; print(os.path.realpath(sys.argv[1]))" "$TARGET" 2>/dev/null || node -e "console.log(require('path').resolve(process.argv[1]))" "$TARGET" 2>/dev/null || readlink -f "$TARGET" 2>/dev/null || echo "$TARGET")"
fi

# Prevent installing into repo itself
if [[ "$DEST_DIR" == "$SOURCE_DIR" || "$DEST_DIR" == "$SOURCE_DIR"/* ]]; then
  echo "Error: Cannot install into the Astesia source repository ($DEST_DIR)" >&2
  exit 2
fi

# UNINSTALL MODE
if [[ "$UNINSTALL" == true ]]; then
  if [[ ! -d "$DEST_DIR" ]]; then
    echo "Target directory does not exist: $DEST_DIR (nothing to uninstall)"
    exit 0
  fi

  MARKER="$DEST_DIR/.astesia-install.json"
  if [[ ! -f "$MARKER" ]]; then
    echo "Error: Target is not owned by Astesia (missing marker): $DEST_DIR" >&2
    exit 3
  fi

  # Extract repo_path from JSON
  MARKER_REPO="$(grep '"repo_path"' "$MARKER" | head -n 1 | sed -E 's/.*"repo_path":\s*"([^"]+)".*/\1/' || echo "")"
  if [[ -z "$MARKER_REPO" ]]; then
    echo "Error: Invalid marker format in $MARKER" >&2
    exit 3
  fi

  # Normalize paths for comparison
  NORM_MARKER="$(cd "$MARKER_REPO" 2>/dev/null && pwd -P || echo "$MARKER_REPO")"
  NORM_SOURCE="$(cd "$SOURCE_DIR" 2>/dev/null && pwd -P || echo "$SOURCE_DIR")"

  if [[ "$NORM_MARKER" != "$NORM_SOURCE" && "$MARKER_REPO" != "$SOURCE_DIR" ]]; then
    echo "Error: Target is owned by another repository ($MARKER_REPO != $SOURCE_DIR)" >&2
    exit 3
  fi

  if [[ "$DRY_RUN" == true ]]; then
    echo "[DRY-RUN] Would remove Astesia plugin directory: $DEST_DIR"
    exit 0
  fi

  echo "Removing Astesia plugin from: $DEST_DIR"
  rm -rf "$DEST_DIR"
  echo "Astesia plugin uninstalled cleanly."
  exit 0
fi

# INSTALL / UPDATE MODE
if [[ -d "$DEST_DIR" ]]; then
  MARKER="$DEST_DIR/.astesia-install.json"
  IS_OWNED=false
  if [[ -f "$MARKER" ]]; then
    MARKER_REPO="$(grep '"repo_path"' "$MARKER" | head -n 1 | sed -E 's/.*"repo_path":\s*"([^"]+)".*/\1/' || echo "")"
    NORM_MARKER="$(cd "$MARKER_REPO" 2>/dev/null && pwd -P || echo "$MARKER_REPO")"
    NORM_SOURCE="$(cd "$SOURCE_DIR" 2>/dev/null && pwd -P || echo "$SOURCE_DIR")"
    if [[ "$NORM_MARKER" == "$NORM_SOURCE" || "$MARKER_REPO" == "$SOURCE_DIR" ]]; then
      IS_OWNED=true
    fi
  fi

  if [[ "$IS_OWNED" == true && "$FORCE" != true ]]; then
    # Idempotent check
    if [[ -f "$DEST_DIR/plugin.json" && -d "$DEST_DIR/skills" && -d "$DEST_DIR/rules" ]]; then
      echo "Astesia plugin is already installed and up to date at: $DEST_DIR"
      exit 0
    fi
  elif [[ "$IS_OWNED" != true ]]; then
    if [[ "$FORCE" != true ]]; then
      echo "Error: Target directory exists and is not owned by this Astesia repo: $DEST_DIR. Use --force to backup and overwrite." >&2
      exit 4
    fi

    TIMESTAMP="$(date +%Y%m%d%H%M%S)"
    BACKUP_DIR="${DEST_DIR}.bak-${TIMESTAMP}"
    if [[ "$DRY_RUN" == true ]]; then
      echo "[DRY-RUN] Would backup conflicting folder $DEST_DIR -> $BACKUP_DIR"
    else
      echo "Backing up conflicting folder to: $BACKUP_DIR"
      mv "$DEST_DIR" "$BACKUP_DIR"
    fi
  fi
fi

if [[ "$DRY_RUN" == true ]]; then
  echo "[DRY-RUN] Would create directory: $DEST_DIR"
  echo "[DRY-RUN] Would copy plugin.json"
  echo "[DRY-RUN] Would symlink skills -> $SOURCE_DIR/skills"
  echo "[DRY-RUN] Would symlink rules -> $SOURCE_DIR/rules"
  echo "[DRY-RUN] Would write ownership marker .astesia-install.json"
  echo "[DRY-RUN] Would verify installation integrity"
  exit 0
fi

rollback_created_items() {
  rm -rf "$DEST_DIR/plugin.json" "$DEST_DIR/skills" "$DEST_DIR/rules" "$DEST_DIR/.astesia-install.json"
}

mkdir -p "$DEST_DIR"
cp "$SOURCE_DIR/plugin.json" "$DEST_DIR/plugin.json"

rm -rf "$DEST_DIR/skills" "$DEST_DIR/rules"
if ! ln -s "$SOURCE_DIR/skills" "$DEST_DIR/skills" 2>/dev/null || ! ln -s "$SOURCE_DIR/rules" "$DEST_DIR/rules" 2>/dev/null; then
  echo "Error: Failed to link skills and rules directories" >&2
  rollback_created_items
  exit 6
fi

NOW="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
cat << EOF > "$DEST_DIR/.astesia-install.json"
{
  "version": "3.0.0",
  "repo_path": "$SOURCE_DIR",
  "link_type": "symlink",
  "created_paths": [
    "plugin.json",
    "skills",
    "rules",
    ".astesia-install.json"
  ],
  "installed_at": "$NOW"
}
EOF

# Post-installation verification
if [[ ! -f "$DEST_DIR/plugin.json" ]]; then
  echo "Error: Verification failed: target plugin.json not found" >&2
  rollback_created_items
  exit 5
fi

VERSION="$(grep '"version"' "$DEST_DIR/plugin.json" | head -n 1 | sed -E 's/.*"version":\s*"([^"]+)".*/\1/')"
if [[ "$VERSION" != "3.0.0" ]]; then
  echo "Error: Verification failed: plugin.json version mismatch ($VERSION != 3.0.0)" >&2
  rollback_created_items
  exit 5
fi

if [[ ! -f "$DEST_DIR/skills/minimalist-executor/SKILL.md" ]]; then
  echo "Error: Verification failed: skills directory link invalid" >&2
  rollback_created_items
  exit 5
fi

if [[ ! -f "$DEST_DIR/rules/AGENTS.md" ]]; then
  echo "Error: Verification failed: rules directory link invalid" >&2
  rollback_created_items
  exit 5
fi

echo "Astesia plugin installed successfully in Live Mode (symlink) at: $DEST_DIR"
exit 0
