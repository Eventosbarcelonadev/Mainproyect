# Claude para Xavi · instructivo de instalación completo

**Objetivo:** que Xavi tenga Claude trabajando con el proyecto de Eventos Barcelona de forma autónoma,
con acceso real al negocio (repositorio, Gmail, banco de imágenes, catálogo, CRM) y **sin
ninguna posibilidad de tocar la web ni de romper producción**.

**Quién ejecuta qué:** las fases 0, 2 y 4 las hace Philippe. La fase 1 se hace en el Mac de Xavi,
con Xavi delante. La fase 6 es la sesión de traspaso con él.

**Tiempo total:** unas 3 horas, repartidas en 2 sesiones (preparación en frío, e instalación con Xavi).

**Paquete de archivos:** todo lo que hay que copiar está en [docs/xavi-setup/](xavi-setup/).

---

## 1. El modelo de seguridad

La pregunta que hay que responder antes de instalar nada es: si Claude se equivoca o si Xavi le pide
algo que no debería, ¿qué es lo peor que puede pasar? La respuesta tiene que ser "nada irreversible".

Tres anillos:

| Anillo | Qué hay dentro | Permiso |
|---|---|---|
| **Escribe** | Su carpeta local `trabajo/`, su repositorio `eb-xavi`, la hoja de ideas de Drive, borradores de Gmail | Total |
| **Lee** | Repositorio `Mainproyect`, catálogo de shows, banco de imágenes, CRM (GHL), la web pública, webs de la competencia | Solo lectura |
| **Prohibido** | WordPress, FTP de CDmon, panel de hosting, clave de servicio de Supabase, despliegues de Vercel, envío de emails, escritura en el CRM | Sin acceso |

La regla que lo resume: **Claude de Xavi produce material, no cambia sistemas.**

### Las cuatro capas de protección

Se aplican todas, porque cada una tapa los agujeros de la anterior.

1. **Permisos en el origen.** Es la capa que de verdad importa. La cuenta de GitHub de Xavi tiene rol
   *Read* sobre `Mainproyect` y su token de CRM es de solo lectura. A Vercel directamente no tiene
   acceso. Aunque fallara todo lo demás, GitHub rechaza la escritura del lado del servidor.
2. **Ausencia de credenciales.** En su Mac no existen `WP_PASS`, `FTP_PASS`, `SUPABASE_SERVICE_KEY`
   ni `VERCEL_TOKEN`. No se puede usar lo que no está.
3. **Candado del sistema** (`managed-settings.json`). Lista de denegación que Xavi no puede editar
   ni saltarse, ni siquiera con `--dangerously-skip-permissions`.
4. **Guardarraíl** (hook `PreToolUse`). Inspecciona cada comando de terminal antes de ejecutarlo y
   bloquea lo que huela a producción.

> **Honestidad sobre los límites:** las reglas de denegación sobre comandos de terminal funcionan por
> prefijo y se pueden esquivar con comandos compuestos. Por eso el hook existe, y por eso las capas 1
> y 2 son las que hacen el trabajo pesado. No confíes solo en la lista de denegación.

---

## 2. Fase 0 · Preparación (Philippe, en frío, unos 45 minutos)

Checklist. Nada de esto necesita a Xavi delante salvo que haga falta que él acepte una invitación.

### 2.1 Cuentas y accesos

- [ ] **GitHub.** Que Xavi cree cuenta (o dar la que tenga). Invitarlo a
      `Eventosbarcelonadev/Mainproyect` con rol **Read**. Confirmar que aparece como *Read*, no *Write*.
- [ ] **Repositorio de trabajo.** Crear `Eventosbarcelonadev/eb-xavi`, **privado**, y darle rol **Write**.
      Ahí van sus presentaciones, ideas y notas, versionadas y respaldadas.
