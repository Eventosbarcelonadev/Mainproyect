---
name: eb-radar
description: >-
  Repasa las webs de referencia del sector (agencias de espectáculos y producción) y vuelca lo
  nuevo en la hoja "EB · Motor de ideas": formatos que no tenemos, tendencias, huecos de catálogo.
  Úsala cuando Xavi diga "mira qué hay nuevo", "pasa el radar", "qué están haciendo los otros",
  "revisa la competencia", o de forma quincenal como rutina. No copia contenido ajeno: registra
  formatos e ideas con la fuente citada.
---

# Radar del sector

Rutina quincenal. Objetivo: que Xavi sepa qué formatos se están vendiendo fuera y cuáles de esos
EB no puede producir hoy. La salida útil no es "mirá qué bonito", es **la lista de fichajes**.

## Paso 1 · Fuentes

Salen de la hoja "EB · Motor de ideas", pestaña `Fuentes` (que Xavi mantiene), y de la lista
`referencias` que devuelve `GET /api/gpt/catalogo`. Semilla actual:

| Fuente | Qué mirar |
|---|---|
| Scarlett Entertainment | Catálogo enorme y bien categorizado. Amplitud y cómo nombran los actos. |
| Contraband Events | Agencia UK. Conceptos de espectáculo y actos poco vistos. |
| Stormont | Eventos corporativos. Escenografía y formato de evento completo. |
| 42.show | Formatos inmersivos y tecnológicos. |
| Sintonizart | Agencia española. Comparable directa en mercado local. |
| Creartys | Agencia española de animación y espectáculos. |
| Talents Productions | Producción artística. Shows a medida. |

Respetá `robots.txt` y no machaques: como mucho 8 a 10 páginas por fuente y por pasada.
Solo WebFetch y WebSearch, que no tienen coste. Nada de servicios de scraping de pago.

## Paso 2 · Qué buscar

- Categorías o formatos que ellos tienen y nosotros no.
- Actos que aparecen en varias fuentes a la vez (señal de que el mercado los está pidiendo).
- Cómo nombran las cosas (la taxonomía ajena da ideas de keywords y de categorías).
- Novedades de los últimos meses, no el catálogo histórico entero.

## Paso 3 · Volcar a la hoja

Una fila por hallazgo en la pestaña `Radar`:

`fecha | fuente | formato detectado | descripción en 1 línea | por qué es interesante | ¿lo tenemos? (sí/no/parcial) | show nuestro más cercano | esfuerzo (bajo/medio/alto) | link | estado`

Estado arranca en `nuevo`. Xavi lo mueve a `descartado`, `a producir` o `en catálogo`.

Todo lo que salga `no` o `parcial` se consolida en la pestaña `Huecos de catálogo`, sumando al
contador de "veces visto" si ya estaba.

## Paso 4 · Resumen para Xavi

Al terminar, un resumen corto en el chat:

- Cuántas fuentes se revisaron y cuántos hallazgos nuevos.
- **Los 3 huecos más repetidos**, con la recomendación: fichar artista, producir a medida o descartar.
- Una cosa que se puede vender ya con el catálogo actual y no se está vendiendo.

## Reglas

- Inspiración, no copia. Nunca guardes ni reutilices su texto, sus fotos ni sus nombres de acto.
- Citá siempre la fuente en la fila del Radar.
- No nombres a estas agencias en ningún documento que vea un cliente.
- Sin guion largo (—).
