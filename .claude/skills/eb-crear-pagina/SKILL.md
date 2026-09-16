---
name: eb-crear-pagina
description: >-
  Doctrina para crear cualquier página nueva del site eventosbarcelona.com (post de blog, landing MICE, ficha de show/espectáculo, ficha de artista, caso de éxito, plantilla de archivo Elementor) SIN construir la estructura desde cero. Duplica una plantilla existente que ya renderiza bien, cambia SOLO el contenido y la imagen, y verifica visualmente antes de reportar "publicado". Invocar cuando el usuario diga "crea una página", "creemos una landing", "nuevo caso de éxito", "nueva ficha de show", "nuevo artículo", "publica esto en la web", "haz la versión EN de esta página", o dé cualquier señal de crear contenido nuevo en WordPress.
---

# Crear una página nueva en Eventos Barcelona

**Regla absoluta:** nunca construir la estructura desde cero. Siempre partir de una plantilla espejo que ya renderiza bien en producción. Cambiar SOLO contenido + imagen destacada. Verificar visualmente antes de decir "listo".

Esta skill codifica lo que se aprendió en sep 2026 (sesión con Xavi cazando 4 bugs: pompas de jabón sin hero, Maestros de ceremonias en blanco, /casos-de-exito/ vs /en/success-stories/ con estructura diferente, typo "Contratatar"). Los 4 fallos tienen la misma causa raíz: no haber duplicado una plantilla existente + no haber verificado el render.

## Antes de invocar cualquier ability MCP

Cargar en contexto (leer si no están):
- `feedback_clone_template_never_from_scratch.md` (regla base)
- `feedback_verify_visual_render_hard.md` (checklist visual)
- `feedback_verify_images.md`
- `feedback_verify_en_and_mobile.md`
- `feedback_seo_bilingue_obligatorio.md`
- `feedback_no_em_dash.md`

Y las skills auxiliares:
- `copywriting` para el tono EB y las reglas de estilo (no em-dash, no middle-dot, no "En breve", no "Marca · descripción")
- `eb-publicar-contenido` para el flujo de publicación con abilities `eb/*`
- `eb-crear-espectaculo` si es una ficha de show
- `eb-ux-ui` para la verificación visual

## Templates espejo canónicas (sep 2026)

Cuando el usuario pida crear una pieza, mirar esta tabla primero. NUNCA arrancar sin escoger un espejo.

| Tipo de pieza | Post_type | ID espejo | URL espejo | Notas |
|---|---|---|---|---|
| Post refresh AEO | `post` | 20023 | /ideas-eventos-aniversario-empresa/ | Con TLDR + FAQ + bio de autor (snippet 109) |
| Post nuevo AEO | `post` | 22097 | /elegir-agencia-eventos-corporativos-barcelona/ | Estructura AEO, guía práctica |
| Landing MICE | `page` | 22017 | /mice-barcelona/ | Snippet 110 EB-LANDINGS-AEO activo |
| Landing agencia | `page` | 21943 | /agencia-de-eventos-barcelona/ | Cluster comercial, snippet 110 |
| Ficha show / espectáculo | `espectaculos` | 5245 | /espectaculos/light-art-show/ | Hero + galería + NUMBERS "por qué elegir" (ver skill `eb-crear-espectaculo`) |
| Caso de éxito reciente | `casosdexito` | 21744 | /casos-de-exito/aston-martin-.../ | Post-retainer con foto autorizada |
| Ficha artista | `artistas` | 5203 | /artistas/magos-en-barcelona/ | Renderiza bien en loop-grid 16960 |
| Ficha música | `musica` | 21272 | /musica/flamenco-tradicional/ | Reciente, template consolidado |
| Plantilla archivo CPT | `elementor_library` | 15275 | /en/success-stories/ | 6 top containers, con formulario. La ES 15250 ya es clon traducido |
| Loop item de listado | `elementor_library` | 16960 | (dinámico) | "Bucle Exitos" — NO usar 2686 "Loop Exito" deprecated |
| Formulario global ES | `elementor_library` | 17171 | (dinámico) | Con heading "Solicita tu propuesta personalizada" |
| Formulario global EN | `elementor_library` | 17697 | (dinámico) | Con heading "Request your personalized proposal" |

Si el usuario pide un tipo que no está en la tabla:
1. Buscar en el site otra pieza del mismo `post_type` que renderice bien y usarla como espejo
2. Actualizar esta tabla con la nueva referencia canónica al terminar

## Flujo obligatorio (6 pasos)

### Paso 1 · Escoger la plantilla espejo

- Localizar la pieza espejo según la tabla de arriba
- **Verificar que la espejo funciona**: `curl -sH "Cache-Control: no-cache" <url espejo>` + confirmar que renderiza bien (hero, contenido, formulario, footer). Si la espejo tiene algún bug conocido, NO la uses como base — buscar otra.
- Chequear también su listado ancestro: la card de la espejo debe renderizar CON su imagen (no blanca).

