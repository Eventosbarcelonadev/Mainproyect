---
status: CANONICAL · FUENTE DE VERDAD · v2.0
title: Pirámide SEO — Eventos Barcelona
origin: Piramide_Keywords_SEO_Eventos_Barcelona.docx.pdf
last_review: 2026-08-20 (v2.0 · cruce con GSC top queries real)
next_review: 2026-11-20 (trimestral)
owner: Equipo SEO/contenido Eventos Barcelona
---

# Pirámide SEO — Eventos Barcelona

## ⚠️ Aviso de corrección · 2026-08-24

**Las cifras de impresiones de la sección v2.0 están mal etiquetadas.** Dicen "Impr 90d" pero
corresponden a una ventana de **5 o 6 días**, no de 90. Verificado contra la API de Search Console:
el ratio entre lo publicado y lo real es constante (~0,78 de una ventana de 7 días) en todas las
keywords comprobadas, lo que descarta que sea una diferencia de filtro o de fecha de corte.

| Keyword | Dice v2.0 | Real 90d | Factor |
|---|---:|---:|---:|
| `agencia de eventos` | 190 | **2.911** | 15x |
| `agencia de eventos corporativos` | 152 | **2.114** | 14x |
| `eventos barcelona` | 133 | **3.311** | 25x |
| `eventos corporativos barcelona` | 105 | **1.535** | 15x |
| `eventos mice` | 38 | **737** | 19x |

**Qué sigue siendo válido:** las tres keywords descartadas por falta de demanda
(`team building barcelona`, `animación para eventos empresariales`,
`experiencias para eventos corporativos`) lo están correctamente. Comprobado a 90 días reales:
10, 24 y 162 impresiones respectivamente. El método era erróneo pero esa conclusión se sostiene.

**Qué hay que revisar:** la priorización. Con volúmenes 15 veces menores, cualquier keyword de
demanda media pudo quedar por debajo del umbral de atención. En los datos reales hay
**147 búsquedas en posición 11-20 con 30 o más impresiones** que esta pirámide no recoge.

**A partir de ahora los volúmenes y posiciones se consultan en
`propuestas.eventosbarcelona.com/metricas`, hoja Keywords.** Salen por API, con la ventana escrita
al lado de cada número, y con el histórico mes a mes congelado en `data/seo-keywords.json`. Esta
pirámide se queda como documento de estrategia y de cobertura por landing, que es donde aporta.

---

## 🆕 v2.0 · Refresh 2026-08-20 · Cruce con GSC real (90d)

> ⚠️ Las impresiones de esta sección son de ~5 días, no de 90. Ver el aviso de corrección de arriba.

Datos GSC pull 2026-08-16 (últimos 90 días) han confirmado y refutado hipótesis de la v1.0:

### ✅ Confirmado — keywords con demanda REAL en GSC

| Cluster | Query representativa | Impr 90d | Pos | Landing que la cubre |
|---|---|---:|---:|---|
| Agencia eventos | `agencia de eventos` | 190 | 17,3 | Home ES · Landing partner-DMC (Sprint 2 ✓) |
| Agencia eventos corp | `agencia de eventos corporativos` | 152 | 16,3 | Landing partner-DMC ES ✓ |
| Marca | `eventos barcelona` | 133 | 11,8 | Home ES · **único click validado** (4 clicks) |
| Corp events BCN | `eventos corporativos barcelona` | 105 | 12,2 | Home · Landing partner-DMC ✓ |
| DJ para fiestas | `dj para fiestas` + variantes | 30-70 | 27-42 | **⚠ SIN LANDING · GAP OPORTUNIDAD** |
| Cantante eventos | `cantante para eventos` | 33 | 23 | Parcial en /musica/ ⚠ |
| MICE | `eventos mice` | 38 | 21,2 | Landing convenciones ES ✓ (Sprint 3) |

### ❌ Refutado — keywords planificadas SIN demanda real

