# Plan de keywords · Eventos Barcelona
### Septiembre 2026 · construido sobre 17 meses de posiciones reales de Search Console

> Sustituye a la pirámide como fuente operativa de priorización. La pirámide sigue valiendo
> como mapa de cobertura por landing, pero sus volúmenes están mal medidos
> (ver el aviso en `docs/SEO-PIRAMIDE-KEYWORDS.md`).
>
> Datos: junio a agosto 2026, API de Search Console. Todo lo de aquí es demanda **probada**:
> keywords por las que el sitio ya aparece. Ninguna cifra viene de una estimación.

---

## 1. El diagnóstico, sin adornos

**No es que no subamos. Es que bajamos.**

Comparando las 1.477 keywords presentes antes y después del arranque del retainer:

| | Abril-junio | Julio-agosto | Delta |
|---|---:|---:|---:|
| Posición media ponderada por impresiones | 25,48 | 29,56 | **-4,08 puestos** |
| Keywords que suben 1+ puesto | | 424 (28,7%) | |
| Keywords que bajan 1+ puesto | | **847 (57,3%)** | |
| Volumen en keywords que bajan | | **60,9%** | |

### La causa principal no es nuestra

La caída empieza la **semana del 8 de junio**, tres semanas antes de que arrancara el retainer
(2 de julio). Posición media semanal:

```
1 jun    22,5  ██████████████████
8 jun    25,4  ███████████████████████
15 jun   28,5  ██████████████████████████████
22 jun   29,9  █████████████████████████████████
   (desde aquí, meseta plana en 27-30)
```

Coincide con el asentamiento del **May 2026 Core Update** (desplegado del 21 de mayo al 2 de junio)
más el **spam update del 24-26 de junio**. No hubo ningún cambio técnico en el sitio en esa ventana.

**Esto no es una excusa, es el punto de partida.** El retainer empezó sobre un sitio ya golpeado, y
en dos meses no ha revertido nada. Lo que sigue explica por qué.

### Lo que sí es nuestro

**43 páginas publicadas en julio y agosto han generado 8 clics.** 41 de las 43 tienen cero.
Aportan el 4,8% de las impresiones y el 1,7% de los clics.

El sitio tiene 295 páginas con impresiones. **182 (62%) no generan un solo clic.** La home
concentra el 31% de todas las impresiones; el top 5 de páginas, el 50%.

La estrategia de publicar volumen de páginas nuevas no está funcionando. Y publicar más páginas
después de un core update que castiga calidad es, probablemente, empeorarlo.

---

## 2. Los tres problemas estructurales

### Problema 1 · No existe la página que debería rankear

De las **62 keywords en posición 11-20 con 150 o más impresiones** (29.266 impresiones, **31 clics**),
la inmensa mayoría las sirve **la home**.

La home rankea en posición 12-18 para veinte variantes de "agencia de eventos barcelona". Ninguna
landing dedicada compite. Las que existen están muertas:

| Página | Impresiones | Posición | Clics |
|---|---:|---:|---:|
| `/partner-dmc-agencias-eventos-barcelona/` (Sprint 2) | 55 | 37,7 | 0 |
| `/agencia-eventos-corporativos-profesional-barcelona/` | 145 | 43,6 | 0 |
| `/eventos-empresa/` | 4.673 | 54,3 | 0 |

Google no tiene a quién dar la primera página para el cluster comercial, así que le da la home, y
la home no es una página de servicio: es un escaparate.

### Problema 2 · Canibalización

**983 de 4.993 keywords (19,7%) las sirven dos o más URLs del sitio.** El patrón se repite: la home
rankea decente y una landing rankea en posición 50-70, restando en vez de sumando.

Páginas que más desvían:

| Página | Keywords en las que compite como secundaria | Impresiones desviadas |
|---|---:|---:|
| `/musica/` | 65 | 3.194 |
| `/eventos-empresa/` | 36 | 2.931 |
| `/produccion-tecnica-para-eventos/` | 16 | 1.708 |
| `/espectaculos/` | 40 | 1.308 |
| `/artistas-y-espectaculos/` | 34 | 1.369 |

### Problema 3 · Hay clusters muertos consumiendo esfuerzo

| Cluster | Impresiones | Posición media | Impresiones en página 1 |
|---|---:|---:|---:|
| Agencia / empresa de eventos | 43.144 | 25,7 | 1.168 |
| Música / DJ / bandas | 34.993 | 28,9 | 2.799 |
| Eventos corporativos | 27.587 | 30,7 | 1.413 |
| **Técnica / alquiler** | 18.105 | **51,0** | **34** |
| Espectáculos / shows | 11.217 | 34,4 | 1.159 |
| Marca EB | 6.125 | 19,4 | 3.073 |
| **Cena de gala / catering** | 4.475 | **51,6** | **55** |
| Danza / baile | 3.555 | 23,6 | 753 |
| Fiestas temáticas | 3.082 | 25,3 | 913 |

