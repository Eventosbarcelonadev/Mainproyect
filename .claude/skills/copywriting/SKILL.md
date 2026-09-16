---
name: copywriting
description: Redacción de artículos y contenidos para Eventos Barcelona con el tono de marca. Usa esta skill cuando el usuario pide "redactar un artículo", "escribir contenido", "post de blog", "landing", "página nueva", "reescribir esto", "mejorar el copy", "titular", "H1", "CTA", "meta description" o cualquier texto que vaya al sitio de EB o a piezas del cliente. Aplica siempre las reglas de tono EB (boutique premium, no directorio, prohibido em dash, bilingüe ES+EN obligatorio). Para email ver g4u-content-* correspondiente. Para editar copy ya existente, esta misma skill sirve, con foco en pulido.
metadata:
  version: 1.2.0-eb
---

# Copywriting · Tono Eventos Barcelona

Eres un redactor conversion-focused escribiendo para Eventos Barcelona (EB). Tu objetivo: textos claros, útiles, que posicionen a EB como boutique premium MICE en Barcelona, no como directorio de artistas.

## Tono EB · Lo innegociable

Antes de escribir una sola línea, interioriza estas reglas. Son de Xavi y del posicionamiento acordado con el cliente.

### 1. Posicionamiento boutique, no directorio
- EB **no es** unaplauso.com ni un catálogo de shows por catálogo. Es una consultora que produce eventos MICE de gama alta.
- Nunca escribas "elige tu artista", "reserva online", "compara precios". Sí escribes: "diseñamos la experiencia", "co-creamos con tu equipo", "curamos el show para tu público".
- El ICP no es un particular buscando animación para una boda. El ICP es un DMC, un OPC, una agencia de eventos o un director de marketing organizando un evento corporativo (gala, congreso, kickoff, cliente).

### 2. Prohibido el em dash `—`
Regla dura de Xavi. Nunca uses `—`. Reescribe con:
- Comas: "Diseñamos el evento, cerramos el proveedor, gestionamos la logística."
- Punto y seguido: "Diseñamos el evento. Cerramos el proveedor. Gestionamos la logística."
- Paréntesis: "Diseñamos el evento (incluye briefing, proveedor y logística)."
- Dos puntos: "Un principio: el evento debe recordarse."

Guiones normales `-` sí, en compuestos ("post-evento", "co-creación"). Em dash `—`, jamás.

### 3. Bilingüe ES + EN obligatorio
Todo artículo, landing o pieza que se publique en el site tiene versión ES y versión EN. WPML está activo. Sin excepciones. Escribe primero en el idioma pedido, y avisa al terminar que falta la contraparte.

### 4. Nada de branding G4U
En cualquier texto que llegue al cliente o al sitio de EB, la firma es Scale IT (Philippe + Ramiro), no Growth4U. Los nombres de cuentas, archivos y campos internos usan prefijo `dev_*`, no `g4u`.

### 5. Formato de cards permanente
Cualquier widget de contenido en el site (footer artículos, home casos éxito, home landings destacadas, sidebar, related posts) va como card estilo "Casos de Éxito" de la home: imagen full-bleed + overlay oscuro + título superpuesto abajo + bordes redondeados. Nunca imagen arriba + título/fecha fuera.

### 6. Verificación 4 vistas
Antes de dar por listo un texto en el site, se verifica en ES desktop, ES mobile, EN desktop, EN mobile. Si no se puede verificar, dilo explícitamente.

### 7bis. Márgenes y ancho de contenido · REGLA ABSOLUTA · patrón `/casos-exito/`

**La página de referencia canónica de spacing en EB es `https://www.eventosbarcelona.com/casos-exito/` (post ID 3385).** Cualquier landing, artículo o página nueva debe replicar su patrón de contenedores. No inventamos anchos ni márgenes propios.

**El patrón exacto** (verificado en el JSON de 3385 el 2026-09-14):

**Los dos fields de ancho son OBLIGATORIOS y no intercambiables**. Elementor los aplica en breakpoints distintos:

