# Canal de Partnership · Eventos Barcelona

**Versión 1.0 · 2026-08-16 · Autor: Philippe (Scale IT)**
Definición operativa del canal: qué es un partner, cómo se cualifica, cómo se le paga, cómo se sigue y cómo se atribuye lo que trae.

Complementa `docs/icp-outbound.md` (a quién se escribe) y `OUTPUTS/eventos-barcelona/plan-partnerships-outbound.md` (calendario y objetivos).

---

## Qué es y qué no es un partner

**Es partner** quien puede poner a EB delante de eventos que EB no vería nunca por su cuenta, de forma repetida.

**No es partner:**
- Un cliente que repite (eso es un buen cliente)
- Un artista o proveedor del catálogo (esos ya tienen su pipeline)
- Alguien que promete presentaciones sin evento concreto detrás

La diferencia práctica: un lead se cierra una vez, un partner produce leads durante años. Por eso el canal se mide en **acuerdos activos**, no en contactos.

---

## Los cinco tiers

| Tier | Quién | Qué le damos | Qué nos da | Objetivo |
|---|---|---|---|---|
| **T1 Canal MICE** | DMC, OPC, agencias de eventos | Departamento de entretenimiento y producción sin montarlo | Eventos recurrentes de alto ticket | 4 acuerdos a 31 oct |
| **T1b Agencia internacional** | Contraband, Scarlett, Stormont, Talents & Productions | Producción técnica local, rider, permisos, coordinación en destino | Eventos de sus clientes en Barcelona | 2 acuerdos a 31 dic |
| **T2 Venue** | MNAC, Museu Marítim, Poble Espanyol, Llotja de Mar, hoteles premium | Ficha técnica del espacio y showreel que ellos usan en su material | Entrada en su preferred supplier list | 5 venues a 31 dic |
| **T3 Proveedor complementario** | Catering, AV no cubierto, azafatas, foto y vídeo, mobiliario | Referral cruzado | Avisos de eventos donde falta entretenimiento | 15 acuerdos a 30 sep |
| **T4 Asociación o directorio** | Eventoplus, Barcelona Convention Bureau, MPI, SITE, Cvent | Contenido y presencia | Autoridad, backlink, listado | Eventoplus ya |

El T3 arranca primero porque ya hay **200+ proveedores en GHL** con relación existente. Es el único tier con coste cero y tiempo de ciclo corto.

---

## Cualificación · el filtro de 4 preguntas

Antes de invertir tiempo en un partner candidato:

1. **¿Toca eventos que encajan con los Leads Ideales?** (gala dinner, convención, contratación directa de espectáculo). Si solo hace ferias o congresos sin componente artístico, no
2. **¿Cuántos eventos al año en Barcelona o Cataluña?** Menos de 5 no justifica el esfuerzo de onboarding
3. **¿Tiene ya partner artístico fijo?** Si lo tiene y está contento, es un no por ahora. Se anota y se revisa en 6 meses
4. **¿Hay conflicto con un cliente actual de EB?** Se cruza contra GHL antes del primer contacto. Innegociable

Solo quien pasa las cuatro entra en el pipeline como `Contactado`.

---

## Modelo económico

**Decisión pendiente de Xavi.** Es bloqueante: no se contacta a ningún T1 sin esto cerrado, porque la primera pregunta que hacen es qué se llevan.

Tres opciones, con recomendación:

| Modelo | Cómo funciona | Cuándo encaja | Nota |
|---|---|---|---|
| **Comisión por evento (recomendado)** | 10-15% sobre el valor del evento cerrado que originó el partner | DMC pequeños, agencias, venues, proveedores | Alinea incentivos, cero coste hundido. Solo se paga sobre negocio que no habría existido |
| Rappel anual | Escalado por volumen acumulado al cierre del año | OPC y agencias grandes cuya política interna prohíbe comisión por operación | Menos motivador a corto, más limpio contablemente |
| Caso a caso | Se negocia por evento | Agencias internacionales (T1b), donde el reparto depende de qué pone cada uno | Solo para T1b |

Los T2 (venues) y T4 (asociaciones) normalmente **no llevan comisión**: el intercambio es contenido y presencia, no dinero.

---

## Proceso · de identificado a activo

**1 · Identificar.** Entra en GHL como contacto con `contact_type = Partner` y `partner_tier` asignado. Opportunity en pipeline `Partners`, etapa `Identificado`.

**2 · Cualificar.** Filtro de 4 preguntas. El que no pasa va a `Descartado` con motivo escrito.

**3 · Contactar.** LinkedIn desde el perfil de Xavi (autoridad local) más email al contacto de producción. Aquí no hay automatización: el universo es pequeño y el mensaje va personalizado con un evento suyo concreto.

**4 · Brief.** Documento de una página, ES y EN:
- Qué es EB en dos líneas (productora artística y técnica, no DMC, no directorio)
- Las tres capacidades: espectáculo, producción técnica, coordinación
- Tres casos verificables del sector del partner
- Cómo se trabaja junto (quién hace qué, tiempos de respuesta)
- El modelo económico
- Un contacto y un teléfono

**5 · Acuerdo.** Verbal vale para arrancar. El papel solo cuando hay primer evento. Pedir firma antes de demostrar valor es la forma más rápida de perder el partner.

