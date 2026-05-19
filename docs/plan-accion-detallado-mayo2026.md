# Plan de acción detallado — mayo 2026

**Fecha:** 2026-05-19
**Objetivo de negocio:** 2 leads cualificados/día sostenidos a 6 meses.
**Estado actual:** ~1 lead/día (mix de canales), ~22 clics orgánicos/día.
**Hipótesis:** la mayor parte del gap se cierra con SEO (CTR + posición + nuevos artículos).

---

## 1. Modelo de conversión (supuesto base)

Necesitamos un ratio **clics orgánicos → leads** para poder estimar el lift de cada acción.

**Cálculo:**
- GSC 90d: 1.979 clics orgánicos → ~8.030 clics/año.
- GA 365d: 524 eventos de intención (contact + click_mail + click_tel) sobre 12.280 sesiones → 4,3 %.
- Asumiendo que ~40 % de las sesiones vienen de orgánico (resto: directo, referral, retargeting): orgánico aporta ~210 eventos de intención/año.
- Sobre 8.030 clics → **1 lead por cada ~38 clics** (~2,6 %).

**Hipótesis de trabajo conservadora:** *1 lead cualificado por cada 30 clics orgánicos (3,3 %).*

Esta tasa hay que **validar con GHL en julio** (cruzando contactos con `origen:web-elementor`/`origen_form` vs sesiones orgánicas de GA). Si la realidad es 1/20, todos los números siguientes son sub-estimación.

---

## 2. Sprint 1 — Mejorar 10 páginas existentes (semana 1-2)

**Foco:** páginas con muchas impresiones y CTR muy debajo del benchmark de su posición. Solo título + meta + schema + bloques FAQ — sin tocar contenido troncal.

**Esfuerzo:** ~12-15 h. **Plazo de impacto medible:** 3-4 semanas.

| # | URL | Impr/90d | CTR hoy | Pos | Acción concreta | CTR target | Lift clics/90d | Lift leads/qtr |
|---|---|---:|---:|---:|---|---:|---:|---:|
| 1 | `/` | 76.121 | 0,78 % | 17,6 | Title "Agencia eventos corporativos Barcelona \| 15 años, 300+ shows" + meta con CTA + FAQ schema (8 Q&A) + Service schema | 1,5 % | +548 | +18 |
| 2 | `/alquiler-iluminacion/` | 15.601 | 0,15 % | 31,1 | Title con specs ("Alquiler iluminación eventos Barcelona \| Pars LED, Lyres, focos") + tabla equipos + FAQ + meta con precio desde | 0,8 % | +101 | +3 |
| 3 | `/grupos-musica/` | 15.250 | 0,37 % | 24,0 | Title con categorías + meta con "Grupos jazz, flamenco, pop, DJ" + grid clickeable + FAQ | 1,2 % | +130 | +4 |
| 4 | `/musica/dj-barcelona/` | 10.089 | 0,14 % | 32,4 | Title "DJ profesional Barcelona eventos corporativos" + perfiles con video + FAQ "cuánto cuesta un DJ en BCN" | 0,7 % | +57 | +2 |
| 5 | `/15-excelentes-alternativas-...corporativos/` | 7.582 | 1,98 % | 9,1 | Actualizar a "Edición 2026" + ToC + bloques internal linking a /artistas/ + reclamar featured snippet con Q&A intro | 2,8 % | +61 | +2 |
| 6 | `/eventos-mice-que-es/` | 6.823 | 0,37 % | 24,4 | Title "Eventos MICE qué son: guía 2026 + glosario" + ToC + internal linking a /eventos-empresa/ | 1,0 % | +43 | +1,5 |
| 7 | `/alquiler-escenarios/` | 6.362 | 0,44 % | 32,2 | Title con dimensiones + tabla por capacidad + FAQ "cuánto cuesta alquilar un escenario" | 1,2 % | +49 | +1,5 |
| 8 | `/espectaculos/` | 5.652 | 0,30 % | 39,2 | Reescritura completa: hub con 4 categorías clickeables + FAQ + Service schema | 1,0 % | +39 | +1 |
| 9 | `/en/` | 5.354 | 1,87 % | 13,7 | Title "Corporate event agency Barcelona — 15 yrs, 1.000+ events" + FAQ EN + LocalBusiness EN-aware | 2,8 % | +50 | +2 |
| 10 | `/artistas/` | 4.311 | 0,65 % | 29,7 | Title con número ("500+ artistas Barcelona") + filtro por categoría visible + FAQ | 1,5 % | +37 | +1 |
| **Total Sprint 1** | | **153.145** | | | | | **+1.115** | **+36** |

