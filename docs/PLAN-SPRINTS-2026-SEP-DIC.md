# Plan de sprints · Eventos Barcelona · septiembre a diciembre 2026
### Cómo frenar la caída, cobrar lo sembrado, y no volver a improvisar

> Sucesor operativo de `PLAN-KEYWORDS-2026-10.md`. Aquí el plan se organiza
> por sprints con métricas, umbrales de decisión y regla numérica de alarma.
> Escrito 31 agosto 2026 · vigente 1 sep – 21 dic 2026.

---

## 0. Contexto vital · qué sabemos hoy

**Salud del dominio** (baseline al que volvemos si algo va mal):

| Métrica | Abril-junio | Julio-agosto | Delta |
|---|---:|---:|---:|
| **Posición media ponderada** | 25,48 | **29,56** | −4,08 puestos |
| Keywords que suben 1+ puesto | | 424 (28,7%) | |
| Keywords que bajan 1+ puesto | | **847 (57,3%)** | |
| Volumen en keywords que bajan | | **60,9%** | |
| Páginas con impresiones y 0 clics | | **182 / 295** | 62% |
| Cluster comercial (5 kw · imp / clics) | | 8.407 / 10 | |
| AI bot traffic (90 días) | | 6.952 crawls | Bing 3.215 · ChatGPT 2.161 · Claude 552 · Perplexity 192 |
| Clics desde ChatGPT | | **50 · CTR 5,32%** | 15× Google |

**Lo que hemos hecho ya** (sprint agosto + decisiones 31 ago):

- Landing `/agencia-de-eventos-barcelona/` publicada ES + EN
- 11 backlinks entrantes a la agencia + 12 landings cross-cluster
- 4 URLs CTR fix (rumba, ideas originales, entrega premios, burlesque)
- 2 canibalización 301 (`/eventos-empresa/`, `/agencia-eventos-corp-profesional/`)
- 10 landings temáticas nuevas ES + EN (LED, iluminación, videowall, escenografía, venues, música hub, DJ, cantante, violinista, bandas, pompas, cantante)
- Landing EN bailarines flamenco → **pirámide 12/12 cerrada**
- Snippet `EB-AI-ATTRIBUTION` disparando GA4 event `ai_referral` desde 29 ago
- Snapshot `data/seo-snapshot-20260828.json` congelado

**Las 5 decisiones tomadas 31 ago** (memoria útil para el resto del plan):

1. ❌ DataForSEO — trabajar solo con GSC
2. ✅ Canonical `/artistas-y-espectaculos/` (aplicación técnica Yoast metabox pendiente Phil)
3. ✅ Landing EN flamenco publicada
4. ✅ Tarea testimonios creada para Xavi (Alta · deadline 15 sept)
5. ❌ Autor bio Xavi por ahora

---

## 1. La regla que ordena todo

**No podemos caer más.** La posición media ponderada 29,56 es el techo. Si baja de ahí, todo el plan se pausa para diagnóstico.

Traducido a gates de decisión con fecha y condición dura:

| Gate | Fecha | Condición de alarma | Acción si suena |
|---|---|---|---|
| **G1** | 12 oct · cierre S3 | Cero kw del cluster comercial suben > 1 puesto | Pausar S4 · Auditoría técnica profunda (hosting, Core Web Vitals, canibalización residual) · Confirmar si hubo patch de core update |
| **G2** | 23 oct · cierre ventana | 5 kw cluster comercial siguen en pos > 10 | Pivot inmediato a **Frente E** ampliado (E-E-A-T + calidad) · No lanzar Frente D · Revisión estrategia con Xavi |
| **G3** | 9 nov · cierre S5 | Posición media ponderada > 30 | Alarma roja · Auditoría E-E-A-T completa · Reconsiderar activar DataForSEO |
| **G4** | 21 dic · cierre año | Media ponderada > 28 (no volvimos al pre-core update) | Plan Q1 2027 se reescribe desde cero con auditoría profunda |

---

## 2. Los ocho sprints · septiembre a diciembre

