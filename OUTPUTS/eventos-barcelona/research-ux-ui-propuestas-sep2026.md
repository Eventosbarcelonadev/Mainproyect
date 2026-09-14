# Rider visual de las propuestas EB

**Fecha:** 2026-09-14
**Para:** Philippe y Ramiro (Scale IT), con decisiones a validar con Xavi
**Alcance:** capa visual de la web app de propuestas (`propuesta.html`): vista cliente, editor (`?admin=1`), builder (`?mode=builder`) y PDF A4 (`?print=1`). Sin tocar lógica, datos, APIs ni flujos.
**Método:** auditoría de primera mano con capturas reales (Chrome headless, escrituras bloqueadas) + 4 líneas de research web en paralelo + verificación.

---

## 1. Alcance

| Campo | Valor |
|---|---|
| Pregunta | ¿Qué cambios solo visuales harían que la propuesta se lea como boutique premium y convierta mejor, en web, móvil y PDF? |
| Superficies | Vista cliente (escritorio 1440 px y móvil 390 px), editor admin, builder, PDF A4 |
| Muestra auditada | `ca5e1a51` (aprobada, 5 shows, 3 con extras, resumen oculto) · `061efc6d` (revisión, 6 shows, tema danza, resumen visible) · builder con 305 shows |
| Qué cuenta como "visual" | CSS, tipografía, color, espaciado, tratamiento de imagen, jerarquía, maquetación de print. Cambios en el HTML de las plantillas (`renderProposal`) se marcan aparte porque viven dentro de JS |
| Fuera de alcance | Nuevas funciones (índice navegable, opcionales seleccionables, firma, vídeo embebido), cambios de datos o de flujo de aprobación |
| "Completo" significa | Cada sección visible de las 4 superficies revisada + recomendaciones con evidencia y prioridad |

## 2. Diagnóstico de primera mano (capturas 2026-09-14)

### Datos de uso que condicionan el diseño (Supabase, 195 propuestas)

- 28 aprobadas; las aprobadas tienen casi siempre 3 a 5 shows.
- `event_date`: 81 vacías y 106 en formato ISO crudo (`2026-09-21`). El hero muestra la fecha tal cual o `null`.
- `event_location` vacía en 95, `client_company` vacía en 78, `event_guests` nulo en 37 y a `0` en otras 66.
- `category`: 186 "shows" (mix), 5 danza, 3 circo y 1 "música". Solo 8 reciben tema de color propio: la categoría "música" lleva tilde y no casa con la clave `musica` de `CATEGORY_CONFIG`, así que cae al tema por defecto.
- `hide_summary = true` en 23 propuestas: el cliente no ve total.
- 0 propuestas con imagen de cabecera elegida a mano: el hero siempre es la foto del primer show.

### Vista cliente

