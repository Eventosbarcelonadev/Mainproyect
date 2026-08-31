# Plan de keywords · Eventos Barcelona
### Octubre-noviembre 2026 · construido sobre lo ejecutado y lo que falta

> Sucesor operativo de `PLAN-KEYWORDS-2026-09.md`. El plan anterior diagnosticó la caída
> y organizó los primeros 6 bloques de ejecución. Este plan asume esa ejecución hecha
> y define lo que viene mientras esperamos la ventana de medición 25 sep – 23 oct.
>
> Fecha: 31 agosto 2026. Basado en: sprint SEO ejecutado 28 ago (commits 4d33f90, 5b141f7,
> 9107b83), snapshot en `data/seo-snapshot-20260828.json`, 44 tareas Notion Done a 31 ago.

---

## 1. Dónde estamos ahora

**Ejecutado del plan de agosto (85%)**:

| Bloque | Estado | Deliverable |
|---|---|---|
| 1 · Landing comercial | ✅ | `/agencia-de-eventos-barcelona/` ES + EN (posts 21943 / 21944) |
| 1.6 · Internal linking | ✅ | 11 backlinks entrantes + cross-cluster en 12 landings |
| 2 · CTR fix 9 kw pág. 1 | ✅ 4 de 9 | rumba catalana, ideas originales, entrega premios, burlesque. Las otras 5 son URL home no editable a keyword específica |
| 3 · Canibalización | ✅ 2 de 4 | 301 `/eventos-empresa/` + 301 `/agencia-eventos-corp-profesional/` |
| 4 · Auditoría viejos | 🟡 parcial | SEO title + meta + focus keyphrase reescritos en 7 posts pre-2023. **Falta reescritura profunda del cuerpo** |
| 5 · Snapshot congelado | ✅ | `data/seo-snapshot-20260828.json` |
| 0 · Censo 295 páginas | 🟡 pendiente | Solo pre-2023 auditadas. Faltan las 287 restantes |

**Adicional ejecutado (fuera del plan agosto)**:
- Snippet `EB-AI-ATTRIBUTION` disparando GA4 event `ai_referral` con dimensión `ai_source`
- 10 landings temáticas nuevas ES + EN (iluminación, videowall, escenografía, venues, música hub, DJ, cantante, violinista, bandas, LED, pompas, cantante)
- Bailarines Flamenco SEO fix (H1 + title + meta)
- Cuaderno SEO EB como entregable visual

**Ventana comprobable**: 25 sep – 23 oct. Antes de esa fecha cualquier dato es ruido.

---

## 2. Los tres huecos que el plan anterior reconoció · plan de cierre

El plan de agosto terminaba con esta sección:

> - **Volumen de keywords donde no aparecemos.** Search Console solo mide lo que ya rankea.
> - **Por qué exactamente nos golpeó el core update.** Requiere auditoría de calidad de contenido y E-E-A-T.
> - **Qué hace la competencia.** Nada de aquí es comparativo.

Aquí va cómo se cierra cada uno.

### Hueco 1 · Keyword research fuera del sitio

**Problema**: GSC solo mide lo que ya rankea. Perdemos visibilidad de la demanda que aún no hemos cazado. No podemos construir la siguiente ola de landings sobre datos, solo sobre intuición.

**Opciones ordenadas por coste**:

| Herramienta | Coste | Cobertura |
|---|---|---|
| Google Keyword Planner (via cuenta Ads dev@) | Gratis | Volúmenes por rango, competencia Ads, no orgánica |
| DataForSEO API pay-as-you-go | ~$25 / mes uso ligero | SERP + volumen + dificultad |
| Ahrefs / SEMrush | 100-150 € / mes | Todo, incluido tracking competencia |

**Recomendación**: activar **DataForSEO API pay-as-you-go**. Coste ligado a uso real, lo pagamos entre Scale IT y Xavi, y devuelve datos que se pueden guardar en `data/keywords-externas.json` para trackear en el tiempo.

**Terminado cuando**: el próximo cluster de landings se decide con volumen mensual medido, no con intuición.

### Hueco 2 · Auditoría E-E-A-T para post-core update

**Problema**: el core update de mayo-junio castigó calidad. El sitio bajó 4 puestos de media. Y el sitio tiene 182 de 295 páginas sin un solo clic. La hipótesis, no probada pero razonable, es que hay páginas de baja calidad arrastrando la autoridad del dominio hacia abajo.

**Auditoría estructurada**:

Los 8 posts pre-2023 tienen media **630 palabras, 1,4 H2, 0,5 enlaces internos**. Compárese con los B5-B12 nuevos: **854 palabras, 7,2 H2, 5,8 enlaces**. El gap es real y medible.

**Acciones**:

