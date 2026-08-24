# Medición de performance GEO · Eventos Barcelona

Última actualización: 2026-08-24

## 1. Lo que Google lanzó (sí, es cierto)

El **3 de junio de 2026** Google lanzó en Search Console los **informes de rendimiento de IA generativa**
(`Rendimiento > Búsqueda > IA generativa`, y otro equivalente para Discover).

Qué trae:

| Aspecto | Estado |
|---|---|
| Métricas | **Solo impresiones.** Sin clics, sin CTR, sin posición media |
| Dimensiones | Páginas, países, dispositivos, fechas (hora / día / semana / mes) |
| Cobertura | AI Overviews + AI Mode (agregados, no separables entre sí) |
| Consultas | **No hay dimensión de query.** Ninguna |
| API | **No.** Ni Search Analytics API ni el export a BigQuery lo devuelven (verificado por API el 2026-08-24) |
| Rollout | Parcial. Empezó por un subconjunto de sitios (arrancó en UK) y se va ampliando |
| Relación con el informe normal | Los datos de IA generativa **ya estaban incluidos** dentro del tipo de búsqueda "Web". El informe nuevo los aísla, no añade tráfico |

Lo importante de la última fila: **AI Mode no es tráfico nuevo que no estuvieras viendo**, es una vista
segmentada de impresiones que ya contaban. No esperes que suban los totales.

Google ha dicho que irá añadiendo métricas según feedback. Hoy es una vista de visibilidad, no de rendimiento.

### Cómo comprobar si EB ya lo tiene

1. Entrar a Search Console con `dev@eventosbarcelona.com` → propiedad `https://www.eventosbarcelona.com/`
2. Menú lateral: **Rendimiento**. Si aparece una entrada **"IA generativa"** debajo de
   "Resultados de búsqueda", está activo.
3. Si no aparece: la propiedad todavía no entró en el rollout. No hay forma de solicitarlo, solo esperar.

Si está activo, copiar a mano cada quincena al campo `gsc_generative_ai` de `data/geo-report.json`
(impresiones totales + top páginas). No hay automatización posible mientras siga sin API.

## 2. Lo que sí podemos medir hoy por API (implementado)

`scripts/geo-report.js` es el medidor recurrente. Junta las tres capas medibles:

```bash
node scripts/geo-report.js 365    # últimos 12 meses (default)
node scripts/geo-report.js 90     # último trimestre
```

Salidas: `data/geo-report.json` + `data/geo-ai-landing-pages.csv`

Qué mide:

1. **GA4 · referrals de asistentes AI.** Sesiones que llegan desde `chatgpt.com`, `claude.ai`,
   `gemini.google.com`, `perplexity.ai`, `copilot.*` y compañía. Es la señal más honesta que existe:
   si un LLM te citó y el usuario hizo clic, aparece aquí. Tendencia mensual + landing pages + share.
2. **GA4 · leads atribuidos.** `generate_lead`, `contact_elementor`, `click_mail`, `click_telefono`
   cruzados contra el mismo filtro. Permite decir si el tráfico AI convierte mejor o peor que la media.
3. **GSC · denominador.** Impresiones y clics de Search para poner el volumen AI en contexto.
4. **Infra GEO.** Verifica en vivo que `robots.txt` sigue permitiendo GPTBot / ClaudeBot / PerplexityBot /
   Google-Extended / CCBot, que el `Content-Signal` está puesto y que `llms.txt` responde 200.
   Esto es el chequeo anti-regresión: un plugin o un WAF pueden tumbarlo sin avisar.

Para añadir un asistente nuevo: editar el array `AI_SOURCES` en [scripts/geo-report.js](../scripts/geo-report.js).

## 2b. Serie histórica (la parte que caduca)

`scripts/geo-timeline.js` mantiene `data/geo-timeline.json`, un archivo propio con un snapshot
mensual congelado. Existe porque **las fuentes caducan**:

| Fuente | Retención real medida | Consecuencia |
|---|---|---|
| Search Console | 16 meses rodantes | Los datos de EB empiezan en **abril 2025**, que es justo el borde. Ese mes desaparece en semanas |
| GA4 | Agregados disponibles hasta ene 2024 en esta property | Menos urgente, pero no garantizado |

Si no se congela, la historia se pierde y no hay forma de recuperarla.

```bash
node scripts/geo-timeline.js backfill   # reconstruye todo lo disponible (ya ejecutado: 32 meses)
node scripts/geo-timeline.js update     # refresca los últimos 3 meses (lo que corre en cada sprint)
node scripts/geo-timeline.js show       # imprime la serie sin tocar APIs
```

**Regla de integridad:** un mes ya guardado nunca se borra ni se sobrescribe con `null`. Solo se
actualiza si la API todavía lo devuelve con datos. Cuando GSC deje de servir abril 2025, el snapshot
sigue en el repositorio.

`geo-report.js` invoca `geo-timeline.js update` al terminar, así que la serie se alimenta sola.

Métricas congeladas por mes: sesiones totales, sesiones AI, share AI, sesiones ChatGPT, leads totales,
leads AI, share de leads AI, e impresiones / clics / CTR / posición de GSC.

