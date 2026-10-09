#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

output="$({
  docker compose --project-directory "$repo_root" exec -T iris \
    iris session IRIS -U USER <<'OBJECTSCRIPT'
Set sc = $System.OBJ.LoadDir("/workspace/iris/src", "ck", , 1)
If $System.Status.IsError(sc) Do $System.Status.DisplayError(sc)
Halt
OBJECTSCRIPT
} 2>&1)"

printf '%s\n' "$output"

if [[ "$output" != *"Load finished successfully."* ]]; then
  printf '%s\n' "La compilacion de las clases IRIS fallo." >&2
  exit 1
fi