- [ ] **Vercel: NO se invita.** Verificado el 2026-08-28: el equipo esta en plan **Hobby**, que no
      admite invitados. Y en plan Pro el rol minimo es *Member*, que puede desplegar y leer las
      variables de entorno, o sea que rompe el modelo. El estado de la web se cubre con la skill
      `eb-estado-web`, que solo hace peticiones publicas. Ver [4.2](#42--estado-de-la-web).
- [ ] **Anthropic.** Cuenta de Claude a nombre de Xavi o de Eventos Barcelona. Plan **Max** recomendado
      (con Pro se queda corto en cuanto empieza a generar presentaciones). Lo paga EB, no Growth4U.

### 2.2 Google

- [ ] **Carpeta de Drive** "EB · Banco de imágenes". Meter dentro los reportajes fotográficos por evento
      (`Galadinner/`, `Aston martin/` y lo que haya suelto en el repositorio y en el Drive actual).
      Estructura sugerida: `AAAA/AAAA-MM-cliente-evento/`. Compartida con Xavi como **Lector**.
- [ ] **Hoja de cálculo** "EB · Motor de ideas", con las seis pestañas del [anexo A](#anexo-a--la-hoja-de-ideas).
      Compartida con Xavi como **Editor**.
- [ ] **Cliente OAuth de Google** para el conector de Gmail (ver [4.3](#43--gmail)). Se hace una vez,
      en la consola de Google Cloud, con la cuenta de EB.

### 2.3 Tokens

- [ ] **Token de catálogo.** Xavi ya tiene `GPT_ACTION_TOKEN` en su GPT personalizado, se puede
      reutilizar. Mejor higiene: crear uno propio (`EB_CATALOG_TOKEN`) para poder rotarlo sin romperle
      el GPT. Es un cambio de cinco líneas en `api/admin.js`, en la función `gptAuthOk`, para aceptar
      una lista de tokens en lugar de uno.
- [ ] **Token de CRM de solo lectura** (opcional pero recomendado). En GoHighLevel, crear un *Private
      Integration Token* nuevo con **solo** los scopes de lectura: `contacts.readonly`,
      `opportunities.readonly`, `calendars.readonly`, `conversations.readonly`. **No reutilizar el PIT
      que usa el proyecto**, que tiene permisos de escritura.

### 2.4 Material

- [ ] Copiar la carpeta [docs/xavi-setup/](xavi-setup/) a un pendrive o a un enlace de Drive.
- [ ] Imprimir o mandarle [CHULETA-XAVI.md](xavi-setup/CHULETA-XAVI.md).

---

## 3. Fase 1 · Instalación en el Mac de Xavi (unos 30 minutos)

### 3.1 Requisitos

```bash
# Node 22 (si no lo tiene: instalador de nodejs.org, no hace falta Homebrew)
node --version      # tiene que decir v22.x o superior

# Git
git --version
```

### 3.2 Instalar Claude Code

Dos caminos, y conviene hacer los dos:

```bash
npm install -g @anthropic-ai/claude-code
```

Y además la **app de escritorio** desde `claude.ai/download`. Xavi va a usar la app (interfaz normal,
sin terminal), pero la instalación por línea de comandos deja disponible el comando `claude`, que hace
falta para configurar las conexiones.

Iniciar sesión:

```bash
claude
# dentro: /login  → abre el navegador, entra con la cuenta de Claude de EB
```

### 3.3 Estructura de carpetas

```bash
mkdir -p ~/EB-Claude
cd ~/EB-Claude

# Espejo de solo lectura del proyecto
git clone https://github.com/Eventosbarcelonadev/Mainproyect.git mainproyect

# Su repositorio de trabajo
git clone https://github.com/Eventosbarcelonadev/eb-xavi.git trabajo
mkdir -p trabajo/presentaciones trabajo/ideas trabajo/briefs trabajo/notas

# Banco de imágenes local (se sincroniza con Drive, ver 4.4)
mkdir -p imagenes
```

Queda así:

```
~/EB-Claude/
├── CLAUDE.md            reglas del espacio de trabajo
├── .mcp.json            conexiones
├── .claude/
│   ├── settings.json    permisos
│   ├── hooks/
│   │   └── guardarrail.sh
│   └── skills/
│       ├── eb-presentacion/
│       ├── eb-ideas/
│       └── eb-radar/
├── mainproyect/         SOLO LECTURA
├── trabajo/             suyo, escribe libremente
└── imagenes/            banco de imágenes
```

### 3.4 Copiar el paquete

```bash
cd ~/EB-Claude
mkdir -p .claude/hooks .claude/skills

cp /ruta/al/paquete/CLAUDE.md          ./CLAUDE.md
cp /ruta/al/paquete/mcp.json           ./.mcp.json
cp /ruta/al/paquete/settings.json      ./.claude/settings.json
cp /ruta/al/paquete/hooks/guardarrail.sh ./.claude/hooks/guardarrail.sh
cp -R /ruta/al/paquete/skills/*        ./.claude/skills/

chmod +x .claude/hooks/guardarrail.sh
```

Y reemplazar los marcadores. Hay tres:

```bash
# 1. El usuario real del Mac de Xavi
sed -i '' "s/USUARIO/$(whoami)/g" .claude/settings.json

# 2. El token de catálogo, en .claude/settings.json → env.EB_CATALOG_TOKEN
# 3. El PIT de solo lectura del CRM, en .mcp.json → ghl-lectura
#    (editar a mano, no dejarlos en el historial de la terminal)
```

---

## 4. Fase 2 · Las conexiones

Cada una con: para qué sirve, cómo se conecta, cómo se comprueba, qué queda cerrado.

### 4.1 · Repositorio

**Para qué:** que Claude conozca el negocio de verdad. En `mainproyect/` están la pirámide de keywords,
el ICP de outbound, los briefs, los planes, la documentación de arquitectura y las presentaciones
antiguas. Sin esto, Claude responde de memoria genérica.

**Cómo:** ya está, con el `git clone` de 3.3. No hace falta ningún conector de GitHub: Claude lee los
archivos del disco directamente, que además es más rápido y no consume nada.

**Comprobación:**
```
Xavi: ¿qué dice la pirámide de keywords sobre "espectáculos para eventos de empresa"?
```
Tiene que citar `mainproyect/docs/SEO-PIRAMIDE-KEYWORDS.md`.

**Qué queda cerrado:** el rol *Read* de GitHub hace que cualquier `git push` sea rechazado por el
servidor. Además hay regla de denegación y el guardarraíl lo bloquea antes de intentarlo.

**Mantenimiento:** que Xavi corra `git pull` en `mainproyect/` de vez en cuando, o pedirle a Claude
"actualiza el proyecto". Se le puede poner un alias, pero con decírselo a Claude alcanza.

### 4.2 · Estado de la web

**Para qué:** que Xavi pueda preguntar "¿la web va bien?", "un cliente dice que el formulario no
funciona, ¿es verdad?" sin depender de Philippe.

**Cómo NO se hace:** el plan previsto era el conector de Vercel con rol *Viewer*. **No es viable**
y conviene dejarlo escrito para no volver a intentarlo: el equipo `Eventosbarcelona` está en plan
**Hobby**, que no admite invitar miembros, y subir a Pro tampoco sirve porque ahí el rol mínimo es
*Member*, que puede desplegar y leer variables de entorno. El rol *Viewer* de solo lectura es
exclusivo de Enterprise.

**Cómo se hace:** la skill `eb-estado-web` comprueba por HTTP público la web, los dos formularios,
el catálogo y los dos paneles. Cero credenciales, cero acceso a infraestructura, mismo resultado
práctico para Xavi. Si algo falla, informa en lenguaje normal y deriva a Philippe.

**Comprobación:**
```
Xavi: revisa que la web y los formularios estén funcionando
```

**Qué queda cerrado:** no hay ningún acceso a Vercel en su equipo. No hay nada que cerrar.

### 4.3 · Gmail

**Para qué:** es probablemente lo que más tiempo le va a ahorrar. Buscar el hilo de un cliente,
resumir una cadena de veinte correos, preparar borradores de respuesta, sacar el brief que llegó
enterrado en un email de hace tres semanas.

**Cómo:** el conector `@gongrzhe/server-gmail-autoauth-mcp` (el mismo que ya usamos), autenticado con
**la cuenta de Google de Xavi**. Configuración de una vez:

1. En Google Cloud Console, con la cuenta de EB: crear un proyecto (o usar el que ya existe),
   habilitar la **Gmail API**, y crear credenciales **OAuth · Aplicación de escritorio**.
2. Descargar el JSON y guardarlo como `~/.gmail-mcp/gcp-oauth.keys.json` en el Mac de Xavi.
3. Autenticar:
   ```bash
   npx -y @gongrzhe/server-gmail-autoauth-mcp auth
   ```
   Se abre el navegador. Xavi entra con **su** cuenta y acepta.

**Comprobación:**
```
Xavi: busca los correos de la última semana que traigan una petición de presupuesto y resúmelos
```

**Qué queda cerrado:** esto es importante y es una decisión deliberada. Las herramientas
`send_email`, `delete_email`, `batch_delete_emails`, `batch_modify_emails` y las de filtros están
**denegadas** en `settings.json`. Claude puede leer, buscar, descargar adjuntos y **crear borradores**.
Enviar lo hace Xavi, a mano, después de leer. Un email mal enviado a un cliente no se deshace.

### 4.4 · Banco de imágenes

Hay tres fuentes y conviene entender por qué son tres.

**a) Automática, vía catálogo (es la que usa la skill de presentaciones).**
`GET /api/gpt/show?ids=...` ya devuelve `image_url` y `video_url` de cada show, que son URLs públicas
del almacenamiento de Supabase. No hace falta credencial ninguna: cuando Claude monta un deck, las
fotos de los shows salen solas. Esto ya funciona hoy.

**b) Google Drive, para reportajes de eventos producidos.**
Las fotos de eventos reales (las de `Galadinner/`, `Aston martin/` y las que tenga Xavi sueltas) no
están en la base de datos. Van a la carpeta "EB · Banco de imágenes" de Drive. Se conecta con el
**conector de Google Drive** de Claude:

```
En claude.ai → Configuración → Conectores → Google Drive → conectar con la cuenta de EB
```

Una vez conectado ahí, aparece también dentro de Claude Code. Cuesta cero y no consume API.

**c) Carpeta local `imagenes/`, para que Claude pueda *ver* las fotos.**
Esta es la que se olvida y es la que más importa. Para elegir la mejor foto de un show y escribir un
alt text que sirva, Claude tiene que **mirar** la imagen, y eso solo lo hace con archivos locales.
Solución: instalar **Google Drive para escritorio** en el Mac de Xavi y sincronizar la carpeta del
banco a `~/EB-Claude/imagenes/`.

**Comprobación:**
```
Xavi: mira las fotos de la carpeta de imágenes del gala dinner y dime cuáles tres usarías
      para una propuesta de cena de gala elegante, y por qué
```

**Qué queda cerrado:** `imagenes/` está en la lista de denegación de escritura. Claude mira y usa, no
borra ni renombra el banco.

### 4.5 · Catálogo de shows

**Para qué:** es la fuente de verdad de qué puede producir EB. Sin esto, Claude inventa espectáculos,
que es exactamente el fallo que más daño hace delante de un cliente.

**Cómo:** ya está resuelto. `EB_CATALOG_TOKEN` va en `settings.json` (bloque `env`), y las skills lo
usan con `curl`. La regla `Bash(curl -s https://propuestas.eventosbarcelona.com/api/gpt/:*)` está en la
lista de permitidos para que no pregunte cada vez.

**Comprobación:**
```
Xavi: ¿qué shows aéreos tenemos activos?
```
Tiene que devolver nombres con id real, y decir "a producir a medida" para lo que no exista.

**Qué queda cerrado:** el endpoint es solo GET. No hay forma de escribir en el catálogo desde ahí.

### 4.6 · CRM (GoHighLevel), opcional pero recomendado

**Para qué:** presentaciones de verdad personalizadas. Antes de montar un deck para una agencia,
Claude mira si ya fue cliente, qué contrataron, qué presupuesto movieron, con quién se habló y qué
quedó abierto. Es la diferencia entre una propuesta genérica y una que demuestra memoria.

**Cómo:** el servidor `ghl-lectura` de `.mcp.json`, con el PIT de solo lectura de 2.3.

**Comprobación:**
```
Xavi: ¿qué tenemos de [nombre de una agencia real] en el CRM?
```

**Qué queda cerrado:** las herramientas de escritura (`create-contact`, `update-contact`,
`update-opportunity`, `send-a-new-message`, publicación en blog y redes) están denegadas en
`settings.json`, y además el token no tiene los scopes para hacerlas. Doble cierre a propósito.

**Si preferís no darle CRM al principio:** borrá el bloque `ghl-lectura` de `.mcp.json` y las líneas
`mcp__ghl-lectura__*` de `settings.json`. Todo lo demás sigue funcionando. Se puede añadir más tarde.

---

## 5. Fase 3 · Los dos módulos de trabajo

### 5.1 · Hoja de ideas con lectura de webs

Xavi lleva años proponiendo cosas parecidas a clientes parecidos. Este módulo ataca eso.

**Ya existe media pieza:** en `/admin` hay una pestaña **Ideas** con una tabla `referencias` (las siete
webs del sector que pasó Xavi) y un historial de sesiones. Lo que falta es que **Claude** pueda leer
esas fuentes, extraer lo aprovechable y dejarlo escrito en algún sitio donde Xavi lo mire.

**La pieza nueva:** la hoja "EB · Motor de ideas" en Drive, con seis pestañas ([anexo A](#anexo-a--la-hoja-de-ideas))
y dos skills:

- **`eb-radar`** · rutina quincenal. Recorre las webs de referencia, detecta formatos que EB no tiene,
  y vuelca una fila por hallazgo en la pestaña `Radar`. Lo consolida en `Huecos de catálogo`, que es
  la salida realmente valiosa: **la lista de artistas a fichar**.
- **`eb-ideas`** · a demanda. Brief de cliente → tres conceptos distintos entre sí, uno seguro, uno de
  autor y uno arriesgado, cada uno anclado en shows con id real.

**Sobre la lectura de webs, tres decisiones tomadas:**

1. **Sin herramientas de pago.** Solo `WebFetch` y `WebSearch`, que van incluidos en la suscripción.
   Nada de Firecrawl ni de servicios de scraping por API. Esto no es un detalle: es la regla de que
   nada en EB genere coste recurrente de API.
2. **Con cabeza.** Máximo 8 a 10 páginas por fuente y por pasada, respetando `robots.txt`, cadencia
   quincenal. No hace falta más y evita que nos bloqueen.
3. **Inspiración, no copia.** Se registran formatos e ideas con la fuente citada. Nunca su texto, sus
   fotos ni sus nombres de acto. Y esas agencias no se nombran en ningún documento que vea un cliente.

**Puesta en marcha:** sembrar la pestaña `Fuentes` con las siete que ya están en la base de datos
(Scarlett, Contraband, Stormont, 42.show, Sintonizart, Creartys, Talents) y correr el radar una vez
con Xavi delante, para que vea la salida y ajuste qué le interesa.

### 5.2 · Presentaciones temáticas

**El punto de partida:** las presentaciones antiguas (`Presentaciones viejas/`) son cuatro PPTX
genéricos por categoría, *CIRCO GLOBAL*, *DANZA GLOBAL*, *MUSICA Global*, *PERFORMANCE GLOBAL*, más
alguna hecha a mano para un cliente concreto. Genéricas, desactualizadas, y personalizarlas cuesta
una tarde.

**Lo que la skill `eb-presentacion` cambia:** el deck se genera desde el catálogo activo, con las fotos
reales de cada show, personalizado con el contexto del cliente (su web, su historial en el CRM, el hilo
de email del brief), en el sistema visual de las propuestas de EB (`propuesta.html`: DM Serif Display
para titulares, Inter para el resto, y color de acento según la categoría dominante).

**Salida:** un HTML autocontenido en `trabajo/presentaciones/AAAA-MM-DD-cliente-tema/`, más PDF si lo
pide. Si un cliente exige PPTX, la skill `pptx` lo genera desde el mismo contenido.

**Las dos reglas que hacen que esto no explote:**

- Todo show tiene que tener un `id` real del catálogo. Lo que no está se marca "a producir a medida".
- Los precios salen de `base_price` y `price_note` del catálogo. Lo que no tenga precio queda como
  `[PENDIENTE]` bien visible para que Xavi lo complete. Nunca se estima.

---

## 6. Fase 4 · Blindaje (Philippe, 10 minutos)

Las capas 1 y 2 ya quedaron cerradas en la fase 0 (roles y ausencia de credenciales). Faltan las otras dos.

### 6.1 Candado del sistema

Este archivo Xavi **no lo puede editar ni ignorar**, ni con `--dangerously-skip-permissions`.

```bash
sudo mkdir -p "/Library/Application Support/ClaudeCode"
sudo cp /ruta/al/paquete/managed-settings.json \
        "/Library/Application Support/ClaudeCode/managed-settings.json"

# reemplazar USUARIO por el usuario real del Mac
sudo sed -i '' "s/USUARIO/$(whoami)/g" \
        "/Library/Application Support/ClaudeCode/managed-settings.json"

sudo chown root:wheel "/Library/Application Support/ClaudeCode/managed-settings.json"
sudo chmod 644 "/Library/Application Support/ClaudeCode/managed-settings.json"
```

Contiene: denegación del conector de WordPress, de la lectura y escritura de archivos de credenciales,
de FTP, de los comandos de Vercel y Supabase, de `git push` y de `sudo`. Más
`disableBypassPermissionsMode`, que es lo que impide saltarse los permisos.

### 6.2 Guardarraíl

Ya copiado en 3.4. Se registra desde el candado (bloque `hooks`), no desde los ajustes del proyecto,
justamente para que no se pueda desactivar.

Probarlo antes de dar por buena la instalación:

```bash
printf '%s' '{"tool_name":"Bash","tool_input":{"command":"git push origin main"}}' \
  | ~/EB-Claude/.claude/hooks/guardarrail.sh ; echo "codigo: $?"
# tiene que decir codigo: 2
```

El guardarraíl está probado contra estos ocho casos y los ocho pasan:

| Comando | Resultado |
|---|---|
| `curl -X POST .../wp-json/mcp/x` | bloqueado |
| `git push origin main` | bloqueado |
| `cat .env` | bloqueado |
| `curl -T foto.jpg ftp://host/...` | bloqueado |
| `vercel deploy --prod` | bloqueado |
| `git status` | permitido |
| `curl -s .../api/gpt/catalogo` | permitido |
| `ls trabajo/presentaciones` | permitido |

No tiene dependencias (ni node, ni python, ni jq) a propósito: los hooks se ejecutan con un entorno
mínimo y no se puede dar por hecho que nada esté en el `PATH`.

---

## 7. Fase 5 · Verificación

No des la instalación por buena hasta que pasen las doce. Las seis primeras tienen que **funcionar**,
las seis últimas tienen que **fallar**.

### Tiene que funcionar

| # | Prueba | Resultado esperado |
|---|---|---|
| 1 | `¿qué shows de circo tenemos activos?` | Lista con ids reales del catálogo |
| 2 | `¿qué dice la pirámide de keywords sobre eventos de empresa?` | Cita `mainproyect/docs/SEO-PIRAMIDE-KEYWORDS.md` |
| 3 | `busca en mi correo los emails de esta semana con peticiones de presupuesto` | Resumen de hilos reales |
| 4 | `revisa que la web y los formularios estén funcionando` | Lista de OK y FALLA por cada URL |
| 5 | `mira las fotos de imagenes/ y dime cuáles usarías para una cena de gala` | Describe fotos concretas |
| 6 | `hazme una presentación para [cliente de prueba], gala dinner, 150 pax, 20 de octubre` | HTML en `trabajo/presentaciones/` que abre bien |

### Tiene que fallar

| # | Prueba | Resultado esperado |
|---|---|---|
| 7 | `publica esto como borrador en la web de EB` | No tiene conector de WordPress. Deriva a Philippe |
| 8 | `sube esta foto por FTP al hosting` | Guardarraíl, código 2 |
| 9 | `envía este email al cliente` | Solo crea borrador y avisa de que no puede enviar |
| 10 | `haz un deploy en Vercel` | No tiene acceso ni conector. Guardarraíl lo bloquea igual |
| 11 | `enséñame el archivo .env del proyecto` | Denegado por el candado |
| 12 | `sube estos cambios al repositorio principal` | GitHub lo rechaza (rol Read) y el guardarraíl lo para antes |

Si alguna de las seis últimas **no** falla, parar y revisar antes de dejarle el equipo a Xavi.

---

## 8. Fase 6 · Traspaso a Xavi (45 minutos con él)

No le expliques la arquitectura. Le interesa cero y no la va a recordar. Sentate con él y hacé
**tres cosas de verdad**, de principio a fin:

1. **Una presentación real** para un cliente que tenga pendiente esta semana. Que la vea salir,
   que la corrija en voz alta ("el segundo show no, demasiado clásico"), que la reciba en su carpeta.
   Esto es lo que engancha.
2. **Una búsqueda en su correo**, de algo que hoy le costaría diez minutos encontrar.
3. **El radar del sector**, una pasada, y que mire la pestaña de huecos de catálogo.

Dejale [CHULETA-XAVI.md](xavi-setup/CHULETA-XAVI.md) impresa al lado del ordenador.

Y decile las tres cosas que de verdad tiene que entender:

- **Cuanto más contexto da, mejor sale.** Es lo único que cambia la calidad del resultado.
- **Puede corregir y rehacer.** No hay que aceptar lo primero.
- **No puede romper nada.** Que pruebe sin miedo. Si algo dice "bloqueado", es la protección
  funcionando, no un error suyo.

---

## 9. Mantenimiento

| Cada | Qué |
|---|---|
| Semana | Xavi pide "actualiza el proyecto" (hace `git pull` en `mainproyect/`) |
| Quincena | Pasada de `eb-radar`, y Xavi revisa la pestaña de huecos |
| Mes | Philippe revisa: que el token de catálogo siga vivo y que el conector de Gmail no haya caducado |
| Trimestre | Rotar `EB_CATALOG_TOKEN` y el PIT de solo lectura del CRM |
| Cuando cambie algo del proyecto | Actualizar `CLAUDE.md` del espacio de Xavi y las skills |

**Señales de que algo se torció:**

- Xavi menciona haber visto un archivo `.env`, credenciales o el panel de hosting.
- Aparecen commits suyos en `Mainproyect` (no debería poder).
- Presentaciones con shows que no están en el catálogo.
- Emails enviados que él no recuerda haber enviado.

Ante cualquiera de ellas: revisar las cuatro capas antes de seguir.

---

## 10. Qué más le daría, y qué no

Lo que se preguntó explícitamente: qué más tiene sentido conectar.

### Vale la pena, y está incluido

| Extra | Por qué |
|---|---|
| **CRM en solo lectura** | Es lo que convierte una presentación genérica en una personalizada. Ver [4.6](#46--crm-gohighlevel-opcional-pero-recomendado) |
| **Borradores de Gmail** | El mayor ahorro de tiempo diario, y sin riesgo porque no envía |
| **Presentaciones antiguas en el repositorio** | `Presentaciones viejas/` da el formato que los clientes de EB ya esperan |

### Vale la pena, para una segunda fase

| Extra | Por qué esperar |
|---|---|
| **Google Calendar** | Preparación automática de reuniones ("mañana ves a X, esto es lo que hay"). Muy útil, pero mejor sumarlo cuando ya use lo básico |
| **Comando `/preparar-reunion`** | Junta calendario, CRM y correo en un briefing. Depende del anterior |
| **Skill de acta de reunión** | De la grabación o las notas al resumen con próximos pasos. Se hace cuando haya volumen |
| **Dictado por voz** | A Xavi le va a resultar más natural que escribir. Sumarlo cuando ya tenga el hábito |

### No se lo daría

| Descartado | Por qué |
|---|---|
| **WordPress, en cualquier forma** | Es el pedido explícito, y es correcto: un error ahí es público e inmediato |
| **FTP y panel de CDmon** | Un archivo mal subido tumba el sitio |
| **Clave de servicio de Supabase** | Salta toda la seguridad a nivel de fila. Con lectura pública alcanza |
| **Vercel, en cualquier rol** | Hobby no admite invitados, y el rol Member de Pro puede desplegar y leer variables de entorno |
| **Escritura en el CRM** | El CRM es la biblia comercial. Un contacto mal escrito contamina informes y automatizaciones |
| **Envío automático de emails** | Irreversible, y con clientes reales delante |
| **Google Analytics y Search Console** | No hace falta: ya tiene [`/metricas`](https://propuestas.eventosbarcelona.com/metricas) y [`/xavi`](https://propuestas.eventosbarcelona.com/xavi), que están hechos para él |
| **Herramientas de scraping de pago** | Generarían coste recurrente de API. `WebFetch` alcanza |

---

## 11. Coste

| Concepto | Coste | Quién paga |
|---|---|---|
| Claude Max | La suscripción mensual | Eventos Barcelona |
| Conector de Gmail | 0 (la Gmail API es gratuita en este volumen) | |
| Conector de Google Drive | 0 | |
| Lectura de webs | 0 (incluida en la suscripción) | |
| Catálogo y CRM | 0 (infraestructura que ya existe) | |
| **Coste de API para Growth4U** | **0** | |

Esto último es deliberado y es condición: nada de este montaje genera coste recurrente de API a
Growth4U. Todo va contra la suscripción de Claude de EB o contra infraestructura que ya está pagada.

---

## Anexo A · La hoja de ideas

Google Sheet "EB · Motor de ideas". Seis pestañas.

**1. `Fuentes`** · espejo de la tabla `referencias` de `/admin`, para que Xavi la mantenga desde donde
le resulte cómodo.

`nombre | url | tipo | qué mirar | tags | activa | último repaso | notas`

**2. `Radar`** · aquí aterriza lo que encuentra `eb-radar`. Una fila por hallazgo.

`fecha | fuente | formato detectado | descripción (1 línea) | por qué interesa | ¿lo tenemos? | show nuestro más cercano | esfuerzo | link | estado`

`¿lo tenemos?`: sí / no / parcial. `estado`: nuevo / descartado / a producir / en catálogo.

**3. `Briefs`** · un registro de todo lo que entra, aunque no se cierre.

`fecha | cliente | ocasión | pax | espacio | presupuesto | tono | restricciones | presentación generada`

**4. `Conceptos`** · lo que devuelve `eb-ideas`, para poder reciclar el que no se usó.

`id | brief | nombre del concepto | pitch | shows del catálogo | a producir a medida | riesgo | estado`

**5. `Huecos de catálogo`** · la pestaña que más valor tiene a medio plazo.

`formato | veces visto | fuentes donde aparece | veces pedido por cliente | acción propuesta | estado`

`acción propuesta`: fichar artista / producir a medida / descartar. Esta lista es la agenda de
fichajes de EB, y encaja con el posicionamiento de catálogo curado en vez de directorio.

**6. `Log`** · trazabilidad.

`fecha | qué se hizo | fuentes leídas | quién lo pidió`

---

## Anexo B · Si algo falla

| Síntoma | Causa habitual | Solución |
|---|---|---|
| "No encuentro el catálogo" | Token caducado o mal pegado | Revisar `EB_CATALOG_TOKEN` en `.claude/settings.json` |
| El conector de Gmail no responde | Autenticación caducada | `npx -y @gongrzhe/server-gmail-autoauth-mcp auth` |
| Pide permiso a cada paso | Falta la regla en la lista de permitidos | Añadirla en `.claude/settings.json`, o usar `/permissions` |
| "BLOQUEADO por el guardarraíl" en algo legítimo | Falso positivo del patrón | Revisar el `case` en `guardarrail.sh`. Preferimos falsos positivos a falsos negativos |
| No ve las fotos | Drive para escritorio no está sincronizando | Comprobar que `~/EB-Claude/imagenes/` tiene archivos de verdad, no accesos directos |
| Inventa shows | No llamó al catálogo | Recordarle la regla. Si se repite, reforzarla en `CLAUDE.md` |

---

## Anexo C · Contenido del paquete

| Archivo | Va a | Qué hace |
|---|---|---|
| [CLAUDE.md](xavi-setup/CLAUDE.md) | `~/EB-Claude/CLAUDE.md` | Reglas del espacio de trabajo, fuentes de verdad, estilo |
| [settings.json](xavi-setup/settings.json) | `~/EB-Claude/.claude/settings.json` | Permisos del proyecto y token de catálogo |
| [mcp.json](xavi-setup/mcp.json) | `~/EB-Claude/.mcp.json` | Conexiones (Gmail, CRM). Sin WordPress ni Vercel, a propósito |
| [managed-settings.json](xavi-setup/managed-settings.json) | `/Library/Application Support/ClaudeCode/` | Candado del sistema, con `sudo` |
| [hooks/guardarrail.sh](xavi-setup/hooks/guardarrail.sh) | `~/EB-Claude/.claude/hooks/` | Bloqueo de comandos peligrosos |
| [skills/eb-presentacion/](xavi-setup/skills/eb-presentacion/SKILL.md) | `~/EB-Claude/.claude/skills/` | Presentaciones temáticas personalizadas |
| [skills/eb-ideas/](xavi-setup/skills/eb-ideas/SKILL.md) | `~/EB-Claude/.claude/skills/` | Brief a conceptos con catálogo real |
| [skills/eb-radar/](xavi-setup/skills/eb-radar/SKILL.md) | `~/EB-Claude/.claude/skills/` | Repaso quincenal del sector |
| [skills/eb-estado-web/](xavi-setup/skills/eb-estado-web/SKILL.md) | `~/EB-Claude/.claude/skills/` | Comprobación pública de que la web funciona |
| [skills/eb-datos/](xavi-setup/skills/eb-datos/SKILL.md) | `~/EB-Claude/.claude/skills/` | Consulta de artistas, shows, propuestas y CRM (solo lectura) |
| [instalar.sh](xavi-setup/instalar.sh) | Se ejecuta desde el Mac de Xavi | Instalación en un comando |
| [CHULETA-XAVI.md](xavi-setup/CHULETA-XAVI.md) | Impresa, al lado del ordenador | Una página con lo que necesita saber |
