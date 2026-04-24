# Arquitectura show ↔ artista

**Fecha:** 2026-04-24
**Para:** Reunión con Xavi 2026-04-29
**Contexto:** Xavi planteó (WhatsApp 2026-04-24) que si los artistas suben material vía el formulario, ¿cómo sabremos qué foto pertenece a qué artista y qué show? Hoy los modelos de datos son silos.

---

## 1. Estado actual (silos)

### Tabla `shows` (Supabase)
```
id, name, category, subcategory, description,
base_price, price_note, video_url, image_url,
source, active
```
No hay `artista_id` ni `performer`. El catálogo completo actual tiene **226 filas**.

### Tabla `artistas` (Supabase)
```
nombre, email, telefono, ciudad, disciplinas[],
formato_show, bio, videos, cache, rango_artistas,
fotos_urls, rider_tecnico,
ghl_contact_id, holded_id, token_update, acepto_privacidad
```
No hay `show_id` ni `shows[]`. Un artista puede subir fotos y videos, pero no se atan a ninguna ficha de show del catálogo.

### GHL
- Pipeline ARTISTAS tiene contactos con tags (`artista`, `origen_form`, `follow_up`).
- No hay custom field que vincule contacto ↔ show.

### Renderer (`propuesta.html`)
- Cada show se renderiza con `name`, `description`, `imageUrl`, `videoUrl` — **sin nombre del artista**.
- El admin Xavi elige shows del catálogo para armar la propuesta. No ve "por X artista" en el picker.

### Consecuencia práctica
Si Xavi lanza una campaña de captación y entran 50 artistas nuevos con fotos + videos en 1 mes, **no hay forma programática** de saber:
- Qué show del catálogo corresponde a cada artista nuevo.
- Qué fotos en `artistas.fotos_urls` deberían aparecer en `shows.image_url`.
- Si un show que Xavi va a meter en una propuesta tiene al artista disponible, confirmado, o si es un draft sin revisar.

---

## 2. Propuesta MVP (mínima, reversible, en fases)

### Fase 1 — Schema (1 migración, 0 downtime)

```sql
-- Relación 1:N (un artista puede ofrecer múltiples shows; un show pertenece a 1 artista principal)
ALTER TABLE shows
  ADD COLUMN artista_id  uuid REFERENCES artistas(id) ON DELETE SET NULL,
  ADD COLUMN status      text DEFAULT 'active',
  -- 'active' = visible en catálogo, 'pending_review' = nuevo por revisar, 'archived' = no mostrar
  ADD COLUMN submitted_at timestamptz;

CREATE INDEX idx_shows_artista_id ON shows(artista_id);
CREATE INDEX idx_shows_status     ON shows(status);
```

**No rompe nada existente** — todas las filas nuevas de `shows` arrancan con `artista_id = NULL, status = 'active'` (comportamiento actual).

### Fase 2 — Formulario de artistas

Añadir al paso 2/3 del wizard:
- **Checkbox**: "¿Quieres registrar un show nuevo?" (sí/no).
- Si sí: un subformulario con `show.name`, `show.description`, `show.price`, + permitir marcar las fotos/videos que aplican a ese show específico.
- Un artista puede registrar **N shows** en el mismo envío (botón "Añadir otro show").

Backend (`api/lead-artista.js`):
- Por cada show que el artista rellenó, crear una fila en `shows` con:
  - `id` = slug generado del nombre + sufijo UUID corto
  - `artista_id` = `artistas.id` recién creado
  - `status` = `pending_review`
  - `image_url`, `video_url` = las marcadas por el artista
- Actualizar GHL: añadir tag `show_<show_id>` al contacto del artista.

### Fase 3 — Admin / Xavi

**Vista nueva**: `/admin-shows.html` (simple, sólo Xavi)
- Lista todos los shows con `status='pending_review'`.
- Cada tarjeta: nombre, artista (con link al contacto), fotos, video, caché.
- 3 botones por tarjeta: **Aprobar** (pasa a `active`), **Editar** (modal con campos), **Rechazar** (pasa a `archived`).

**Cambio en `propuesta.html`**:
- El Builder y el catálogo filtran `shows` por `status='active'` (los `pending_review` no aparecen).
- En el picker, debajo del nombre del show mostrar: *"por [artista.nombre]"* cuando `artista_id` está presente.
- Loaders existentes (`loadShowCatalogFromSupabase`) ya hacen `active=eq.true` — sólo hay que cambiar a `status=eq.active` para alinear con el nuevo campo.

### Fase 4 — Campaña de captación (desbloqueada)

Con la Fase 1-3 en producción, la campaña de artistas puede:
- Importar lista de artistas conocidos de Xavi (CSV o Gmail blue-flagged).
- Cada uno recibe un link tokenizado → abre `formulario-artistas.html?token=X` pre-cargado.
- El artista añade/actualiza sus shows → Xavi revisa en `/admin-shows.html` → al aprobar, aparecen en el catálogo y son seleccionables para propuestas.

Sin este schema, la campaña genera 50+ contactos desconectados de shows → Xavi tiene que mapear manualmente → inviable.

---

## 3. Decisiones abiertas para la reunión

1. **1:N o N:N entre `artistas` y `shows`?**
   Propuesta: 1:N (un show = un artista principal). Simple y cubre 95% de casos. Para duets/grupos se pone el "líder" o la compañía como artista asociado.

2. **`status` de revisión por show**: ¿necesario desde el día 1, o basta con un simple `active true/false`?
   Propuesta: sí, desde el día 1 (`pending_review`, `active`, `archived`). La campaña va a generar drafts masivos y Xavi necesita una inbox de revisión.

3. **Las 158 filas actuales en Supabase sin match en hardcoded** (descubiertas hoy en el audit): ¿se mantienen como `artista_id = NULL, status = 'active'` o entran en `pending_review` para que Xavi las audite de a poco?
   Propuesta: mantenerlas `active` (están en el catálogo histórico, muchas aparecen en PPT). Crear un task aparte de imagen/video para llenar huecos.

4. **Visibilidad del artista al cliente**: ¿el nombre del artista aparece en la propuesta enviada al cliente final, o sólo para Xavi?
   Propuesta: sólo para Xavi por defecto (confidencialidad de talento). El renderer público sigue igual que ahora.

5. **Holded/facturación**: los artistas nuevos que entran por la campaña, ¿se crean como proveedores en Holded desde el día 1 o esperan hasta que se les contrata?
   Propuesta: esperar. Hoy `api/lead-artista.js` ya los crea non-blocking — se puede desactivar y activar al aprobar `pending_review`.

---

## 4. Esfuerzo estimado

| Fase | Trabajo | Horas |
|---|---|---|
| 1 — Schema | Migración + rebuild tipos en api | 1 |
| 2 — Form + backend | Subform shows en wizard + `lead-artista.js` actualizado | 4-6 |
| 3 — Admin review | `admin-shows.html` nuevo + cambios `propuesta.html` picker | 4-6 |
| 4 — Lanzamiento campaña | Templates email + CSV import + tokens | 3-4 |
| **Total MVP** | | **12-17 h** |

Rollout sugerido: Fase 1-3 en 1 semana (para que funcione end-to-end), Fase 4 cuando Xavi apruebe copy de la campaña y tenga la lista inicial.