| # | Hallazgo | Evidencia | Gravedad |
|---|---|---|---|
| D1 | En móvil (390 px) los botones "Descargar PDF" y "Aprobar presupuesto" del hero no caben: el verde se corta fuera de pantalla y el PDF parte en dos líneas | `client-mob-00-viewport` | Alta |
| D2 | Hero a `min-height: 100vh` con foto al 30 % de opacidad plana: la foto queda turbia y la página no asoma bajo el pliegue | `client-desk-06-hero`, CSS `.hero`, `.hero-bg-image` | Media |
| D3 | La línea de detalle del hero muestra la fecha ISO (`2026-09-21`) o `null`, y no enseña cliente, lugar ni invitados | `client-desk-06-hero`, `admin-desk-00` | Alta |
| D4 | El título del hero es el nombre interno del evento; con nombres largos ocupa 3 líneas a 90 px | `admin-desk-00` ("Fiesta de empresa Actividad Aérea SL (variante con Rumba Catalana)") | Media |
| D5 | Formato de precio inconsistente en la misma página: `3950€` (bloque), `19.650€` (total), `2.250 €` (nota). `toLocaleString('es-ES')` no separa las cifras de 4 dígitos (correcto según la RAE) pero usa punto en las de 5 (impropio según FundéuRAE) y el código pega el `€` sin espacio | `client-desk-09-block1`, `x-client-desk-summary` | Alta |
| D6 | El resumen concatena la nota de precio entre paréntesis: dobles paréntesis y `()` vacíos ("Rueda Cyr & Cubo LED Show ()") | `x-client-desk-summary` | Alta |
| D7 | Las filas extra del bloque ("4 artistas … 2400€") no dicen si son alternativa u opcional; en el resumen se suman al total con "+" | `client-desk-09-block1`, `x-client-desk-summary` | Media |
| D8 | Botón verde `#2ecc71` con texto blanco: 2,10:1. Coral `#E87461` con texto blanco y etiquetas coral de 12 px sobre blanco: 2,96:1. Tema circo `#E8A461`: 2,12:1. Todos por debajo de AA (4,5:1) | cálculo WCAG | Alta |
| D9 | Dos acciones fuertes (PDF + Aprobar) antes de haber visto ningún show; la acción de aprobar usa un verde ajeno a la marca | `client-desk-06-hero` | Media |
| D10 | Acento por categoría: la misma marca sale coral, rosa, azul, naranja o morado según la propuesta | CSS `body.theme-*`, `admin-desk-00` (rosa) | Media |
| D11 | Desalineación con la web principal: eventosbarcelona.com usa Space Grotesk, coral `#EC5853` y magenta `#CC3366`; la propuesta usa DM Serif Display + Inter y coral `#E87461` | `brand-home-1/2`, estilos computados | Media (decisión de marca) |
| D12 | Fotos con logos de terceros y con artefactos de compresión dentro de la propuesta (Coca-Cola en malabares, "pidilite chairman club" en Glow Drummers, marcas en tarjetas del builder). Medido en el catálogo (304 fotos): mediana 1.197 px de ancho, 118 por debajo de 1.000 px y 86 por debajo de 720 px. La columna de imagen del bloque mide 720 px CSS en escritorio (1.440 px reales en retina) | `client-desk-09-block1`, `x-builder-selected`, medición `naturalWidth` | Alta (credibilidad) |
| D13 | Carrusel: flechas solo en hover (invisibles en táctil) y puntos de 8 px | CSS `.carousel-arrow`, `.carousel-dot` | Baja |
| D14 | "Ver vídeo" es una pastilla negra con el mismo peso que el precio y saca al cliente a YouTube | `client-desk-08-block0` | Baja |
| D15 | Condiciones: viñetas `#e5e5e5` (1,26:1), texto gris 14 px; cancelación y pago pesan igual que el resto | `client-desk-12-conditionssection` | Baja |
| D16 | Logos de clientes al 55 % en gris: en móvil 2 columnas × 9 filas de scroll | `client-mob-11-clientssection` | Baja |
| D17 | CSS muerto: `.stats-*`, `.upsell-*`, `.cta-banner`, `.btn-outline-white` definidos pero no renderizados | grep en `propuesta.html` | Baja (limpieza) |

### PDF A4 (`ca5e1a51`, 7 páginas)

| # | Hallazgo | Evidencia | Gravedad |
|---|---|---|---|
| P1 | El bloque 50/50 apaisado se imprime en A4 vertical: cada show ocupa su propia página y deja en blanco la parte inferior. Medido con script sobre el PDF: 20, 39, 39 y 28 % de blanco inferior en las páginas 3 a 6 | `pdf-p3`, `pdf-p6`, `pdfblank.swift` | Alta |
| P2 | La imagen se recorta al alto de la columna de texto: fotos muy ampliadas y pixeladas | `pdf-p3` (malabares) | Alta |
| P3 | Sin cabecera ni pie: ni cliente, ni fecha, ni número de página, ni validez de la pre-reserva | todas las páginas | Media |
| P4 | "Ver vídeo" se imprime como botón | págs. 2, 3, 6 | Baja |
| P5 | La última página comprime "sobre nosotros", logos (3 columnas con cajas visibles), condiciones y pie | `pdf-p7` | Media |
| P6 | Portada: foto oscura al 30 %, sin logo ni nombre del cliente | `pdf-p1` | Media |

### Editor (`?admin=1`)

