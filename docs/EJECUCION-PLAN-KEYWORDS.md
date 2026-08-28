# Plan de ejecución · cluster comercial

**Preparado el viernes 28 agosto 2026.** Para ejecutar de forma intensiva sin interrumpir el Sprint 5,
que sigue su curso hasta el 9 de septiembre.

Base: [PLAN-KEYWORDS-2026-09.md](PLAN-KEYWORDS-2026-09.md). Aquí no se repite el diagnóstico, solo
se convierte en tareas con criterio de terminado.

---

## Antes de empezar: tres decisiones que te tocan a ti

Sin estas respuestas, la ejecución se queda a medias en los bloques 2 y 3.

| # | Decisión | Por qué bloquea | Por defecto si no dices nada |
|---|---|---|---|
| D1 | ¿Puedo tocar title y meta description de páginas **ya publicadas**? | Es el bloque 2 entero. Toca producción, aunque no cambia URLs ni contenido | **No lo toco.** Dejo los textos propuestos en un documento para que los apliques tú |
| D2 | ¿Qué hacemos con `/eventos-empresa/`? Es un post de 2019, posición 54, cero clics, y desvía 2.931 impresiones en 36 keywords | Sin resolverlo, la landing nueva nace compitiendo contra él | **Propuesta, no ejecución.** Dejo el 301 documentado para que lo apliques |
| D3 | ¿La landing nueva se publica este fin de semana o queda en borrador para revisión? | Cambia si el bloque 1 termina en "listo para publicar" o en "publicado" | **Borrador.** Mis permisos en WordPress no publican, es intencionado |

Nada de lo que hago es irreversible por mi cuenta: la ability de WordPress que uso crea borradores y
nunca publica. Publicar, redirigir y borrar requieren tu mano.

---

## Bloque 0 · Censo de contenido · 1 h

Sin tocar el sitio. Es la base de los bloques 3 y 4.

| Tarea | Produce | Terminado cuando |
|---|---|---|
| 0.1 Cruzar las 295 páginas con impresiones contra su fecha de publicación y su rendimiento | `data/censo-contenido.json` | Cada URL tiene año, impresiones, clics, posición y a qué cluster pertenece |
| 0.2 Mapa completo de canibalización: qué URL compite con cuál y por qué keyword | Tabla en el censo | Las 983 keywords con 2+ URLs tienen asignada una URL ganadora y una perdedora |
| 0.3 Veredicto por página: mantener / mejorar / consolidar / podar | Columna `veredicto` | Las 295 tienen veredicto con su motivo |

**Nota técnica:** la REST API de WordPress responde lenta y el sitemap está devolviendo timeout
(probablemente el WAF de CDmon). Si sigue caído, el censo se hace solo con datos de Search Console,
sin fecha de publicación, y las fechas se rellenan después.

---

## Bloque 1 · La landing comercial · 4 a 5 h

El núcleo. Objetivo: que exista la página que hoy no existe y que Google pueda darle la primera
página al cluster comercial en vez de dársela a la home.

**Keywords objetivo** (38 keywords, 23.845 impresiones, 27 clics hoy):

Principales: `agencia de eventos` (2.665 imp, pos 16,1) · `agencia de eventos corporativos` (2.019,
15,4) · `eventos corporativos barcelona` (1.549, 14,8) · `agencia de eventos barcelona` (1.146, 12,2) ·
`agencia eventos` (1.028, 12,5) · `agencias de eventos barcelona` (996, 13,5)

| Tarea | Produce | Terminado cuando |
|---|---|---|
| 1.1 Brief de la página: intención, estructura, qué la diferencia de la home | Sección en este doc | Cada bloque de la página tiene su función escrita |
| 1.2 Copy ES completo | Draft en WordPress | Texto listo, sin relleno, con propuesta de valor real y CTA |
| 1.3 Maquetación Elementor clonando una página que ya funcione | Draft renderizando bien | `eb/render-elementor` devuelve HTML con CSS |
| 1.4 SEO: title, meta description, slug `/agencia-de-eventos-barcelona/` | Yoast configurado | Focus keyphrase asignada, title 50-60, meta 150-160 |
| 1.5 Versión EN y enlace WPML como traducción | Draft EN vinculado | Mismo grupo de traducción, `/en/...` |
| 1.6 Plan de enlazado interno: desde dónde debe recibir enlaces | Lista de URLs a editar | Mínimo 8 enlaces internos identificados, con el texto ancla propuesto |

**Lo que hace que esta página no sea una más:** la landing DMC del Sprint 2 tiene **un solo enlace
interno** y está en posición 37. Una página sin enlaces internos no compite. El punto 1.6 no es
opcional, es la mitad del trabajo.

**Lo que no puedo hacer:** publicarla ni aplicar los enlaces internos sobre páginas publicadas
(requiere D1). Queda todo listo y documentado.

---

## Bloque 2 · Las 9 que ya están en página 1 y no reciben clic · 2 h

**Bloqueado por D1.** 3.906 impresiones, **2 clics**. Es el único bloque con retorno posible en días
en vez de meses, porque no depende de que Google nos suba.

| Keyword | Imp | Pos | Página |
|---|---:|---:|---|
| `rumba catalana` | 1.586 | 8,6 | `/musica/grupos-de-rumba/` |
| `empresa eventos` | 407 | 8,9 | `/` |
| `agencia eventos corporativos` | 387 | 6,0 | `/` |
| `empresa de eventos barcelona` | 384 | 9,9 | `/` |
| `ideas originales para eventos` | 328 | 3,0 | `/15-excelentes-alternativas-de-ocio.../` |
| `entrega de premios` | 281 | 7,6 | `/entregas-premios-eventos/` |
| `empresas de eventos corporativos` | 188 | 9,3 | `/` |
| `mice ad hoc events` | 178 | 6,9 | `/en/mice-industry-events-definition/` |
| `show de burlesque en barcelona` | 167 | 7,6 | `/danza/contratar-bailarinas-burlesque/` |

