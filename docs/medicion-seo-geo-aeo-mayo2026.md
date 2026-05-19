# Medición SEO/GEO/AEO + Plan de mejora — mayo 2026

**Fecha:** 2026-05-19
**Objetivo:** Aumentar leads cualificados desde la web (target Xavi: 2-3/día).
**Período medido:** 90 días (2026-02-18 → 2026-05-18).
**Comparación:** vs baselines abril 2026 ([project_seo_baselines_apr2026.md](../README.md)).

---

## 1. Resumen ejecutivo

| Métrica | Abril 2026 | Mayo 2026 (90d) | Δ |
|---|---|---|---|
| Impresiones/día | 2.600 | 2.593 | flat |
| Clics/día | 23 | 22 | -4% |
| CTR | 0,90 % | **0,85 %** | -5 % |
| Posición media | — | 21,8 | nuevo dato |
| Usuarios GA (365d) | — | 9.285 (25/día) | nuevo dato |
| CR estimado (sessions→lead) | — | 4-8 % | nuevo dato |
| Recomendación IA | 22,5 % | sin medir esta vuelta | — |

**Diagnóstico en una frase:** la visibilidad (impresiones) está estable, pero el **CTR sigue 3x por debajo del benchmark de sector (2,5 %)** y la **posición media 21,8 deja la mayoría del tráfico potencial en página 2-3**. La conversión sessions→lead es decente (4-8 %), o sea el problema es de **arriba del embudo, no del fondo**.

**3 palancas con mayor ROI:**
1. **Quick wins de CTR** sobre queries que ya están en top 10 → +30-50 % clics sin cambiar posición.
2. **AEO**: FAQ + Schema en páginas top → featured snippets + IA citations.
3. **Casos de éxito**: pasar de 3 expuestos a 15 → autoridad + long-tail + conversion lift.

---

## 2. Medición SEO

### 2.1 Tráfico orgánico (GSC 90d)
- **1.979 clics** sobre **233.344 impresiones** | CTR 0,85 % | Pos media 21,8.
- 80 % España, pero **232 clics internacionales** (UK 66, FR 38, US 32, DE 26, IT 17, MX 17, NL 13, AR 12, IE 8). Confirma que el target corporate internacional es real.
- **Mobile CTR 1,09 % vs Desktop 0,75 %** → mobile convierte mejor, pero la mayoría del tráfico cae en desktop. Optimización mobile-first justificada.

### 2.2 Queries con mayor potencial inmediato

Queries ya en página 1 con CTR por debajo del benchmark de su posición:

| Query | Clics | Impr | CTR actual | Pos | CTR esperado | Clics potenciales |
|---|---:|---:|---:|---:|---:|---:|
| eventos barcelona | 289 | 6.097 | 4,7 % | 6,8 | 8 % | +201 |
| agencia de eventos barcelona | 9 | 1.730 | 0,5 % | 6,2 | 8 % | +130 |
| agencia eventos barcelona | 19 | 1.280 | 1,5 % | 4,7 | 12 % | +135 |
| agencia de eventos en barcelona | 9 | 903 | 1,0 % | 6,6 | 8 % | +63 |
| empresas eventos barcelona | 4 | 239 | 1,7 % | 6,2 | 8 % | +15 |
| ideas originales para eventos | 4 | 196 | 2,0 % | **1,7** | 25 % | +45 |
| agencia de eventos corporativos en barcelona | 5 | 352 | 1,4 % | 4,6 | 12 % | +37 |
| event agency barcelona | 4 | 655 | 0,6 % | 7,7 | 6 % | +35 |

**Suma del techo conservador: ~660 clics extra/90d (~7/día), sin mover una sola posición.** Solo afinando title/meta.

### 2.3 Queries con potencial de salto top3 (pos 4-10)

| Query | Pos | Impr | Si llega a top3 (CTR 25 %) |
|---|---:|---:|---:|
| eventos barcelona | 6,8 | 6.097 | +1.500 clics/90d |
| agencia eventos barcelona | 4,7 | 1.280 | +320 |
| empresa de eventos barcelona | 7,0 | 563 | +140 |
| empresas de eventos barcelona | 7,9 | 953 | +240 |
| event agency barcelona | 7,7 | 655 | +160 |

**Total potencial top3 sobre estas 5: ~2.300 clics/90d = +25 clics/día sostenidos.**

### 2.4 Páginas que ya rinden (consolidar)

- `/` → 591 clics (home, alta autoridad)
- `/15-excelentes-alternativas-de-ocio-para-eventos-corporativo` → **150 clics** (artículo ganador — replicar formato)
- `/en/` → 100 clics (EN funciona)
- `/grupos-musica/` → 56
- `/danza/` → 36
- `/en/dance/bollywood-show/` → 36 (CTR 6,6 %)
- `/artistas/actores-barcelona/` → 30

### 2.5 Páginas con visibilidad alta y CTR pobre (recuperables)