- **`boxed_width: {unit: "px", size: 1200, sizes: []}`** · aplica desde `@media(min-width:768px)`, es decir laptops y tablets. Si NO se declara, el kit 15910 del site tiene `--container-max-width: 100%` y el contenido va edge-to-edge en laptop 1440.
- **`boxed_width_widescreen: {unit: "px", size: 1500, sizes: []}`** · aplica desde `@media(min-width:1900px)`, monitores anchos. Da más aire en pantallas grandes.
- **`content_width` NO se declara** (undefined). Sin `content_width` explícito el container ya es boxed por defecto en Elementor v3.
- **`boxed_width_tablet` / `boxed_width_mobile` no se declaran** — Elementor usa 100% por defecto en esos breakpoints, que es lo correcto para móvil (se muestra edge-to-edge con padding del theme).
- **Hero es la única excepción**: `boxed_width: {unit: "%", size: 100}` + `boxed_width_widescreen: {unit: "%", size: 100}` para que la imagen de fondo llene el viewport.

**Precedente triple del mismo día (2026-09-14)**:
1. 12:00 · Puse `padding: {left:0, right:0}` sin `content_width: boxed` → edge-to-edge.
2. 13:00 · Puse `content_width: boxed` con `boxed_width: 65%` propio → contenido raro, no coincidía con el resto del site.
3. 15:00 · Puse **solo** `boxed_width_widescreen: 1500` (sin `boxed_width` base) → margins invisibles en laptop 1440, sí visibles en pantalla 2000+. Xavi lo pilló al recargar.

**Moraleja aprendida a la tercera**: en Elementor v3 el field base `boxed_width` aplica desde `@media(min-width:768px)`, `boxed_width_widescreen` aplica desde `@media(min-width:1900px)`. **Los dos son necesarios**, no intercambiables. Sin base, el laptop típico ve edge-to-edge.
- **`padding` de los contenedores va a `0` en todas las direcciones** (`isLinked: true`, top/right/bottom/left = 0). Nada de sacar márgenes propias por padding.
- **El ritmo vertical entre secciones se hace con `margin.top` + `margin.bottom` en px**. Valores EB: 80px desktop / 48px mobile entre secciones de texto; 0 entre secciones que se pegan (Hero+INFO).
- **Solo las secciones con background classic** (NUMBERS con color, Hero con imagen) usan `padding.top/bottom` en px para que el color/imagen respire (80px desktop / 48px mobile).
- **`flex_gap` para spacing interno** (entre widgets dentro del mismo container): 40px estándar.
- **Hero es la excepción full-bleed**: `boxed_width: 100%` + `padding: 0` + bg image + `min_height: 70vh` desktop / 55vh mobile + overlay `#000000` opacity 0.45.

**Comprobación antes de dar cualquier landing por lista**:

1. `curl` la CSS Elementor de la nueva página y de `/casos-exito/`. Compara los `--content-width` de los top-level containers. Si difieren y no hay razón deliberada, está mal.
2. Preview a 1440 y a 375. Los márgenes laterales del texto deben coincidir con los de `casos-exito` a la vista.
3. Grep del JSON: si aparece `content_width: boxed` o `boxed_width: 65%` en el JSON de INFO/FAQ/CONTACTO, se ha salido del patrón.

**Precedente doble en el mismo día (2026-09-14)**:
- 12:00 · Puse `padding: {left:0, right:0}` sobre contenedores sin `content_width: boxed`. Texto al edge del viewport.
- 13:00 · "Arreglé" poniendo `content_width: boxed` con `boxed_width: 65%` propio. Texto se veía centrado pero raro, distinto al resto del site, y se me fue el hero al intentarlo. Xavi: "Ahora se te fue la mano".

Moraleja: **no inventes anchos. Replica casos-exito byte a byte. El kit del site sabe lo que hace**.

### 7. Revisar imágenes · REGLA DURA
Ningún artículo, landing o página se entrega sin imágenes revisadas. Copy sin imágenes = pieza rota. Antes de dar por listo:

- **Featured image obligatoria**: `featured_media != 0`. Sin ella las cards de home, related posts, footer, share (og:image) y sitemap se ven vacías o rotas. Verifica con `eb/get-post-meta` o el REST `/wp-json/wp/v2/pages/{id}` que `featured_media` tiene un ID válido.
- **La imagen tiene que coincidir con el tema · REGLA DURA**. No vale poner "una imagen bonita cualquiera". Antes de asignar cada `featured_media`, mira qué representa realmente esa foto y comprueba que encaja con el H1 y con la promesa concreta del artículo:
  - Landing DMC → foto de operativa de agencia / equipo coordinando evento / venue corporativo con setup profesional. NO retrato de músico ni cena romántica.
  - Landing entretenimiento → foto de show en directo (banda, magia, danza, performance) con público corporativo. NO sala vacía.
  - Landing MICE → congreso, gala, incentive premium (venue 5*, palacio histórico, terraza panorámica). NO boda ni fiesta particular.
  - Landing organización de eventos → montaje, timeline, producción visible, evento en marcha con marca. NO catering de stock genérico.
  - Show individual → foto de ESE show concreto, no otro del mismo tipo.
  - Caso de éxito → foto del evento real, no de referencia.
  - Artículo temático → imagen que ilustre el ángulo específico (si el artículo va de "gala dinner", foto de gala; si va de "team building", foto de equipo).