**Resultado esperado Sprint 1:** ~+12 clics/día sostenidos = **~12 leads/mes extra al M3**.

---

## 3. Sprint 2 — Atacar top3 en 5 keywords (semana 3-6)

**Foco:** mover posiciones, no CTR. Mismas páginas del Sprint 1 (principalmente `/`), trabajadas con internal linking + backlinks + contenido troncal.

**Esfuerzo:** ~25-30 h. **Plazo:** 2-4 meses para ver efecto completo.

| # | Keyword | Pos hoy | Impr/90d | CTR hoy | Si top3 (CTR 25 %) | Lift clics/90d | Lift leads/qtr |
|---|---|---:|---:|---:|---:|---:|---:|
| 1 | eventos barcelona | 6,8 | 6.097 | 4,7 % | 25 % | +1.236 | +41 |
| 2 | agencia de eventos barcelona | 6,2 | 1.730 | 0,5 % | 25 % | +424 | +14 |
| 3 | agencia eventos barcelona | 4,7 | 1.280 | 1,5 % | 25 % | +301 | +10 |
| 4 | empresa de eventos barcelona | 7,0 | 563 | 0,7 % | 25 % | +137 | +4,5 |
| 5 | event agency barcelona (EN) | 7,7 | 655 | 0,6 % | 25 % | +160 | +5 |
| **Total si TODO se logra** | | | | | | **+2.258** | **+75** |
| **Realista 60 % achievement** | | | | | | **+1.355** | **+45** |

**Acciones requeridas para Sprint 2:**
- **Auditar backlinks de Rodanet** (kimonos, sitios irrelevantes) y disavow toxicidad confirmada. Sin esto, los esfuerzos de link building se contaminan.
- **2-3 backlinks editoriales** en medios sectoriales (eventoplus.com — ya pagamos 1.000 EUR/año; barcelonaconventionbureau.com; revistas MICE).
- **Internal linking sistemático**: 15-20 páginas de servicios apuntando a `/` con anchor variado ("agencia eventos Barcelona", "agencia de eventos corporativos", etc.).
- **EventoPlus**: confirmar que cada show publicado linkea a la home con anchor optimizado (hoy no sabemos).

**Resultado esperado Sprint 2 realista:** ~+15 clics/día sostenidos = **~15 leads/mes extra al M5**.

---

## 4. Sprint 3 — Crear 8 artículos nuevos (semana 5-10)

**Foco:** cubrir keywords donde EB no aparece. Cada artículo apunta a un keyword Tier 1 con volumen real.

**Esfuerzo:** 3-4 h por artículo investigación + redacción + schema + imágenes = **~30-35 h total**. Plus el hub de casos de éxito ~10 h aparte.

**Rampa:** los artículos tardan 3-6 meses en rankear. M3 = 30 % del lift, M6 = 75 %, M9 = 100 %.

| # | URL propuesta | Keyword principal | Volumen mensual estimado | Target pos | Tráfico mensual esperado al rankear | Leads/mes al rankear |
|---|---|---|---:|---:|---:|---:|
| 1 | `/casos-de-exito/` (hub + 15 cases) | "casos eventos corporativos barcelona" + LT | 200+ | 4-6 | 80 | 2,7 |
| 2 | `/como-organizar-evento-corporativo-barcelona/` | "como organizar evento corporativo barcelona" | 480 | 5-8 | 120 | 4 |
| 3 | `/team-building-barcelona-empresas/` | "team building barcelona empresas" | 720 | 6-10 | 100 | 3,3 |
| 4 | `/family-day-corporativo-barcelona/` | "family day corporativo" | 320 | 4-7 | 90 | 3 |
| 5 | `/entretenimiento-eventos-corporativos-barcelona/` | "entretenimiento eventos corporativos" | 590 | 5-8 | 120 | 4 |
| 6 | `/venues-eventos-corporativos-barcelona/` | "venues barcelona corporate events" | 410 | 6-10 | 70 | 2,3 |
| 7 | `/en/corporate-event-planner-barcelona/` | "corporate event planner Barcelona" | 320 (EN) | 5-9 | 60 | 2 |
| 8 | `/en/dmc-barcelona-corporate-events/` | "DMC Barcelona corporate events" | 260 (EN) | 6-10 | 50 | 1,7 |
| **Total al estado estable (M9-M12)** | | | **3.300+** | | **~690** | **~23** |
| **Total al M6 (75 % rampa)** | | | | | **~520** | **~17** |