Sprints de 2 semanas. Definition of Done al final de cada uno. Cada tarea entra a Notion con owner, deadline y criterio de terminado.

---

### Sprint 1 · 1 – 14 septiembre · Cerrar pendientes de agosto

**Objetivo**: rematar el 15% de agosto que quedó sin cerrar. No añadir scope.

| Tarea | Owner | Terminado cuando |
|---|---|---|
| Testimonios de 3 clientes reales (nombre + logo + frase) | Xavi | Home + landing agencia muestran 3 testimonios en producción |
| Aplicar canonical `/musica/`, `/artistas/`, `/espectaculos/` → `/artistas-y-espectaculos/` desde Yoast metabox | Phil | HTML de las 3 páginas muestra `<link rel="canonical" href="…/artistas-y-espectaculos/">` |
| Reescritura profunda 3 posts pre-2023 top-tráfico | Phil | Posts 12521, 12507, 12518 con estructura H2/H3, FAQ schema, imagen intercalada, ≥ 900 palabras, ≥ 5 internal links |
| Diferenciación SEO de `/espectaculos/` (archive CPT) | Phil | Title + meta específicos que no colisionen con hubs hermanos |
| **Métrica semanal**: 5 kw cluster comercial | Phil | Snapshot 8 sep y 15 sep con delta vs 28 ago |

**Definition of Done**: los 3 testimonios en producción, canonical aplicado, 3 posts reescritos, snapshot 15 sep con delta committeado.

---

### Sprint 2 · 15 – 28 septiembre · Hubs pendientes

**Objetivo**: crear los 2 hubs que faltan del plan agosto para completar la arquitectura.

| Tarea | Owner | Terminado cuando |
|---|---|---|
| Landing hub `/produccion-tecnica-para-eventos/` reescrita | Phil | Union real de sonido + iluminación + LED + videowall + escenografía. > 1.500 palabras. 5 links a spokes. FAQ + CTA |
| Landing hub `/eventos-mice-barcelona/` nueva ES + EN | Phil | Union real de convenciones + galas + venues + escenografía. WPML linked. ≥ 1.500 palabras |
| Cross-linking spokes → 2 hubs nuevos | Phil | Cada spoke temático apunta al hub nuevo. Bloque «También te puede interesar» actualizado |
| FAQ schema en 8 posts B5-B12 | Phil | JSON-LD FAQPage en cada post. Verificable en Rich Results Test |
| **Métrica semanal**: 5 kw + attribution GA4 primeros datos | Phil | Snapshot 22 sep y 29 sep · GA4 event ai_referral con ≥ 10 sesiones |

**Definition of Done**: 2 hubs en producción · FAQ schema · attribution IA con datos reales · snapshot 29 sep.

---

### Sprint 3 · 29 septiembre – 12 octubre · GEO / AEO ofensivo

**Objetivo**: aprovechar que ChatGPT ya nos manda tráfico convertible (5,32% CTR) para captar más. Este es el sprint que activa la ventaja competitiva GEO.

| Tarea | Owner | Terminado cuando |
|---|---|---|
| 5 posts optimizados para AI Overviews | Phil | Cada post responde una pregunta explícita en H2 con respuesta de 40-60 palabras en el primer párrafo del bloque |
| Answer boxes en 10 landings principales | Phil | Bloque «Resumen» de 60 palabras al inicio de cada landing, citable como snippet |
| `llms.txt` refresh mensual automatizado | Phil | Cron o mu-plugin regenera semanal desde el sitemap |
| Monitorear GA4 `ai_referral` continuo | Phil + Xavi | Dashboard con sesiones por `ai_source` (chatgpt · perplexity · claude · gemini · copilot) |
| **G1 · cierre S3 · 12 oct** | | Revisar 5 kw cluster comercial · condición roja: cero suben > 1 puesto |

**Definition of Done**: G1 pasado · snapshot 13 oct · answer boxes en producción.

---

### Sprint 4 · 13 – 26 octubre · Ventana crítica cierre

**Objetivo**: interpretar los datos de la ventana 25 sep – 23 oct. Es el primer momento honesto para saber si la estrategia funcionó.

