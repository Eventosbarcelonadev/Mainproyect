---
kind: qa-report
target: research-ux-ui-propuestas-sep2026.md
mode: deep
verdict: PASS
verdict_es: ENTREGABLE
score: 9.3
score_limited_by: cobertura
coverage_claims: 42
coverage_verified: 32
independent: true
sources: 48
searches: 136
qa_at: '2026-09-14T19:50:00Z'
---

# QA · Rider visual de las propuestas EB

## Nota: 9,3 / 10 · ENTREGABLE
La limita la cobertura (32 de 42 afirmaciones verificadas), no los hallazgos: todos los hallazgos medios se corrigieron y queda una baja abierta y declarada.

**Modo**: Deep · **Tipo**: research · **Fecha**: 2026-09-14
**Independencia**: verificador en contexto separado ✓ (tres agentes: una ronda de 11 afirmaciones de carga y dos de QA con 25 preguntas neutras, sin acceso al documento)
**Rúbricas**: `_base` + `deliverable-html` (para el HTML publicado) · ⚠ no existe rúbrica de tipo research
**Voz**: `_base` · ⚠ EB no tiene overlay de rúbrica ni guía de brand voice en el Brain

## Cobertura
| | |
|---|---|
| Afirmaciones en el documento (preflight) | 42 |
| Verificadas con fuente consultada o script | 32 (76 %) |
| Portantes verificadas | 12 de 12 |
| No verificables o sin reverificar | 10 |

Portantes: botones del hero fuera de pantalla en móvil (62,7 px), formatos de precio y `()` en el resumen, fecha cruda y `null`, contrastes de verde y coral, blanco inferior del PDF, conteos de Supabase, resolución de fotos del catálogo, Chromium 131 con `preferCSSPageSize`, norma FundéuRAE, NN/g scroll, Better Proposals móvil, desalineación de marca con eventosbarcelona.com.

`searches` recoge las llamadas a herramientas de los tres verificadores (44 + 33 + 59).

## Veredicto
ENTREGABLE. Ni críticas ni medias abiertas y todas las portantes verificadas.

## Bloqueos deterministas (preflight)
- 2 guiones largos en la fila E1 (cita literal de la barra admin). **Corregido**: la fila describe los campos sin reproducir el separador.
- Sin enlaces muertos (39 comprobados), sin placeholders, sin fechas relativas.

## Contrato de escritura y voz
- ⚠ **Contrato de de-slop sin comprobar**: `contar-pruebas.py` no está instalado en esta máquina. Las cuatro pruebas contables no se ejecutaron.
- `_base` § Voz: cero guiones largos tras la corrección ✓ · castellano peninsular ✓ · sin narrativa de proceso ni siglas de contrato ✓.

## Hallazgos (todos corregidos salvo el último)

