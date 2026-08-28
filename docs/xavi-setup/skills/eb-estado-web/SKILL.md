---
name: eb-estado-web
description: >-
  Comprueba que la web y las herramientas de Eventos Barcelona están funcionando: la web pública,
  el formulario de clientes, el formulario de artistas, el catálogo y los paneles de Xavi.
  Úsala cuando Xavi diga "¿la web va bien?", "¿está caído algo?", "revisa que funcione todo",
  "un cliente dice que el formulario no le funciona", "comprueba la web". No arregla nada:
  informa y, si hay algo roto, dice que hay que avisar a Philippe.
---

# Estado de la web

Comprobación de dos minutos, sin credenciales y sin acceso a la infraestructura.

## Qué comprobar

Hacé WebFetch a cada URL y anotá si responde y si el contenido tiene sentido:

| Qué | URL |
|---|---|
| Web pública | https://www.eventosbarcelona.com |
| Formulario de cliente | https://propuestas.eventosbarcelona.com/formulario-cliente |
| Formulario de artista | https://propuestas.eventosbarcelona.com/formulario-artista |
| Catálogo público | https://propuestas.eventosbarcelona.com/catalogo |
| Panel de métricas | https://propuestas.eventosbarcelona.com/metricas |
| Panel de Xavi | https://propuestas.eventosbarcelona.com/xavi |

Y el catálogo por API, que es el que alimenta las presentaciones:

```bash
curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $EB_CATALOG_TOKEN" \
  https://propuestas.eventosbarcelona.com/api/gpt/catalogo
```

Un `200` es correcto. Un `401` significa que el token caducó. Cualquier `5xx` es un fallo del servidor.

## Cómo informar

Lista corta, una línea por cosa, con un símbolo claro:

```
OK    Web pública
OK    Formulario de cliente
FALLA Catálogo (error 500)
OK    Panel de métricas
```

Si algo falla:

1. Reintentá una vez, por si fue un pico puntual.
2. Si sigue fallando, decilo claro y **sin tecnicismos**: "el formulario de clientes no está
   cargando, cualquiera que entre ahora no puede pedir presupuesto".
3. Terminá siempre igual: **"esto lo tiene que mirar Philippe, avisale"**.

## Lo que no hay que hacer

- No intentes arreglarlo. No hay acceso al servidor y es correcto que no lo haya.
- No des un diagnóstico técnico inventado. Decí qué URL falla y con qué código, nada más.
- No lo repitas en bucle. Una comprobación, un informe.