| Tarea | Owner | Terminado cuando |
|---|---|---|
| Recopilar snapshot 20 oct · comparar con 28 ago | Phil | data/seo-snapshot-20261020.json committeado con análisis de delta |
| Publicar report HTML con hallazgos ventana | Phil | Artifact con las 5 kw cluster comercial + delta + hipótesis explicativas |
| **G2 · 23 oct · gate crítico** | | Condición: 5 kw cluster comercial en pos ≤ 10 |
| Decisión bifurcación S5 | Xavi + Ramiro + Phil | Documentado en Notion: seguir Frente D (SÍ tracción) o pivot Frente E (NO tracción) |
| Refresh mensual llms.txt automático | Phil | Segunda iteración estable |

**Definition of Done**: report ventana publicado · decisión S5 tomada · snapshot 26 oct.

---

### Sprint 5 · 27 octubre – 9 noviembre · Long-tail O pivot

**Objetivo depende del G2**:

**Si G2 verde (cluster comercial en pos ≤ 10)** → Frente D:

| Tarea | Owner |
|---|---|
| Landing `agencia MICE internacional Barcelona` | Phil |
| Landing `producción evento corporativo boutique` | Phil |
| Landing `agencia eventos hibrídos` | Phil |
| Landing `wedding planner corporate Barcelona` | Phil |

**Si G2 rojo** → Pivot Frente E ampliado:

| Tarea | Owner |
|---|---|
| Reescritura profunda 5 páginas viejas más | Phil |
| Auditoría hosting + Core Web Vitals | Phil |
| Reforzar tono de las 12 landings sprint 4/5 (recomendación Xavi) | Phil + Xavi |
| Contactar 3 medios MICE para menciones | Ramiro |

**G3 · 9 nov · Media ponderada > 30 → alarma roja** · reconsiderar DataForSEO.

**Definition of Done**: G3 pasado · snapshot 9 nov.

---

### Sprint 6 · 10 – 23 noviembre · Contenido de autoridad

**Objetivo**: acumular señales E-E-A-T que sobreviven al próximo core update. Este sprint es preventivo, no reactivo.

| Tarea | Owner | Terminado cuando |
|---|---|---|
| 3 casos reales publicados con métricas | Xavi + Phil | Post por caso con: cliente, evento, pax, artistas, feedback textual, foto autorizada |
| Serie de guías comparativas | Phil | 3 guías: `DMC vs agencia`, `in-house vs freelance`, `producción integrada vs subcontratada` |
| Backlink push · outreach a 5 medios MICE | Ramiro | 5 emails enviados con placement propuesto |
| Refresh estacional pre-diciembre | Phil | Copy actualizado en landing agencia + gala dinners con temporada alta (fiestas empresa nov-dic) |
| **Métrica quincenal** | Phil | Snapshot 23 nov |

**Definition of Done**: 3 casos publicados · 3 guías publicadas · 5 outreach enviados · snapshot 23 nov.

---

### Sprint 7 · 24 noviembre – 7 diciembre · Consolidación técnica

**Objetivo**: cerrar los gaps técnicos y de accesibilidad que se acumularon.

| Tarea | Owner | Terminado cuando |
|---|---|---|
| Auditoría Core Web Vitals + Lighthouse | Phil | Report con LCP, CLS, INP por página tipo. Fix de los 5 issues más graves |
| Fix accesibilidad WCAG AA | Phil | Contrast ratio, alt texts, aria labels revisados en las 22 landings publicadas |
| Snapshot noviembre + diff vs agosto | Phil | data/seo-snapshot-20261130.json + análisis 3 meses |
| Report mensual sprint 4-7 | Phil | Artifact HTML publicado |
| Comunicación resultados 3 meses a Xavi + Ramiro | Phil | Call de 45 min con hallazgos |

**Definition of Done**: report 3 meses publicado · call con Xavi realizada.

---

### Sprint 8 · 8 – 21 diciembre · Cierre año + plan Q1 2027

**Objetivo**: cerrar el año y preparar la siguiente iteración con las lecciones aprendidas.