| # | Hallazgo | Evidencia | Gravedad |
|---|---|---|---|
| E1 | La barra muestra `null` como último dato de los metadatos (empresa, tipo de evento y fecha) y el hero `null · Fiesta corporativa` | `admin-desk-00`, `updateAdminBar()` | Media |
| E2 | Estado = punto de color + "REVISION" en mayúsculas grises (sin tilde) | `admin-desk-05-adminbar` | Media |
| E3 | Los contornos de edición usan el acento de la categoría: las ayudas de edición parecen parte del diseño | `x-admin-hover-edit` | Media |
| E4 | En móvil la barra ocupa 2 filas y el toggle "EN" queda cortado | `admin-mob-00` | Media |
| E5 | Botón "×" de borrar bloque sin texto, gris, a la misma altura en todos los bloques | `admin-desk-08-block0` | Media |
| E6 | Picker: tarjetas ya añadidas al 40 % (se leen como rotas), etiquetas duplicadas y con erratas ("CIRCO · CIRCO, ACROBACIA, HUILA HOPPS") | `x-admin-picker` | Baja |
| E7 | Modal de aprobación con emoji ✅ y botón verde de bajo contraste | `x-admin-approvemodal` | Baja |

### Builder (`?mode=builder`)

| # | Hallazgo | Evidencia | Gravedad |
|---|---|---|---|
| B1 | Etiquetas en mayúsculas sin tildes ("TELEFONO", "UBICACION", "DESCRIPCION"); los placeholders parecen valores ya rellenados ("Carlos Martinez") | `builder-desk-00` | Baja |
| B2 | Selects nativos con otra altura y padding que los inputs | `builder-desk-00` | Baja |
| B3 | Dos colores de acción primaria: coral en "Generar Propuesta", verde en "Aprobar y enviar"; barra `#1a1a2e` fuera de la paleta | `x-builder-selected` | Baja |

### Contraste medido (fórmula WCAG 2.x)

| Par | Uso | Ratio | AA texto normal |
|---|---|---|---|
| `#333` / `#fff` | texto principal | 12,63 | Pasa |
| `#666` / `#fff` | texto secundario | 5,74 | Pasa |
| `#fff` / `#2ecc71` | botón "Aprobar" | 2,10 | Falla |
| `#fff` / `#E87461` | botón coral | 2,96 | Falla |
| `#E87461` / `#fff` | etiquetas 12 px | 2,96 | Falla |
| `#E8A461` / `#fff` | etiquetas tema circo | 2,12 | Falla |
| `#e5e5e5` / `#fff` | viñetas de condiciones | 1,26 | Decorativo |
| `#ccc` sobre foto al 30 % (peor píxel) | subtítulo del hero | 3,98 | Falla |

---

## 3. Marco: por qué la propuesta pierde categoría

**Hallazgo no obvio.** Ninguna agencia de espectáculos revisada tiene un lenguaje visual de lujo, tampoco Scarlett Entertainment, el referente de Xavi (Raleway + Lato, rojo `#c51230`). El código premium está en la hotelería de lujo: Aman, Belmond, Rosewood, Soho House. La propuesta EB ya usa buena parte de ese código (fotos a sangre, serif de display en grande, apertura y cierre en oscuro, logos de primer nivel). **Lo que la baja de categoría no es el diseño base sino las costuras**: formatos, datos vacíos, contraste, móvil y PDF.

Tres capas de problema:

| Capa | Qué es | Ejemplos | Dónde se arregla |
|---|---|---|---|
| Costuras | Detalles que delatan plantilla o fallo | `null`, `()`, `3950€` frente a `19.650€`, botones cortados en móvil | CSS + 3 retoques en funciones de render |
| Sistema | Falta de tokens comunes | 5 acentos por categoría, verde fuera de marca, 100vh, radios y espaciados sin escala | CSS |
| Formato | El medio no está maquetado para su soporte | PDF A4 vertical con bloques apaisados; hero de pantalla completa | CSS de `print-mode` y del hero |

## 4. Qué dice la evidencia (4 líneas de research)

Fiabilidad: **I** = independiente (NN/g, Baymard, W3C, documentación técnica) · **F** = datos de fabricante de software de propuestas (correlaciones sobre sus usuarios, posible sesgo) · **O** = observación directa de sitios (CSS descargado).

### 4.1 Formato y lectura

