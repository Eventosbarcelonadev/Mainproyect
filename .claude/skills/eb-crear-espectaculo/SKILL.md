---
name: eb-crear-espectaculo
description: Reglas y estructura para crear un espectáculo en eventosbarcelona.com. Cubre el CPT correcto, la estructura Elementor obligatoria (hero + info + galería + sección NUMBERS "¿Por qué elegir X?" con 4 razones + especificaciones técnicas + FAQ schema + form contacto) y la publicación bilingüe ES+EN vinculada por WPML. Invocar cuando el usuario pida "crear espectáculo", "nuevo show en la web", "añadir X al catálogo de espectáculos", "publicar espectáculo Y", "faltan los porqué en el show Z".
---

# Crear un espectáculo en EB (eventosbarcelona.com)

Esta es la doctrina para publicar un show individual en el catálogo. **No es opcional** — todos los shows tienen que cumplir estas reglas o Xavi los reporta como "incompletos".

## 1. CPT correcto: `espectaculos`, NUNCA `page`

Un show específico (Light Boxes Show, Show de Pompas de Jabón, Acrobatas Mano a Mano) va como post del CPT `espectaculos`. **NO va como `page`**.

- Si se creó por error como page → usar `eb/move-post-type` con `to_type="espectaculos"` (ability MCP EB). Mueve traducciones WPML también y crea redirect 301 automático.
- URL resultante: `/espectaculos/<slug>/` (ES), `/en/performances/<slug>/` (EN).

Las **landings SEO temáticas** (`/violinista-cena-gala-corporativa-barcelona/`, `/dj-fiesta-empresa-barcelona/`) SÍ son pages — son hubs comerciales, no shows concretos.

## 2. Estructura Elementor obligatoria

Todos los shows siguen esta estructura de arriba abajo. Referencia canónica: post 18608 (Light Boxes Show).

1. **Hero container** — background featured-image dinámico, breadcrumb icon-list `Artistas y espectáculos | Espectáculos` + H1 "Nombre del show para eventos Barcelona"
2. **INFO container** — H2 "Contratar espectáculo X Barcelona" + 2-3 párrafos comerciales (Space Grotesk 24px, line-height 36px)
3. **Galería container** — media-carousel skin slideshow, 3 slides por vista, altura 700px desktop / 300px mobile, border-radius 14px. Primer slide puede ser video de YouTube. Después H2 con subtítulo + `<ul>` de 3-4 bullets con `<strong>` inicial.
4. **NUMBERS container** ⚠️ **CRÍTICO** — sección "¿Por qué elegir <Nombre del show>?" con 4 razones numeradas 01/02/03/04. Ver detalle abajo.
5. **INFO container técnico** — H2 "Especificaciones técnicas" + `<ol>` de 3-5 bullets técnicos.
6. **FAQ container** — heading con `<span class="kcs-text3">Preguntas frecuentes </span>` + nested-accordion con `faq_schema: yes` y 3-5 preguntas frecuentes.
7. **CONTACTO container** — heading "Solicita información sobre X" + global form (templateID 4613).

## 3. La sección NUMBERS (obligatoria)

Xavi la exige. Si falta, el show sale "incompleto" en review.

**Container padre** background gris (color global `ed38265`), padding grande vertical, flex-direction column.
**Container título** boxed-width 70% (100% tablet): H2 centrado "¿Por qué elegir <Nombre del show>?"
**Container 4 columnas** flex-direction row (column en tablet), gap 100px desktop / 40px tablet:

Cada columna es 25% width (100% tablet), flex-direction column, con:
- **Widget 1 — Número**: heading `<p>` size 100px (95px mobile) Space Grotesk font-weight 400, align center, `_css_classes: kcs-text4`. El title se hidrata dinámicamente con ACF `field_65d72cb341037` con key `:01`, `:02`, `:03`, `:04`. Si no hay ACF, poner el texto directo "01"/"02"/"03"/"04".
- **Widget 2 — Título+descripción**: heading H4 align center, con contenido HTML `<strong>Título de la razón</strong><br>Descripción de una frase`.

Las 4 razones NO se copian de otro show. Son **específicas del show en cuestión**. Ejemplos válidos:

- Light Boxes: Impacto Visual · Branding dinámico · Tecnología de Punta · Versatilidad
- Show pompas: Efecto Sorpresa · Adaptable a tu Marca · Cero Complicaciones · Interacción Total

Recomendación de esqueleto por razón (ayuda a redactar rápido):
1. **La sensación única** que provoca (visual, emoción, sorpresa)
2. **La personalización de marca** (logo, colores, formato adaptable al cliente)
3. **La tranquilidad operativa** (tecnología, montaje limpio, garantías)
4. **La adaptabilidad** (espacios, público, tipo de evento)

## 4. Traducción EN obligatoria

WPML activo. Cada show ES debe tener su versión EN vinculada al mismo `trid`.