| Tarea | Owner | Terminado cuando |
|---|---|---|
| **G4 · 21 dic · Media ponderada > 28 → plan Q1 se reescribe desde cero** | | |
| Escribir `PLAN-SPRINTS-2027-Q1.md` | Phil + Ramiro | Doc con 6 sprints, métricas y gates |
| Backup snapshot cierre año | Phil | data/seo-snapshot-20261221.json |
| Doc de resultados año 2026 | Phil | HTML artifact con delta vs abril-junio (baseline pre-core update) |
| Comunicación resultados año a Xavi | Phil + Ramiro | Reunión de fin de año |
| Fecha de arranque Q1 2027 | Xavi + Ramiro + Phil | Confirmada |

**Definition of Done**: G4 evaluado · plan Q1 escrito · comunicación completada.

---

## 3. Medición · cómo NO improvisar

### Cadencia de snapshots

| Frecuencia | Qué | Dónde |
|---|---|---|
| **Semanal** (lunes) | 5 kw cluster comercial · posición individual | `data/seo-keywords-tracker.json` + dashboard-metricas |
| **Semanal** (lunes) | AI bot traffic + GA4 `ai_referral` | Cuaderno SEO auto-refresh |
| **Quincenal** (viernes de cierre sprint) | Delta vs sprint anterior por métrica | Report HTML sprint |
| **Mensual** (día 1) | Snapshot completo cluster + posiciones + páginas 0 clics | `data/seo-snapshot-YYYYMMDD.json` + artifact |
| **Al cierre sprint** | Sprint report con Definition of Done | Cuaderno SEO nueva versión |

### KPIs primarios · los cinco que ordenan todo

| # | KPI | Baseline hoy (31 ago) | Objetivo 23 oct | Objetivo 21 dic |
|---|---|---:|---:|---:|
| 1 | Posición media ponderada del cluster comercial (5 kw) | 14,0 media | ≤ 10 | ≤ 8 |
| 2 | Impresiones totales GSC / mes | ~78k | +15% | +30% |
| 3 | Clics del cluster comercial / mes | 10 | ≥ 30 | ≥ 80 |
| 4 | Sesiones `ai_referral` GA4 / mes | 0 | ≥ 20 | ≥ 100 |
| 5 | Páginas con 0 clics | 182 / 295 | ≤ 170 | ≤ 150 |

Cualquier delta que se salga del rango objetivo entre snapshot y snapshot activa una revisión antes del gate siguiente.

### KPIs secundarios · seguimiento sin gate

- Ranking individual de las 62 kw cluster comercial
- Bot visits crecimiento por engine (Bing, ChatGPT, Claude, Perplexity, Gemini, Amazonbot, Llama)
- Rich results captured (FAQ, HowTo, Article)
- Backlinks nuevos apuntando a EB (via GSC · Links)
- Menciones de marca en LLMs (via ChatGPT / Perplexity / Claude search manual mensual)

### Herramientas activas

| Herramienta | Uso |
|---|---|
| Google Search Console | Fuente única de posiciones · export mensual |
| GA4 (`G-Q2J5EP9VDS`) | Eventos `ai_referral` con dimensión `ai_source` |
| LLMagnet (MCP) | Bot traffic + visibility score |
| Yoast SEO | Meta description, focus keyphrase, canonical (metabox manual) |
| Redirection plugin | 301s de canibalización |
| Snapshot JSON (`data/`) | Congelado semanal + mensual |
| Cuaderno SEO artifact | Report visible para Xavi + Ramiro |

### Definition of Done · aplicable a cada sprint

1. Todas las tareas del sprint marcadas Done o Deferido con justificación en Notion
2. Snapshot committeado con delta vs sprint anterior
3. Report HTML publicado como artifact (versión del cuaderno SEO)
4. Notion sincronizado (owner, stage, detalle actualizado)
5. Si hay gate al cierre del sprint, evaluado y documentado

### Los cuatro gates de decisión · repetido

Cada gate tiene fecha, condición roja y acción si suena. Ninguna decisión se toma fuera de un gate: eso es lo que evita improvisar.