Estas keywords estaban en la pirámide v1 como "❌ A CREAR" pero GSC confirma **0 impresiones significativas** en 90 días:

- **`team building barcelona`** · 0 impresiones GSC · **DESCARTAR del roadmap** (confirmando pivot del Informe Estratégico 2026-07)
- **`animación para eventos empresariales`** · 0 impresiones GSC · **DESCARTAR**
- **`experiencias para eventos corporativos`** · 0 impresiones GSC · **DESCARTAR**

Todas coinciden con las categorías que el Informe Estratégico EB pidió eliminar del posicionamiento por no ser core del negocio real.

### 🆕 Nuevo cluster no en v1.0 · añadir a Nivel 2

**Cluster "DJ + música para fiestas"** — GSC muestra >200 impresiones agregadas en 90 días con posiciones 25-45. Landing genérica /musica/dj-barcelona/ existe pero no captura el intent "fiesta" específico. Propuesta:

- Landing nueva `/dj-fiesta-empresa-barcelona/` ES + EN (Sprint 5)
- Keywords: dj para fiestas, dj para fiesta privada, contratar dj para fiestas, dj fiestas privadas barcelona, alquilar altavoces para fiesta barcelona

### 📊 Estado post Sprint 4 · gaps cubiertos vs v1.0

Nivel 3 — específicas: v1.0 tenía 4 ⚠ + 1 ❌ = 5 gaps. Post Sprint 4 quedan **2 gaps** (charlestón + show percusión LED). Cubiertos:
- `violinista para cena de gala` ✅ Landing dedicada Sprint 4 (`/violinista-cena-gala-corporativa-barcelona/`)
- `banda de versiones para fiesta de empresa` ✅ Landing dedicada Sprint 4 (`/bandas-versiones-fiestas-empresa-barcelona/`)

Nivel 2 — categorías: v1.0 tenía 4 ⚠ + 5 ❌ = 9 gaps. Post Sprint 4 quedan **4 gaps reales** (team building/animación/experiencias DESCARTADOS por refuted, quedan circo hub / gala hub cubierto por landing gala dinners Sprint 2, WOW effect / actividades congresos). Cubiertos:
- `alquiler de pantallas LED` ✅ Landing dedicada Sprint 4
- `espectáculos para cenas de gala` ✅ Landing gala dinners Sprint 2
- Landing `/espectaculos-eventos-corporativos-barcelona/` como hub refresh Sprint 4

Nivel 2 refined post-refresh: **13/17 ✅** · **1/17 ⚠ parcial** · **3/17 ❌ DESCARTADOS** (team building, animación, experiencias) = cobertura efectiva **93%** de lo que sí tiene demanda real.

### 🎯 Prioridades Sprint 5 · basadas en GSC v2 refresh

1. **Landing `/dj-fiesta-empresa-barcelona/` ES+EN** — cluster nuevo con 200+ impresiones agregadas / 90d validadas
2. **Refresh homepage title/meta** — captura `eventos barcelona` (único click validado, pos 11,8 con potencial de subir a top 10)
3. **Landing `/agencia-de-eventos-barcelona/`** o refresh mejorado — 500+ impresiones agregadas en variantes "agencia de eventos [corporativos/en] barcelona"
4. **Cantante para eventos** — landing dedicada dentro de `/musica/` (33 impr / 90d ya con pos 23)

### Aprendizaje operativo v2.0

- **CTR real 0,40%** vs baseline abril 0,90% — bajó por incorporación de queries nuevas (post Sprint 2) sin clicks aún porque están en pos 20+
- Solo **10 queries validadas con clicks** en 90 días vs 1000 queries con impresiones = ratio bajísimo, indica que EB está en zonas de descubrimiento pero no de captura todavía
- Impresiones estables (~2.400/día) confirman que Google no penalizó — sigue mostrando el sitio, solo bajó CTR por ranking promedio

---

# Pirámide SEO — Eventos Barcelona (v1.0 · legacy)

