#!/usr/bin/env bash
set -euo pipefail

# Obtener directorio del script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HITO_11_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_DIR="$(cd "$HITO_11_DIR/.." && pwd)"
HITO_10_DIR="$REPO_DIR/hito-10-api"

# Cargar .env si existe respetando variables ya exportadas
for ENV_FILE in "$HITO_11_DIR/.env" "$HITO_10_DIR/.env" "$REPO_DIR/.env"; do
  if [ -f "$ENV_FILE" ]; then
    echo "Cargando variables de entorno desde: $ENV_FILE"
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
    break
  fi
done

echo "================================================================================"
echo "Iniciando Evaluación de Conectividad — Hito 11"
echo "Directorio Hito 10: $HITO_10_DIR"
echo "================================================================================"

TSX_BIN="$HITO_10_DIR/node_modules/tsx/dist/cli.mjs"

if [ -f "$TSX_BIN" ]; then
  node "$TSX_BIN" "$SCRIPT_DIR/evaluar_conectividad.ts" "$@"
else
  npx tsx "$SCRIPT_DIR/evaluar_conectividad.ts" "$@"
fi
