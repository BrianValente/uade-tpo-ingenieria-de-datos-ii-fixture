#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

"$repo_root/iris/scripts/cargar.sh"

output="$({
  docker compose --project-directory "$repo_root" exec -T iris \
    iris session IRIS -U USER <<'OBJECTSCRIPT'
Set sc = ##class(Fixture.Demo).Ejecutar()
If $System.Status.IsError(sc) Do $System.Status.DisplayError(sc)
Halt
OBJECTSCRIPT
} 2>&1)"

printf '%s\n' "$output"

partido_id=""
while IFS= read -r line; do
  case "$line" in
    PARTIDO_ID=*) partido_id="${line#PARTIDO_ID=}" ;;
  esac
done <<< "$output"

if [[ -z "$partido_id" ]] || [[ "$output" != *"OK: demostracion completa"* ]]; then
  printf '%s\n' "La demostracion no termino correctamente." >&2
  exit 1
fi

docker compose --project-directory "$repo_root" restart iris >/dev/null

iris_ready=false
for _ in {1..30}; do
  if docker compose --project-directory "$repo_root" exec -T iris iris qlist IRIS 2>/dev/null | grep -q running; then
    iris_ready=true
    break
  fi
  sleep 2
done

if [[ "$iris_ready" != true ]]; then
  printf '%s\n' "IRIS no quedo disponible despues del reinicio." >&2
  exit 1
fi

persistence_output="$({
  docker compose --project-directory "$repo_root" exec -T iris \
    iris session IRIS -U USER <<OBJECTSCRIPT
Set sc = ##class(Fixture.Demo).VerificarPersistencia("$partido_id")
If \$System.Status.IsError(sc) Do \$System.Status.DisplayError(sc)
Halt
OBJECTSCRIPT
} 2>&1)"

printf '%s\n' "$persistence_output"

if [[ "$persistence_output" != *"OK: persistencia durable despues del reinicio"* ]]; then
  printf '%s\n' "La comprobacion de persistencia durable fallo." >&2
  exit 1
fi