**Resultado esperado Sprint 3 al M6:** ~+17 leads/mes extra, escalando a +23 leads/mes en M9.

---

## 5. Proyección cumulativa de leads

**Asumiendo:**
- Base orgánica actual: ~22 clics/día × 30 días / 30 = ~22 leads/mes orgánicos
- Otros canales (directo, referral, outbound): +8 leads/mes
- **Total base: ~30 leads/mes ≈ 1 lead/día**

| Hito | S1 lift | S2 lift | S3 lift | Total leads/mes | Leads/día |
|---|---:|---:|---:|---:|---:|
| Hoy | — | — | — | 30 | 1,0 |
| M3 (julio) | +10 | +5 | +2 | 47 | 1,6 |
| M6 (octubre) | +12 | +15 | +17 | 74 | **2,5** ✓ |
| M9 (enero 27) | +12 | +18 | +23 | 83 | 2,8 |

**A M6 superamos el objetivo de 2/día.** Stretch (3/día) realista en M9-M12.

---

## 6. Lo que NO está en esta proyección (upside)

Toda esta planificación es **solo SEO orgánico**. No incluye:

- **GEO/IA**: si subimos la tasa de recomendación de 22,5 % → 40 %, los LLMs derivan tráfico cualificado que no se cuenta en GSC. Difícil de medir pero real.
- **Outbound + partnerships**: el plan del retainer incluye outbound a event planners + MPI/ICCA/Sortlist. Mínimo +5-10 leads/mes en M6 si Xavi acepta esos pilares.
- **Casos de éxito como upsell**: cada caso publicado puede ser compartido en LinkedIn → trafico social que multiplica el SEO.
- **CTR mobile mejor que desktop**: si optimizamos mobile-first (mobile CTR 1,09 % vs desktop 0,75 %), hay ~30 % de upside extra solo por arreglar la experiencia móvil.

---

## 7. Riesgos y supuestos a validar

1. **Conversión 1 lead/30 clics** es un supuesto. **Validar con GHL en julio** cruzando contactos `origen_form`/`origen:web-elementor` vs sesiones orgánicas de GA. Si la realidad es 1/20, todos los números suben 50 %.
2. **Sprint 2 al 60 % de achievement**: mover posiciones depende de competencia y backlinks. Conservador. Realista podría ser 40-80 %.
3. **Sprint 3 rampa**: Google puede tardar 6 meses en rankear contenido nuevo en queries competitivas. Si tarda más, M6 cae al rango 1,8-2 leads/día.
4. **Backlinks tóxicos Rodanet**: si no se limpian primero, los esfuerzos de Sprint 2 se contaminan. **Auditoría primero, link building después.**

---

## 8. Lista priorizada para arrancar la semana que viene

Si tuviéramos que arrancar el lunes con 4 horas:

1. **Hora 1-2**: reescribir title + meta de `/` (la home). Es el 38 % del tráfico total. Subir el CTR de la home de 0,78 % → 1,5 % = +500 clics/90d = **+17 leads/quarter solo de esa página**.
2. **Hora 3**: añadir FAQ schema a `/` con 8 Q&A (precio típico, plazos, sectores, internacional, etc.).
3. **Hora 4**: title + meta de `/alquiler-iluminacion/` (15.601 impresiones desaprovechadas).

Resultado de esas 4 horas medible en GSC en 2-3 semanas.