> **Este documento es la biblia.** Cualquier acción SEO sobre eventosbarcelona.com (creación de página, reescritura de title, internal linking, campaña outbound, brief para creator, schema markup, etc.) **debe consultar este documento primero**. Si una keyword o página no encaja en ningún nivel, antes de actuar abrir discusión.

## Regla maestra · Bilingüe obligatorio (ES + EN)

> **Toda página y todo artículo de eventosbarcelona.com tiene que existir en español Y en inglés. Sin excepciones.**
>
> Un artículo en ES sin su contraparte EN se considera **incompleto** y no se publica. Razones:
>
> 1. **MICE internacional es el core del negocio.** El público objetivo de mayor ticket llega en inglés (event planners de empresas internacionales con oficina en BCN, DMC desde otros países, congresos europeos).
> 2. **WPML está instalado y funcionando.** No hay excusa técnica: el sitio ya tiene la infraestructura ES/EN sincronizada (verificable en cualquier URL: hreflang reciprocal activo).
> 3. **El sitemap ya refleja la regla en buena parte del catálogo** (cada `/musica/...` tiene su `/en/music/...`, idem `/danza/` ↔ `/en/dance/`, `/artistas/` ↔ `/en/artists/`, `/espectaculos/` ↔ `/en/performances/`, `/casos-de-exito/` ↔ `/en/success-stories/`). Las páginas nuevas tienen que mantener la simetría.
> 4. **Las keywords del Nivel 1 ya están duplicadas** entre ES y EN en la pirámide (corporate events Barcelona, MICE events Barcelona, etc.) — el contenido debe seguir el mismo patrón en los niveles 2 y 3.
>
> **Cómo aplicarlo en cada acción:**
> - Cualquier nueva página se crea como par `/ruta/` (ES) + `/en/path/` (EN) en la misma sesión de trabajo. WPML translation, no traducción literal.
> - El briefing de cualquier artículo (incluso si lo redactará un freelance) debe entregar ambos idiomas al mismo tiempo.
> - El internal linking debe respetar hreflang: páginas ES enlazan a ES, EN a EN. No mezclar.
> - Si por excepción operativa una página sale primero en un idioma, queda **flag como deuda técnica** y se completa en el plazo del sprint siguiente.

## Lógica de la pirámide

```
                ▲
              ◢ 3 ◣           específicas — alta conversión
            ◢───────◣
          ◢   2     ◣         categorías — comercial / evaluación
        ◢─────────────◣
      ◢      1          ◣     genéricas — descubrimiento / marca
    ◢───────────────────────◣
```

**Tres niveles, tres intents distintos:**

| Nivel | Tipo de keyword | Intent | Objetivo SEO |
|---|---|---|---|
| **3** | Específicas (long-tail) | Quiero contratar X concreto | Generar leads directos de contratación |
| **2** | Categorías de servicio | Quiero una solución para Y | Posicionar líneas de negocio · captar evaluación |
| **1** | Genéricas de marca/agencia | Quiero un partner para mi evento | Autoridad de marca · partner global |

**Flujo de autoridad:** Nivel 1 (empresa) → Nivel 2 (categorías) → Nivel 3 (servicios específicos). Cada página específica enlaza hacia su categoría; cada categoría enlaza hacia la Home / páginas de marca. Sin cross-links innecesarios entre niveles.

---

## Nivel 3 · Keywords específicas (15)

**Intent:** alta conversión. Usuarios que saben exactamente qué quieren contratar.

