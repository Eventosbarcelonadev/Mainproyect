#!/bin/bash
# ---------------------------------------------------------------------------
# Guardarrail de Eventos Barcelona
#
# Hook PreToolUse (matcher: Bash). Inspecciona el comando ANTES de ejecutarlo y
# lo bloquea si toca producción. Salida 2 = bloqueado; el motivo vuelve a Claude,
# que se lo explica a Xavi en lenguaje normal.
#
# Sin dependencias a propósito: solo sed y bash. Los hooks se ejecutan con un
# PATH mínimo y no se puede dar por hecho que node, python o jq estén disponibles.
#
# Es la última red de seguridad, no la primera: la protección de verdad está en
# los permisos de origen (GitHub Read, Vercel Viewer, tokens de solo lectura) y
# en que este equipo simplemente no tiene las credenciales de producción.
# ---------------------------------------------------------------------------

INPUT=$(cat)

# Extrae tool_input.command del JSON de entrada. Si falla, se escanea el payload
# entero: preferimos un falso positivo a dejar pasar algo.
CMD=$(printf '%s' "$INPUT" | tr -d '\n' \
  | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"//p' \
  | sed 's/","[a-z_]*"[[:space:]]*:.*$//')
[ -z "$CMD" ] && CMD="$INPUT"

bloquear() {
  echo "BLOQUEADO por el guardarrail de Eventos Barcelona: $1." >&2
  echo "Este equipo no toca producción. Explicale a Xavi qué querías hacer y decile que eso lo ejecuta Philippe." >&2
  exit 2
}

case "$CMD" in
  *wp-json*|*wp-admin*|*xmlrpc.php*|*mu-plugins*|*wp-content*)
    bloquear "acceso a WordPress" ;;
  *ftp://*|*"lftp"*|*--ftp-create-dirs*|*"curl -T"*|*"curl --upload-file"*|*"sftp "*)
    bloquear "subida por FTP" ;;
  *gestiona.eventosbarcelona.com*|*cdmon*)
    bloquear "panel de hosting CDmon" ;;
  *SUPABASE_SERVICE*|*service_role*|*SERVICE_KEY*)
    bloquear "uso de la clave de servicio de Supabase" ;;
  *"vercel deploy"*|*"vercel --prod"*|*"vercel env"*|*"vercel alias"*|*"vercel rollback"*|*"vercel remove"*)
    bloquear "despliegue o cambio de configuración en Vercel" ;;
  *"git push"*|*"git remote add"*|*"git remote set-url"*)
    bloquear "escritura sobre un repositorio remoto" ;;
  *.env*|*.secrets*)
    bloquear "lectura o escritura de un archivo de credenciales" ;;
  *"rm -rf"*|*"rm -fr"*)
    bloquear "borrado recursivo" ;;
  *EB-Claude/mainproyect*)
    case "$CMD" in
      *">"*|*"rm "*|*"mv "*|*"sed -i"*|*"tee "*)
        bloquear "escritura dentro de mainproyect/, que es de solo lectura" ;;
    esac ;;
esac

exit 0
