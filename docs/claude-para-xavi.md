# Claude para Xavi · instructivo completo

**Objetivo:** que Xavi trabaje con Claude de forma autónoma sobre el proyecto real de Eventos
Barcelona (base de artistas y shows, propuestas, CRM, correo, banco de imágenes) y **sin ninguna
posibilidad de tocar la web ni de romper nada irreversible**.

**Quién hace qué:** las fases 0 y 4 son de Philippe, en frío. La fase 1 se hace en el Mac de Xavi
con él delante. Las fases 2 y 3 quedan configuradas y no hay que tocarlas. La fase 6 es la sesión
de traspaso con Xavi.

**Tiempo:** unos 45 minutos de preparación en frío, y unos 30 minutos con Xavi.

**Paquete de archivos:** [docs/xavi-setup/](xavi-setup/). Todo listo para copiar.

---

## 1. Qué va a poder hacer

Seis capacidades, cada una con su skill instalada:

| Skill | Qué hace | Ejemplo de lo que le pide Xavi |
|---|---|---|
| `eb-propuesta` | Monta una propuesta **real dentro del sistema**, con su URL, enganchada al lead en GHL, en estado revisión para que él la apruebe | *"hazme la propuesta para el lead de DICOM"* |
| `eb-datos` | Consulta toda la base (artistas, shows, propuestas) y todo el CRM, y las cruza | *"¿qué artistas no hemos usado nunca en una propuesta?"* |
| `eb-ideas` | Brief a tres conceptos de evento con shows del catálogo real | *"dame ideas para una cena de gala de 250"* |
| `eb-radar` | Repaso quincenal del sector, y saca la lista de huecos de catálogo | *"pasa el radar y dime qué nos falta"* |
| `eb-presentacion` | Deck temático libre, para prospección o catálogos, cuando no hay lead detrás | *"un deck de circo para enseñar en la feria"* |
| `eb-estado-web` | Comprueba que la web y los formularios funcionan | *"¿la web va bien?"* |

Más lo que sale sin skill: buscar y resumir su correo, preparar borradores de respuesta, leer la
documentación del proyecto, mirar fotos del banco de imágenes.

---

## 2. El modelo de seguridad

La pregunta antes de instalar nada: si Claude se equivoca, o si Xavi le pide algo que no debería,
¿qué es lo peor que puede pasar? La respuesta tiene que ser "nada irreversible".

### Tres anillos

| Anillo | Qué hay dentro | Permiso |
|---|---|---|
| **Escribe** | Su carpeta `trabajo/`, su repositorio `eb-xavi`, la hoja de ideas de Drive, borradores de Gmail, y **propuestas nuevas en estado revisión** | Sí |
| **Lee** | Repositorio `Mainproyect`, base de artistas y shows, propuestas, CRM completo, banco de imágenes, la web pública, webs de la competencia | Solo lectura |
| **Prohibido** | WordPress, FTP de CDmon, panel de hosting, clave de servicio de Supabase, despliegues, envío de correo, escritura en el CRM, aprobar o borrar propuestas | Sin acceso |

La regla que lo resume: **Claude prepara, Xavi aprueba.** Igual que con el correo, donde deja
borradores y envía él.

### Cuatro capas

1. **Permisos en el origen.** GitHub rol *Read* sobre `Mainproyect`, token de CRM de solo lectura.
   Es lo que de verdad protege, porque lo rechaza el servidor.
2. **Ausencia de credenciales.** En su Mac no existen `WP_PASS`, `FTP_PASS`,
   `SUPABASE_SERVICE_KEY` ni `VERCEL_TOKEN`.
3. **Candado del sistema** (`managed-settings.json`). Lista de denegación que Xavi no puede editar
   ni saltarse, ni con `--dangerously-skip-permissions`.
4. **Guardarraíl** (hook `PreToolUse`). Revisa cada comando antes de ejecutarlo.

> **Los límites, dichos claros:** las reglas sobre comandos funcionan por prefijo y se pueden
> esquivar con comandos compuestos. Por eso existe el hook, y por eso las capas 1 y 2 son las que
> hacen el trabajo pesado.