| # | Keyword | Página existente | Estado |
|---:|---|---|---|
| 1 | contratar grupo de jazz para evento corporativo | `/musica/grupo-jazz-barcelona/` | ✅ |
| 2 | espectáculo de flamenco para eventos | `/musica/grupos-de-flamenco-barcelona/` · `/danza/bailarines-flamenco-barcelona/` | ✅ (2 páginas) |
| 3 | show láser para evento de empresa | `/espectaculos/laser-show/` + `/en/performances/laser-shows-barcelona/` | ✅ |
| 4 | contratar malabaristas para eventos | `/artistas/malabarista-barcelona/` · `/artistas/espectaculo-malabares-fuego/` | ✅ |
| 5 | violinista para cena de gala | `/musica/trio-violinistas/` | ⚠ tenemos trío, falta solista |
| 6 | saxofonista para cóctel corporativo | `/musica/contratar-chica-saxofonista/` | ✅ |
| 7 | batucada para evento empresarial | `/musica/contratar-percusionistas-batucada-para-eventos/` | ✅ |
| 8 | show de percusión LED | parcial en `/espectaculos/malabaristas-led-barcelona/` | ⚠ no es específico de percusión LED |
| 9 | caricaturista para eventos | `/artistas/caricaturistas-barcelona/` | ✅ |
| 10 | mago para evento corporativo | `/artistas/magos-en-barcelona/` | ✅ |
| 11 | espectáculo de acrobacias aéreas | `/danza/danza-aerea-barcelona/` + `/en/artists/acrobats-tightrope-walkers/` | ✅ |
| 12 | banda de versiones para fiesta de empresa | `/musica/pop-rock-live-band/` | ⚠ tiene pop/rock, falta "banda de versiones" |
| 13 | DJ para evento corporativo en Barcelona | `/musica/dj-barcelona/` | ✅ |
| 14 | espectáculo de fuego para eventos | `/artistas/espectaculo-malabares-fuego/` | ✅ |
| 15 | bailarines de charlestón para eventos temáticos | — | ❌ **A CREAR** |

**Cobertura Nivel 3: 10/15 ✅ · 4/15 ⚠ parcial · 1/15 ❌ falta** (67 % directa, 27 % parcial, 7 % gap).

---

## Nivel 2 · Categorías de servicios (17)

**Intent:** comercial / evaluación. Usuarios que buscan solución pero no proveedor definitivo.

| # | Keyword | Página existente | Estado |
|---:|---|---|---|
| 1 | grupos de música para eventos | `/grupos-musica/` · `/musica/` | ✅ |
| 2 | espectáculos de danza para eventos corporativos | `/danza/` · `/en/dance/` | ✅ |
| 3 | shows de circo para eventos | parcial en `/espectaculos/` | ⚠ falta hub `/circo/` |
| 4 | entretenimiento para eventos empresariales | — | ❌ **A CREAR** |
| 5 | artistas para eventos corporativos | `/artistas/` · `/artistas-y-espectaculos/` | ✅ |
| 6 | espectáculos para cenas de gala | — | ❌ **A CREAR** (hub gala) |
| 7 | shows WOW effect Barcelona | distribuido en `/espectaculos/` | ⚠ sin hub dedicado |
| 8 | alquiler de equipos de sonido en Barcelona | `/alquiler-sonido/` | ✅ |
| 9 | alquiler de iluminación para eventos | `/alquiler-iluminacion/` | ✅ |
| 10 | alquiler de pantallas LED | parcial en `/alquiler-audiovisual/` | ⚠ falta página dedicada |
| 11 | alquiler y montaje de equipos AV | `/alquiler-audiovisual/` | ✅ |
| 12 | producción audiovisual para eventos | `/produccion-tecnica-para-eventos/` | ✅ |
| 13 | escenarios para eventos corporativos | `/alquiler-escenarios/` | ✅ |
| 14 | team building en Barcelona | — | ❌ **A CREAR** (alto volumen) |
| 15 | actividades para congresos | `/organizacion-de-congresos-y-convenciones/` | ⚠ no usa la keyword exacta |
| 16 | experiencias para eventos corporativos | — | ❌ **A CREAR** |
| 17 | animación para eventos empresariales | — | ❌ **A CREAR** |

**Cobertura Nivel 2: 8/17 ✅ · 4/17 ⚠ parcial · 5/17 ❌ faltan** (47 % directa, 24 % parcial, 29 % gap).