**6 · Onboarding.** Link con UTM propio, material de apoyo, y el compromiso que más pesa: **propuesta en 24 horas**. El generador de propuestas ya existe, así que la promesa se sostiene.

**7 · Activar y amplificar.** El partner que trae un evento cerrado pasa a `Activo` y recibe caso conjunto publicado y mención cruzada.

---

## Pipeline en GHL

**Pendiente de crear a mano.** La API v2 de GHL no expone creación de pipelines.

Pipeline: **`Partners`**

| # | Etapa | Significa |
|---|---|---|
| 0 | Identificado | En la lista, sin contactar |
| 1 | Contactado | Primer toque enviado, sin respuesta |
| 2 | En conversación | Ha respondido, hay interlocución viva |
| 3 | Acuerdo verbal | Han dicho que sí, sin evento todavía |
| 4 | Activo | Ha originado al menos un evento |
| 5 | Descartado | No encaja, con motivo escrito |

Al crearlo, guardar en `.env` **y en Vercel** (divergen, hay que setear en ambos y redeployar):

```
GHL_PIPELINE_PARTNERS=
GHL_STAGE_PARTNER_IDENTIFICADO=
GHL_STAGE_PARTNER_CONTACTADO=
GHL_STAGE_PARTNER_CONVERSACION=
GHL_STAGE_PARTNER_ACUERDO=
GHL_STAGE_PARTNER_ACTIVO=
GHL_STAGE_PARTNER_DESCARTADO=
```

---

## Campos creados en GHL (16 ago 2026)

Aplicados con `scripts/setup-partner-channel.js --apply`, verificados en producción.

| Campo | fieldKey | id | Tipo |
|---|---|---|---|
| Contact Type | `contact.contact_type` | 0LBySc0XI7qKiPQVrQs9 | SINGLE_OPTIONS · **opción `Partner` añadida** a las 5 existentes |
| Partner Tier | `contact.partner_tier` | 9LrKi0SHPTMJSNwrAGOs | SINGLE_OPTIONS (5 tiers) |
| Partner Modelo economico | `contact.partner_modelo_economico` | xuxHGIQHRPKVeBuTGyyZ | SINGLE_OPTIONS |
| Partner Slug | `contact.partner_slug` | BGO6mtOyaXaJsaLNX1mB | TEXT |
| Partner origen | `opportunity.partner_origen` | HYWQd3wYYvc91PEIqoQZ | TEXT |

Tags creados: `partner_ok` (partner activo, misma convención que `artista_ok` y `proveedor_ok`) y `new_partner`.

> **Gotcha documentado:** GHL deriva el `fieldKey` del **nombre** del campo, no de lo que le pases. Pedí `contact_partner_tier` y quedó `contact.partner_tier`. El script ya busca por la key real, así que es idempotente. Tenerlo en cuenta al crear campos nuevos.

---

## Atribución

Cada partner tiene un `partner_slug` (ej. `ovation-dmc`). Con él:

**Link de referral:**
```
https://eventosbarcelona.com/partner-dmc-agencias-eventos-barcelona/
  ?utm_source=partner&utm_medium=referral&utm_campaign=ovation-dmc
```

La captura de UTM end-to-end ya está desplegada desde Sprint 3 (snippet WordPress que persiste en sessionStorage + mapeo en `lead-cliente.js` a los 6 campos `utm_*`). O sea que esto es configuración, no desarrollo.

Cuando el lead llega por teléfono o email y no por link, se rellena `opportunity.partner_origen` a mano con el slug. Sin eso el canal es invisible en el reporting y en tres meses nadie sabrá qué partner funcionó.

---

## Qué se mide

| Métrica | Cómo | Cadencia |
|---|---|---|
| Partners por etapa | Pipeline `Partners` | Cierre de sprint |
| Acuerdos activos | Contactos con tag `partner_ok` | Cierre de sprint |
| Leads originados por partner | Opps con `partner_origen` relleno | Cierre de sprint |
| Valor de pipeline por partner | Suma de `monetaryValue` agrupada por `partner_origen` | Mensual |
| Tiempo de identificado a activo | Fecha de etapa | Trimestral |

Un partner sin lead originado a los 90 días de `Acuerdo verbal` se revisa: o el brief no funcionó, o no era partner.

---

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Contactar a un DMC que ya es cliente de EB | Cruce obligatorio contra GHL antes del primer envío |
| T1b son competencia en SERP internacional | Acuerdo explícito sobre qué cuentas quedan fuera de alcance |
| Comisión que erosiona margen | Solo sobre evento cerrado que no habría existido. Nunca sobre inbound |
| Partner que pide exclusividad | No se concede en el primer acuerdo. Se revisa a los 12 meses con datos |
| El canal se vuelve trabajo manual para Xavi | El seguimiento lo lleva Ramiro. Xavi solo entra en la llamada de cierre |

---

## Siguiente acción

1. Cerrar el **modelo económico** con Xavi (bloqueante)
2. Crear el pipeline `Partners` en la UI de GHL y guardar los ids
3. Cargar las 40-60 cuentas T1 con cruce previo contra GHL
4. Escribir el brief de partner ES y EN
5. Disparar el **1 de septiembre**

Relacionado: `docs/icp-outbound.md` · `OUTPUTS/eventos-barcelona/plan-partnerships-outbound.md` · `Informe estratégico EB.pdf`