"Técnica / alquiler" tiene 18.105 impresiones y **34** en primera página. "Cena de gala", 4.475 y **55**.
Son clusters donde aparecemos mucho y no competimos en absoluto.

---

## 3. El plan

La regla que ordena todo: **primero cobrar lo que ya está sembrado, después sembrar.**

### Prioridad 1 · El cluster comercial (23.845 impresiones, 27 clics)

Es el mayor pool de oportunidad del sitio y es el core del negocio. Todas estas keywords están en
página 2, servidas por la home:

| Keyword | Impresiones | Posición | Clics | URLs compitiendo | Página principal |
|---|---:|---:|---:|:---:|---|
| `agencia de eventos` | 2665 | 16,1 | 0 | 1 | `/` |
| `agencia de eventos corporativos` | 2019 | 15,4 | 0 | ⚠ 2 | `/` |
| `eventos corporativos barcelona` | 1549 | 14,8 | 6 | ⚠ 4 | `/` |
| `agencia de eventos barcelona` | 1146 | 12,2 | 2 | 1 | `/` |
| `agencia eventos` | 1028 | 12,5 | 2 | ⚠ 2 | `/` |
| `agencias de eventos barcelona` | 996 | 13,5 | 2 | 1 | `/` |
| `agencia eventos barcelona` | 838 | 11,8 | 4 | ⚠ 3 | `/` |
| `organizacion de eventos barcelona` | 807 | 18,7 | 0 | ⚠ 3 | `/` |
| `evento corporativo` | 787 | 18,4 | 0 | ⚠ 3 | `/` |
| `empresas de eventos barcelona` | 781 | 12,1 | 2 | 1 | `/` |
| `empresas de eventos` | 702 | 12,1 | 0 | ⚠ 2 | `/` |
| `agencia de eventos en barcelona` | 666 | 12,1 | 1 | ⚠ 2 | `/` |
| `eventos para empresas barcelona` | 633 | 15,2 | 0 | ⚠ 2 | `/` |
| `organizadores de eventos barcelona` | 608 | 16,7 | 0 | 1 | `/` |
| `agencias eventos barcelona` | 593 | 12,9 | 3 | 1 | `/` |
| `organización de eventos barcelona` | 541 | 13,9 | 1 | 1 | `/` |
| `empresas organizadoras de eventos` | 526 | 18,0 | 1 | 1 | `/` |
| `agencias de eventos en barcelona` | 509 | 15,7 | 0 | 1 | `/` |
| `empresa de eventos en barcelona` | 477 | 12,1 | 0 | ⚠ 2 | `/` |
| `event agency barcelona` | 475 | 12,7 | 0 | ⚠ 4 | `/en/` |
| `agencia de organización de eventos en barcelona` | 467 | 16,5 | 0 | 1 | `/` |
| `producción de eventos corporativos` | 451 | 17,9 | 0 | ⚠ 2 | `/` |

**Acción:** una sola landing de servicio, `/agencia-de-eventos-barcelona/`, que asuma el cluster
entero en ES y EN. No un artículo: una página de servicio con propuesta de valor, casos, proceso y
CTA. Enlazada desde la home, desde el menú principal y desde las páginas de servicio existentes.

Antes de crearla hay que decidir qué pasa con las tres landings muertas del cuadro anterior:
consolidarlas en la nueva con redirect 301, no dejarlas compitiendo.

### Prioridad 2 · Deshacer la canibalización

Sin esto, la landing nueva será la cuarta página compitiendo contra la home.

1. `/eventos-empresa/` (posición 54, cero clics, desvía 2.931 impresiones en 36 keywords):
   decidir si se consolida en la landing nueva o se reorienta a una intención que no solape.
2. `/produccion-tecnica-para-eventos/` compite con la home por "producción de eventos"
   (2.128 impresiones, home en posición 32,6, esta en 60,2). Una de las dos sobra.
3. Hubs `/musica/`, `/espectaculos/`, `/artistas-y-espectaculos/`, `/artistas/`: cuatro hubs
   solapados que compiten entre sí en 162 keywords. Definir uno por cluster y enlazar en cascada.

### Prioridad 3 · Las que ya están en página 1 y no reciben clic

9 keywords, 3906 impresiones, **2 clics**.