---

## Nivel 1 · Keywords genéricas de empresa (14)

**Intent:** descubrimiento / búsqueda de partner. Usuarios que buscan agencia integral.

| # | Keyword | Página existente | Estado |
|---:|---|---|---|
| 1 | agencia de eventos en Barcelona | `/` (Home ES) | ✅ |
| 2 | empresa de eventos en Barcelona | `/` | ✅ |
| 3 | productora de eventos en Barcelona | `/` | ✅ |
| 4 | organización de eventos en Barcelona | `/` | ✅ |
| 5 | producción de eventos corporativos | `/` | ✅ |
| 6 | agencia de eventos corporativos | `/` | ✅ |
| 7 | event management company Barcelona | `/en/` | ✅ |
| 8 | corporate events Barcelona | `/en/` | ✅ |
| 9 | corporate entertainment agency Barcelona | `/en/` | ✅ |
| 10 | event production company Barcelona | `/en/` | ✅ |
| 11 | MICE events Barcelona | `/en/` + `/eventos-mice-que-es/` | ✅ |
| 12 | event agency Spain | `/en/` | ⚠ no hay `/spain/` page |
| 13 | **DMC Barcelona** | — | ❌ **A CREAR** (keyword crítica MICE internacional) |
| 14 | event planner Barcelona | `/en/` | ⚠ no hay landing específica |

**Cobertura Nivel 1: 11/14 ✅ · 2/14 ⚠ parcial · 1/14 ❌ falta** (79 % directa, 14 % parcial, 7 % gap).

---

## Gaps priorizados (páginas a crear)

Por nivel y volumen estimado de búsqueda (alto / medio / bajo).

| Prioridad | URL propuesta | Keyword target | Nivel | Notas |
|---|---|---|---|---|
| **P1** | `/dmc-barcelona/` o `/en/dmc-barcelona/` | DMC Barcelona | 1 | Keyword crítica MICE internacional · alto valor |
| **P1** | `/team-building-barcelona/` | team building en Barcelona | 2 | Alto volumen · base del retainer plan v2 |
| **P1** | `/entretenimiento-eventos-empresariales/` | entretenimiento para eventos empresariales | 2 | Cobre hub que hoy no existe |
| **P2** | `/espectaculos-cenas-de-gala/` | espectáculos para cenas de gala | 2 | Intent comercial alto |
| **P2** | `/experiencias-eventos-corporativos/` | experiencias para eventos corporativos | 2 | Trend tendencia experiencial |
| **P2** | `/animacion-eventos-empresariales/` | animación para eventos empresariales | 2 | Capta término común no especializado |
| **P2** | `/circo/` (hub) | shows de circo para eventos | 2 | Re-agrupar páginas existentes |
| **P3** | `/alquiler-pantallas-led/` | alquiler de pantallas LED | 2 | Vertical técnico específico |
| **P3** | `/musica/violinista-cena-gala/` | violinista para cena de gala | 3 | Faltaba solista (tenemos trio) |
| **P3** | `/musica/bandas-versiones-fiesta-empresa/` | banda de versiones para fiesta de empresa | 3 | Sin página exacta |
| **P3** | `/espectaculos/percusion-led/` | show de percusión LED | 3 | Sin página dedicada |
| **P3** | `/danza/charleston-eventos-tematicos/` | bailarines de charlestón para eventos temáticos | 3 | Nicho específico |

**Total: 12 keywords a cubrir × 2 idiomas (ES + EN obligatorio) = 24 páginas a crear** (2 N1 · 14 N2 · 8 N3). El conteo "12" se mantiene como referencia de _keywords_ a cubrir; el trabajo real son 24 páginas por la regla bilingüe.

---

## Estrategia hub-and-spoke (internal linking)