| Página | Impr | Clics | CTR |
|---|---:|---:|---:|
| `/alquiler-iluminacion/` | 15.601 | 23 | 0,15 % |
| `/grupos-musica/` | 15.250 | 56 | 0,37 % |
| `/eventos-mice-que-es/` | 6.823 | 25 | 0,37 % |
| `/alquiler-escenarios/` | 6.362 | 28 | 0,44 % |

CTR ≤ 0,5 % con miles de impresiones → títulos/metas no enganchan.

---

## 3. Medición GEO (Generative Engine Optimization)

### 3.1 Limitaciones de medición
- Hive Rank no tiene data de eventosbarcelona.com (sin contributors en la red).
- Mide en abril: 40 menciones IA totales, 9 recomendaciones activas (22,5 %).
- No se ha repetido el escaneo. **Acción inmediata: pipeline de medición mensual de citations en ChatGPT/Claude/Perplexity para queries Tier 1.**

### 3.2 Competidores que aparecen en SERP "eventos corporativos Barcelona" (proxy de menciones IA)
Tuset, Bacus, Empirance, GrupoRIC, Rurality, AGÉ Business, CREA Group, Delicious BCN, INNOV'events, Divertimento, Eventic, Sortlist.

**EB aparece** en SERP de "eventos corporativos Barcelona" y "corporate event agency Barcelona" — pero compite contra directorios (Sortlist) y agencias con más volumen de contenido (CREA con 60+ artículos según análisis abril).

### 3.3 Gap GEO principal
Los LLMs citan a quien tiene:
- Datos propios citables (cifras de eventos producidos, sectores cubiertos, etc.)
- Presencia en medios sectoriales (eventoplus, BCB, ICCA)
- Contenido en formato Q&A (lo que el LLM puede extraer y citar)

EB tiene los datos (15 años, 300+ shows, 1.000+ eventos) pero **no están estructurados en formato citable**.

---

## 4. Medición AEO (Answer Engine Optimization)

### 4.1 Schema markup (homepage)
- ✅ **Organization**
- ✅ **LocalBusiness** (Ronda General Mitre 126, BCN)
- ❌ **FAQ schema** → bloquea featured snippets y rich results
- ❌ **Service schema** → no comunica catálogo de servicios a Google
- ❌ **Event schema** → no aprovecha que la marca es exactamente esto
- ❌ **Review/AggregateRating** → no aprovecha reviews de Google

### 4.2 Estructura de contenido
- Homepage: 1 H1 + 6 H2 descriptivos, **0 H2 en formato pregunta** → no captura PAA (People Also Ask)
- Memoria abril menciona **19 páginas con H2 en pregunta sin bloque de respuesta** — al menos esos casos están a medias y son quick-fix
- No hay tabla de contenidos en artículos largos
- Sin sección FAQ

### 4.3 Resultado en SERP
- "ideas originales para eventos" en pos 1,7 con CTR 2,0 % → muy probablemente está siendo robada por un featured snippet de otro dominio. Reclamarlo con un bloque Q&A puro arriba del artículo.

---

## 5. Plan de mejora priorizado

### Sprint 1 — Quick wins CTR + Schema (semana 1-2)
**Objetivo:** +30-50 % clics sin tocar posiciones. Riesgo bajo, impacto medible en 2-3 semanas.

1. **Reescribir titles + meta descriptions** de las 13 páginas con mayor impresiones y CTR < benchmark. Foco en:
   - Beneficio claro al usuario (no solo keyword)
   - CTA en meta description ("Solicita propuesta", "Más de 300 shows", etc.)
   - Diferenciador (años, número de eventos, ubicación)
2. **Añadir schema** a homepage: FAQ (5-8 Q&A), Service (catálogo principal), Review/AggregateRating si Google Reviews tiene rating público.
3. **Cerrar los 19 H2 sin respuesta** identificados en la memoria abril — añadir un bloque corto debajo del H2 en cada una.

**Owner:** Growth4U. **Esfuerzo:** ~10-15 h. **Métrica:** GSC CTR semanal por página tocada.

### Sprint 2 — Atacar top3 en queries Tier 1 (semana 3-6)
**Objetivo:** mover "eventos barcelona" de 6,8 a top3 + "agencia eventos barcelona" de 4,7 a top1.

1. **On-page** de las 2 páginas que rankean para esas queries:
   - Internal linking desde 10-15 páginas de productos hacia la página objetivo
   - Optimizar densidad semántica (entidades relacionadas)
   - Añadir bloque comparativo / cifras / case study inline
2. **Backlinks de calidad**: 2-3 medios sectoriales (eventoplus, BCB) con copy editorial real, no link spam. **Auditar primero los backlinks de Rodanet** (sitios irrelevantes que pueden estar penalizando) y desavow si toxicidad confirmada.
3. **EventoPlus**: ya pagamos 1.000 EUR/año → asegurar que los shows publicados linkean a la home con anchor optimizado.

**Owner:** Growth4U + coordinación con medios. **Esfuerzo:** ~25-30 h. **Métrica:** Pos media en GSC semanal.

