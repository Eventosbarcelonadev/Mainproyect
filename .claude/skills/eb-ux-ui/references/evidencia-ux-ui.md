# Evidencia UX/UI para las superficies de EB

Principios con fuente, verificados en septiembre de 2026. **I** = independiente (NN/g, Baymard, W3C, documentación técnica). **F** = fabricante de software de propuestas (correlaciones sobre sus usuarios: orientan, no prueban). **O** = observado en el CSS/HTML de los sitios.

## Lectura y formato

| Principio | Dato | Fuente | Tipo |
|---|---|---|---|
| La atención se queda arriba | 57 % del tiempo en la primera pantalla, 74 % en las dos primeras | [NN/g, Scrolling and Attention (2018)](https://www.nngroup.com/articles/scrolling-and-attention/) | I |
| Un hero a pantalla completa parece el final | "Six out of eight users did not realize they could scroll down" | [NN/g, Illusion of Completeness (2016)](https://www.nngroup.com/articles/illusion-of-completeness/) | I |
| Introducción y precio acaparan la lectura | 38,2 % intro y 27 % precio (2020); 67 % juntos (2022) | [Better Proposals 2020](https://betterproposals.io/reports/2020/), [2022](https://betterproposals.io/reports/2022/) | F |
| El móvil es mayoría en aperturas | 58 % de propuestas abiertas en móvil (2022) | [Better Proposals 2022](https://betterproposals.io/reports/2022/) | F |
| Las ganadoras son más cortas y visuales | 7 secciones, 11 páginas (13 las perdidas), 83 % con imágenes (infografías) | [Proposify, State of Proposals 2026](https://www.proposify.com/state-of-proposals-2026) | F |
| PDF con maqueta propia | Modo "Presentation": un bloque por página | [Qwilr, PDFs](https://help.qwilr.com/article/89-pdfs) | I |
| Personalizar la portada | Nombre y logo del cliente: +12 % de interacción (no de cierre) | [Storydoc (2026)](https://www.storydoc.com/blog/proposal-statistics) | F |
| Zigzag solo con imágenes informativas | "Informational imagery works well in aligned and zigzag layouts" | [NN/g, Zigzag (2017)](https://www.nngroup.com/articles/zigzag-page-layout/) | I |

## Código premium frente a directorio

| Código | Observado | Tipo |
|---|---|---|
| Serif de display + sans discreta, pocas familias | Aman (Lyon Display + Whitney), Belmond (Sebenta + Gotham), Rosewood (Austin Light), Soho House (Cardo + HK Grotesk). Contraband pide 4 familias de Google Fonts en su home | O |
| Neutros cálidos y poco color | Aman `#f3eee7` con `#313131`; Belmond `#f4f4f2` con `#666`/`#1a1a1a`; Soho House `#fffef7` con `#121212` | O |
| Precio como dato, no oferta | Directorios: "From £2,238" (Alive Network), "Precio: De 500 € a 3500 €" (unaplauso) | O |
| Credibilidad curada | Scarlett: logos de primer nivel. Espectáculos Cortina: 56 logos | O |
| Hueco de mercado | Ninguna agencia de espectáculos revisada (tampoco Scarlett: Raleway + Lato, rojo `#c51230`) tiene lenguaje visual de lujo | O |

## Legibilidad y accesibilidad

| Principio | Dato | Fuente | Tipo |
|---|---|---|---|
| Contraste mínimo | 4,5:1 texto normal; 3:1 texto ≥ 24 px | [WCAG 2.2, 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) | I |
| Objetivos táctiles | 24 × 24 CSS px mínimo (AA) | [WCAG 2.2, 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | I |
| Texto sobre foto | Garantizar el peor caso; degradado en la zona del texto | [NN/g, Text over images](https://www.nngroup.com/articles/text-over-images/) | I |
| Carruseles | "Dots are a particularly poor cue on mobile devices" | [NN/g, Carousels (2013, rev. 2026)](https://www.nngroup.com/articles/designing-effective-carousels/) | I |
| Pistas de clic débiles | 71 participantes: +22 % de tiempo y +25 % de fijaciones | [NN/g, Flat UI (2017)](https://www.nngroup.com/articles/flat-ui-less-attention-cause-uncertainty/) | I |
| Serif de display en grande | DM Serif Display "shaped for use in super-sized poster settings" | [Google Fonts, DM Serif Display](https://raw.githubusercontent.com/google/fonts/main/ofl/dmserifdisplay/DESCRIPTION.en_us.html) | I |
| Cifras en español | € detrás con espacio; "impropio emplear punto o coma" para miles; 4 cifras sin separar | [FundéuRAE monedas](https://www.fundeu.es/recomendacion/monedas-claves-de-escritura/), [miles y millones](https://www.fundeu.es/recomendacion/miles-y-millones-claves-de-escritura/) | I |
| Numerar páginas con CSS | `@page` margin boxes desde Chrome 131 | [Chrome, print margins (2024)](https://developer.chrome.com/blog/print-margins) | I |
| Viewport móvil | `svh` evita saltos con la barra del navegador (Chrome 108, Firefox 101, Safari 15.4) | [web.dev, viewport units](https://web.dev/blog/viewport-units) | I |
| WCAG 2.4.13 Focus Appearance | Es nivel AAA: no presentarlo como requisito AA | [W3C](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html) | I |

## Editor y admin

| Patrón | Referencia |
|---|---|
| Estado con texto, forma y tono, no solo un punto de color | [Primer StateLabel](https://primer.style/product/components/state-label/), [GOV.UK Tag](https://design-system.service.gov.uk/components/tag/) ("uppercase text can be harder to read") |
| Acciones destructivas lejos de las benignas y diferenciadas | [NN/g, Consequential options (2021)](https://www.nngroup.com/articles/proximity-consequential-options/) |
| Color de edición que no existe en el documento | Webflow resalta en azul al pasar el ratón (ayuda con 403, cita de fragmento de búsqueda) |
| Etiquetas de formulario encima y en tipo oración | [Baymard (2013)](https://baymard.com/blog/mobile-form-usability-label-position), [Atlassian](https://atlassian.design/foundations/content/language-and-grammar) |

## Admin y back-office

| Principio | Dato | Fuente | Para EB |
|---|---|---|---|
| Galería para reconocer, lista para buscar y revisar | "Cards are better suited when users browse for information than when they search"; "Card layouts are less scannable than lists" | [NN/g, Cards (2016)](https://www.nngroup.com/articles/cards-component/) | Shows en galería compacta; en Artistas/Proveedores/Propuestas priorizar densidad. Conmutador galería/lista = funcionalidad nueva |
| Aprovechar pantallas grandes | Solo el 18 % de 50 grandes e-commerce optimizaba para monitores grandes ("vast seas of white", 2015) | [Baymard, responsive upscaling](https://baymard.com/blog/responsive-upscaling) | `main` a 1760 px: 5 columnas a 2000 px |
| Densidad por pasos | Alturas de fila 24/32/40/48/64 px; texto de tabla 14 px | [Carbon, data table style](https://github.com/carbon-design-system/carbon-website/blob/main/src/pages/components/data-table/style.mdx) | Filas y botones de tabla compactos |
| Botón principal una vez por pantalla | "Primary buttons should only appear once per screen"; ghost para acciones menores | [Carbon, buttons](https://github.com/carbon-design-system/carbon-website/blob/main/src/pages/components/button/usage.mdx) | "Ver detalle" en contorno; Video/Fotos ligeros |
| Pestañas: navegación y filtros con formas distintas | "at least two selection indicators"; no mezclar pestañas de navegación con filtros | [NN/g, Tabs (2024)](https://www.nngroup.com/articles/tabs-used-right/) | Navegación con subrayado; pastillas solo en filtros |
| Pocos filtros promocionados y sin redundancia | "Include no more than 2 or 3 promoted filters" | [Polaris IndexFilters](https://raw.githubusercontent.com/Shopify/polaris/main/polaris.shopify.com/content/components/selection-and-input/index-filters.mdx) | Estado separado de datos que faltan |
| Estado con etiqueta, no solo color | "Don't use color alone to signify an important state. Instead, use an accurate label." | [Atlassian Lozenge](https://developer.atlassian.com/platform/forge/ui-kit/components/lozenge/) | Completo/Incompleto, En revisión/Aprobada |
| Menos ruido sin perder capacidad | Reducir "the appearance of clutter... without reducing the capability" | [NN/g, Complex applications (2020)](https://www.nngroup.com/articles/complex-application-design/) | "×" de chips al pasar el ratón, visible en táctil |
| No depender del hover | "Don't rely on hover... fails to translate well on touch devices" | [NN/g, Icon usability (2014)](https://www.nngroup.com/articles/icon-usability/) | `@media (hover: none)` siempre visible |
| Cifras alineadas | `tabular-nums` para contadores que cambian | [MDN font-variant-numeric](https://developer.mozilla.org/en-US/docs/Web/CSS/font-variant-numeric) | Contadores y badges |
| Un solo idioma y verbo + sustantivo | Heurística 4 de consistencia; etiquetas "{verb}+{noun}" | [NN/g heurísticas](https://www.nngroup.com/articles/ten-usability-heuristics/), [Polaris](https://raw.githubusercontent.com/Shopify/polaris/main/polaris.shopify.com/content/patterns/resource-index-layout/variants/default.mdx) | "Activos", "Pendientes de revisión", "Pasar a revisión" |
| Estados vacíos como éxito | "never make merchants feel unsuccessful or guilty" | [Polaris EmptyState](https://raw.githubusercontent.com/Shopify/polaris/main/polaris.shopify.com/content/components/layout-and-structure/empty-state.mdx) | "Sin imagen" a 0 es buena noticia |

## Cifras propias de EB (medidas 2026-09-14)

| Medida | Antes | Después (rama `visual/rider-ola-1`) |
|---|---|---|
| Botón "Aprobar" en móvil 390 px | termina en 453 px (fuera) | 370 px (dentro) |
| Barra del editor en móvil | 133 px de alto | 53 px |
| PDF propuesta 5 shows | 7 páginas, hasta 39 % en blanco | 5 páginas |
| PDF propuesta 6 shows | 9 páginas, hasta 51 % en blanco | 6 páginas |
| Admin Shows, tarjetas por pantalla (2000 px) | 3 columnas, 6,7 | 5 columnas, 12 |
| Admin Shows, tarjetas por pantalla (1600 px) | 3 columnas, 6,2 | 5 columnas, 11,5 |
| Admin Proveedores, tarjetas por pantalla | 8 | 15,9 |
| Admin Propuestas en móvil | página de 1.327 px de ancho | 390 px, tabla con scroll propio |
| Contraste botón "Aprobar" | 2,10:1 | 5,32:1 |