| Tarea | Produce | Terminado cuando |
|---|---|---|
| 2.1 Ver qué sale hoy en el resultado de cada una | Diagnóstico por keyword | Se sabe si el problema es el title, la meta o que hay algo de Google encima |
| 2.2 Reescribir title y meta description de las 9 | Textos nuevos | Cada uno responde a la intención de la búsqueda, no describe la página |
| 2.3 Aplicar (solo con D1 = sí) | Yoast actualizado | Verificado con `eb/set-seo` |

Cinco de las nueve las sirve la home, así que su title es uno solo y no se puede optimizar para las
cinco a la vez. Ese es justamente el argumento del bloque 1: necesitan páginas propias.

---

## Bloque 3 · Canibalización · 2 h de análisis, la ejecución depende de D2

| Caso | Situación | Propuesta |
|---|---|---|
| `/eventos-empresa/` | Post de 2019, pos 54, 0 clics, desvía 2.931 imp en 36 keywords | 301 a la landing nueva |
| `/produccion-tecnica-para-eventos/` | Compite con la home por `producción de eventos` (2.128 imp; home pos 32,6, esta 60,2) | Decidir cuál se queda el término |
| Cuatro hubs solapados: `/musica/`, `/espectaculos/`, `/artistas/`, `/artistas-y-espectaculos/` | Compiten entre sí en 162 keywords | Un hub por cluster, el resto enlaza en cascada |
| `/agencia-eventos-corporativos-profesional-barcelona/` | Ya es un 301 a la landing DMC | Repuntar a la landing nueva |

Produce: documento de consolidación con cada 301 y su justificación, listo para aplicar. **Los 301
no los aplico yo.**

---

## Bloque 4 · Auditoría de contenido viejo · 3 h

La hipótesis que explica el core update, y la que no se puede confirmar solo con posiciones.

`/eventos-empresa/` es de junio 2019, se titula "Eventos de Empresa: Guía Paso a Paso", es genérico,
no menciona a Eventos Barcelona, no tiene CTA y termina pidiendo comentarios en Facebook. Si hay
treinta páginas así, eso es exactamente lo que un core update de calidad castiga, y explicaría por
qué el sitio cayó cuatro puestos de media en junio.

| Tarea | Produce | Terminado cuando |
|---|---|---|
| 4.1 Identificar todo el contenido anterior a 2023 con impresiones y cero clics | Lista priorizada | Cada página tiene año, rendimiento y una nota de calidad |
| 4.2 Leer las 15 de más impresiones y evaluarlas | Ficha por página | Se sabe si el problema es calidad, intención o formato |
| 4.3 Veredicto: reescribir, consolidar o despublicar | Plan de poda | Cada una tiene decisión y motivo |

**Aviso honesto:** esto es una hipótesis, no un hecho. Los datos de posición no prueban que el core
update fuera por calidad de contenido. Lo que sí es un hecho es que 182 de 295 páginas no generan un
solo clic, y eso es un problema por sí mismo.

---

## Bloque 5 · Congelar el punto de partida · 30 min

Para que dentro de un mes se pueda decir si funcionó, sin discusión.

| Tarea | Produce | Terminado cuando |
|---|---|---|
| 5.1 Snapshot con fecha de las 38 keywords del cluster comercial | Entrada en `data/seo-keywords.json` | Posición de cada una congelada a 28 ago |
| 5.2 Añadir al dashboard el seguimiento explícito de las 5 keywords objetivo | Hoja Keywords | Se ve su posición semana a semana |

**Objetivo comprobable:** que `agencia de eventos`, `agencia de eventos corporativos`,
`eventos corporativos barcelona`, `agencia de eventos barcelona` y `agencia eventos` pasen de página 2
a página 1. Son 8.407 impresiones que hoy dan 10 clics.

**Plazo realista:** entre cuatro y ocho semanas desde que la landing esté publicada e indexada. No
antes. Cualquiera que prometa que se mueve en dos semanas está adivinando.

---

## Orden de ejecución

```
Bloque 0 (censo)
      ↓
Bloque 1 (landing)  ──┐
Bloque 4 (auditoría) ─┤ en paralelo, no dependen entre sí
Bloque 5 (snapshot) ──┘
      ↓
Bloque 3 (canibalización)   ← necesita el censo del bloque 0
      ↓
Bloque 2 (CTR)              ← el último: si D1 es no, queda documentado
```

Total estimado: **12 a 14 horas**. Cabe en un fin de semana de trabajo intensivo.

---

## Qué tendrás el lunes

Con D1, D2 y D3 en "no" (el escenario más conservador):

- Landing ES + EN en borrador, maquetada, con SEO puesto, lista para que le des a publicar
- Documento de enlazado interno: qué páginas editar y con qué texto ancla
- Los 9 titles y metas reescritos, listos para pegar
- Plan de consolidación con cada 301 justificado
- Censo de las 295 páginas con veredicto
- Auditoría de las 15 páginas viejas de más volumen
- Snapshot congelado para medir

Con D1, D2 y D3 en "sí": lo mismo, pero aplicado.

## Qué NO va a pasar este fin de semana

- **Las posiciones no se van a mover.** Nada de esto se ve en días. Si el lunes miras el dashboard y
  está igual, es lo esperado.
- **No voy a publicar páginas nuevas de nicho.** Es justo lo que el plan dice que hay que dejar de hacer.
- **No voy a tocar el Sprint 5.** Sigue como está hasta el 9 de septiembre.