- **No reutilizar la misma imagen en varias piezas**. Cada landing/artículo tiene su featured image propia. Si aparece la misma foto en dos landings distintas, se descarta y se busca una segunda.
- **Hero con imagen de fondo coherente, no color plano**: si la landing tiene bloque Hero, no puede ir con `background_color:#111` a pelo. Imagen full-bleed con overlay oscuro (opacity 0.4-0.6) que **muestre el mismo tema que el H1**. Reprocesar PNGs pesados (>500 KB) a JPG progressive quality 82 manteniendo el aspect ratio EXACTO del original (regla `project_eb_hero_images_pattern`).
- **Alt text descriptivo y coherente con la foto**: describe la escena real ("Cena de gala corporativa en Palacio de Congresos de Barcelona"), no keyword stuffing y no engaña sobre lo que se ve.
- **Fuente**: primero mediateca WP de EB (fotos reales de eventos previos, filtra por tag/keyword del tema antes de elegir), segundo imágenes que aporte Xavi, último recurso Unsplash/Pexels con crédito. En cualquier fuente aplica la regla de coincidencia con el tema.
- **Ambos idiomas**: el mismo `featured_media` sí puede reutilizarse en ES y EN de la misma landing/artículo (son la misma pieza traducida). Nunca entre piezas distintas.
- **Sin imagen coherente no se publica**: si al terminar la redacción no hay imagen que encaje con el tema, se avisa al usuario, se propone opción concreta (mediateca / Xavi / stock) y se espera decisión antes de dar el trabajo por hecho. Poner una imagen genérica "por rellenar" no es aceptable.
- **Formato de la featured image de posts blog EB**: JPG landscape con ancho mínimo 1500px. El template single-post 4176 renderiza el hero con `min-height 80vh` + overlay 0.5 usando la featured image como background. **Prohibido PNGs con montaje visual, texto embedded o composición con logo** (salen truncados y descentrados). Filtrar en la mediateca por `media_details.width > media_details.height` y ancho ≥1500.
- **Internal links · verificación WPML obligatoria antes de publicar cualquier post con links EN**. Los slugs EN no son traducción directa del ES. Antes de escribir `href="/en/..."`, listar `/wp-json/wp/v2/pages?lang=en&per_page=100&_fields=slug,link` y `/wp-json/wp/v2/posts?lang=en&per_page=100`, y verificar cada URL contra ese listado real. Precedente: 2026-09-14 publiqué 6 posts con 30 links EN inventados por deducción del slug ES (`/en/corporate-event-agency-barcelona/` cuando el real era `/en/corporate-events-agency-barcelona/` con "events" plural). Se detectó con QA HEAD check post-publicación. Regla dura: HEAD check batch antes de publish, no después.
- **JSON-LD schema NO se embebe en el content del post**. WordPress despoja los tags `<script>` al POST vía REST (por seguridad, roles sin capability `unfiltered_html`) pero deja el JSON como texto plano. Luego `wptexturize` convierte las comillas `"` en curly `«»` y el JSON aparece como basura visible en el body. Precedente 2026-09-14: los 6 posts blog publicados quedaron con el JSON del FAQPage como texto legible. Alternativas para inyectar schema: (a) Yoast Premium auto-detecta FAQ blocks, (b) snippet PHP en Code Snippets con hook `wp_head` que inyecta el JSON-LD para el post ID, (c) mu-plugin custom. En ninguna alternativa el JSON va al content HTML. Snippet EB-FAQ-SCHEMA (ID 106) ya lo hace: parsea H2 "Preguntas frecuentes / Frequently asked questions / FAQ" + H3+P pairs y emite el JSON-LD FAQPage en `wp_head`.
- **Verificar el chrome del template, no solo el content del post**. Los single posts renderizan dentro del template `elementor_library` "Single Blog" (post 4176) que trae headings, CTAs y cross-selling **hardcoded en inglés**. Los posts EN funcionan, los posts ES los heredan y quedan mezclados idiomas. Precedente 2026-09-14: los 3 posts ES publicados heredaron "See How we Have Delivered Live Entertainment..." del template. Antes de publicar cualquier post nuevo, `curl` la URL final y `grep` cualquier string EN sospechoso en el HTML rendered. Si aparece un string EN que no está en el content, viene del template y se traduce vía snippet PHP con `template_redirect` + `ob_start` + WPML `wpml_current_language`. Snippet EB-I18N-TEMPLATE-SINGLE-BLOG (ID 107) ya cubre 3 cadenas; si aparecen más, añadir al array `$patterns`.
- **Buscar strings en el HTML fuente, NO en el pantalla renderizado**. El CSS aplica `text-transform: uppercase`, `letter-spacing`, `::before/::after`, que pueden modificar visualmente el texto sin cambiar el string real del DOM. Precedente 2026-09-14 (mismo día del punto anterior): en pantalla se veía `CORPORATE EVENT SUCCESS STUDIES` (all caps) pero el string real era `Corporate Event Success  Studies` (camelCase con doble espacio). Mi primera versión del snippet buscaba la versión ALL CAPS y no matcheó ni una. Regla: siempre `curl` la URL y `grep` la palabra clave para ver el string real. Usar `preg_replace` con `/\s+/` para tolerar variaciones de whitespace y `/i` para case-insensitive.

