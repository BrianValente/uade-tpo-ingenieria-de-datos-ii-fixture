#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

wait_for_iris() {
  for _ in {1..30}; do
    if docker compose --project-directory "$repo_root" exec -T iris iris qlist IRIS 2>/dev/null | grep -q running; then
      return 0
    fi
    sleep 2
  done
  return 1
}

if ! wait_for_iris; then
  printf '%s\n' "IRIS no esta disponible para compilar las clases." >&2
  exit 1
fi

set +e
output="$({
  docker compose --project-directory "$repo_root" exec -T iris \
    iris session IRIS -U USER <<'OBJECTSCRIPT'
Set sc = $System.OBJ.LoadDir("/workspace/iris/src", "ck", , 1)
If $System.Status.IsError(sc) Do $System.Status.DisplayError(sc)
If $System.Status.IsError(sc) Write "COMPILE_STATUS=ERROR", !
If '$System.Status.IsError(sc) Write "COMPILE_STATUS=OK", !
Halt
OBJECTSCRIPT
} 2>&1)"
command_status=$?
set -e

printf '%s\n' "$output"

if (( command_status != 0 )); then
  exit "$command_status"
fi

if [[ "$output" == *"COMPILE_STATUS=ERROR"* ]] || [[ "$output" != *"COMPILE_STATUS=OK"* ]]; then
  printf '%s\n' "La compilacion de las clases IRIS fallo." >&2
  exit 1
fi