```
                          ┌──────────────┐
                          │  Nivel 1     │
                          │  / · /en/    │  ← Home
                          │  /dmc-bcn/   │
                          └──────┬───────┘
                                 │
            ┌────────────────────┼────────────────────┐
            ▼                    ▼                    ▼
    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
    │  Nivel 2     │    │  Nivel 2     │    │  Nivel 2     │
    │  /musica/    │    │  /artistas/  │    │  /alquiler-* │
    │  /danza/     │    │              │    │              │
    └──────┬───────┘    └──────┬───────┘    └──────┬───────┘
           │                   │                   │
           ▼                   ▼                   ▼
    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
    │  Nivel 3     │    │  Nivel 3     │    │  Nivel 3     │
    │  /musica/    │    │  /artistas/  │    │  /alquiler-  │
    │  grupo-jazz/ │    │  magos-bcn/  │    │  iluminacion │
    │  dj-bcn/     │    │  caricat./   │    │  /escen./    │
    │  saxo/...    │    │  malab./...  │    │              │
    └──────────────┘    └──────────────┘    └──────────────┘
```

**Reglas de enlazado:**

1. **Vertical estricto** dentro de cada vertical (música, danza, artistas, alquiler):
   - N3 enlaza → N2 (su categoría padre)
   - N2 enlaza → N1 (Home) + lateral a categorías relacionadas (música ↔ danza)
   - N1 enlaza → N2 (cada categoría) y selectivamente a N3 destacadas
2. **No saltar niveles innecesariamente** (N3 directamente al Home solo desde breadcrumb).
3. **Anchor variado**: cada categoría debe ser enlazada con 2-3 variantes de anchor desde sus N3 (no siempre la misma).
4. **Casos de éxito** apuntan tanto a la categoría padre como al servicio específico que protagonizó el evento.

---

## Cómo usar este documento

### Antes de crear contenido nuevo

1. Identificar el nivel: ¿es genérica (1), categoría (2) o long-tail (3)?
2. Verificar si la keyword ya tiene página en la tabla de mapping.
3. Si **existe**: optimizar la existente, no crear duplicado.
4. Si **falta**: añadir el brief a la cola de páginas a crear y referenciar este doc.
5. Definir anchors de enlaces internos antes de publicar (hub-and-spoke).

### Antes de reescribir title/meta

1. Confirmar el nivel de la página.
2. El title debe contener la keyword primaria de su nivel.
3. La meta description debe alinearse al intent del nivel:
   - **N1**: "agencia · 15 años · 1.000+ eventos · partner integral"
   - **N2**: "categoría · oferta · número de opciones · cómo contratar"
   - **N3**: "servicio concreto · precio desde · disponibilidad · CTA directa"

### Antes de una campaña outbound / paga

Mapear cada landing del anuncio o cada mensaje de outbound a un nivel concreto. Si no hay landing para esa keyword, primero crear, después lanzar.

### Refresh trimestral

Cada 3 meses (o tras cada actualización mayor de algoritmo Google):

1. Cruzar las keywords de la pirámide contra el GSC top 100 queries.
2. Identificar nuevas keywords que están trayendo tráfico real y mapearlas a niveles (puede sumar al doc).
3. Marcar como obsoletas las que ya no traen impresiones.
4. Re-evaluar gaps: ¿siguen siendo P1?

---

## Estado al 2026-06-18

- **Cobertura global:** 29 keywords cubiertas directamente (64 %) · 10 parciales (22 %) · 6 gaps (14 %).
- **Acción inmediata:** crear las 3 P1 (DMC Barcelona, team building, entretenimiento) — bloquea retainer plan v2.
- **Próxima review:** 2026-09-18 (post Q3 + datos GSC del Sprint 1).

---

## Cambios sobre el doc original

Este markdown extiende el PDF original con: (a) mapping a URLs reales del sitemap actual, (b) gaps priorizados, (c) instrucciones operativas, (d) estado de cobertura. El PDF queda como referencia histórica en `/Piramide_Keywords_SEO_Eventos_Barcelona.docx.pdf`.