### Sprint 3 — Casos de éxito + AEO de fondo (semana 5-10)
**Objetivo:** convertir los 15 casos disponibles de Xavi en activos SEO/GEO/AEO.

1. **Página /casos-de-exito/** con grid de 15 cards. Cada caso = página propia con:
   - Schema Event + AggregateRating
   - Bloque "Cliente / Reto / Solución / Resultado" estructurado
   - Imágenes propias (Xavi las consigue)
   - Vídeo cuando exista
   - CTAs a propuesta
2. **Respetar confidencialidad** SpaceX / F1 → anonimizar como "Empresa de aerospace global" / "Equipo Fórmula 1".
3. **Cada caso linkea** a 2-3 páginas de servicios involucrados → cluster de internal linking.

**Owner:** Growth4U + Xavi (sourcing). **Esfuerzo:** ~30-40 h. **Métrica:** páginas indexadas + clics a /casos-de-exito/*.

### Sprint 4 — Pipeline de medición y GEO sistemático (continuo)
**Objetivo:** dejar de medir manualmente cada 3 meses.

1. **Dashboard mensual automatizado** (`scripts/seo-monthly-report.js`): GSC + GA + posiciones por keyword + benchmark.
2. **Tracker GEO**: script semanal que pregunta a ChatGPT/Claude/Perplexity las 10 queries Tier 1 y registra si EB aparece, en qué posición, junto a qué competidores. Histórico para ver mejora.
3. **UTMs en TODAS las campañas y backlinks pagados** (eventoplus, Confidencial si seguimos, futuras). Reporte mensual de atribución por canal.

**Owner:** Growth4U. **Esfuerzo:** ~12-15 h setup, luego automático. **Métrica:** existencia del reporte + uso por Xavi en monthly review.

---

## 6. KPIs y objetivos a 6 meses (revisión M6 del retainer)

Hipótesis: si el sprint 1+2 funciona, el techo razonable a 6 meses es:

| Métrica | Hoy | Objetivo M6 | Stretch |
|---|---|---|---|
| Impresiones/día | 2.593 | 4.000 | 5.500 |
| Clics/día | 22 | 60 | 90 |
| CTR | 0,85 % | 1,8 % | 2,5 % |
| Posición media | 21,8 | 15 | 10 |
| Top3 en "eventos barcelona" | no | sí | sí |
| Top3 en "agencia eventos barcelona" | no | sí | sí |
| Páginas indexadas con valor | ~80 | +20 (casos+artículos) | +35 |
| Recomendación IA | 22,5 % | 35 % | 45 % |
| Schema cubre todas las páginas top | no | sí | sí |
| Featured snippets capturados | 0 | 3 | 8 |

**Métrica de negocio final (la que importa a Xavi):**
- Leads cualificados/día: hoy <1, objetivo M6 = **2/día sostenidos** (lo que Xavi pidió como mínimo viable).

---

## 7. Riesgos y supuestos

- **Backlinks tóxicos de Rodanet**: hay que auditar y desavow antes de cualquier inversión en backlinks nuevos, o el ROI se contamina.
- **CTR mobile vs desktop**: el gap (1,09 % vs 0,75 %) sugiere que algunos titles/metas en desktop están perdiendo. Validar con A/B antes de cambiar wholesale.
- **WordPress / CDmon**: cualquier cambio de plantilla / schema requiere coordinación con quien tenga FTP. Verificado en abril que tenemos acceso suficiente.
- **Sortlist / directorios**: Sortlist aparece top-3 en EN. Compite contra "agencias específicas". Listar EB en Sortlist puede mover la aguja barato — pendiente decisión MPI/ICCA/Sortlist.

---

## Anexos

- CSV detallados en `/data/gsc-queries.csv`, `gsc-pages.csv`, `gsc-query-by-page.csv` (90 días).
- Documento base: [Eventos-Barcelona-Estrategia-SEO-GEO.md](../Eventos-Barcelona-Estrategia-SEO-GEO.md).
- Plan 8 meses comercial: [project_plan_8_meses_xavi](../README.md).

## Sources

- [Top events agency in Barcelona | CREA Group](https://www.creagroupevents.com/en/events-agency-barcelona)
- [Corporate Events in Barcelona | Tuset Eventos](https://tuseteventos.com/en/corporate-events-barcelona/)
- [Bacus Events — 30 years](https://bacusevents.com/agencia-eventos-barcelona/)
- [Empirance — Luxury corporate events](https://empirance.com/en/corporate-events-barcelona/)
- [Grupo RIC](https://gruporic.com/)
- [AGÉ Business Events](https://agebusinessevents.com/eventos-corporativos-barcelona/)
- [INNOV'events](https://innov-events.es/en/event-agency-barcelona/)
- [Sortlist Barcelona event marketing](https://www.sortlist.com/s/event-marketing/barcelona-es)
- [Sortlist Barcelona event companies](https://www.sortlist.com/i/event/barcelona-es)
