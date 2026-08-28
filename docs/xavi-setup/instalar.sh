#!/bin/bash
# ---------------------------------------------------------------------------
# Instalador de Claude para Eventos Barcelona (Mac de Xavi).
#
# Se ejecuta una sola vez:
#   bash <(curl -s https://raw.githubusercontent.com/.../instalar.sh)
# o, si ya se clonó el proyecto:
#   bash ~/EB-Claude/mainproyect/docs/xavi-setup/instalar.sh
#
# Lo que NO hace (a propósito, lo hace Philippe con sudo):
#   - instalar el candado del sistema (managed-settings.json)
#   - pegar el token del catálogo y el del CRM
# ---------------------------------------------------------------------------
set -e

BASE="$HOME/EB-Claude"
USUARIO="$(whoami)"
verde() { printf "\033[32m%s\033[0m\n" "$1"; }
rojo()  { printf "\033[31m%s\033[0m\n" "$1"; }

echo ""
echo "  Instalando Claude para Eventos Barcelona"
echo "  ========================================"
echo ""

# --- 1. Requisitos -------------------------------------------------------
command -v node >/dev/null 2>&1 || { rojo "Falta Node. Instalalo desde nodejs.org (version 22) y volve a correr esto."; exit 1; }
command -v git  >/dev/null 2>&1 || { rojo "Falta git. Abri la Terminal y escribi: xcode-select --install"; exit 1; }
verde "  OK  Node $(node --version) y git listos"

# --- 2. Claude Code ------------------------------------------------------
if ! command -v claude >/dev/null 2>&1; then
  echo "  ..  Instalando Claude Code"
  npm install -g @anthropic-ai/claude-code
fi
verde "  OK  Claude Code instalado"

# --- 3. Carpetas y repositorios -----------------------------------------
mkdir -p "$BASE"
cd "$BASE"

# GitHub Desktop clona con el nombre del repo. Si esta asi, lo renombramos.
[ -d "$BASE/Mainproyect/.git" ] && [ ! -d "$BASE/mainproyect/.git" ] && mv "$BASE/Mainproyect" "$BASE/mainproyect"
[ -d "$BASE/eb-xavi/.git" ]     && [ ! -d "$BASE/trabajo/.git" ]     && mv "$BASE/eb-xavi" "$BASE/trabajo"

if [ ! -d "$BASE/mainproyect/.git" ]; then
  echo "  ..  Descargando el proyecto de Eventos Barcelona"
  git clone https://github.com/Eventosbarcelonadev/Mainproyect.git mainproyect || {
    rojo "No pude descargar el proyecto."
    rojo "Clonalo antes con GitHub Desktop en la carpeta $BASE y volve a correr esto."
    exit 1
  }
else
  git -C "$BASE/mainproyect" pull --ff-only >/dev/null 2>&1 || true
fi
verde "  OK  Proyecto descargado (solo lectura)"

if [ ! -d "$BASE/trabajo/.git" ]; then
  git clone https://github.com/Eventosbarcelonadev/eb-xavi.git trabajo 2>/dev/null || {
    echo "  ..  El repositorio de trabajo todavia no existe, creo la carpeta local"
    mkdir -p trabajo && git -C trabajo init -q
  }
fi
mkdir -p trabajo/presentaciones trabajo/ideas trabajo/briefs trabajo/notas imagenes
verde "  OK  Carpeta de trabajo lista"

# --- 4. Configuracion ----------------------------------------------------
PAQ="$BASE/mainproyect/docs/xavi-setup"
[ -d "$PAQ" ] || { rojo "No encuentro $PAQ. Avisa a Philippe: falta subir el paquete al repositorio."; exit 1; }

mkdir -p "$BASE/.claude/hooks" "$BASE/.claude/skills"
cp    "$PAQ/CLAUDE.md"            "$BASE/CLAUDE.md"
cp    "$PAQ/mcp.json"             "$BASE/.mcp.json"
cp    "$PAQ/settings.json"        "$BASE/.claude/settings.json"
cp    "$PAQ/hooks/guardarrail.sh" "$BASE/.claude/hooks/guardarrail.sh"
cp -R "$PAQ/skills/"*             "$BASE/.claude/skills/"
chmod +x "$BASE/.claude/hooks/guardarrail.sh"

sed -i '' "s/USUARIO/$USUARIO/g" "$BASE/.claude/settings.json"
verde "  OK  Configuracion y skills copiadas"

# --- 5. Prueba del guardarrail -------------------------------------------
set +e
printf '%s' '{"tool_name":"Bash","tool_input":{"command":"git push origin main"}}' \
  | "$BASE/.claude/hooks/guardarrail.sh" >/dev/null 2>&1
[ $? -eq 2 ] && verde "  OK  Guardarrail funcionando" || rojo "  !!  El guardarrail NO esta bloqueando. Avisa a Philippe."
set -e

echo ""
verde "  Listo. Falta que Philippe pegue dos claves y active el candado."
echo ""
echo "  Ahora abri la app de Claude Code y elegi la carpeta:  $BASE"
echo ""
