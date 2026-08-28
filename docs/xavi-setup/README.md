# Paquete de instalación · Claude para Xavi

Instructivo completo: [../claude-para-xavi.md](../claude-para-xavi.md)

Orden de instalación:

1. Fase 0 del instructivo (accesos, Drive, tokens). Sin esto lo demás no sirve.
2. `CLAUDE.md` → `~/EB-Claude/CLAUDE.md`
3. `mcp.json` → `~/EB-Claude/.mcp.json` (pegar el PIT de solo lectura del CRM)
4. `settings.json` → `~/EB-Claude/.claude/settings.json` (reemplazar `USUARIO`, pegar el token de catálogo)
5. `skills/*` → `~/EB-Claude/.claude/skills/`
6. `hooks/guardarrail.sh` → `~/EB-Claude/.claude/hooks/` (con `chmod +x`)
7. `managed-settings.json` → `/Library/Application Support/ClaudeCode/` con `sudo` (reemplazar `USUARIO`)
8. Fase 5 del instructivo: las 12 pruebas de verificación. Seis funcionan, seis fallan.
9. `CHULETA-XAVI.md` impresa, para él.

Marcadores a reemplazar: `USUARIO`, `PEGAR_TOKEN_DE_CATALOGO_AQUI`, `PEGAR_PIT_DE_SOLO_LECTURA_AQUI`.