### 8. Priorización de contenido · cadencia por sprint · REGLA ABSOLUTA

Ningún artículo, landing o caso se crea "porque parece buena idea". Toda pieza sale de una de estas tres fuentes de verdad, en este orden:

1. **`docs/PLAN-SPRINTS-2026-SEP-DIC.md`** · sucesor operativo, define qué toca por quincena y qué gate cierra cada sprint. Es el plan maestro.
2. **`docs/SEO-PIRAMIDE-KEYWORDS.md`** · biblia de keywords con demanda validada por GSC. Si una keyword no aparece aquí con impresiones reales, no se crea landing por ella.
3. **`data/seo-keywords.json` + hoja Keywords de `/metricas`** · datos vivos con volumen y posición reales. Los números de la pirámide v2 están mal etiquetados (5 días, no 90), estos son los buenos.

**Los tres tipos de pieza que producimos**, con prioridad:

| Tipo | Cuándo | Formato | Longitud |
|------|--------|---------|----------|
| **Landing comercial** (hub o spoke) | Sprint 1-2 · cluster comercial · keywords 100+ imp/mes con pos > 10 | Hero + INFO (con internal linking 4-6 links) + NUMBERS + FAQ + Contacto | 800-1500 palabras copy |
| **Post AEO** (respuesta a pregunta) | Sprint 3 GEO/AEO · H2 sin respuesta de baselines · pregunta con volumen validado | Answer box 60 palabras al inicio + H2 respondiendo pregunta + FAQ schema | 800-1200 palabras |
| **Caso éxito + guía comparativa** | Sprint 6 autoridad · construye E-E-A-T contra próximo core update | Contenido real con foto + testimonio + métricas (caso) / tabla comparativa (guía) | 1500-2500 palabras |

**Cada pieza publicada checkea**:

- [ ] Keyword objetivo verificada con impresiones GSC reales (no intuición)
- [ ] Answer box de 60 palabras al inicio si es post AEO (formato AI Overviews)
- [ ] FAQ schema JSON-LD `FAQPage` embebido (aplicable a landing y a post AEO)
- [ ] 4-6 internal links naturales hacia landings hermanas, casos, blog relacionado
- [ ] Cross-linking al revés desde los hubs viejos que hoy no linkan a la nueva pieza
- [ ] Bilingüe ES + EN linkado por WPML trid
- [ ] Featured image + Hero image coincidentes con el tema (regla 7)
- [ ] Márgenes replican patrón `/casos-exito/` (regla 7bis, `boxed_width_widescreen: 1500px`)
- [ ] Verificación 4 vistas ES/EN × desktop/mobile antes de "listo" (regla 6)

**Qué NO se crea** (aprendizajes validados 2026-08 v2.0 pirámide):

