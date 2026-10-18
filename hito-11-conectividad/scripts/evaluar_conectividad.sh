#!/usr/bin/env bash
set -euo pipefail

# Obtener directorio del script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HITO_10_DIR="$(cd "$SCRIPT_DIR/../../hito-10-api" && pwd)"

export NODE_PATH="$HITO_10_DIR/node_modules"

echo "================================================================================"
echo "Iniciando Evaluación de Conectividad — Hito 11"
echo "Directorio de dependencias: $NODE_PATH"
echo "================================================================================"

npx tsx "$SCRIPT_DIR/evaluar_conectividad.ts" "$@"
