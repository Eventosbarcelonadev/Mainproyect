---
name: eb-publicar-contenido
description: >-
  Publica contenido en la web de Eventos Barcelona (eventosbarcelona.com) vía el MCP de WordPress + FTP:
  casos de éxito, entradas de blog y páginas. Úsala cuando el usuario diga "crea un caso de éxito",
  "sube este case study a la web", "publica este artículo en EB", "crea un borrador en la web",
  "sube estas fotos a WordPress", "haz la versión EN de este caso", o pase un copy + imágenes para la web.
  SIEMPRE deja el contenido como BORRADOR para revisión humana; nunca publica.
---

# Publicar contenido en la web de Eventos Barcelona

Flujo probado para crear/actualizar contenido en `eventosbarcelona.com` (WordPress 7.0) desde Claude Code,
usando el **MCP de WordPress** (abilities `eb/*` custom) + **FTP CDmon** para media y despliegues.

## Reglas de oro (no romper)

1. **Siempre BORRADOR.** Las abilities `eb/*` nunca publican. Un humano revisa y publica con 1 clic en wp-admin.
2. **Mismo formato que los casos actuales.** No inventar estructura: mirar un caso existente y replicar su
   formato/secciones. Ver §"Formato de casos de éxito".
3. **Bilingüe obligatorio (ES + EN).** Todo caso/artículo existe en ES y EN vía WPML. URLs simétricas:
   `/casos-de-exito/` ↔ `/en/success-stories/`, `/musica/` ↔ `/en/music/`, etc. Ver [[feedback_seo_bilingue_obligatorio]].
4. **SEO desde la pirámide.** Keywords, intención y enlaces internos salen de `docs/SEO-PIRAMIDE-KEYWORDS.md`
   (la biblia SEO, [[project_seo_piramide_biblia]]). No inventar keywords random.
5. **Deploy de mu-plugin: lint + health-check + rollback.** Nunca subir PHP sin lintar (no hay php local → usar
   `php-parser` de npm). Tras subir, verificar que el sitio sigue 200; si no, rollback desde el repo.
6. **No usar la REST estándar para escribir.** Este hosting capa los Application Passwords en `/wp/v2/posts`
   (context=edit/DELETE), `/wp/v2/plugins` y `/wp/v2/media` → 401. Usar SIEMPRE las abilities del MCP (endpoint
   `/wp-json/mcp/...`, que NO está capado) y FTP. Ver [[reference_wordpress_mcp]].

## Infraestructura

- **MCP server:** `wordpress` (`@automattic/mcp-wordpress-remote`, stdio). Herramientas:
  `mcp__wordpress__mcp-adapter-discover-abilities`, `...-execute-ability`, `...-get-ability-info`.
- **Abilities de escritura** (mu-plugin `eb-mcp-write.php`, fuente en `data/wp-mu-plugin/eb-mcp-write.php`):
  | Ability | Qué hace |
  |---|---|
  | `eb/create-draft` | Crea borrador. `post_type`: post, page, **casosdexito**, musica, danza, espectaculos. Params: title, content(HTML), excerpt, `featured_media`(id adjunto). |
  | `eb/update-draft` | Edita title/content/excerpt/featured de un borrador (solo draft/pending). |
  | `eb/register-media` | Registra en Biblioteca de Medios una imagen ya subida por FTP. Params: `path` (relativo a uploads), title, alt_text, caption. Devuelve id. |
  | `eb/set-seo` | Fija Yoast: `focus_keyphrase`, `seo_title`, `meta_description`, `slug`. Solo draft/pending. |
- **FTP CDmon:** creds `FTP_USER` / `FTP_HOST` / `FTP_PASS` en `.env.local`. **Docroot real = `web/`**
  (WordPress está en `web/`, NO en la raíz FTP). Uploads: `web/wp-content/uploads/AAAA/MM/`. mu-plugins:
  `web/wp-content/mu-plugins/`. Ver [[project_cdmon_ftp_access.md]].

## Flujo para un caso de éxito (o artículo)

### 1. Preparar
- Identificar el **post_type**: caso de éxito → `casosdexito`; artículo de blog → `post`.
- Leer un caso existente para copiar el formato (REST público:
  `GET /wp-json/wp/v2/casosdexito?per_page=5&_fields=id,link,title`, luego mirar el frontend con WebFetch).
- Consultar `docs/SEO-PIRAMIDE-KEYWORDS.md` → keyword principal + secundarias + páginas internas a enlazar.

### 2. Imágenes → Biblioteca de Medios
1. **Mirar** las imágenes (tool Read) para escribir alt text preciso y elegir la destacada.
2. Renombrar a **slugs SEO** (`espectaculo-acrobatas-evento-aston-martin-barcelona.jpg`).
3. Subir por FTP a `web/wp-content/uploads/AAAA/MM/` (curl `-T` con `--ftp-create-dirs`).
4. `eb/register-media` con `path` relativo (`2026/07/archivo.jpg`) + `alt_text` (SEO/accesibilidad). Guardar el `id`.

```bash
set -a && source .env.local && set +a
curl --ftp-create-dirs -u "$FTP_USER:$FTP_PASS" -T "local.jpg" \
  "ftp://$FTP_HOST/web/wp-content/uploads/2026/07/nombre-seo.jpg"
```

