---
name: EB-Wordpresscreator
description: >-
  Doctrina para crear cualquier página nueva del site eventosbarcelona.com (post de blog, landing MICE, ficha de show/espectáculo, ficha de artista, caso de éxito, plantilla de archivo Elementor) SIN construir la estructura desde cero. Duplica una plantilla existente que ya renderiza bien, cambia SOLO el contenido y la imagen, y verifica visualmente antes de reportar "publicado". Invocar cuando el usuario diga "crea una página", "creemos una landing", "nuevo caso de éxito", "nueva ficha de show", "nuevo artículo", "publica esto en la web", "haz la versión EN de esta página", o dé cualquier señal de crear contenido nuevo en WordPress.
---

# EB-Wordpresscreator · crear una página nueva en Eventos Barcelona

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

## Tipografía y estilos de marca (obligatorio)

Cualquier página del site EB usa **Space Grotesk** como familia tipográfica principal. Cuando se clona una plantilla espejo, la tipografía viene incluida en los settings de Elementor (variables `--e-global-typography-*` y `font-family:"Space Grotesk", Sans-serif` scoped por widget). **No inventar font-family propia.**

Sizes y pesos habituales por widget:
- **H1** (Elementor heading `elementor-size-default`): usa la primary font. Tamaño responsive del template. NO hardcodear font-size.
- **H2** de sección: primary font, ver espejo.
- **Text-editor** (párrafos body): `font-family:"Space Grotesk", Sans-serif; font-size:24px; font-weight:400; line-height:36px` (desktop). El espejo ya lo tiene.
- **Números grandes** (sección NUMBERS de shows): `font-size:100px` desktop, `95px` mobile.

**Highlight de keyword en H1/H2 con las clases `kcs-*`** (patrón de marca Xavi):
- `<span class="kcs-text2">Espectáculos </span>` → subrayado salmón grueso (usado en H1)
- `<span class="kcs-text2-2">leading brands </span>` → subrayado salmón variante (H1 alternativo)
- `<span class="kcs-text3">nuestras producciones </span>` → estilo variante (H2 galería)
- `<span class="kcs-text4">01</span>` → estilo números NUMBERS section

Regla: envolver EN EL H1 la keyword principal con `<span class="kcs-text2">…</span>` o `<span class="kcs-text2-2">…</span>` (según lo que use la plantilla espejo — coger el mismo). No inventar clase nueva. No dejar el H1 sin highlight (rompe el patrón de marca).

Ejemplo real (pompas):
```html
<h1 class="elementor-heading-title elementor-size-default">
  <span class="kcs-text2">Show de pompas de jabón</span> para eventos corporativos en Barcelona
</h1>
```

**Snippet `eb-fix-kcs-wrap`** en el site normaliza el comportamiento responsive del kcs (desktop: `white-space:nowrap` para que no rompa el highlight; mobile: `white-space:normal` para que respire). Ya está activo, no tocar.

## FAQ · formato obligatorio según post_type

Hay dos formatos válidos, **elige según la pieza que estés creando**:

### Formato A · Blog posts y páginas legacy (text-editor con HTML)

Este es el formato que activa el snippet 106 EB-FAQ-SCHEMA (auto-inyecta FAQPage JSON-LD en `<head>`).

Estructura obligatoria dentro del text-editor:

```html
<h2>Preguntas frecuentes</h2>

<h3>¿Pregunta 1?</h3>
<p>Respuesta a la pregunta 1, en 40-80 palabras.</p>

<h3>¿Pregunta 2?</h3>
<p>Respuesta a la pregunta 2.</p>

<h3>¿Pregunta 3?</h3>
<p>Respuesta a la pregunta 3.</p>

<h3>¿Pregunta 4?</h3>
<p>Respuesta a la pregunta 4.</p>

<h3>¿Pregunta 5?</h3>
<p>Respuesta a la pregunta 5.</p>
```

Restricciones para que snippet 106 lo detecte:
- `<h2>Preguntas frecuentes</h2>` **exactamente** (sin clase, sin span) — o `<h2>Frequently asked questions</h2>` en EN, o `<h2>FAQ</h2>`
- Pares `<h3>Q</h3>` seguidos INMEDIATAMENTE de `<p>A</p>` (solo whitespace entre medio)
- Sin `<strong>` ni `<em>` dentro del `<h3>` o el `<p>` (el snippet los aplana con `wp_strip_all_tags`)
- La sección FAQ termina cuando aparece otro `<h2>` o `<hr>`
- 3 a 5 Q&A ideal
- Cada respuesta 40-80 palabras, concreta, con números/rangos cuando aplique

**Verificar tras publicar:**
```bash
curl -sH "Cache-Control: no-cache" "<url>" | grep -c '"@type":"FAQPage"'
# → tiene que ser ≥1 (una FAQ schema generada)
curl -sH "Cache-Control: no-cache" "<url>" | grep -c "Preguntas frecuentes"
# → ≥1 (el heading visible)
```

### Formato B · Fichas de show/espectáculo (widget nested-accordion)