### Deuda de seguridad conocida

`/api/admin` **no tiene autenticación**. Verificado el 2026-08-28 desde fuera, sin cabeceras:
`list-artistas` devuelve 200 con nombre, email y teléfono de los artistas, y `admin.html` es
público. El endpoint corre con `SUPABASE_SERVICE_KEY` y expone acciones de borrado.

Esto es anterior a este montaje y **no lo resuelve este montaje**. El guardarraíl protege el equipo
de Xavi, no el endpoint. Consecuencia práctica: Xavi no necesita ninguna credencial nueva para leer
la base, porque ya está abierta a internet.

Arreglo pendiente, unos 40 minutos: extender `gptAuthOk` a todas las acciones con una cabecera
`x-admin-token`, y que `admin.html` pida la contraseña una vez y la guarde en el navegador. Las dos
acciones `gpt-*` siguen con su token propio para no romper el GPT de Xavi.

---

## 3. Fase 0 · Preparación (Philippe, 45 minutos)

### 3.1 Accesos

- [ ] **GitHub.** Usuario de Xavi (con el correo de EB, no personal). Invitarlo a
      `Eventosbarcelonadev/Mainproyect` con rol **Read**. Verificar que dice *Read*, no *Write*.
- [ ] **Repositorio de trabajo.** Crear `Eventosbarcelonadev/eb-xavi`, **privado**, rol **Write**.
- [ ] **Claude.** Cuenta a nombre de EB. **Xavi está en plan Pro y con Pro se puede trabajar**,
      pero hay que cuidar el contexto o se queda sin sesión a media propuesta. Las tres reglas
      están en el `CLAUDE.md` de su espacio y en la configuración: no leer los archivos grandes de
      `mainproyect/` (bloqueados para lectura: los `.html` de la raíz, `api/`, `scripts/`,
      `supabase/` y `data/seo-keywords.json`), pedir solo los datos que se van a usar, y una
      conversación por tarea. Si aun así le corta a menudo, ahí sí toca subir a Max.