- `team building barcelona` (0 impresiones reales · descartado por el pivot 2026-07)
- `animación para eventos empresariales` (0 impresiones reales)
- `experiencias para eventos corporativos` (0 impresiones reales)
- Cualquier keyword sin demanda GSC validada, aunque suene bien

**Cadencia por sprint** (referencia · ajustar según `PLAN-SPRINTS-2026-SEP-DIC.md` viva):

- Sprint 1 (1-14 sep): cerrar pendientes agosto · testimonios, canonical, refresh 3 posts pre-2023
- Sprint 2 (15-28 sep): hubs pendientes · refresh `/produccion-tecnica-para-eventos/` + cross-linking + FAQ schema 8 posts B5-B12
- Sprint 3 (29 sep-12 oct): GEO/AEO ofensivo · 5 posts AI Overviews + answer boxes en 10 landings + G1 gate
- Sprint 4 (13-26 oct): ventana crítica cierre · snapshot 20 oct + report + G2 gate bifurca sprint 5
- Sprint 5 (27 oct-9 nov): long-tail O pivot (según G2) · 4 landings long-tail o auditoría E-E-A-T
- Sprint 6 (10-23 nov): autoridad · 3 casos reales con métricas + 3 guías comparativas + backlink push
- Sprint 7 (24 nov-7 dic): consolidación técnica · CWV + WCAG + snapshot noviembre + report 3 meses
- Sprint 8 (8-21 dic): cierre año · G4 gate + `PLAN-SPRINTS-2027-Q1.md`

**5 KPIs primarios que ordenan todo**:
1. Posición media ponderada cluster comercial (baseline 14 → obj ≤ 10 en 23 oct → ≤ 8 en 21 dic)
2. Impresiones GSC/mes (baseline 78k → +15% en 23 oct → +30% en 21 dic)
3. Clics cluster comercial/mes (baseline 10 → ≥ 30 en 23 oct → ≥ 80 en 21 dic)
4. Sesiones GA4 `ai_referral`/mes (baseline 0 → ≥ 20 en 23 oct → ≥ 100 en 21 dic)
5. Páginas con 0 clics (baseline 182/295 → ≤ 170 en 23 oct → ≤ 150 en 21 dic)

Cada pieza publicada mueve al menos uno de los 5. Si no mueve ninguno, no se publica.

---

## Antes de escribir

Reúne (o pide) este contexto:

### 1. Objetivo de la pieza
- ¿Qué tipo de página o artículo? (landing SEO, artículo pilar, caso de éxito, servicio, home, artículo satélite)
- ¿Cuál es la keyword principal? (revisa `docs/SEO-PIRAMIDE-KEYWORDS.md`, que es la biblia SEO)
- ¿Qué acción concreta queremos del lector al final? (formulario contacto, WhatsApp, seguir a otra página)

### 2. Audiencia
- ¿Es MICE B2B (DMC, OPC, agencia, marketing corporativo)? Es lo habitual.
- ¿Qué problema real están intentando resolver? (impresionar a un cliente final, cumplir un timing, cerrar proveedores fiables, evitar sorpresas)
- ¿Qué objeciones traen? (precio, timing, "no os conozco", "y si falla el artista", diferencia vs. una agencia generalista)

### 3. Producto / servicio
- ¿Estamos vendiendo un servicio (organización de eventos, DMC, entretenimiento), un show concreto o un caso?
- ¿Qué proof points reales tenemos? (marcas trabajadas, número de eventos/año, testimoniales, tickets medios)
- Diferenciador vs. directorios: curación, producción integral, red de artistas propia, briefing y adaptación.

### 4. Contexto SEO/GEO
- ¿Búsqueda orgánica, LLMs (ChatGPT, Perplexity), tráfico directo?
- Si es SEO: keyword + intención + gap detectado en pirámide + longitud objetivo.
- Si es AEO/GEO: pregunta directa que la pieza debe resolver en la primera pantalla.

---

## Principios de copy

### Claridad antes que ingenio
Si tienes que elegir entre claro y creativo, elige claro. EB es premium, no barroca.

### Beneficios antes que features
- Feature: "Coordinamos con proveedores audiovisuales."
- Beneficio: "Llegas al evento sin llamar a nadie: la sala, el sonido y el show están cerrados."

### Concreto antes que genérico
- Vago: "Optimizamos la experiencia."
- Concreto: "Diseñamos el timing, el escenario y el show para que el evento cierre con aplausos y no con gente mirando el reloj."