| Principio | Dato | Fuente | Fiab. | Para EB |
|---|---|---|---|---|
| La atención se concentra arriba | 57 % del tiempo en la primera pantalla, 74 % en las dos primeras | [NN/g, Scrolling and Attention, 2018](https://www.nngroup.com/articles/scrolling-and-attention/) | I | Datos del evento y del cliente legibles en la primera pantalla |
| Un hero a pantalla completa parece el final | 6 de 8 usuarios no vieron que podían bajar | [NN/g, Illusion of Completeness](https://www.nngroup.com/articles/illusion-of-completeness/) | I | Hero a 88 svh, que asome el concepto |
| Introducción y precio acaparan la lectura | 38,2 % intro y 27 % precio (2020); 67 % juntos (2022) | [Better Proposals 2020](https://betterproposals.io/reports/2020/), [2022](https://betterproposals.io/reports/2022/) | F | Máximo cuidado tipográfico en concepto y resumen |
| El móvil ya es mayoría | 58 % de aperturas en móvil (2022) | [Better Proposals 2022](https://betterproposals.io/reports/2022/) | F | El fallo D1 afecta a la mayoría de clientes |
| Las ganadoras son más cortas y visuales | 7 secciones y 11 páginas de media (13 en las perdidas); 83 % con imágenes. Cifras tomadas de las infografías del informe | [Proposify, State of Proposals 2026](https://www.proposify.com/state-of-proposals-2026) | F | Agrupar visualmente en ~7 capítulos; objetivo PDF ≤ 11 págs. |
| El PDF necesita su propia maqueta | Qwilr "Presentation": un bloque por página A4; descargas PDF 12 % (2022) | [Qwilr PDFs](https://help.qwilr.com/article/89-pdfs), [Better Proposals 2022](https://betterproposals.io/reports/2022/) | I/F | Layout de print en una columna |
| La prueba social va antes del precio | En su rediseño de ejemplo, "Why Us" y la prueba social van antes del precio (orden deducido de la estructura, no enunciado como regla) | [Proposify, 2025](https://www.proposify.com/blog/proposal-design-best-practices) | F | Logos + "sobre nosotros" antes del resumen |
| Personalizar la portada | Nombre y logo del cliente: +12 % de interacción | [Storydoc, 2026](https://www.storydoc.com/blog/proposal-statistics) | F | "Propuesta para [empresa]" en el hero |

### 4.2 Código premium frente a directorio

| Código | Evidencia observada | Fiab. | Para EB |
|---|---|---|---|
| Serif de display + sans discreta, pocas familias | Aman (Lyon Display + Whitney), Belmond (Sebenta + Gotham), Rosewood (Austin Light), Soho House (Cardo + HK Grotesk). Contraband pide 4 familias de Google Fonts solo en su home | O | Mantener DM Serif Display solo en grande + Inter |
| Neutros cálidos, texto carbón, poco color | Aman `#f3eee7` con texto `#313131` y sin acento dominante; Belmond `#f4f4f2` con textos `#666` y `#1a1a1a`; Soho House `#fffef7` con `#121212` | O | Papel `#FAF8F5`, tinta `#1D1B1A`, coral único |
| Un solo botón relleno por página | Aman: "Discover more" como enlace de texto y un único botón (observación de la línea de benchmark, no reverificada en QA) | O | Un primario: "Aprobar propuesta" |
| Precio como dato, no como oferta | Directorios: "From £2,238" (Alive Network), "Precio: De 500 € a 3500 €" (unaplauso) | O | Cifra sobria, tabular, sin cajas de color |
| Credibilidad curada | Scarlett: logos de primer nivel; Espectáculos Cortina: 56 logos | O | 12-18 logos máximo, altura óptica igualada |
| Línea editorial bajo el título | Sternberg Clarke ("Victorian acrobatics from this…"), Dragone, Monarque ("Privé · La Maison Chevalier · 2026"). No reverificado en QA | O | Línea con formato · duración · artistas |
| Antipatrones de directorio | Presumir de volumen, precio-mercancía, sobrecarga, tipografía sin sistema, medallas y urgencia | O | EB no los tiene: no introducirlos |

Fuentes: [Aman](https://www.aman.com/), [Belmond](https://www.belmond.com/), [Rosewood](https://www.rosewoodhotels.com/en/default), [Soho House](https://www.sohohouse.com/), [Scarlett Entertainment](https://www.scarlettentertainment.com/), [Sternberg Clarke](https://sternbergclarke.co.uk/), [Contraband](https://www.contrabandevents.com/), [Alive Network](https://www.alivenetwork.com/), [unaplauso](https://www.unaplauso.com/), [Espectáculos Cortina](https://www.espectaculoscortina.com/), [NN/g, luxury principles, 2022](https://www.nngroup.com/articles/luxury-principles-ecommerce-design/).

### 4.3 Legibilidad y accesibilidad

| Principio | Dato | Fuente | Fiab. | Para EB |
|---|---|---|---|---|
| Contraste mínimo AA | 4,5:1 texto normal, 3:1 texto ≥ 24 px | [WCAG 2.2, SC 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) | I | Verde 2,10 y coral 2,96 fallan |
| Texto sobre imagen: peor caso | Overlay al 50 % más eficaz que al 30 %; degradado inferior | [NN/g, Text over images](https://www.nngroup.com/articles/text-over-images/) | I | Foto a color con degradado inferior |
| Controles del carrusel que se vean | "Dots are a particularly poor cue on mobile devices, because people often do not notice them"; botones pequeños o sobre fondo recargado cuestan de ver (2013, revisado 2026) | [NN/g, Designing Effective Carousels](https://www.nngroup.com/articles/designing-effective-carousels/) | I | Flechas siempre visibles en táctil (hoy solo aparecen con hover) |
| Objetivos táctiles | 24 × 24 px mínimo (AA) | [WCAG 2.2, SC 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | I | Puntos del carrusel y "×" del editor |
| Pistas de clic débiles cuestan | +22 % de tiempo con botones planos o fantasma | [NN/g, Flat UI, 2017](https://www.nngroup.com/articles/flat-ui-less-attention-cause-uncertainty/) | I | El primario siempre relleno |
| Zigzag solo si la imagen informa | Menos eficiente con imágenes decorativas | [NN/g, Zigzag, 2017](https://www.nngroup.com/articles/zigzag-page-layout/) | I | Mantener zigzag (las fotos son el producto) |
| Serif de display solo en grande | DM Serif Display "has been shaped for use in super-sized poster settings", con DM Serif Text "for use in smaller point ranges" | [Google Fonts, descripción de DM Serif Display](https://raw.githubusercontent.com/google/fonts/main/ofl/dmserifdisplay/DESCRIPTION.en_us.html) | I | Precios pequeños en Inter tabular |
| Formato del euro y de miles | "En España lo habitual es que el símbolo de la moneda se posponga a la cifra, y en tal caso va separado con un espacio". Es "impropio emplear punto o coma" como separador de miles; con 4 cifras es "frecuente y válido omitir el espacio" y se mantiene desde 5 | [FundéuRAE, monedas (2017)](https://www.fundeu.es/recomendacion/monedas-claves-de-escritura/), [FundéuRAE, miles y millones](https://www.fundeu.es/recomendacion/miles-y-millones-claves-de-escritura/) | I | `3950 €` y `19 650 €` (espacio fino no separable) |
| Numerar páginas con CSS | `@page` margin boxes desde Chrome 131; el PDF de EB usa Chromium 131 con `preferCSSPageSize: true` | [Chrome, print margins](https://developer.chrome.com/blog/print-margins) | I | Pie "Página X de Y" sin tocar la API |
| Hero y viewport móvil | `svh` evita saltos con la barra del navegador | [web.dev, viewport units](https://web.dev/blog/viewport-units) | I | `min-height: 88svh` |

### 4.4 Editor

| Patrón | Referencia | Para EB |
|---|---|---|
| Color de edición exclusivo, ausente del documento | [Webflow](https://help.webflow.com/hc/en-us/articles/33961319255059-Webflow-canvas-overview) resalta en azul los elementos al pasar el ratón (su ayuda devolvió 403; cita tomada de fragmento de búsqueda) | `--ui-edit: #3B5BDB` en contornos y controles |
| Estado como etiqueta con texto, forma y tono | [Polaris Badge](https://shopify.dev/docs/api/app-home/polaris-web-components/feedback-and-status-indicators/badge), [Primer StateLabel](https://primer.style/product/components/state-label/), [GOV.UK Tag](https://design-system.service.gov.uk/components/tag/) | Pastilla tintada en lugar de punto + mayúsculas |
| Acciones destructivas separadas y etiquetadas | [NN/g, consequential options](https://www.nngroup.com/articles/proximity-consequential-options/) | "Quitar" visible; rojo solo en hover |
| Notificaciones breves que no tapen la barra | [Primer, accessible notifications](https://primer.style/accessibility/patterns/accessible-notifications-and-messages/) | Toast abajo al centro, fondo navy, icono semántico |
| Etiquetas de formulario en tipo oración | [Atlassian, language](https://atlassian.design/foundations/content/language-and-grammar), [Baymard](https://baymard.com/blog/mobile-form-usability-label-position) | Builder sin mayúsculas y con tildes |

## 5. Dirección visual propuesta (sin rediseño)

### Tokens de la propuesta

| Token | Valor | Uso | Contraste |
|---|---|---|---|
| `--paper` | `#FAF8F5` | Secciones claras | fondo |
| `--ink` | `#1D1B1A` | Títulos y texto principal | 16,19 sobre papel |
| `--ink-2` | `#5E5853` | Texto secundario | 6,61 sobre papel |
| `--rule` | `#E6E1DB` | Filetes | decorativo |
| `--coral` | `#EC5853` | Acento de marca (el de eventosbarcelona.com): rellenos, total, sobre oscuro | 5,32 con `#161413` encima |
| `--coral-text` | `#B63F35` | Etiquetas y texto pequeño en coral | 5,28 sobre papel |
| `--night` | `#161413` | Hero, cierre y barra | fondo |
| `--on-night` | `#D9D3CC` / `#A8A099` | Texto sobre oscuro | 12,36 / 7,13 |
| `--ok` | `#1A7340` | Solo estado "aprobada" | 5,88 con blanco |
| `--ui-edit` | `#3B5BDB` | Solo modo editor | 5,67 sobre blanco |

### Tipografía
- **DM Serif Display** solo ≥ 28 px: h1 del hero, nombre del show, total. `font-synthesis-weight: none`.
- **Inter** 400 a 17 px / 1,65 para el cuerpo, `max-inline-size: 62ch`. 500 para énfasis. Petición de fuentes `Inter:wght@400..600`.
- Etiquetas: Inter 500, 12 px, mayúsculas, `letter-spacing: .12em`, `--coral-text`.
- Precios de bloque y resumen: Inter 500 con `font-variant-numeric: tabular-nums`.

### Maqueta
- Hero `min-height: 88svh`, foto a opacidad 1 con degradado inferior hasta `rgba(22,20,19,.85)`, h1 `max-inline-size: 18ch` y `text-wrap: balance`.
- Bloques 50/50 con zigzag por `grid-column`, sin `direction: rtl`; imagen con `aspect-ratio` en lugar de `min-height`.
- Un único botón relleno (coral con texto `#161413`); el resto, secundarios de contorno o enlaces.
- Print: bloque de show en una columna (imagen 16:9 arriba, texto debajo), `@page { margin: 14mm 14mm 16mm }`, `@page :first { margin: 0 }`, pie con `counter(page)` / `counter(pages)`.

## 6. Backlog priorizado

Tipo: **CSS** = solo la hoja de estilos de `propuesta.html` · **Plantilla** = texto o marcado dentro de funciones de render JS, sin cambiar lógica (requiere OK explícito) · **Contenido** = datos o fotos en el admin · **Decisión** = validar con Xavi.

### Ola 1 · Costuras visibles (CSS, 1-2 días)

| ID | Área | Tipo | Impacto | Esfuerzo | Cambio | Dónde | Evidencia |
|---|---|---|---|---|---|---|---|
| V01 | Cliente | CSS | Alto | S | Hero móvil: ocultar "Descargar PDF" en el nav por debajo de 600 px (sigue en el cierre) y botón de aprobar compacto | `.nav`, `.nav-right`, `.btn-pdf-client`, `.btn-approve-client` | D1 |
| V02 | Cliente/Editor | CSS | Alto | S | Acción principal con contraste AA: coral `#EC5853` con texto `#161413` (5,32); verde oscuro `#1A7340` solo para "aprobada" | `.btn-approve-client`, `.btn-approve`, `.btn-confirm`, `.toast.success` | D8, D9 |
| V03 | Cliente | CSS | Alto | S | Etiquetas en `#B63F35` y `letter-spacing: .12em` | `.section-label` | D8 |
| V04 | Cliente | CSS + Decisión | Medio | S | Acento único de marca: neutralizar `body.theme-*` | `body.theme-*` | D10, D11 |
| V05 | Cliente | CSS | Alto | S | Hero a 88 svh, foto a color con degradado inferior, texto `#D9D3CC`, h1 18ch con balance | `.hero`, `.hero-bg-image`, `.hero h1`, `.hero-sub`, `.hero-detail` | D2, D4 |
| V06 | PDF | CSS | Alto | M | Bloque de show en una columna en print: imagen 16:9 arriba, texto debajo, sin `min-height` | `body.print-mode .block*` | P1, P2 |
| V07 | PDF | CSS | Medio | M | Márgenes y "Página X de Y" con `@page` margin boxes; portada sin márgenes | `@page`, `@page :first` | P3 |
| V08 | PDF | CSS | Bajo | S | "Ver vídeo" impreso como enlace de texto con URL | `body.print-mode .btn-dark` | P4 |
| V09 | Editor | CSS | Medio | S | Color exclusivo de edición `#3B5BDB` en hover/foco, input de precio y "Agregar show" | `.editable-text`, `.price-input`, `.add-show-block` | E3 |
| V10 | Editor | CSS | Medio | S | Barra admin en móvil en una fila con acciones desplazables; toggle sin cortes | `.admin-bar` @media | E4 |
| V11 | Cliente | CSS | Bajo | S | Carrusel: flechas visibles en táctil (`hover: none`), 44 px; puntos con área de 24 px | `.carousel-arrow`, `.carousel-dot` | D13 |
| V12 | Global | CSS | Bajo | S | `:focus-visible` de 3 px y `prefers-reduced-motion` | global | WCAG 2.4.7, 2.3.3 |

### Ola 2 · Sistema (CSS, 2-3 días)

| ID | Área | Tipo | Impacto | Esfuerzo | Cambio | Dónde | Evidencia |
|---|---|---|---|---|---|---|---|
| V13 | Cliente | CSS | Medio | S | Paleta cálida: papel `#FAF8F5`, tinta `#1D1B1A`, secundario `#5E5853`, noche `#161413` | `:root` | 4.2 |
| V14 | Cliente | CSS | Medio | M | Cuerpo Inter 400 17 px / 1,65 a 62ch; carga `Inter:wght@400..600` | `.block-content p`, `.concept-section p`, `<link>` | 4.3 |
| V15 | Cliente | CSS | Medio | S | Precio de bloque en Inter tabular, nota en línea propia; "Ver vídeo" como enlace secundario | `.block-footer`, `.block-price`, `.btn-dark` | D5, D14 |
| V16 | Cliente | CSS | Medio | S | Filas de suplemento con filete, prefijo "+" e importes tabulares | `.block-extras-row` | D7 |
| V17 | Cliente | CSS | Medio | S | Resumen: total DM Serif 44 px con filete de 2 px, cifras tabulares, nota IVA a 14 px en `--ink-2` | `.summary-*` | 4.1 |
| V18 | Cliente | CSS | Bajo | S | Condiciones: viñetas visibles, 15 px, 2 columnas desde 900 px | `.conditions-section` | D15 |
| V19 | Cliente | CSS | Bajo | S | Logos: gris al 80 %, 3 columnas en móvil, caja de altura uniforme, sin hover de color | `.clients-grid` | D16 |
| V20 | Cliente | CSS | Bajo | S | Zigzag por `grid-column` en vez de `direction: rtl` | `.block--reversed` | 4.3 |
| V21 | Editor | CSS | Medio | S | Estado como pastilla tintada; toast abajo al centro; icono en vez de emoji | `.status-dot`, `#adminStatus`, `.toast`, `.modal-content .check` | E2, E7 |
| V22 | Editor | CSS | Medio | S | "Quitar" con texto visible, rojo solo en hover, siempre visible en táctil; "×" de filas de 28 px | `.block-remove`, `.ex-remove`, `.cond-remove` | E5 |
| V23 | Editor | CSS | Bajo | S | Picker: insignia "Añadido" en vez de 40 %; categoría a 12 px; cabecera fija | `.picker-card.already-added`, `.picker-search` | E6 |
| V24 | Builder | CSS | Bajo | S | Etiquetas en tipo oración a 13 px, selects a la altura de los inputs | `.form-group label`, `select` | B1, B2 |
| V25 | Global | CSS | Bajo | S | Escala de espaciado 8 pt, radios y sombras en `:root`; borrar CSS muerto | `:root`, `.stats-*`, `.upsell-*`, `.cta-banner` | D17 |

### Ola 3 · Fuera del "solo CSS" (requiere OK)

| ID | Área | Tipo | Impacto | Esfuerzo | Cambio | Dónde | Evidencia |
|---|---|---|---|---|---|---|---|
| V26 | Cliente | Plantilla + Decisión | Alto | S | Formato único de precio según FundéuRAE: `3950 €`, `19 650 €` (espacio fino no separable, sin punto) y espacio antes del `€`; `€3,950` en EN. Si Xavi prefiere la convención comercial `3.950 €`, aplicarla en todas las cifras por igual | `formatPrice()` y plantillas que añaden `&euro;` | D5 |
| V27 | Cliente | Plantilla | Alto | S | Resumen sin paréntesis: nota de precio en segunda línea | `renderProposal()` · `summaryHTML` | D6 |
| V28 | Cliente/Editor | Plantilla | Alto | S | Fecha legible y campos vacíos ocultos (sin `null`) en hero y barra | `renderProposal()` · `.hero-detail`, `updateAdminBar()` | D3, E1 |
| V29 | Cliente | Plantilla | Medio | S | "Propuesta para [empresa]" en el hero con el dato existente | `renderProposal()` | 4.1 |
| V30 | Cliente | Plantilla | Medio | S | Orden: "sobre nosotros" + logos antes del resumen | `renderProposal()` | 4.1 |
| V31 | Global | Plantilla | Bajo | S | Textos: "Vuestra inversión", "En revisión", tildes del builder | `I18N`, `updateAdminBar()`, HTML del builder | E2, B1 |
| V32 | Imágenes | Contenido | Alto | M | Retirar fotos con logos de terceros; foto principal ≥ 1.600 px; la mejor foto primero | Admin de shows | D12 |
| V33 | Cliente | Decisión | Medio | S | IVA: nota visible junto al total o desglose base / IVA / total | Resumen | 4.3 |

## 7. Decisiones para Xavi

1. **Color de "Aprobar".** Recomendación: coral de marca con texto oscuro; el verde queda para el estado "aprobada". Alternativa: verde oscuro `#1A7340` si quiere mantener el verde como "sí".
2. **Acento por categoría.** Recomendación: un solo coral de marca. Los temas de color casi no se usan (8 de 195 propuestas) y fragmentan la marca.
3. **Tipografía.** Recomendación: mantener DM Serif Display + Inter (registro editorial, coincide con el código premium) y alinear solo el color con la web. Alternativa: Space Grotesk, como eventosbarcelona.com, a costa del registro editorial.
4. **IVA.** Nota "IVA no incluido" visible junto al total (B2B) o desglose completo.
5. **Orden.** Prueba social (logos + experiencia) antes del precio.

## 8. Fuera de alcance (funcionalidad nueva, para más adelante)

- Índice lateral con sección activa o barra de progreso.
- Extras opcionales seleccionables por el cliente.
- Firma previa de EB con foto de Xavi junto al bloque de aprobación.
- Vídeo integrado con fachada (póster + reproducción en la página).
- Testimonio junto al total; bloque "Lo que nos habéis pedido".
- Barra fija inferior con total y "Aprobar" en móvil.

## 9. Verificación independiente

Un verificador en contexto separado contrastó 11 afirmaciones de carga con el texto de las fuentes (2026-09-14): 6 verificadas tal cual (NN/g scroll, Better Proposals 2020 y 2022, Qwilr, WCAG 2.5.8, Baymard), 4 con matices (Proposify: cifras de infografías; Storydoc: el +12 % es de interacción, no de cierre; GOV.UK: "some research… harder to read"; NN/g carruseles: puntos que no se ven, no controles "ocultos") y 1 contradicha (formato `3.950 €`, corregido en D5, 4.3 y V26). WCAG 2.4.13 Focus Appearance es AAA: no se usa como requisito.

## 10. Limitaciones

- Datos de conversión de Proposify, Better Proposals, Storydoc y PandaDoc: fabricantes, correlacionales, cambian mucho entre años. Se usan como orientación.
- Comportamiento móvil de los sitios del benchmark no observado (sin render).
- Muestra de capturas: 2 propuestas. Las métricas de datos cubren las 195.
- La web de la RAE devolvió 403; la norma del euro se tomó de Fundéu.

Capturas y scripts de auditoría: scratchpad de la sesión (no versionados, contienen datos de clientes).