- [ ] **Vercel: no se invita.** El equipo está en plan Hobby, que no admite miembros, y en Pro el
      rol mínimo (*Member*) puede desplegar y leer variables de entorno. El rol *Viewer* es de
      Enterprise. Se cubre con `eb-estado-web`. Ver [5.6](#56--estado-de-la-web).

### 3.2 Google

- [ ] **Carpeta de Drive** "EB · Banco de imágenes" con los reportajes por evento, estructura
      `AAAA/AAAA-MM-cliente-evento/`. Compartida con Xavi como **Lector**.
- [ ] **Hoja** "EB · Motor de ideas" con las seis pestañas del [anexo A](#anexo-a--la-hoja-de-ideas).
      Compartida como **Editor**.
- [ ] **Cliente OAuth de Google** para el conector de Gmail. Ver [5.3](#53--gmail).

### 3.3 Tokens

- [ ] **`EB_CATALOG_TOKEN`.** Se puede reutilizar el `GPT_ACTION_TOKEN` que Xavi ya tiene en su GPT.
      Mejor higiene: uno propio, para poder rotarlo sin romperle el GPT. Cambio de cinco líneas en
      `gptAuthOk` para aceptar una lista de tokens.
- [ ] **PIT de GoHighLevel de solo lectura.** Uno **nuevo**, no el del proyecto. Scopes a marcar:
      `contacts.readonly`, `opportunities.readonly`, `conversations.readonly`,
      `conversations/message.readonly`, `calendars.readonly`, `calendars/events.readonly`,
      `locations/customFields.readonly`, `payments/orders.readonly`,
      `payments/transactions.readonly`, `blogs.readonly`, `socialplanner/post.readonly`.

### 3.4 Subir el paquete

El instalador lee la configuración desde el repositorio, así que tiene que estar en `main`:

```bash
git add docs/claude-para-xavi.md docs/xavi-setup/
git commit -m "Setup de Claude para Xavi"
git push origin main
```

---

## 4. Fase 1 · Instalación en el Mac de Xavi (30 minutos)

### 4.1 Las tres apps

Instaladores normales, siguiente y siguiente:

1. **Node 22** desde `nodejs.org` (el botón grande de la izquierda)
2. **GitHub Desktop** desde `desktop.github.com`, entrando con su usuario de GitHub
3. **Claude Code** desde `claude.ai/download`, entrando con la cuenta de Claude de EB

GitHub Desktop no es un capricho: clonar un repositorio privado desde la terminal exige un token
personal, y eso con un usuario no técnico es media hora perdida.

### 4.2 Descargar los dos repositorios

En GitHub Desktop, `File → Clone repository → GitHub.com`, dos veces:

- `Mainproyect`, con *Local path* `~/EB-Claude`
- `eb-xavi`, con *Local path* `~/EB-Claude`

### 4.3 El instalador

Un solo comando en la Terminal:

```bash
bash ~/EB-Claude/mainproyect/docs/xavi-setup/instalar.sh
```

Comprueba Node y git, instala Claude Code si falta, ordena las carpetas (renombra lo que clonó
GitHub Desktop), copia la configuración y las skills, sustituye el nombre de usuario y **prueba que
el guardarraíl bloquea de verdad**. Va marcando OK en verde. Si algo falla lo dice en rojo.

Queda así:

```
~/EB-Claude/
├── CLAUDE.md            reglas del espacio de trabajo
├── .mcp.json            conexiones
├── .claude/
│   ├── settings.json    permisos
│   ├── hooks/guardarrail.sh
│   └── skills/          las seis skills
├── mainproyect/         SOLO LECTURA
├── trabajo/             suyo
│   ├── presentaciones/  ideas/  briefs/  notas/
└── imagenes/            banco de imágenes
```

### 4.4 Las dos claves (esto lo hace Philippe)

A mano, no por terminal, para que no queden en el historial:

- `~/EB-Claude/.claude/settings.json` → `env.EB_CATALOG_TOKEN`
- `~/EB-Claude/.mcp.json` → el PIT de solo lectura en `ghl-lectura`

---

## 5. Fase 2 · Las conexiones

### 5.1 · Repositorio del proyecto

**Para qué:** que Claude conozca el negocio. En `mainproyect/` están la pirámide de keywords, el
ICP, los briefs, los planes y las presentaciones antiguas.

**Cómo:** ya está con el clonado. No hace falta conector de GitHub, Claude lee del disco.

**Prueba:** *"¿qué dice la pirámide de keywords sobre eventos de empresa?"*

**Qué queda cerrado:** el rol *Read* hace que GitHub rechace cualquier `git push`.

**Mantenimiento:** *"actualiza el proyecto"* y hace `git pull`.

### 5.2 · Base de datos y CRM

**Para qué:** es el corazón de todo. Artistas con ficha completa, shows, propuestas históricas, y el
CRM entero. Y sobre todo, cruzarlos.

**Cómo:** la skill `eb-datos`. La base va por `/api/admin?action=list-*` (abierto, ver la deuda de
seguridad de [2](#deuda-de-seguridad-conocida)) y el CRM por el conector `ghl-lectura`.

En lectura quedan disponibles: contactos, tareas, oportunidades, pipelines, conversaciones y
mensajes, agenda y notas de citas, campos personalizados, datos de la cuenta, pedidos,
transacciones, entradas de blog y publicaciones en redes. Veintitrés herramientas.

**Prueba:** *"¿cuántos artistas tenemos en total y cuántos de danza?"*

**Qué queda cerrado:** doce herramientas de escritura del CRM denegadas, y el guardarraíl bloquea
las veinte acciones de escritura de `/api/admin` (`add-*`, `edit-*`, `delete-*`, `set-*`, `save-*`,
`upload-*`) y cualquier POST contra ese endpoint. Las lecturas pasan.

### 5.3 · Gmail

**Para qué:** probablemente lo que más tiempo le ahorra a diario. Buscar el hilo de un cliente,
resumir una cadena de veinte correos, rescatar el brief enterrado en un email de hace tres semanas,
preparar respuestas.

**Cómo:** conector `@gongrzhe/server-gmail-autoauth-mcp` con **la cuenta de Xavi**:

1. En Google Cloud Console, con la cuenta de EB: crear proyecto, habilitar la **Gmail API**, crear
   credenciales **OAuth · Aplicación de escritorio**.
2. Guardar el JSON como `~/.gmail-mcp/gcp-oauth.keys.json` en el Mac de Xavi.
3. `npx -y @gongrzhe/server-gmail-autoauth-mcp auth` y entrar con su cuenta.

**Prueba:** *"busca los correos de esta semana con peticiones de presupuesto y resúmelos"*

**Qué queda cerrado:** `send_email`, `delete_email`, `batch_delete_emails`, `batch_modify_emails` y
las de filtros están denegadas. Lee, busca, descarga adjuntos y **crea borradores**. Enviar lo hace
Xavi. Un correo mal enviado a un cliente no se deshace.

### 5.4 · Banco de imágenes

Tres fuentes, y conviene entender por qué son tres.

**a) Automática, vía catálogo.** `/api/gpt/show?ids=...` ya devuelve `image_url` y `video_url` de
cada show, que son URLs públicas. Cuando Claude monta una propuesta, las fotos salen solas. Esto ya
funciona hoy, sin credenciales.

**b) Google Drive, para reportajes de eventos.** Las fotos de eventos producidos no están en la
base. Van a "EB · Banco de imágenes" y se conectan con el **conector de Google Drive** desde
`claude.ai → Configuración → Conectores`. Una vez conectado ahí, aparece en Claude Code.

**c) Carpeta local `imagenes/`, para que Claude pueda *ver* las fotos.** Es la que se olvida y la
que más importa. Para elegir la mejor foto y escribir un alt text que sirva hay que **mirarla**, y
eso solo funciona con archivos locales. Instalar **Google Drive para escritorio** y sincronizar la
carpeta a `~/EB-Claude/imagenes/`.

**Prueba:** *"mira las fotos del gala dinner y dime cuáles tres usarías para una cena elegante"*

**Qué queda cerrado:** `imagenes/` está denegada para escritura. Mira y usa, no borra ni renombra.

### 5.5 · Catálogo de shows

**Para qué:** la fuente de verdad de qué puede producir EB. Sin esto, Claude inventa espectáculos,
que es el fallo que más daño hace delante de un cliente.

**Cómo:** `EB_CATALOG_TOKEN` en `settings.json`, y las skills lo usan con `curl`. La regla ya está
en la lista de permitidos para que no pregunte cada vez.

**Prueba:** *"¿qué shows aéreos tenemos activos?"* Debe devolver ids reales, y decir "a producir a
medida" para lo que no exista.

**Qué queda cerrado:** el endpoint es solo GET.

### 5.6 · Estado de la web

**Para qué:** *"¿la web va bien?"*, *"un cliente dice que el formulario no funciona"*.

**Cómo NO se hace, y queda escrito para no reintentarlo:** el conector de Vercel no es viable. El
equipo está en Hobby (no admite invitados) y en Pro el rol mínimo puede desplegar y leer variables
de entorno. *Viewer* de solo lectura es exclusivo de Enterprise.

**Cómo se hace:** la skill `eb-estado-web` comprueba por HTTP público la web, los dos formularios,
el catálogo y los dos paneles. Cero credenciales, mismo resultado práctico. Si algo falla, lo dice
en lenguaje normal y deriva a Philippe.

**Prueba:** *"revisa que la web y los formularios estén funcionando"*

---

## 6. Fase 3 · Los tres motores

### 6.1 · Propuestas automáticas sobre el sistema existente

Esto es lo que más cambia el día a día de Xavi, y la decisión de diseño importa: **no genera un
archivo suelto, genera una propuesta dentro del sistema que ya está montado.** Queda en la base,
con su URL en `propuestas.eventosbarcelona.com`, enganchada al contacto y a la oportunidad de GHL,
y aparece en el listado de `/admin` como cualquier otra.

El flujo:

1. Claude busca el lead en el CRM, el hilo en el correo y las propuestas anteriores a ese cliente.
   Repetir lo que el cliente ya rechazó es el peor error posible, y con `list-proposals?q=empresa`
   se evita.
2. Elige entre 3 y 6 shows del catálogo activo, con `id` real, agrupados en momentos.
3. `currentPrice` arranca igual que el `base_price` del catálogo. El margen lo pone Xavi con un solo
   control (`global_margin`) desde `/admin`. **Nunca se inventa un precio:** lo que no tenga precio
   va a cero y se avisa.
4. `POST /api/save-proposal` con `status: "revision"`.
5. Le devuelve a Xavi el enlace, los shows elegidos, y qué le falta.

**La línea que no se cruza:** se guarda siempre en **revisión**, nunca en **aprobada**. Aprobar
escribe la URL validada en el campo `URL Propuesta Validada` de la oportunidad en GHL y da la
propuesta por buena de cara al cliente. Eso es de Xavi, y son dos clics en `/admin`.

Bloqueado por el guardarraíl y verificado: guardar como aprobada, `validate-proposal`,
`generate-proposal-pdf` y `delete-proposal`. Crear en revisión pasa.

Si Xavi pide cambios, se edita **la misma** propuesta mandando el JSON con el campo `id`. No se crea
una nueva por cada corrección.

### 6.2 · El proyecto de ideas

Xavi lleva años proponiendo lo mismo a clientes parecidos. Este motor ataca eso, y él mismo lo pidió.

**Ya existe media pieza:** en `/admin` hay una pestaña **Ideas** con la tabla `referencias` (las
siete webs del sector que pasó Xavi) y un historial de sesiones. Lo que faltaba es que Claude las
lea, extraiga lo aprovechable y lo deje escrito donde Xavi lo mire.

**La pieza nueva:** la hoja "EB · Motor de ideas" ([anexo A](#anexo-a--la-hoja-de-ideas)) y dos skills:

- **`eb-radar`**, quincenal. Recorre las webs de referencia, detecta formatos que EB no tiene y
  vuelca una fila por hallazgo. Lo consolida en la pestaña `Huecos de catálogo`, que es la salida
  con valor de verdad: **la lista de artistas a fichar**.
- **`eb-ideas`**, a demanda. Brief a tres conceptos distintos entre sí: uno seguro, uno de autor y
  uno arriesgado. Cada uno anclado en shows con id real.

Tres decisiones tomadas sobre la lectura de webs:

1. **Sin herramientas de pago.** Solo `WebFetch` y `WebSearch`, incluidos en la suscripción. Nada de
   servicios de scraping por API. Esto no es un detalle: nada en EB puede generar coste recurrente.
2. **Con cabeza.** Máximo 8 a 10 páginas por fuente y pasada, respetando `robots.txt`, cadencia
   quincenal.
3. **Inspiración, no copia.** Formatos e ideas con la fuente citada. Nunca su texto, sus fotos ni
   sus nombres de acto. Y esas agencias no se nombran en ningún documento de cliente.

### 6.3 · Presentaciones temáticas

Para cuando **no hay un lead detrás**: un deck de circo para enseñar en una feria, un catálogo
temático para prospección, material para un partner.

Las presentaciones antiguas (`Presentaciones viejas/`) son cuatro PPTX genéricos por categoría,
desactualizados, y personalizarlos cuesta una tarde. `eb-presentacion` genera un HTML autocontenido
desde el catálogo activo, con fotos reales, en el sistema visual de EB (DM Serif Display para
titulares, Inter para el resto, color de acento según categoría), y PDF o PPTX si hace falta.

Si hay lead, la herramienta correcta es `eb-propuesta`, no esta.

---

## 7. Fase 4 · Blindaje (Philippe, 10 minutos)

Las capas 1 y 2 quedaron cerradas en la fase 0. Faltan las otras dos.

### 7.1 Candado del sistema

```bash
sudo mkdir -p "/Library/Application Support/ClaudeCode"
sudo cp ~/EB-Claude/mainproyect/docs/xavi-setup/managed-settings.json \
        "/Library/Application Support/ClaudeCode/managed-settings.json"
sudo sed -i '' "s/USUARIO/$(whoami)/g" \
        "/Library/Application Support/ClaudeCode/managed-settings.json"
sudo chown root:wheel "/Library/Application Support/ClaudeCode/managed-settings.json"
sudo chmod 644 "/Library/Application Support/ClaudeCode/managed-settings.json"
```

Xavi no lo puede editar ni ignorar. Contiene la denegación del conector de WordPress, de archivos de
credenciales, de FTP, de los comandos de Vercel y Supabase, de `git push` y de `sudo`, más
`disableBypassPermissionsMode`.

### 7.2 Guardarraíl

Ya copiado por el instalador, y registrado desde el candado (no desde los ajustes del proyecto)
justamente para que no se pueda desactivar.

Quince casos probados, quince correctos:

| Comando | Resultado |
|---|---|
| `curl -X POST .../wp-json/mcp/x` | bloqueado |
| `curl -T foto.jpg ftp://host/...` | bloqueado |
| `git push origin main` | bloqueado |
| `cat .env` | bloqueado |
| `vercel deploy --prod` | bloqueado |
| `.../api/admin?action=delete-artista` | bloqueado |
| `.../api/admin?action=delete-show` | bloqueado |
| `.../api/admin?action=edit-artista` | bloqueado |
| cualquier POST a `/api/admin` | bloqueado |
| `save-proposal` con `"approved"` | bloqueado |
| `validate-proposal` | bloqueado |
| `save-proposal` en revisión | permitido |
| `.../api/admin?action=list-artistas` | permitido |
| `.../api/admin?action=list-proposals` | permitido |
| `git status` | permitido |

Sin dependencias (ni node, ni python, ni jq) a propósito: los hooks corren con un entorno mínimo.

---

## 8. Fase 5 · Verificación

No des la instalación por buena hasta que pasen las catorce. Las ocho primeras tienen que
**funcionar**, las seis últimas tienen que **fallar**.

### Tiene que funcionar

| # | Prueba | Resultado esperado |
|---|---|---|
| 1 | `¿qué shows de circo tenemos activos?` | Lista con ids reales |
| 2 | `¿cuántos artistas tenemos en total y cuántos de danza?` | Números del campo `total`, no de la primera página |
| 3 | `¿qué propuestas hay abiertas ahora mismo?` | Listado real con cliente y estado |
| 4 | `¿qué dice la pirámide de keywords sobre eventos de empresa?` | Cita `mainproyect/docs/SEO-PIRAMIDE-KEYWORDS.md` |
| 5 | `busca en mi correo las peticiones de presupuesto de esta semana` | Resumen de hilos reales |
| 6 | `mira las fotos de imagenes/ y dime cuáles usarías para una cena de gala` | Describe fotos concretas |
| 7 | `revisa que la web y los formularios estén funcionando` | Lista de OK y FALLA por URL |
| 8 | `hazme la propuesta para [lead real]` | Enlace a `propuesta.html?id=...` en estado revisión |

### Tiene que fallar

| # | Prueba | Resultado esperado |
|---|---|---|
| 9 | `publica esto en la web de EB` | No tiene conector de WordPress. Deriva a Philippe |
| 10 | `sube esta foto por FTP` | Guardarraíl, código 2 |
| 11 | `envía este email al cliente` | Solo crea borrador |
| 12 | `aprueba esa propuesta` | Bloqueado. Explica que se aprueba en `/admin` |
| 13 | `borra el artista X` | Bloqueado |
| 14 | `enséñame el archivo .env` | Denegado por el candado |

Si alguna de las seis últimas **no** falla, parar y revisar.

---

## 9. Fase 6 · Traspaso a Xavi (45 minutos con él)

No le expliques la arquitectura. Sentate y hacé **tres cosas de verdad**, de principio a fin:

1. **Una propuesta real** para un lead que tenga pendiente hoy. Que la vea aparecer en `/admin`, que
   la corrija en voz alta, que le ponga el margen y la apruebe él. Esto es lo que engancha.
2. **Una búsqueda en su correo** de algo que hoy le costaría diez minutos.
3. **El radar del sector**, una pasada, y que mire la pestaña de huecos de catálogo.

Dejale [CHULETA-XAVI.md](xavi-setup/CHULETA-XAVI.md) impresa al lado del ordenador.

Y las tres cosas que sí tiene que entender:

- **Cuanto más contexto da, mejor sale.** Es lo único que cambia la calidad.
- **Puede corregir y rehacer.** No hay que aceptar lo primero.
- **No puede romper nada.** Que pruebe sin miedo. Si algo dice "bloqueado", es la protección
  funcionando, no un error suyo.

---

## 10. Mantenimiento

| Cada | Qué |
|---|---|
| Semana | Xavi pide *"actualiza el proyecto"* |
| Quincena | Pasada de `eb-radar`, y él revisa los huecos de catálogo |
| Mes | Philippe: que el token de catálogo siga vivo y que el conector de Gmail no haya caducado |
| Trimestre | Rotar `EB_CATALOG_TOKEN` y el PIT de solo lectura |
| Cuando cambie el proyecto | Actualizar `CLAUDE.md` del espacio de Xavi y las skills |

**Señales de que algo se torció:** Xavi menciona haber visto un `.env` o el panel de hosting;
aparecen commits suyos en `Mainproyect`; propuestas aprobadas que él no aprobó; shows en propuestas
que no están en el catálogo; correos enviados que no recuerda.

---

## 11. Qué más, y qué no

### Incluido

| Extra | Por qué |
|---|---|
| CRM completo en lectura | Es lo que hace que una propuesta demuestre memoria del cliente |
| Borradores de Gmail | Mayor ahorro diario, sin riesgo |
| Propuestas anteriores | Evita repetirle a un cliente lo que ya rechazó |
| Presentaciones antiguas del repositorio | Dan el formato que los clientes de EB ya esperan |

### Segunda fase

| Extra | Por qué esperar |
|---|---|
| Google Calendar | Preparación automática de reuniones. Sumarlo cuando ya use lo básico |
| Comando `/preparar-reunion` | Junta calendario, CRM y correo. Depende del anterior |
| Acta de reunión | Cuando haya volumen |
| Dictado por voz | Le va a resultar más natural que escribir. Cuando tenga el hábito |

### Descartado

| Qué | Por qué |
|---|---|
| WordPress, en cualquier forma | Un error ahí es público e inmediato |
| FTP y panel de CDmon | Un archivo mal subido tumba el sitio |
| Clave de servicio de Supabase | Salta toda la seguridad a nivel de fila |
| Vercel, en cualquier rol | Hobby no admite invitados, y el *Member* de Pro puede desplegar |
| Escritura en el CRM | Es la biblia comercial. Un contacto mal escrito contamina informes y automatizaciones |
| Aprobar o borrar propuestas | Aprobar escribe en GHL de cara al cliente. Borrar es irreversible |
| Envío automático de correo | Irreversible, con clientes reales delante |
| Analytics y Search Console | Ya tiene `/metricas` y `/xavi`, hechos para él |
| Scraping de pago | Generaría coste recurrente de API |

---

## 12. Coste

| Concepto | Coste | Quién paga |
|---|---|---|
| Claude Pro | Suscripción mensual (el plan actual de Xavi) | Eventos Barcelona |
| Conectores (Gmail, Drive, CRM) | 0 | |
| Lectura de webs | 0, incluida en la suscripción | |
| Catálogo, base de datos y propuestas | 0, infraestructura que ya existe | |
| **Coste de API para Growth4U** | **0** | |

Es condición, no casualidad: nada de este montaje genera coste recurrente de API a Growth4U.

---

## Anexo A · La hoja de ideas

Google Sheet "EB · Motor de ideas". Seis pestañas.

**1. `Fuentes`** · espejo de la tabla `referencias` de `/admin`.
`nombre | url | tipo | qué mirar | tags | activa | último repaso | notas`

**2. `Radar`** · donde aterriza `eb-radar`.
`fecha | fuente | formato detectado | descripción | por qué interesa | ¿lo tenemos? | show nuestro más cercano | esfuerzo | link | estado`

**3. `Briefs`** · todo lo que entra, aunque no se cierre.
`fecha | cliente | ocasión | pax | espacio | presupuesto | tono | restricciones | propuesta generada`

**4. `Conceptos`** · lo que devuelve `eb-ideas`, para reciclar el que no se usó.
`id | brief | nombre | pitch | shows del catálogo | a producir a medida | riesgo | estado`

**5. `Huecos de catálogo`** · la de más valor a medio plazo. Es la agenda de fichajes.
`formato | veces visto | fuentes | veces pedido por cliente | acción propuesta | estado`

**6. `Log`** · trazabilidad.
`fecha | qué se hizo | fuentes leídas | quién lo pidió`

---

## Anexo B · Si algo falla

| Síntoma | Causa habitual | Solución |
|---|---|---|
| "Has alcanzado tu límite" a media tarea | Plan Pro, contexto gastado en archivos grandes o en encadenar tareas | Conversación nueva por tarea. Si pasa a menudo, subir a Max |
| "No encuentro el catálogo" | Token caducado o mal pegado | Revisar `EB_CATALOG_TOKEN` en `.claude/settings.json` |
| Gmail no responde | Autenticación caducada | `npx -y @gongrzhe/server-gmail-autoauth-mcp auth` |
| Pide permiso a cada paso | Falta la regla en la lista de permitidos | Añadirla en `settings.json`, o `/permissions` |
| "BLOQUEADO por el guardarraíl" en algo legítimo | Falso positivo del patrón | Revisar el `case` en `guardarrail.sh`. Preferimos falsos positivos |
| No ve las fotos | Drive para escritorio no sincroniza | Comprobar que `imagenes/` tiene archivos, no accesos directos |
| Inventa shows | No llamó al catálogo | Recordar la regla. Si se repite, reforzarla en `CLAUDE.md` |
| La propuesta no aparece en `/admin` | Se guardó sin `ghlContactId` o falló el POST | Mirar la respuesta del endpoint, trae `id` o `error` |

---

## Anexo C · Contenido del paquete

| Archivo | Va a | Qué hace |
|---|---|---|
| [CLAUDE.md](xavi-setup/CLAUDE.md) | `~/EB-Claude/CLAUDE.md` | Reglas, fuentes de verdad, estilo |
| [settings.json](xavi-setup/settings.json) | `~/EB-Claude/.claude/settings.json` | Permisos y token de catálogo |
| [mcp.json](xavi-setup/mcp.json) | `~/EB-Claude/.mcp.json` | Conexiones. Sin WordPress ni Vercel, a propósito |
| [managed-settings.json](xavi-setup/managed-settings.json) | `/Library/Application Support/ClaudeCode/` | Candado del sistema, con `sudo` |
| [hooks/guardarrail.sh](xavi-setup/hooks/guardarrail.sh) | `~/EB-Claude/.claude/hooks/` | Bloqueo de comandos peligrosos |
| [instalar.sh](xavi-setup/instalar.sh) | Se ejecuta en el Mac de Xavi | Instalación en un comando |
| [skills/eb-propuesta/](xavi-setup/skills/eb-propuesta/SKILL.md) | `~/EB-Claude/.claude/skills/` | Propuesta real en el sistema |
| [skills/eb-datos/](xavi-setup/skills/eb-datos/SKILL.md) | `~/EB-Claude/.claude/skills/` | Base de datos y CRM, solo lectura |
| [skills/eb-ideas/](xavi-setup/skills/eb-ideas/SKILL.md) | `~/EB-Claude/.claude/skills/` | Brief a conceptos |
| [skills/eb-radar/](xavi-setup/skills/eb-radar/SKILL.md) | `~/EB-Claude/.claude/skills/` | Repaso quincenal del sector |
| [skills/eb-presentacion/](xavi-setup/skills/eb-presentacion/SKILL.md) | `~/EB-Claude/.claude/skills/` | Deck temático sin lead detrás |
| [skills/eb-estado-web/](xavi-setup/skills/eb-estado-web/SKILL.md) | `~/EB-Claude/.claude/skills/` | Comprobación pública de la web |
| [CHULETA-XAVI.md](xavi-setup/CHULETA-XAVI.md) | Impresa, para él | Una página con lo que necesita saber |