### Paso 2 · Leer `_elementor_data` + meta de la espejo

```bash
curl -s -u "$WP_USER:$WP_PASS" \
  "https://eventosbarcelona.com/wp-json/wp/v2/<cpt>/<id_espejo>?context=edit&_fields=meta,title,excerpt,featured_media,yoast_head_json"
```

- `_elementor_data`: la estructura visual
- `_elementor_page_settings`, `_elementor_template_type`, `_elementor_edit_mode`
- `featured_media`, `yoast_head_json` (para SEO title/description patterns)

Guardar el JSON parseado como referencia. Contar top-level containers, walk widgets con Python para tener el "mapa" de la estructura.

### Paso 3 · Crear el borrador desde la espejo

**No usar la REST estándar** — usar abilities MCP `eb/*`:

- `eb/clone-case` si es caso de éxito (clona `_elementor_data` completo + acepta `texts:[]`, `slides:[]`, `faq_html:""` para el contenido nuevo)
- `eb/create-draft` + copia manual del `_elementor_data` de la espejo para otros tipos (post, page, espectaculos, etc.)

Cambiar SOLO estos campos en el JSON clonado:
- Textos en `heading.title`, `text-editor.editor`, `button.text`, `icon-list.text`
- `featured_media` (referenciar la imagen nueva del paso 4)
- Slug (post_name), Yoast title/description (via `eb/set-seo`)

**Preservar sin tocar:**
- Número y orden de top-level containers
- `elType`, `widgetType`, `id` de widgets
- Settings de containers (padding, margin, boxed_width, min-height, background-image position/size)
- Global widgets (templateID — cambiar solo si es form ES→EN o viceversa)
- Loop-grid `template_id` (16960 para casos, artistas, música, danza, espectáculos)

### Paso 4 · Cambiar la featured_image OBLIGATORIAMENTE

Este paso NO se salta ni siquiera si "temporal" o "para testear".

Requisitos de la imagen nueva:
- Debe coincidir temáticamente con el H1 del clone (nunca reutilizar la del espejo)
- JPG landscape, ≥1500px de ancho
- **Sin logos de terceros** en la imagen (ver `feedback_fotos_proveedor_sin_logos.md`)
- **Sin PNG con montaje/collage**
- Alt text descriptivo, distinto al del espejo

Subida:
```bash
# 1. Subir por FTP a wp-content/uploads/AAAA/MM/
# 2. Registrar en Media Library
eb/register-media path="AAAA/MM/nombre-imagen.jpg" title="..." alt_text="..." caption="..."
# → devuelve id
# 3. Asignar como featured_media
eb/update-draft id=<draft_id> featured_media=<media_id>
```

**Verificar la imagen en 4 superficies** (con `curl` de la URL pública ya guardada como draft o publish):

1. **Hero widget de la página**: `grep -oE 'background-image:url\("[^"]+"\)' /tmp/pagina.html` — la URL debe ser la de la imagen nueva
2. **Card del loop-grid en el listado ancestro** (`/artistas/`, `/espectaculos/`, `/casos-de-exito/`, `/blog/`): `grep -c "e-loop-item-<post_id>"` + verificar background-image en el CSS scoped. Si la card sale blanca, replicar el patrón del snippet 111 EB-FIX-MAESTROS-BG
3. **OG:image en el `<head>`**: `grep -oE 'property="og:image" content="[^"]+"' /tmp/pagina.html`
4. **Schema.org image en JSON-LD**: `grep -oE '"image":"[^"]+"' /tmp/pagina.html`

Si cualquiera falta o apunta a otra imagen, NO reportar "listo" hasta cazarlo.

### Paso 5 · Publicación bilingüe (obligatoria)

Nada se publica solo en un idioma. Regla `feedback_seo_bilingue_obligatorio` + refuerzo sep 2026: **misma estructura, no solo contenido paralelo**.

Flujo bilingüe correcto:
1. Duplicar la plantilla espejo ES → clone ES con el contenido
2. Duplicar la plantilla espejo EN (que puede ser la MISMA plantilla si el sitio la comparte, o una separada por idioma) → clone EN con el contenido traducido
3. Linkar ambos con WPML via `eb/set-language`:
   ```
   eb/set-language id=<draft_es_id> lang=es
   eb/set-language id=<draft_en_id> lang=en source_id=<draft_es_id> source_lang=es
   ```
4. Cambiar el global widget del formulario según idioma: templateID 17171 en ES, 17697 en EN
5. Verificar que los enlaces internos `<a href="/en/...">` en el clone EN apuntan a URLs que existen (regla `feedback_verify_internal_links_wpml`). Los slugs EN NO son traducción directa; siempre listar `/wp-json/wp/v2/pages?lang=en` antes de meter hrefs

### Paso 6 · Verificación visual pre-publish (regla `feedback_verify_visual_render_hard`)

Antes de reportar "publicado" o "listo":

