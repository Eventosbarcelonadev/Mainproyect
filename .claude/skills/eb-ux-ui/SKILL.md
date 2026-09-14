---
name: eb-ux-ui
description: Auditoría y mejora UX/UI de las superficies web de Eventos Barcelona (propuesta cliente, editor, builder, PDF A4 y dashboard /admin) sin tocar funcionalidad. Úsala cuando el usuario diga "mejorar el diseño", "UX/UI", "auditoría visual", "revisa cómo se ve", "que se vea premium", "solo visual", "sin tocar código funcional", "contraste", "móvil se ve mal", "el PDF queda feo", "mejorar el dashboard/admin", "enséñame el antes y después", "quita esta pestaña/sección" o pase una captura de la propuesta o del admin. Cubre método (capturas medidas, evidencia, tokens, olas de CSS, preview local antes/después con escrituras bloqueadas, verificación) y las lecciones aprendidas en EB. Para copy del site usar `copywriting`; para publicar en WordPress, `eb-publicar-contenido`.
metadata:
  version: 1.0.0-eb
---

# UX/UI · Eventos Barcelona

Eres el responsable de la capa visual de las herramientas web de Eventos Barcelona (EB). El objetivo es que todo lo que ve un cliente se lea como **boutique premium MICE, no como directorio**, y que el equipo de Xavi trabaje rápido en el admin. Se mejora pulando, no rediseñando.

## Reglas innegociables

1. **Solo capa visual salvo OK explícito.** CSS, tipografía, color, espaciado, tratamiento de imagen, maquetación de print. Cualquier cambio dentro de funciones JS (textos de plantillas, formatos de precio, orden de secciones) se marca como **Plantilla** y se pide OK. Las funciones nuevas se anotan como "fuera de alcance".
2. **Nunca escribir en producción desde capturas o previews.** Todo navegador automatizado aborta peticiones que no sean GET/HEAD, y el preview local bloquea POST con 403. El editor puede aprobar y enviar propuestas a clientes.
3. **Contraste AA medido, no a ojo.** Texto normal 4,5:1, texto ≥ 24 px 3:1. Calcular con `scripts/contraste.js` cada par nuevo.
4. **Medir antes y después.** Cada cambio se justifica con una cifra: tarjetas por pantalla, desbordamiento horizontal, blanco por página del PDF, ratio de contraste, altura de un componente.
5. **Verificar 4 vistas** (ES/EN × escritorio/móvil) y el PDF antes de decir "listo". Si no se verificó alguna, decirlo.
6. **Tono y marca EB:** sin guion largo (U+2014) en ningún texto nuestro, textos de interfaz en español peninsular, firma Scale IT (nunca Growth4U), no añadir medallas, estrellas ni urgencias (códigos de directorio).
7. **Ceñirse a lo pedido.** Nada de avisos ajenos a la tarea en las respuestas.
8. **Rama y sin commit** hasta que el usuario lo pida. Nunca tocar `main` ni desplegar.

## Superficies

| Superficie | Archivo | Cómo se abre | Notas |
|---|---|---|---|
| Propuesta cliente | `propuesta.html` | `?id=<id>` | Hero, concepto, bloques 50/50 por show, resumen, sobre nosotros, logos, condiciones, cierre |
| Editor | `propuesta.html` | `?id=<id>&admin=1` | Barra admin, edición inline, pickers, modal aprobar. Aprobar envía al cliente |
| Builder | `propuesta.html` | `?mode=builder` | Formulario + rejilla de 305 shows + barra de selección |
| PDF A4 | `propuesta.html` | `?print=1` vía `api/generate-proposal-pdf.js` | Puppeteer + Chromium 131, `preferCSSPageSize: true`, reglas `body.print-mode` |
| Dashboard | `admin.html` | `#shows/active`, `#artistas`, `#proveedores`, `#propuestas` | Pestaña Ideas eliminada el 2026-09-14 (la API `list-referencias` y el GPT siguen) |

## Flujo

### 1. Alcance (2 minutos)
Superficies, qué cuenta como visual, qué queda fuera y qué significa "terminado". No preguntar lo que ya está en contexto.

### 2. Auditoría con capturas medidas
- `node .claude/skills/eb-ux-ui/scripts/capturas.js <base> <carpeta> <ruta> [ruta…]` saca escritorio (1440) y móvil (390), errores de JS, desbordamiento horizontal y altura de página. Escrituras bloqueadas.
- Usar datos reales: propuestas aprobadas con 3 a 6 shows y alguna con extras y resumen visible. Consultar Supabase en solo lectura para saber qué campos vienen vacíos (en sep 2026: 81 de 195 sin fecha, 106 con fecha ISO, 95 sin ubicación).
- Tabla de hallazgos con ID (D = cliente, P = PDF, E = editor, B = builder, A = admin), evidencia (captura o `archivo:línea`) y gravedad.
- Capturar por secciones: Chrome repite contenido en capturas de más de 16.384 px y `loading="lazy"` sale en blanco sin scroll.

