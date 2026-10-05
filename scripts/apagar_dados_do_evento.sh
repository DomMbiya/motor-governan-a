#!/usr/bin/env bash
# Apaga TODA a massa de dados do evento: documentos, análises, dossiês e trilha de auditoria.
# Exigido pela seção 8 da proposta: os dados do evento não saem da máquina e são apagados ao final.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Isto apaga definitivamente todos os documentos, análises, dossiês e a trilha de auditoria."
read -r -p "Digite APAGAR para confirmar: " resposta
[[ "$resposta" == "APAGAR" ]] || { echo "Cancelado."; exit 1; }

if command -v docker >/dev/null 2>&1; then
  docker compose down --volumes --remove-orphans || true
fi
rm -rf backend/data
echo "Dados do evento apagados em $(date '+%d/%m/%Y %H:%M'). A base de regras (backend/rules) foi mantida."