**Cache purge obligatorio**:
```bash
curl -sX DELETE -u "$WP_USER:$WP_PASS" "https://eventosbarcelona.com/wp-json/elementor/v1/cache"
curl -sX POST "https://api.cloudflare.com/client/v4/zones/$CF_ZONE/purge_cache" \
  -H "Authorization: Bearer $CF_TOKEN" -H "Content-Type: application/json" \
  -d '{"files":["<url_es>","<url_en>"]}'
sleep 5
```

**Checklist visual** (bloqueante — si algo falla, NO reportar "listo"):

```bash
# 1. Fetch renderer output
curl -sH "Cache-Control: no-cache" "<url_pagina>?cb=$(date +%s)$RANDOM" > /tmp/pagina.html

# 2. Estructura
grep -c "<h1" /tmp/pagina.html   # exactamente 1
grep -oE 'data-elementor-id="[0-9]+"' /tmp/pagina.html  # confirmar id del post

# 3. Hero visual
grep -oE 'background-image:url\("[^"]+"\)' /tmp/pagina.html | head -1  # imagen nueva
grep -oE '<img[^>]*(src|data-src)="[^"]+"' /tmp/pagina.html | head -3

# 4. AEO bloques (si es post o landing)
grep -c "eb-aeo-tldr\|eb-author-bio\|FAQPage\|Preguntas frecuentes" /tmp/pagina.html

# 5. Contenido correcto
grep -c "<H1 esperado>"     # el H1 del clone
grep -c "<H2 principal>"    # H2 del intro

# 6. Firma AI (todos deben salir 0)
grep -c "—" /tmp/pagina.html         # em-dash
grep -c "·" /tmp/pagina.html         # middle-dot (ojo: el `·` puede ser legítimo en breadcrumbs, revisar contexto)
grep -c "En breve" /tmp/pagina.html  # intro Claude
grep -oE "[A-Z][a-z]+ · [a-z]" /tmp/pagina.html  # patrón "Marca · descripción" en títulos

# 7. Comparar contra espejo (paridad estructural)
grep -c "elementor-widget-heading" /tmp/pagina.html
grep -c "elementor-widget-text-editor" /tmp/pagina.html
grep -c "elementor-widget-form\|eb-form" /tmp/pagina.html
grep -c "elementor-widget-loop-grid" /tmp/pagina.html
# → los conteos deben coincidir con los de la espejo

# 8. Listado ancestro (card no blanca)
curl -sH "Cache-Control: no-cache" "<url_listado>" | grep -c "e-loop-item-<id>"

# 9. Bilingüe: mismo comando sobre la URL EN, comparar conteos
```

**Verificación en 4 vistas** (regla `feedback_verify_en_and_mobile`):
- ES desktop
- ES mobile (`curl -A "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0)"`)
- EN desktop
- EN mobile

**Si CUALQUIER check falla**: no reportar "publicado". Volver al Paso 3, corregir, repurgar, re-verificar.

## Anti-patrones prohibidos

- ❌ Construir el `_elementor_data` desde cero con containers `heading` + `text-editor` sueltos
- ❌ Publicar con `featured_media` reutilizada de otra pieza
- ❌ Publicar sin verificar la card en el listado ancestro (bug Maestros)
- ❌ Publicar solo en ES o solo en EN
- ❌ Publicar con el mismo global form templateID para ambos idiomas (usar 17171 ES / 17697 EN)
- ❌ Reportar "listo" basado en respuesta REST 200 sin `curl` + `grep` de la URL pública
- ❌ Usar `·`, `—`, `–`, "En breve", "Sección N ·", patrón "Marca · descripción" en copy/títulos
- ❌ Dejar strings del idioma equivocado (ej. "Request your..." en ES o "Solicita..." en EN)
- ❌ Usar loop-item template 2686 "Loop Exito" (deprecated) — siempre 16960 "Bucle Exitos"

## Cuando el usuario diga "creemos una página / haz X"

Respuesta obligatoria inicial (antes de tocar nada):

1. **Identificar tipo de pieza** que pide (post, landing, ficha show, caso, etc.)
2. **Nombrar la plantilla espejo** que se va a clonar de la tabla canónica
3. **Verificar la espejo** con curl + grep antes de tomarla como base
4. **Pedir la imagen** (o localizarla) que va a usar como featured, sabiendo que NO se puede reutilizar la del espejo
5. **Pedir el copy** en ES y EN, o generarlo aplicando la skill `copywriting`
6. **Ejecutar el flujo de 6 pasos**
7. **Al terminar cada pieza publicada**, correr el checklist visual completo, incluyendo comparación de conteos contra la espejo

Si el usuario dice "hazlo rápido" o "no verifiques", **la respuesta es NO**: la verificación es el punto crítico que hemos aprendido cazando 4 bugs en una sola sesión. Es 30 segundos por pieza. Ese medio minuto por URL es lo que separa "publicado y funcionando" de "publicado y roto — Xavi lo cazará mañana".