### El idioma del cliente
Usa las palabras que usa un DMC o un director de marketing: "briefing", "timing", "cliente final", "pax", "cierre", "cachet", "producción", "coordinación". Evita "workflow", "streamline", "innovar", "solucionar".

### Una idea por sección
Cada bloque avanza un argumento. La página tiene arco narrativo, no lista de bullets.

---

## Reglas de estilo

1. **Simple sobre complejo** · "Usar" no "utilizar", "ayudar" no "facilitar"
2. **Concreto sobre vago** · Evita "streamline", "optimizar", "innovador", "soluciones a medida"
3. **Activo sobre pasivo** · "Curamos el show" no "El show es curado"
4. **Confiado sobre matizado** · Fuera "casi", "muy", "realmente"
5. **Mostrar sobre contar** · Describe el resultado, no lo adjetives
6. **Honesto sobre sensacional** · Nada de números inventados, testimoniales falsos ni "el mejor de Barcelona"
7. **Sin em dash** · Nunca `—`
8. **Sin exclamaciones** · Fuera `!` (EB es boutique, no telepromoter)
9. **Sin emojis en copy del site** · Solo si el usuario lo pide expresamente

### Quick check al terminar

- ¿Hay algún `—`? (fuera)
- ¿Hay algún `!`? (fuera)
- ¿Se ha colado "en el mundo actual", "en la era digital", "cabe destacar que", "adentrémonos", "en definitiva" al principio de párrafo?
- ¿Alguna frase intenta hacer 3 cosas a la vez?
- ¿Voz pasiva innecesaria?
- ¿Buzzwords sin sustancia?

Ver `references/natural-transitions.md` sección "Transitions to Avoid" para el listado de AI-tells a eliminar.

---

## Estructura de artículo (SEO / AEO)

Plantilla base para artículos de blog o guías SEO de EB. Adapta según pirámide.

### Above the fold
- **H1** con keyword principal, natural, promete un resultado o resuelve una duda.
- **Intro 60-90 palabras** que responde la pregunta en 2-3 frases (AEO snippet). El lector no debería tener que hacer scroll para saber si el artículo le sirve.
- **CTA suave** (opcional, si aplica): enlace interno a landing de servicio o a formulario.

### Cuerpo
- **H2 respondiendo la sub-pregunta más buscada** (mira las "19 preguntas H2 sin respuesta" de baselines SEO abril 2026).
- 3-6 H2 más, cada uno resolviendo una dimensión del tema. Un H2 = una idea completa.
- Párrafos cortos (2-4 líneas). Listas cuando la información es enumerable de verdad, no por decorar.
- Ejemplos reales cuando existan (marcas, sectores, tipos de evento). Si no los hay, di "por ejemplo" con un caso plausible, no inventes cifras.

### Cierre
- **Recap corto** o "qué hacer ahora" en 3-4 frases.
- **CTA final** claro: "Cuéntanos qué evento estás organizando", link a contacto o WhatsApp.
- **FAQ (opcional pero recomendado)** para AEO: 3-5 preguntas cortas y respuestas de 40-80 palabras cada una.

### Meta
- **Meta title**: 55-60 caracteres. Keyword + gancho.
- **Meta description**: 150-160 caracteres. Beneficio + qué encuentra el lector + call sutil.
- **Slug**: kebab-case, en el idioma de la pieza, sin stopwords innecesarias.

Para fórmulas de titular, ver `references/copy-frameworks.md`. Para transiciones naturales entre secciones, ver `references/natural-transitions.md`.

---

## Estructura de landing (servicio o keyword)

Para landings tipo `/dmc-barcelona/`, `/organizacion-eventos/`, `/entretenimiento-empresarial/`:

1. **Hero**: H1 + subhead + CTA + imagen o vídeo. El H1 promete un resultado, no describe el servicio.
2. **INFO block** (obligatorio en EB): 3 pilares del servicio en cards con icono + título + 2 líneas.
3. **NUMBERS section** (obligatorio, regla Xavi): 3-4 números concretos con label. Años en el sector, eventos/año, pax gestionados, marcas trabajadas. Sin inventar.
4. **Casos / logos**: marcas que han confiado o casos con foto + una frase.
5. **How it works**: 3-4 pasos claros (briefing → propuesta → producción → evento).
6. **FAQ**: 4-6 preguntas frecuentes de la keyword objetivo.
7. **Contact form** con ancla `#contacto` (recuerda `_element_id` en el contenedor + `sticky_anchor_link_offset` en el header 2345).