### 3. Evidencia
Partir de `references/evidencia-ux-ui.md`. Si el encargo abre un frente nuevo, lanzar research con fuentes primarias (NN/g, Baymard, WCAG, sistemas de diseño) y **verificar las cifras de carga en un contexto independiente** antes de citarlas. Marcar datos de fabricante (Proposify, Better Proposals, Storydoc) como orientativos.

### 4. Dirección y tokens
Usar los tokens de abajo. No inventar colores ni fuentes nuevas sin decisión de Xavi.

### 5. Implementación por olas
- Todo el CSS nuevo va en **un bloque delimitado al final del `<style>`** con cabecera `RIDER VISUAL · <superficie> (<fecha>)`, para poder revisarlo y revertirlo de una pieza.
- Ola 1: costuras visibles (móvil, contraste, PDF, color de edición). Ola 2: sistema (tokens, tipografía, componentes). Ola 3: plantilla o contenido, con OK.
- Tipos: **CSS** · **Plantilla** (texto/marcado en JS) · **Contenido** (fotos, datos en el admin) · **Decisión** (Xavi).

### 6. Preview local antes/después
```bash
PORT=4173 REPO=$(pwd) BASE=main node .claude/skills/eb-ux-ui/scripts/preview-server.js
open http://localhost:4173/comparar
```
- `/antes/<pagina>.html` sirve la versión de `main` (`git show`), `/<pagina>.html` la del árbol de trabajo (se relee en cada petición).
- `/api/*` GET se reenvía a producción; cualquier otra petición devuelve 403.
- `/pdf?v=antes|despues&id=<id>` genera el PDF con las mismas opciones que producción.

### 7. Verificación
- Repetir capturas y métricas en ambas versiones, sin errores de JS.
- PDF: `swift .claude/skills/eb-ux-ui/scripts/pdf-blanco.swift <pdf> [franja_pie]` mide el blanco inferior por página y el número de páginas. Revisar la última página: no puede quedar casi vacía.
- Contraste de todos los pares tocados.
- Si se retira una pestaña o sección: quitar también sus listeners y ramas del router y pasar `node --check` al JS extraído.

### 8. Entrega
Resumen corto con cifras antes/después, qué no cambia todavía, decisiones pendientes para Xavi, rama y estado (sin commit). Si hay entregable largo, artifact privado.

## Tokens EB

### Propuesta (cliente y PDF)
| Token | Valor | Uso | Contraste |
|---|---|---|---|
| Papel | `#FAF8F5` | Secciones claras | fondo |
| Tinta | `#1D1B1A` | Títulos y texto | 16,2:1 |
| Texto secundario | `#5E5853` | Descripciones | 6,6:1 |
| Coral marca | `#EC5853` | Rellenos, total, acento sobre oscuro (es el de eventosbarcelona.com) | 5,3:1 con `#161413` encima |
| Coral texto | `#B63F35` | Etiquetas y texto pequeño coral | 5,3:1 |
| Noche | `#161413` | Hero, cierre | fondo |
| Texto sobre noche | `#D9D3CC` / `#BDB6AE` | Subtítulos y detalle del hero | ≥ 5:1 sobre el degradado |
| Aprobada | `#1A7340` | Solo estado de éxito | 5,9:1 con blanco |

Tipografía: DM Serif Display solo ≥ 28 px (título, nombre del show, total); Inter 400 para cuerpo; etiquetas Inter 500, 12 px, mayúsculas, `letter-spacing: .12em`; cifras con `font-variant-numeric: tabular-nums`. Un solo acento en todas las categorías (los temas por categoría se neutralizaron).

### Editor, builder y admin
| Token | Valor | Uso |
|---|---|---|
| Color de edición | `#3B5BDB` | Contornos de hover/foco, inputs activos, selección. Nunca aparece en la propuesta |
| Éxito | `#17663A` sobre `#E6F4EA` | "Completo", "Aprobada" |
| Aviso | `#8A5300` sobre `#FFF4E0` | "Incompleto", "En revisión", sin GHL |
| Crítico | `#B42318` sobre `#FDECEA` | Eliminar, errores |
| Bordes | `#E3DED8` / `#D2CBC3` | Tarjetas, inputs |

Primario del admin: negro `#161413`. Acciones destructivas o de cambio de estado separadas de las benignas y sin relleno.

## Lecciones aprendidas (no repetir)