### 3. Redactar el copy (SEO-friendly, formato existente)
- Revisar el texto del cliente y hacerlo **SEO-friendly** sin cambiar la historia: integrar la keyword principal
  de forma natural en el primer párrafo, H2 con secundarias, alt text, y enlaces internos (verificar antes que
  devuelvan 200).
- **Formato de casos de éxito** (según los actuales, p. ej. "Light Art en Paris"):
  1. **Subtítulo** de una línea (frase en `<strong>`) bajo el título.
  2. **Narrativa de intro** (cliente, evento, contexto). 2-3 párrafos.
  3. **Vídeo** justo después de la intro (URL de YouTube en su propia línea para oEmbed).
  4. Secciones con **H2** (reto/solución/producción). Tono conversacional.
  5. **Cierre + CTA** ("¿Preparas un evento…?" → enlace a `/contacto/`).
  - Los casos actuales **NO** usan caja de "Datos clave"/ficha (aunque es buena para AEO — solo añadir si el
    usuario lo pide explícitamente).
- Imágenes embebidas: `<figure class="wp-block-image size-large"><img src="URL" alt="…" class="wp-image-ID"/></figure>`.
- `wp_kses_post` **elimina `<iframe>`**: para vídeo usar la URL de YouTube desnuda (oEmbed) o avisar de que se
  ponga con el widget Vídeo de Elementor.

### 4. Crear el borrador
`eb/create-draft` con `post_type`, `title`, `content` (HTML), `excerpt` (meta fallback), `featured_media` (id de la destacada).

### 5. SEO (Yoast)
`eb/set-seo` con `focus_keyphrase`, `seo_title` (≤60), `meta_description` (~155), `slug` limpio
(`aston-martin-concesionario-barcelona-espectaculo-f1`).

### 6. Versión EN
Duplicar el flujo en EN bajo `/en/success-stories/` y enlazar la traducción vía WPML.

### 7. Entregar
Dar el link de edición (`/wp-admin/post.php?post=ID&action=edit`) y la preview. Opcional: generar un Artifact de
vista previa (redimensionar imágenes con `sips`, incrustar como data URI — la CSP de Artifacts bloquea imágenes remotas).

## ⚠️ Formato de casos de éxito = Elementor (DECISIÓN del equipo: duplicar)
El contenido de los casos actuales vive en `_elementor_data` (post_content vacío), no en `post_content`.
**Decisión tomada (2026-07-09): NO crear el caso vía post_content del MCP; se DUPLICA un caso Elementor existente
y se pega el contenido a mano en Elementor.** El MCP no monta el layout final; el MCP aporta el "kit de contenido".

Flujo real para un caso de éxito:
1. **MCP prepara el kit de contenido:** sube las imágenes a la Biblioteca (`eb/register-media`), deja el copy
   SEO-friendly en el formato correcto (se puede volcar en un `eb/create-draft` como *fuente de texto*), y el link
   del vídeo. Este borrador post_content es SOLO la fuente de copy/SEO, no la página final.
2. **Humano en wp-admin:** duplica un caso existente (plugin **Duplicate Page**, p. ej. "Light Art en Paris") →
   nuevo borrador con la estructura Elementor intacta.
3. **Humano en Elementor:** reemplaza título, subtítulo, intro, secciones, CTA; inserta las imágenes desde la
   Biblioteca (ya subidas por MCP) y el widget Vídeo con la URL de YouTube.
4. **MCP aplica SEO** sobre el borrador final: `eb/set-seo` (focus keyphrase, seo_title, meta_desc, slug).
   (Ojo: `eb/set-seo` solo actúa sobre draft/pending.)
- Alternativa futura si se quiere automatizar del todo: ability que clone `_elementor_data` y reemplace textos/URLs
  en el JSON — más frágil, valorar solo si el volumen lo justifica.

## Extender el mu-plugin (nuevas abilities)
1. Editar `data/wp-mu-plugin/eb-mcp-write.php` (patrón: `wp_register_ability` con `meta.mcp.public=true`,
   `execute_callback`, `permission_callback`, schema con `default=>[]`). Copiar el patrón de LLMagnet
   `includes/class-abilities.php` si hay dudas de firma.
2. **Lint** (no hay php local): `cd scratchpad && npm i php-parser` y `parseCode` con `suppressErrors:false`.
3. **Deploy** por FTP a `web/wp-content/mu-plugins/eb-mcp-write.php` con health-check (home + wp-json = 200) y
   **rollback** re-subiendo la versión del repo si falla. Sincronizar `data/wp-mu-plugin/eb-mcp-write.php`.
4. `discover-abilities` para verificar que aparece la nueva ability.

## Checklist "Definition of Done" por pieza
- [ ] Borrador creado (nunca publicado) · post_type correcto
- [ ] Formato = casos existentes (subtítulo, vídeo, secciones, CTA)
- [ ] Imagen destacada + imágenes embebidas con alt text
- [ ] Vídeo de YouTube colocado
- [ ] SEO: focus keyphrase, seo_title, meta_desc, slug limpio, ≥3 enlaces internos (200)
- [ ] Versión EN creada y enlazada por WPML
- [ ] Preview revisada por humano antes de publicar