| Fase | Producto | Terminado cuando |
|---|---|---|
| 2.1 Identificar contenido de baja calidad | Lista de posts pre-2023 con veredicto (reescribir / consolidar / despublicar) | Cada uno tiene decisión |
| 2.2 Reescritura profunda de 3 top-tráfico | Nuevo cuerpo con estructura H2/H3, FAQ, internal links, imagen intercalada, autor bio | 3 posts `12521`, `12507`, `12518` reescritos completos (no solo SEO) |
| 2.3 Autor bio de Xavi en cada post nuevo y viejo | Bloque de autor con foto, nombre, cargo, X años experiencia | Aparece en el schema BlogPosting como `author` |
| 2.4 Testimonios / logotipos clientes en home | Sección con logos reales (verificados por Xavi) | Home refleja los clientes verificados |

**Prioridad**: **alta**. E-E-A-T se acumula, no se recupera de un día para otro. Empezar ya, medir en 90 días.

### Hueco 3 · Análisis competitivo

**Problema**: no sabemos quién ocupa las posiciones 1-10 en las 62 keywords del cluster comercial. Sabemos que la home nuestra está en pos 12-18. Alguien está por delante.

**Competidores identificados hasta hoy** (memory `project_eb_positioning_icp`):

| Nombre | Modelo | Uso para EB |
|---|---|---|
| Scarlett Barcelona | Boutique premium con equipo propio | **Benchmark**. Ver su copy, propuesta de valor, casos |
| Unaplauso | Directorio grande | **Anti-modelo**. Nada que copiar |
| Grup Serhs Events | Grupo corporativo | Competidor MICE grande |
| ExpoBcn | Producción de ferias | Cluster técnico |
| Global Events House | Agencia internacional | Cluster corporativo |

**Acciones**:

| Fase | Producto | Terminado cuando |
|---|---|---|
| 3.1 Fetch de las 62 kw cluster comercial en GSC + posiciones de competencia | Tabla con top 3 competidores por kw | Se sabe quién nos supera y por cuántos puestos |
| 3.2 Análisis de copy de Scarlett en sus landings top | Extractos de propuesta de valor, tono, casos, CTAs | Se sabe qué hace Scarlett mejor que nosotros |
| 3.3 Gap analysis contenido: qué páginas tiene Scarlett que no tenemos | Lista de tipologías de landing pendientes | Priorizar según impresiones + factibilidad |

**Herramienta**: DataForSEO SERP API si activamos hueco 1, o inspección manual con `sitewatch` gratis.

---

## 3. Los cinco frentes de octubre-noviembre

**La regla que ordena todo**: **primero cerrar lo abierto de agosto, después atacar lo nuevo.**

### Frente A · Cerrar los pendientes de agosto (semana 1-2 septiembre)

| Tarea | Estado | Prio |
|---|---|---|
| B0 · Censo de las 287 páginas restantes con veredicto (mantener / mejorar / consolidar / podar) | Pendiente | Alta |
| B3.3 · Consolidar 4 hubs solapados: `/musica/` + `/espectaculos/` + `/artistas/` + `/artistas-y-espectaculos/` en uno | Pendiente | **Muy alta** — 162 kw canibalizadas |
| B3.2 · `/produccion-tecnica-para-eventos/` vs home por "producción de eventos" (2.128 imp) | Pendiente | Media |
| Landing EN de bailarines flamenco (para cerrar 12/12 pirámide) | Pendiente | Media |
| Reescritura profunda de 3 posts top-tráfico pre-2023 (`12521`, `12507`, `12518`) | Pendiente | Alta E-E-A-T |

### Frente B · Hubs pendientes (semana 2-3 septiembre)

Del cuaderno SEO: Sprint 7 · crear los 2 hubs faltantes:

- Hub **Producción técnica** que una sonido + iluminación + LED + videowall + escenografía en un solo cluster (18.105 impresiones actuales, solo 34 en pág. 1)
- Hub **Eventos MICE** que una convenciones + galas + venues + escenografía (43.144 imp cluster)

ES + EN, WPML linked. Ambos con FAQ schema y schema Service.

### Frente C · GEO / AEO (semana 3-4 septiembre)

Ahora que tenemos data de AI bot traffic (Bing 3.215, ChatGPT 2.161, Claude 552, Perplexity 192) y el snippet `EB-AI-ATTRIBUTION` capturando humanos desde el 29 ago, arrancamos el ciclo GEO real:

| Acción | Deliverable | Terminado cuando |
|---|---|---|
| C.1 Añadir FAQ schema a los 8 posts B5-B12 | JSON-LD FAQPage por post | Rich snippets desbloqueados |
| C.2 Escribir 5 posts optimizados para AI Overviews | Estructura: pregunta explícita como H2 + respuesta de 40-60 palabras en el primer párrafo | Que ChatGPT/Perplexity los citen |
| C.3 llms.txt refresh mensual automatizado | Script cron o mu-plugin regenera semanal | Sin acción manual |
| C.4 Content chunks citables por AI | Cada landing tiene un "answer box" de 60 palabras al inicio | Detectable via LLMagnet dashboard |

**Keywords GEO objetivo** (baseline volumen 0 en GSC porque no rankeamos, pero uso alto en LLMs):