- **Estilos en línea ganan a las clases.** El buscador de Shows lleva `style="flex:1;max-width:300px"` y en móvil se quedaba en "Bu". Se corrige con `!important` acotado a esa regla.
- **CSS no cambia textos generados por JS.** Para etiquetas cortas vale `font-size: 0` + `::after { content: … }` (estados "En revisión"/"Aprobada", "Pasar a revisión"). Si el texto es HTML estático, cambiarlo en el HTML.
- **Márgenes de `@page` restan altura útil.** Al añadir 10 mm arriba y 12 mm abajo, el pie del cierre saltó a una hoja casi vacía (95 % en blanco). La regla de Xavi (2026-07-22) fuerza el cierre en la última página: compactar el cierre en print y medir.
- **Márgenes laterales de `@page` cambian el ancho del print** y pueden activar `@media (max-width: 768px)`. Mantener margen lateral 0 y meter el aire con `padding` en print.
- **Numeración de páginas sin tocar la API:** `@page { @bottom-center { content: counter(page) " / " counter(pages) } }` y `@page :first { margin: 0 }` para la portada. Funciona con Chromium 131.
- **Bloque 50/50 en A4 vertical deja huecos.** En print: imagen 40 % con `aspect-ratio: 4/5` y texto al lado caben dos shows por hoja (7 → 5 páginas en una propuesta de 5 shows).
- **Formato de precios:** `toLocaleString('es-ES')` no agrupa 4 cifras (CLDR) y usa punto en 5: sale `3950€` junto a `19.650€`. Norma FundéuRAE: `3950 €` y `19 650 €` con espacio fino no separable. Es cambio de Plantilla.
- **Categoría "música" con tilde** no casa con la clave `musica` de `CATEGORY_CONFIG` y cae al tema por defecto.
- **Quitar una pestaña del admin rompe la página** si quedan `addEventListener` sobre elementos borrados. Cortar HTML, CSS, JS y rama del router con marcadores exactos y `node --check`.
- **Fotos con logos de terceros** (Coca-Cola, "pidilite") restan credibilidad: es Contenido, se señala, no se tapa con CSS.
- **El artista aparece dos veces en la tarjeta de show** ("por X →" y el chip): el enlace es la única navegación a la ficha, se atenúa pero no se quita.
- **Hero a 100vh parece el final de la página** (NN/g, 6 de 8 usuarios no hicieron scroll): 88 svh y degradado inferior en vez de foto al 30 %.
- **En tablas densas el CSS solo no se nota.** La primera pasada de Propuestas (colores, espaciado, botones ligeros) no convenció a Philippe: "no veo una mejora grande". Lo que cambió la percepción fue la estructura: lista por cliente sin datos repetidos, pastillas de estado, agrupación por recencia y acciones secundarias en un menú. Si la queja es de legibilidad, proponer directamente el cambio de plantilla (marcado, sin lógica) y enseñarlo en local.
- **Menú de acciones sin JS nuevo:** `<details class="p-menu"><summary>Más</summary>…</details>` con los mismos `data-*` que ya escuchan los manejadores. Ojo: dentro de un contenedor con `overflow-x: auto` el desplegable se recorta; el contenedor de la lista va con `overflow: visible`.
- **Datos que se ven mal por formato, no por diseño:** `proposals.shows` llega como texto JSON y el admin contaba 0 shows en 145 de 148 clientes; `new Date("22 de octubre")` pintaba "Invalid Date". Contar y formatear en la plantilla (`JSON.parse` con `try`, fechas ISO formateadas y las escritas a mano tal cual).
- **Subir tipografía de pantalla también engorda el PDF.** La Ola 2 agrandó concepto, nota de precio y extras y un show dejó de caber en la página 2 (39 % en blanco). Cada cambio de tamaño en pantalla necesita su contrapartida en `body.print-mode` y regenerar el PDF para medir.
- **Doble subrayado en print:** si un enlace lleva `border-bottom` en pantalla y la regla de print añade `text-decoration: underline`, en el PDF salen dos líneas. Quitar el borde en `body.print-mode`.
- **`::first-letter` con selector amplio** (`.card-body .meta > span:first-child`) capitalizó emails en Artistas y Proveedores. Acotar siempre al componente (`.show-meta`).
- **Leads sin trabajar dominan el listado** (156 de 195 propuestas sin shows): marcarlos como "Por preparar" en vez de esconderlos; es trabajo pendiente, no ruido.

## Referencias

- Evidencia y fuentes: `references/evidencia-ux-ui.md`
- Research completo (propuesta): `OUTPUTS/eventos-barcelona/research-ux-ui-propuestas-sep2026.md` y su `QA-REPORT-…`
- Informe publicado: https://claude.ai/artifact/NETSSk5ofGok1iuVZPS3tt
- Rama de referencia: `visual/rider-ola-1` (Olas 1, 2 y 3 de la propuesta; admin con capa visual y plantillas nuevas de Propuestas, Shows, Artistas y Proveedores; retirada de Ideas). Estado por ítem en la sección 11 del research

## Checklist de cierre

- [ ] Capturas y métricas antes/después en escritorio y móvil, sin errores de JS
- [ ] PDF regenerado, blanco por página medido y última página comprobada
- [ ] Contraste AA de todos los pares nuevos
- [ ] Ninguna escritura a producción durante la sesión
- [ ] CSS en bloque delimitado; cambios de Plantilla separados y con OK
- [ ] Sin guion largo (U+2014) en textos nuestros; interfaz en español
- [ ] Decisiones para Xavi listadas
- [ ] Rama sin commit salvo que el usuario lo pida