| Keyword | Impresiones | Posición | Página |
|---|---:|---:|---|
| `rumba catalana` | 1586 | 8,6 | `/musica/grupos-de-rumba/` |
| `empresa eventos` | 407 | 8,9 | `/` |
| `agencia eventos corporativos` | 387 | 6,0 | `/` |
| `empresa de eventos barcelona` | 384 | 9,9 | `/` |
| `ideas originales para eventos` | 328 | 3,0 | `/15-excelentes-alternativas-de-ocio-para-eventos-corporativos/` |
| `entrega de premios` | 281 | 7,6 | `/entregas-premios-eventos/` |
| `empresas de eventos corporativos` | 188 | 9,3 | `/` |
| `mice ad hoc events` | 178 | 6,9 | `/en/mice-industry-events-definition/` |
| `show de burlesque en barcelona` | 167 | 7,6 | `/danza/contratar-bailarinas-burlesque-cabaret-barcelona/` |

Aquí subir posiciones no sirve: ya estamos arriba. Lo que falla es que el resultado no se gana el
clic frente a lo que Google pone encima. Trabajo de title, meta description, schema y formato de
respuesta citable. Es la frontera con GEO.

### Prioridad 4 · El resto de página 2 fuera del cluster comercial

24 keywords, 5421 impresiones:

| Keyword | Impresiones | Posición | Clics | URLs | Página principal |
|---|---:|---:|---:|:---:|---|
| `musica para eventos` | 485 | 16,4 | 1 | ⚠ 2 | `/grupos-musica/` |
| `contratar músicos para eventos` | 427 | 12,3 | 0 | ⚠ 2 | `/grupos-musica/` |
| `mice barcelona` | 327 | 18,4 | 1 | ⚠ 3 | `/eventos-mice-que-es/` |
| `maestro de ceremonias` | 253 | 14,0 | 0 | 1 | `/artistas/maestro-ceremonias/` |
| `show` | 246 | 13,6 | 0 | 1 | `/espectaculos/` |
| `grupos musicales para bodas barcelona` | 233 | 18,9 | 0 | ⚠ 3 | `/grupos-musica/` |
| `corporate event` | 226 | 17,5 | 0 | ⚠ 5 | `/en/` |
| `bollywood barcelona` | 219 | 14,5 | 0 | ⚠ 2 | `/danza/show-de-bollywood/` |
| `música en directo para eventos` | 217 | 18,0 | 0 | ⚠ 2 | `/grupos-musica/` |
| `musicos para eventos` | 213 | 18,0 | 0 | ⚠ 2 | `/grupos-musica/` |
| `musica en vivo para eventos` | 212 | 19,8 | 0 | ⚠ 3 | `/grupos-musica/` |
| `bailarin profesional en barcelona` | 211 | 13,8 | 0 | ⚠ 2 | `/danza/` |

Son mejoras sobre páginas que ya existen, no páginas nuevas.

---

## 4. Qué dejar de hacer

1. **No publicar landings de nicho nuevas** hasta que el cluster comercial esté en página 1. Las dos
   previstas para el Sprint 5 (percusión LED, charlestón) tienen cero impresiones en tres meses.
   Advertencia honesta: cero en Search Console puede significar "no tenemos página", no
   "no hay demanda". Pero el argumento no depende de eso: hay 29.266 impresiones de demanda
   **probada** sin cobrar.
2. **No invertir en "técnica / alquiler" ni "cena de gala"** como clusters SEO. 22.580 impresiones
   combinadas y 89 en primera página. Si son líneas de negocio importantes, el canal no es la
   búsqueda orgánica genérica.
3. **No medir el trabajo en páginas publicadas.** 43 páginas y 8 clics. La métrica es posición y
   clics de las keywords objetivo, y está en el dashboard.

---

## 5. Cómo se mide

Cada keyword de este plan está en `data/seo-keywords.json` con su posición congelada mes a mes
desde abril 2025. El seguimiento no es una opinión:

```bash
node scripts/seo-keywords.js oportunidades   # lista viva priorizada
```

Y la hoja **Keywords** de `propuestas.eventosbarcelona.com/metricas` lleva la columna de movimiento
mes a mes. Si en el cierre del Sprint 5 el cluster comercial no se ha movido, el plan estaba mal o
la ejecución estaba mal, y se ve en una tabla.

**Objetivo comprobable para el Sprint 5:** que las cinco keywords de más volumen del cluster
comercial (`agencia de eventos`, `agencia de eventos corporativos`, `eventos corporativos barcelona`,
`agencia de eventos barcelona`, `agencia eventos`) suban de página 2 a página 1. Son
8407 impresiones que hoy dan 10 clics.

---

## 6. Lo que este plan no puede responder

- **Volumen de keywords donde no aparecemos.** Search Console solo mide lo que ya rankea. Para
  decidir sobre keywords sin página propia hace falta un keyword tool. No lo tenemos conectado.
- **Por qué exactamente nos golpeó el core update.** Requiere una auditoría de calidad de contenido
  y E-E-A-T, no datos de posiciones.
- **Qué hace la competencia.** Nada de aquí es comparativo.

Los tres huecos son trabajo pendiente, y los tres son más baratos que seguir publicando páginas
que no captan.