**1 · ERROR · media · corregido**
- **Dice**: formato recomendado `3.950 €`.
- **Verificación**: FundéuRAE considera "impropio emplear punto o coma" como separador de miles; con 4 cifras es "frecuente y válido omitir el espacio" ([miles y millones](https://www.fundeu.es/recomendacion/miles-y-millones-claves-de-escritura/)).
- **Corrección**: `3950 €` y `19 650 €`; la convención comercial `3.950 €` queda como alternativa de decisión.

**2 · OVERCLAIM · media · corregido**
- **Dice**: cada show deja "el 35-45 % inferior en blanco" / "casi media hoja".
- **Verificación**: script sobre el PDF (`pdfblank.swift`): 20, 39, 39 y 28 % en las páginas 3 a 6.
- **Corrección**: "hasta un 39 %" con las cuatro cifras.

**3 · UNVERIFIABLE · media · corregido**
- **Dice**: Belmond usa "un único acento terracota `#c04e37`", como apoyo de "un solo acento".
- **Verificación**: en el CSS de belmond.com aparecen `#f4f4f2`, `#666`, `#1a1a1a` y un `--color-accent: #0d9aff`; `#c04e37` no se encontró.
- **Corrección**: retirado; el principio pasa a "neutros cálidos y poco color" con valores verificados.

**4 · DISCREPANCY · baja · corregido** · Soho House `#fffaf5`/`#432d38` → verificado `#fffef7` con `#121212`.

**5 · DISCREPANCY · baja · corregido** · Contraband "5 fuentes" → 4 familias de Google Fonts en la home (Cuprum, Oxygen, Raleway, Roboto).

**6 · UNVERIFIABLE · baja · corregido** · Alive Network "extras a +£678" (solo HTML) → no aparece; la página muestra paquetes. Retirado; se mantiene "From £2,238", verificado.

**7 · DISCREPANCY · baja · corregido** · cita "Precio: De 1 € a 800 €" de una ficha no reverificada → sustituida por la verificada "Precio: De 500 € a 3500 €".

**8 · UNVERIFIABLE · baja · corregido** · Framer "marca en morado" → la frase no está en ninguna página de Framer consultada. Retirado.

**9 · PROVENANCE · baja · corregido** · "DM Serif Display pensada para tamaños grandes" citaba el repo dm-fonts, que no lo dice → fuente cambiada a la descripción oficial en google/fonts ("super-sized poster settings").

**10 · OVERCLAIM · baja · corregido** · Proposify "orden recomendado" → el artículo no enuncia un orden; se deduce de su rediseño de ejemplo. Reformulado.

**11 · ERROR · baja · corregido** · "9 propuestas con tema de color" → 8: la categoría "música" lleva tilde y no casa con la clave `musica` de `CATEGORY_CONFIG` (cae al tema por defecto). Hallazgo lateral: es un bug funcional menor, fuera del alcance de este encargo.

**12 · MISSING · baja · corregido** · `event_guests` vacío en 37 → además 66 filas con `0`.

**13 · PROVENANCE · baja · abierto y declarado** · Webflow "resalta en azul al pasar el ratón": su centro de ayuda devolvió 403; la cita sale de un fragmento de búsqueda. El texto lo indica.

## Sólido
- Supabase: 195 propuestas, 28 aprobadas, 81 fechas vacías y 106 ISO, 95 sin ubicación, 78 sin empresa, 23 con resumen oculto, 0 con cabecera elegida.
- Contrastes: 2,10 · 2,96 · 2,12 · 1,26 · 5,74 · 12,63 y todos los pares de la paleta propuesta (5,28 a 16,19).
- Código: `formatPrice` = `toLocaleString('es-ES')` (`3950` / `19.650`), `&euro;` pegado, `(priceNote)` siempre entre paréntesis, `event.date` sin formato, `REVISION` sin tilde, flechas del carrusel solo con hover, hero 100vh con foto al 30 %, CSS muerto, `page.pdf({ preferCSSPageSize: true })`, Chromium 131.
- Catálogo: 304 fotos, mediana 1.197 px, 118 bajo 1.000 px, 86 bajo 720 px.
- eventosbarcelona.com: Space Grotesk, botones `#cc3366`, enlaces `#ec5853`.
- Fuentes externas: NN/g (scroll 57/74 %, 6 de 8, flat UI 22 % con 71 participantes, zigzag, opciones destructivas), WCAG 1.4.3 y 2.5.8, Better Proposals 2020 y 2022, Proposify 2026 (infografías), Storydoc +12 % de interacción, Qwilr, FundéuRAE, Chrome 131 `@page`, web.dev svh, GOV.UK Tag, Primer StateLabel, Aman, Rosewood, Scarlett, 56 logos de Cortina.

## No verificable o sin reverificar
- Observaciones sobre capturas propias sin segunda revisión independiente: logos de terceros en fotos (D12), "Ver vídeo" con el peso del precio (D14), viñetas de condiciones (D15), erratas del picker (E6) y del builder (B1). Acción: revisarlas en la web antes de presentarlas a Xavi.
- Benchmark sin reverificar: Aman "Discover more" como enlace y un único botón; líneas editoriales de Sternberg Clarke, Dragone y Monarque. Marcados en el texto.
- Patrones de sistemas de diseño citados solo por la línea de research: Polaris Badge, Primer notificaciones, Atlassian tipo oración, NN/g luxury principles.
- Webflow (hallazgo 13).

## Falta
- La muestra de PDF (`ca5e1a51`) tiene el resumen oculto: no se auditó cómo cae el resumen en A4.
- No se probó una propuesta en inglés ni Safari real en iOS (solo emulación en Chrome).
- No hay datos propios de uso (qué secciones leen los clientes de EB): todo el comportamiento de lectura es de terceros.

## Rúbrica
**`_base`**
- Voz: cero guiones largos ✓ (tras corregir) · sin siglas de contrato ✓ · castellano peninsular ✓ · sin narrativa de proceso ✓
- Tema visual G4U Warm Strategic: **N/A**. Entregable de Scale IT para Eventos Barcelona; en esta cuenta no se usa la marca G4U en la infraestructura del cliente.
- Publicación en docs.growth4u.io con g4u-comments: **N/A**. Publicado como artifact privado de claude.ai.
- Sustancia: cifras con fuente ✓ · fechas absolutas ✓ · veredicto con nota ✓

**`deliverable-html`** (sobre el HTML publicado)
- Self-contained: ✗ parcial. Es un artifact multiarchivo (18 imágenes aparte y Google Fonts con fuentes de respaldo). Aceptable en la plataforma; declarado.
- Guardado en `OUTPUTS/`: el análisis sí; el HTML y las capturas se quedan fuera del repo porque contienen datos de clientes.
- Render sin errores de consola ✓ · sin scroll horizontal ✓ · jerarquía legible ✓
- Datos trazables ✓ · fechas absolutas ✓ · idioma consistente ✓ · enlaces comprobados en el análisis ✓
- Verificador independiente ✓
- No publicar sin OK: publicado como artifact **privado**, sin compartir.