## 2c. Dashboard público

**`propuestas.eventosbarcelona.com/metricas`** (rewrite en `vercel.json` → `dashboard-metricas.html`).

Tres hojas:

| Hoja | Contiene |
|---|---|
| **GEO** | ChatGPT como 3ª fuente, desglose por asistente, volumen mensual, conversión, landing pages, qué se mide y qué no, infraestructura |
| **SEO** | Impresiones / clics / CTR mes a mes, las tres causas de la caída de clics, top búsquedas con marca de "CTR anómalo", top páginas, ES vs EN |
| **Histórico** | Curva de share **mes a mes** (la métrica que manda), comparativa año contra año, y la serie mensual completa de los 32 meses |

**No se edita a mano.** Lo genera `scripts/build-dashboard-metricas.js` leyendo los dos JSON. Si un dato
no está en los JSON, no aparece en el dashboard.

```bash
node scripts/geo-report.js 365            # refresca datos + congela el mes en la serie
node scripts/build-dashboard-metricas.js  # regenera el HTML
```

El dashboard de sprints (`/xavi`) no duplica estas métricas: enlaza aquí desde su barra de pestañas.

Notas de implementación que costaron encontrarse, por si hay que tocar el generador:

- Las barras se escalan al **86%** del alto, no al 100%: el número va encima y necesita hueco.
- `Math.max(...valores, 1)` rompe cualquier serie en fracción (share, CTR): fuerza el máximo a 1 y aplana
  todas las barras. Usar `Math.max(...valores) || 1`.
- GA4 devuelve varios `sessionSource` por asistente (`perplexity.ai` y `perplexity`, `copilot.com` y
  `copilot.microsoft.com`). El generador los agrupa; si aparece un asistente nuevo, añadirlo al array
  `ASSISTANT` además de a `AI_SOURCES` de los otros dos scripts.

## 3. Baseline EB · 12 meses (2025-08-24 → 2026-08-23)

| Métrica | Valor |
|---|---|
| Sesiones totales | 12.058 |
| Sesiones desde asistentes AI | **859 (7,12%)** |
| ChatGPT | 785 sesiones, 625 usuarios |
| Claude / Gemini / Perplexity / Copilot | 26 / 22 / 16 / 8 |
| Pico mensual | feb 2026 (108 sesiones) |
| Últimos 3 meses | jun 39 · jul 60 · ago 32 (mes parcial) |
| Impresiones GSC (web) | 838.011 · 6.413 clics · CTR 0,77% |

**Titular:** ChatGPT es la **tercera fuente de tráfico** de eventosbarcelona.com, por delante de Bing
(249 sesiones), Instagram y todo el social junto.

**Segundo titular:** el tráfico AI **sobre-indexa en conversión**. Con un 7,12% de las sesiones genera
entre el 9,5% y el 13,7% de los eventos de lead según el evento. Es tráfico de mayor intención que la media.

**Tercer titular (corregido con la serie histórica):** en **share** el canal AI crece de forma sostenida,
de 0,7% del tráfico en Q3 2024 a **9,9% en Q3 2026**, trimestre a trimestre sin retrocesos. La lectura
inicial de "tendencia plana" venía de mirar sesiones absolutas sin normalizar por la caída del tráfico
total del sitio. Julio 2025 vs julio 2026: sesiones AI +130,8%, share del 3,49% al 10,47%.

**Dónde aterriza:** mayoritariamente en **inglés** (`/en`, `/en/dance`, `/en/stage-rental`,
`/en/audiovisual-equipment-rental`, `/en/artists/*`). Coherente con el ICP MICE internacional.
Refuerza la regla de bilingüe obligatorio.

## 4. Límites conocidos (decirlos antes de que los pregunten)

- **Los asistentes con navegación desactivada no dejan rastro.** Si ChatGPT responde de memoria sin
  citar, el usuario llega como `(direct)`. Todo lo medible es un suelo, nunca el número real.
- **`(not set)` en landing page** (91 sesiones) es tráfico AI que GA4 no pudo atribuir a una URL.
- **Google anonimiza queries raras.** Aunque llegue la dimensión de query al informe de GSC, buena parte
  del volumen quedará en el pool anónimo.
- **AI Overviews sin clic no es medible por GA4.** Solo el informe de GSC lo ve, y solo como impresión.
  Esa es exactamente la brecha que el informe nuevo viene a tapar.
- **Logs de servidor.** Contar hits de GPTBot / ClaudeBot / PerplexityBot en el access log daría la capa
  de crawling (¿nos están leyendo?). CDmon plan Junior no da SSH, así que queda fuera por ahora.

## 5. Cadencia propuesta

- **Quincenal**, junto con la actualización del dashboard de Xavi: correr `geo-report.js 90`
  (que ya alimenta la serie histórica), volcar el delta al dashboard.
- **Mensual**: correr `geo-report.js 365`, revisar tendencia y confirmar que la infra GEO sigue en pie.
- **Cuando GSC active el informe**: añadir impresiones de IA generativa al JSON y al dashboard.