Usar el widget nativo Elementor Pro `nested-accordion` con setting `faq_schema: yes`. El widget genera el schema propio, NO necesita snippet 106.

Estructura del nested-accordion (settings del widget):
- `faq_schema: yes` (obligatorio para JSON-LD)
- `items`: array de 3-5 items con `title` (pregunta) y `text` (respuesta HTML)
- Icon del acordeón: `plus` (icono minimalista de marca EB)
- Título de sección arriba del widget: `<span class="kcs-text3">Preguntas frecuentes </span>` (dentro de un heading widget separado)

Referencia visual: post 18608 (Light Boxes Show) o post 5245 (Light Art Show) — copiar el bloque completo con `nested-accordion + heading kcs-text3`.

## Formulario de contacto antes del footer (obligatorio)

**TODA página del site termina con el formulario de contacto justo antes del footer.** Sin excepciones. Es la última sección visible del contenido.

Estructura obligatoria del último top-level container:

```
container <id>
  ├── menu-anchor (anchor="contact" — permite scroll a #contact desde cualquier CTA)
  └── container
      └── global widget (form)
          ├── templateID: 17171 en ES
          └── templateID: 17697 en EN
```

Contenido del formulario global (viene incluido del template global, NO se toca):
- Heading "Solicita tu propuesta personalizada" (ES) / "Request your personalized proposal" (EN)
- Texto intro: "En el próximo paso definirás tu evento..." (ES) / "In the next step you'll define your event..." (EN)
- Stepper de 5 pasos (1-2-3-4-5)
- Campos: Nombre, Empresa, Email, Teléfono
- Textarea "Cuéntanos brevemente sobre tu evento (opcional)" (ES) / "Tell us briefly about your event (optional)" (EN) — placeholder inyectado por `eb-form.js` que ya es language-aware
- Checkbox "Acepto la Política de Privacidad"
- Botón "Enviar solicitud →" (ES) / "Submit request →" (EN)

**Reglas de la sección form:**
- SIEMPRE la penúltima sección de la página (después vienen solo `</main>` y `<footer>`)
- SIEMPRE con `menu-anchor` anchor=`contact` justo antes del container del form, para que cualquier `<a href="#contact">` en la página scrollee correctamente
- SIEMPRE usa el global widget correcto según idioma (17171 ES / 17697 EN — nunca al revés)
- Container padre `width: 100%` para que el form llene el ancho del boxed (nunca 50% ni width fijo — el bug del /en/success-stories/ del sep 2026)

**Verificar tras publicar:**
```bash
curl -sH "Cache-Control: no-cache" "<url>" > /tmp/pagina.html
grep -c "eb-form" /tmp/pagina.html                              # ≥1 (form injectado)
grep -c 'id="contact"' /tmp/pagina.html                         # ≥1 (menu-anchor)
grep -oE 'Solicita tu propuesta|Request your personalized' /tmp/pagina.html | head -1  # el heading según idioma
# Confirmar que el form está justo antes del </main>
grep -B 5 "</main>" /tmp/pagina.html | grep "eb-form"           # ≥1
```

Si la página nueva NO tiene form antes del footer, es un fallo bloqueante. **Nunca reportar "publicado" sin form**. Este era el bug detectado en /casos-de-exito/ sep 2026 — todos los listados y todas las pages/posts tienen que terminar con form.

## Restricciones comunes de contenido FAQ (ambos formatos)

- **Cero em-dash `—`**, cero middle-dot `·` como separador, cero en-dash `–`
- **Cero "En breve"** o "En resumen" como intro de respuestas
- Preguntas empiezan con **"¿"** en ES y con **"How"/"What"/"Why"/"When"/"Where"** en EN
- Preguntas específicas, no genéricas ("¿Cuánto cuesta X en Barcelona?" mejor que "¿Cuál es el precio?")
- Respuestas con números concretos: rangos de precio, duración, personas, meses de anticipación
- No copiar-pegar preguntas entre piezas (Google detecta duplicate FAQPage y ninguna se muestra)

## Anti-patrones prohibidos

- ❌ Construir el `_elementor_data` desde cero con containers `heading` + `text-editor` sueltos
- ❌ Publicar con `featured_media` reutilizada de otra pieza
- ❌ Publicar sin verificar la card en el listado ancestro (bug Maestros)
- ❌ Publicar solo en ES o solo en EN
- ❌ Publicar SIN formulario de contacto antes del footer (la última sección de la página debe ser el form con menu-anchor `contact`)
- ❌ Publicar con el mismo global form templateID para ambos idiomas (usar 17171 ES / 17697 EN)
- ❌ H1 sin `<span class="kcs-text2">` o `<span class="kcs-text2-2">` envolviendo la keyword principal
- ❌ Cambiar la font-family de Space Grotesk por otra en un widget concreto
- ❌ FAQ con `<h2 class="algo">Preguntas frecuentes</h2>` (el snippet 106 busca `<h2>` sin clase — usar `<h2>` limpio)
- ❌ FAQ sin schema (formato A: usar el `<h2>Preguntas frecuentes</h2>` para activar snippet 106; formato B: setting `faq_schema: yes` en el nested-accordion)
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