- **G1 · 12 oct** · cluster comercial no se mueve → auditoría técnica profunda
- **G2 · 23 oct** · cluster comercial pos > 10 → pivot Frente E, no lanzar D
- **G3 · 9 nov** · media ponderada > 30 → reconsiderar DataForSEO
- **G4 · 21 dic** · media ponderada > 28 → plan Q1 se reescribe

---

## 4. Qué dejar de hacer (repetido del plan oct-nov)

1. **No publicar contenido nuevo entre S1 y S4 fuera del plan.** Es exactamente el error que nos hizo publicar 43 páginas para 8 clics durante el retainer.
2. **No añadir keywords al scope sin evidencia GSC.** Sin herramienta externa, el único criterio es demanda ya medida.
3. **No pivotar antes de un gate.** Si algo no funciona a día 10 del sprint, se espera al cierre del sprint para decidir.
4. **No mover métricas ni objetivos** durante el trimestre. Los baselines son los del snapshot 28 ago y del snapshot 20 oct.
5. **No prometer a Xavi resultados que no controlamos.** Las posiciones son Google, no nosotros. Comprometemos ejecución, no ranking.

---

## 5. Riesgos identificados · monitoreo activo

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Otro core update en Q4 (oct-nov histórico) | Alta | Alta | Monitorear google.com/search/updates semanal. Sprint 6 refuerza E-E-A-T preventivo |
| LLM traffic no convierte pese al crecimiento | Alta | Media | GA4 `ai_referral` confirma. Si en G3 sesiones IA < 20/mes → revisar snippet + endpoint |
| Xavi no entrega testimonios en S1 | Media | Alta | Plan B activo desde 15 sept: 3 testimonios de LinkedIn público de clientes ya visibles |
| Canibalización residual tras canonical S1 | Media | Media | Snapshot semanal detecta si otras kw canibalizan. Redirection plugin listo para 301 rápido |
| Testimonios fake / logotipos sin permiso | Baja | Crítica | Xavi valida por escrito antes de publicar cada uno |

---

## 6. Ownership · quién hace qué

| Responsabilidad | Owner primario |
|---|---|
| Ejecución técnica (código, WP, Notion, snapshots) | Phil |
| Contenido nuevo (redacción, casos, guías) | Phil |
| Testimonios reales + validación cliente | Xavi |
| Casos publicados con métricas | Xavi + Phil |
| Outreach a medios MICE (Sprint 6) | Ramiro |
| Reuniones cierre sprint / cierre año | Phil convoca · Xavi + Ramiro asisten |
| Decisiones estratégicas en gates | Xavi + Ramiro + Phil |

---

## 7. Lo que este plan sí puede responder

- ✅ **Cuándo saber si funciona**: 25 sep – 23 oct para primer read, 21 dic para read final
- ✅ **Qué hacer si no funciona**: cada gate tiene acción documentada
- ✅ **Cuánto contenido nuevo**: cero entre S1 y S4, condicionado en S5, controlado en S6
- ✅ **Cuánto invertir en E-E-A-T vs contenido**: 40% E-E-A-T + 60% contenido en S1-S3, se recalibra en G2

## 8. Lo que este plan NO puede responder todavía

- ⚠️ **Si la caída se revierte antes de dic**: depende de Google, no de nosotros. La probabilidad realista es que la mitad del gap se cierre (media ponderada de 29,56 a ~27) y el resto se recupere durante Q1 2027.
- ⚠️ **Si un patch de core update cambia las reglas** en octubre-noviembre: se replantea todo con auditoría específica.
- ⚠️ **Si el LLM traffic pico se estabiliza o sigue creciendo**: G3 lo dice.

---

**Cierre**: este plan no promete rankings. Compromete ejecución, mide con rigor, y decide en gates. Si algo del plan se demuestra mal, se ve en una tabla y se corrige. Sin drama.

Baseline al que volvemos si algo va rojo: **media ponderada 29,56 · cluster comercial 8.407 imp / 10 clics · 182 páginas 0 clics**.