- Si se publica ES sin EN → borrador con `eb/create-draft` post_type=espectaculos + `eb/set-language` lang=en source_id=<id_es> source_lang=es.
- URL EN: `/en/performances/<slug-en>/`.
- Traducir también los 4 números (título+desc) — nunca dejar contenido en ES en la versión EN.

## 5. Publicar en la página `/espectaculos/` (archive)

El archive del CPT es automático — cuando un post `espectaculos` está `publish`, aparece en `/espectaculos/` sin necesidad de nada más.

Si no aparece:
- Purgar Elementor cache: `DELETE /wp-json/elementor/v1/cache`
- Purgar WPO page cache
- Purgar Cloudflare cache: `POST /zones/$CF_ZONE_ID/purge_cache` con `{"purge_everything":true}`

## 6. Featured image

Formato: **JPG optimizado**, quality 82, progressive, dimensiones 2560x1420 aprox (16:9 landscape scaled). **Máximo 500 KB**. NUNCA PNG para fotos — reprocesar con `cjpeg` desde PPM antes de subir.

Ver memoria [[project_eb_hero_images_pattern]] para el patrón completo de reprocesado.

## 7. FAQ schema

El nested-accordion debe llevar `faq_schema: yes` para inyectar JSON-LD FAQPage automático (aunque Google ya no muestra rich results FAQ desde may-2026, mantiene el schema válido y sirve para AI Overviews / Perplexity / ChatGPT según memoria `reference_wp_geo_stack`).

## 8. Checklist Definition of Done

Antes de marcar publicado:

- [ ] `post_type = espectaculos` (no page)
- [ ] Hero H1 con formato "Nombre para eventos Barcelona"
- [ ] Featured image JPG < 500 KB
- [ ] INFO H2 comercial + copy 2-3 párrafos
- [ ] Galería con al menos 3 slides
- [ ] **Sección NUMBERS con 4 razones específicas del show**
- [ ] Especificaciones técnicas H2 + lista
- [ ] FAQ con `faq_schema: yes` y ≥3 preguntas
- [ ] Form de contacto (global templateID 4613) — **y sus copies traducidos al inglés en la versión EN** (título, placeholders, botones, aviso privacidad)
- [ ] Traducción EN publicada y vinculada por WPML `trid`
- [ ] URL final en `/espectaculos/<slug>/`
- [ ] Aparece en `/espectaculos/` archive (verificar tras purge caches)

## 8.5. Verificación EN + mobile · REGLA DURA

**Regla no negociable de Philippe/Xavi (2026-09-08)**: cada vez que se publica o modifica un artículo o show, hay que verificar **antes de dar por hecho**:

1. **Versión EN**: no basta con que exista el post EN vinculado por WPML. Toda modificación en ES (copy, sección nueva, form, imágenes) tiene que replicarse traducida en EN. Fallar en esto es lo que Xavi reporta como "en inglés no se ve bien / falta X".
   - Copy de la sección → traducir contenido
   - Placeholders del formulario → traducir "Nombre" → "Name", etc.
   - CTAs y botones → "Solicitar presupuesto →" → "Request quote →"
   - Links internos → cambiar `/politica-de-privacidad` → `/en/privacy-policy`
   - Alt text de imágenes → traducir

2. **Mobile ES + Mobile EN**: no basta con ver en desktop. Toda sección tiene que revisarse a viewport 412×900 mínimo:
   - Screenshot con `--user-agent="Mozilla/5.0 (iPhone; …)"` obligatorio
   - Verificar que texto no se corta por la derecha (overflow-x)
   - Verificar que los widgets del NUMBERS caen en columna (`flex-direction: column`) y no se solapan
   - Verificar que el form es usable (inputs no partidos, botón visible)

3. **Purga completa antes de "listo"**: Elementor cache + WPO + Cloudflare (`purge_everything`) → esperar 10 s → tomar screenshot fresh con `?nocache=<timestamp>` para bypass residual.

4. **Nunca dar por finalizado antes de las 4 vistas**: ES desktop, ES mobile, EN desktop, EN mobile. Si falta una, la tarea sigue in-progress.

**Recomendación operativa**: usar Puppeteer o Chrome headless con 2 llamadas paralelas (mobile + desktop) por idioma, comparar screenshots y adjuntar los 4 al reporte final antes de decir "listo".

## 9. Regla dura

**Ningún show va a producción sin la sección NUMBERS de 4 razones específicas.** Si el copy de las 4 razones no está listo, se propone borrador (draft) hasta que Xavi valide. Nunca copiar/pegar razones de otro show.

## 10. Referencias

- Post canónico: 18608 Light Boxes Show
- Reference update template Elementor: leer `_elementor_data` del 18608 con ability `eb/get-post-meta`
- Ability para mover CPT: `eb/move-post-type`
- Ability para crear draft: `eb/create-draft`
- Ability para setear language: `eb/set-language`
- Post que faltaba NUMBERS (arreglado 2026-09-07): 21879 (show pompas ES) + 21880 (bubble show EN)