- `qué agencia de eventos elegir en Barcelona`
- `cómo contratar violinista para gala corporativa`
- `diferencia entre DMC y agencia de eventos`
- `mejores venues para convenciones internacionales Barcelona`
- `cuánto cuesta organizar evento corporativo Barcelona`

### Frente D · Long-tail comercial (octubre)

Cuando el cluster comercial arranque a moverse (esperado 25 sep – 23 oct), lanzar la siguiente ola:

- `agencia eventos MICE internacional`
- `producción evento corporativo boutique`
- `agencia eventos corporativos multilingüe Barcelona`
- `wedding planner corporate Barcelona` (crossover)
- `agencia eventos hibrídos Barcelona` (post-covid, tendencia estable)

**No lanzar antes** de ver que el cluster comercial tiene tracción. Publicar más antes de eso repite el error de agosto.

### Frente E · Auditoría E-E-A-T y testimonios (continuo hasta fin de año)

- Autor bio Xavi en cada post
- Publicar 1 caso real por mes con métricas del cliente (número de pax, artistas contratados, feedback textual, foto)
- Testimonios verificados en home (3 mínimo)
- Certificaciones + logotipos clientes en la landing agencia

Este frente no da resultados en semanas, se acumula.

---

## 4. Qué dejar de hacer

1. **No publicar más landings de nicho hasta ver movimiento del cluster comercial en la ventana 25 sep – 23 oct.** Si no se mueve, algo del diagnóstico o de la ejecución estaba mal y hay que corregir antes de sumar contenido.
2. **No lanzar el Frente D antes del 15 de octubre.** Repetiría el error del sprint 5: contenido nuevo sobre un cluster sin tracción.
3. **No confiar solo en GSC para decidir keywords.** Activar hueco 1 (keyword tool) antes de octubre.
4. **No dejar E-E-A-T para el final.** Los testimonios y bio del autor no dan resultado hoy, pero sin ellos el sitio queda vulnerable al próximo core update.

---

## 5. Cómo se mide

**Ventana comprobable primaria**: 25 septiembre – 23 octubre.

Las 5 keywords cluster comercial (`agencia de eventos`, `agencia de eventos corporativos`, `eventos corporativos barcelona`, `agencia de eventos barcelona`, `agencia eventos`) deben pasar de página 2 a página 1. Son 8.407 impresiones que hoy dan 10 clics.

**Ventana secundaria**: 1 noviembre – 30 noviembre. Los cambios de septiembre (frentes A-C) deben empezar a verse.

**Métricas nuevas activas desde ahora**:

| Métrica | Fuente | Ver |
|---|---|---|
| Posición 5 kw cluster comercial | GSC | Dashboard metricas + `data/seo-keywords.json` |
| Sesiones desde IA por fuente | GA4 event `ai_referral` con dim `ai_source` | GA4 Reports · Engagement · Events |
| Bot traffic por engine | LLMagnet | `llmagnet/get-bot-traffic` MCP |
| Citations en LLMs | Manual + LLMagnet | `llmagnet/get-visibility-score` (77/100 baseline) |

Todo esto vuelca al **Cuaderno SEO EB v2** publicado como Artifact. Se actualizará quincenal.

---

## 6. Lo que este plan sí puede responder (a diferencia del anterior)

- ✅ **Cerrar los 3 huecos** identificados por el plan anterior (keyword tool, E-E-A-T, competencia)
- ✅ **Priorizar GEO/AEO** con los datos reales que ya tenemos (bot traffic + attribution)
- ✅ **Cronograma con puntos de decisión**: si el 23 de octubre el cluster comercial no se mueve, el plan D no se lanza, se revisa por qué

---

## 7. Lo que este plan NO puede responder todavía

- **Cuánto exactamente van a subir las 5 kw cluster comercial**. Se ve el 23 de octubre.
- **Si los frentes B (hubs) y C (GEO) se pueden ejecutar en paralelo con B0 (censo)**. Depende de horas disponibles Ramiro / Phil semana a semana.
- **Cuánto invertimos en E-E-A-T vs contenido nuevo**. Requiere revisión Xavi sobre logotipos clientes reales y testimonios verificables.

---

**Decisiones que necesito de Xavi + Ramiro antes del 15 septiembre**:

1. **DataForSEO API pay-as-you-go**: activo la cuenta (~25 €/mes) o dejo hueco 1 sin resolver?
2. **Consolidación de 4 hubs solapados**: uno canonical + 301 los otros 3. Cuál queremos como canonical: `/artistas-y-espectaculos/`, `/musica/`, `/espectaculos/`, o `/artistas/`?
3. **Landing EN de bailarines flamenco**: sí o no?
4. **3 testimonios verificados** de clientes reales para la home (con logo + una frase). Xavi puede pedir permiso a 3 clientes concretos?
5. **Autor bio Xavi**: foto de perfil profesional + 2 frases de biografía?