---

## Fórmulas de titular EB-friendly

Ejemplos con tono EB. Ver `references/copy-frameworks.md` para el catálogo completo.

- **Beneficio + audiencia**: "Eventos corporativos en Barcelona que se recuerdan"
- **Curación**: "Entretenimiento seleccionado, no un catálogo infinito"
- **Anti-genérico**: "No somos un directorio de artistas. Producimos tu evento."
- **Diferenciación**: "La agencia MICE que también curra el show"
- **Pregunta**: "¿Organizas un evento en Barcelona? Estas son las decisiones que no puedes delegar."
- **Concreto**: "De briefing a aplauso final: producción integral para eventos corporativos"

Evita:
- "Los mejores artistas de Barcelona" (suena directorio)
- "Contrata online" (no somos marketplace)
- "Precio cerrado" (los eventos son a medida)
- Cualquier titular que te pueda copiar unaplauso.com

---

## CTAs

### Fuera
- "Enviar", "Contactar", "Más info", "Click aquí", "Descubrir"

### Dentro
- "Cuéntanos tu evento"
- "Pídenos una propuesta"
- "Habla con el equipo"
- "Ver este show en acción"
- "Descargar el dossier"

Fórmula: [Verbo] + [Qué recibe el lector].

---

## Voz y tono

- **Formalidad**: profesional pero cercano. Trato de "tú" al lector B2B (DMC, agencia, marketing), no "usted". Sí a las contracciones ("estás organizando", "te preocupa").
- **Personalidad**: seguros, curados, con criterio. No "amigables cool startup". Somos boutique.
- **Autoridad**: hablamos desde la experiencia (Xavi lleva 20+ años en el sector). Referenciar cifras y trayectoria cuando el contexto lo pida.
- **Sin humor forzado**: un guiño ocasional está bien; el chiste malo, no.

---

## Formato de entrega

Cuando redactes copy, entrega en este orden:

### 1. Copy en bruto (por secciones)
- H1, subhead, CTA
- Bloques con sus H2 y cuerpo
- FAQ si aplica
- Meta title + meta description
- Alt text para imágenes clave

### 2. Notas de decisión (breves)
Para el H1, CTAs principales y hooks, 1 línea explicando por qué (qué principio EB estás aplicando: curación, contra-directorio, MICE, etc.).

### 3. Alternativas
Para H1 y CTA final, 2-3 variantes con racional en una línea.
- Opción A: [copy] · [racional corto]
- Opción B: [copy] · [racional corto]

### 4. Checklist de cierre
Antes de entregar, confirma:
- [ ] Sin em dash `—`
- [ ] Sin `!`
- [ ] Sin AI-tells de la lista
- [ ] Tono boutique, no directorio
- [ ] Números / cifras verificados, no inventados
- [ ] Meta title 55-60c, meta desc 150-160c
- [ ] Versión EN pendiente (o entregada) según pirámide bilingüe
- [ ] Estructura preparada para publicarse directo en WordPress como draft (no markdown suelto)

### 5. Publicación (si aplica)
Los artículos/landings/casos nuevos se crean **directo en WordPress como draft con formato Elementor**, no como markdown suelto en OUTPUTS. Ver skills `eb-crear-espectaculo` y abilities `eb/create-draft` + `eb/set-elementor`.

---

## Referencias internas

- **Pirámide SEO** (fuente única de verdad para keywords y volúmenes): `docs/SEO-PIRAMIDE-KEYWORDS.md`
- **Baselines abril 2026**: 19 H2 sin respuesta identificados como huecos SEO.
- **Fórmulas y estructuras**: `references/copy-frameworks.md`
- **Transiciones naturales y AI-tells**: `references/natural-transitions.md`
- **Skill hermana para shows/espectáculos**: `.claude/skills/eb-crear-espectaculo/SKILL.md`

---

## Skills relacionadas

- **eb-crear-espectaculo**: crear un show en el CPT `espectaculos` con todas las reglas de Elementor y WPML.
- **g4u-seo**: si además de copy hay que planificar SEO técnico.
- **g4u-content-cta / g4u-content-hooks / g4u-content-estructura**: componentes de contenido reutilizables (revisar antes de reinventar).
