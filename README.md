# WhatsApp Campaign Manager

API REST en Node.js para enviar un mensaje, con imagen opcional, a una lista de personas guardada en JSON. Utiliza **whatsapp-web.js**, vinculación por QR y una única sesión de WhatsApp. No requiere base de datos.

## Dedicatoria

Este proyecto nació para compartir una de las noticias más especiales de mi vida: la llegada de mi hijo. Cada mensaje lleva la alegría y la ilusión de esta nueva etapa.

Gracias, **Ine**, por tu amor, tu compañía y por compartir conmigo esta aventura. Este pequeño servicio guarda el recuerdo de una noticia inmensa para nuestra familia. ❤️

## Origen y tecnologías

Basado en el proyecto `rest-mgmt-incident-whatsapp` de Elthon y en la librería identificada en “Librería del chatbot WhatsApp”. Se conserva la idea de Express, `LocalAuth` y normalización de celulares ecuatorianos; se integra el envío en servicios REST y se reemplaza la lista fija por un JSON. No se importan contactos ni sesiones del proyecto de referencia.

| Componente | Versión | Función |
| --- | --- | --- |
| Node.js | 22.15+ (preferible una versión LTS mantenida) | Runtime, variables de entorno, watch y pruebas nativas |
| Express | 5.2.1 | Servicios REST |
| whatsapp-web.js | 1.34.7 | Vinculación y mensajes mediante WhatsApp Web |
| qrcode | 1.5.4 | QR en PNG y página de vinculación |
| Puppeteer | 25.11.0 (override) | Navegador actualizado para corregir alertas transitivas |

Las versiones directas están fijadas y `package-lock.json` fija las dependencias transitivas. `node --watch` reemplaza nodemon. Se eliminaron dependencias de consola y otras que no necesita este servicio.

`whatsapp-web.js` fija originalmente Puppeteer 24.38.0. Se aplica un `override` a 25.11.0 para corregir las alertas de extracción de archivos de su cadena de dependencias. Es una actualización mayor: al actualizar WhatsApp o Puppeteer, vuelve a comprobar vinculación y envío de texto e imagen. La auditoría npm de esta instalación reportó 0 vulnerabilidades conocidas.

## Instalación

Se necesita Node.js, npm, acceso a internet y WhatsApp en el teléfono. Ejecuta desde la raíz del repositorio:

```bash
npm ci
```

La instalación descarga el navegador utilizado por Puppeteer en `.cache/puppeteer`. En Linux también pueden requerirse las bibliotecas del sistema de [Puppeteer](https://pptr.dev/troubleshooting). Si ya utilizas Chrome, configura `PUPPETEER_EXECUTABLE_PATH` con su ruta completa.

En PowerShell:

```powershell
Copy-Item .env.example .env
Copy-Item data/contacts.example.json contactos.json
```

En Bash:

```bash
cp .env.example .env
cp data/contacts.example.json contactos.json
```

**Reemplaza los números ficticios del ejemplo por tus destinatarios antes de enviar.** Puedes comenzar con un solo contacto propio para verificar el flujo.

```bash
npm start
# Desarrollo con reinicio automático:
npm run dev
```

La API escucha por defecto en `http://127.0.0.1:3000`. Al arrancar, la API inicia automáticamente la conexión de WhatsApp y recupera las credenciales de LocalAuth. No envía mensajes automáticamente.

## Configuración

### Docker y Railway

El `Dockerfile` instala Node 22, Chromium de Debian, fuentes y `tini`. Ejecuta `npm ci`, incluido el parche de imágenes, y arranca la API con recuperación automática de sesión. `.dockerignore` solo permite código, scripts y manifiestos: no incluye credenciales, `.env`, contactos, imágenes personales ni dependencias locales.

Prueba local con Docker (PowerShell):

```powershell
docker build -t whatsapp-campaign-manager .
docker run --rm --name whatsapp-campaign-manager -p 3000:3000 -e API_KEY="TU_CLAVE_LARGA" -v whatsapp-session:/data whatsapp-campaign-manager
```

Detén primero el servidor local si utiliza el puerto 3000. La sesión del contenedor es independiente de la sesión local. El volumen `whatsapp-session` conserva las credenciales al recrear el contenedor.

En Railway:

1. Selecciona el repositorio y la rama `main`; Railway debe construir el `Dockerfile` de la raíz.
2. Define `API_KEY` con una clave larga y privada. El contenedor ya define `HOST=0.0.0.0` y `AUTH_DIR=/data/whatsapp`; la API respeta `PORT` proporcionado por el entorno.
3. Adjunta un volumen al servicio con ruta de montaje `/data`, antes de vincular WhatsApp. Utiliza una sola réplica.
4. Genera el dominio público en Settings → Networking. Añade `x-api-key` a todas las peticiones de Postman.
5. Consulta `GET /api/session`; en la primera vinculación espera `qr`, obtiene `GET /api/session/qr` y escanea la imagen. Tras vincular, espera `ready` y prueba con un solo contacto.

No copies la ruta Windows de Chrome a Railway ni subas tu `.env`. En el contenedor se utiliza `/usr/bin/chromium`. Chromium se ejecuta con `PUPPETEER_NO_SANDBOX=true` para el entorno de contenedor sin privilegios de sandbox; esto desactiva el aislamiento propio del navegador. Esa opción no se activa por defecto al ejecutar Node localmente. La API exige autenticación al escuchar fuera de localhost.

El contenedor no necesita una base de datos. Los archivos multipart se procesan en memoria y la sesión se guarda en el volumen. El dominio raíz `/` devuelve 404 por diseño; usa los endpoints `/api/...` para probar. No configures `/api/session` como healthcheck sin tener en cuenta que exige `x-api-key`.

| Variable | Valor predeterminado | Descripción |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Interfaz de escucha |
| `PORT` | `3000` | Puerto HTTP |
| `AUTH_DIR` | `./.wwebjs_auth` | Persistencia local de la sesión |
| `MESSAGE_DELAY_MS` | `1500` | Pausa entre contactos; de 0 a 60000 ms |
| `API_KEY` | vacío | Si se establece, exige `x-api-key` en todos los endpoints |
| `PUPPETEER_EXECUTABLE_PATH` | automático | Ruta opcional a Chrome |

Las rutas de configuración relativas se resuelven desde la raíz del proyecto. Para escuchar fuera de localhost se exige `API_KEY`. Si publicas la API, utiliza HTTPS mediante un proxy. Los contactos, imágenes y credenciales de sesión están excluidos de Git.

## Archivo de contactos

```json
[
  { "name": "Contacto de ejemplo", "phone": "+593990000000" },
  { "name": "Otro contacto", "phone": "0990000001" }
]
```

- `phone` es obligatorio y de tipo texto; `name` es opcional.
- Se aceptan números internacionales con código de país, con o sin `+`, espacios, paréntesis o guiones.
- Los celulares ecuatorianos `09XXXXXXXX` se convierten a `5939XXXXXXXX`.
- No incluyas `@c.us`. Para otros países utiliza el formato internacional.
- Los duplicados se eliminan después de normalizar, conservando el primer contacto.
- La lista debe tener entre 1 y 1000 entradas. Se valida completa antes de enviar y se recibe en el archivo adjunto de cada POST.
- El mismo texto se envía a todos; `name` identifica el resultado y no es una variable de plantilla.

## Servicio 1: sesión y QR

### Recuperación automática e inicio manual

```bash
curl -X POST http://127.0.0.1:3000/api/session
```

No necesitas este POST después de reiniciar: la recuperación comienza al arrancar el servidor. Se conserva como opción manual para reintentar tras un fallo. Responde `202 Accepted` mientras inicia o espera vinculación, y `200 OK` si ya está lista. Varias llamadas no crean sesiones duplicadas.

```json
{ "status": "starting", "qrDataUrl": null, "error": null }
```

### Consultar estado

```bash
curl http://127.0.0.1:3000/api/session
```

Estados: `disconnected`, `starting`, `qr`, `authenticated`, `ready` y `error`. Solo `ready`, junto con la comprobación de conexión activa, permite enviar. Cuando el estado es `qr`, `qrDataUrl` contiene la imagen PNG en formato data URL.

### Escanear QR

Solo si el estado es `qr` (primera vinculación o credenciales inválidas), abre:

```text
http://127.0.0.1:3000/api/session/qr
```

En el teléfono: **WhatsApp → Dispositivos vinculados → Vincular un dispositivo**. Escanea el QR y consulta el estado hasta que sea `ready`. Actualiza la página si el QR cambia. Si todavía no hay QR o la sesión ya está vinculada, la página devuelve `409 QR_NOT_AVAILABLE`.

Si configuraste API key, envía el encabezado también al obtener la página:

```bash
curl -H "x-api-key: TU_CLAVE" http://127.0.0.1:3000/api/session/qr -o qr.html
```

Abre `qr.html` localmente y elimínalo al terminar. El QR y la carpeta de sesión son privados. `LocalAuth` guarda las credenciales en `AUTH_DIR/session-campaign-manager/` y las reutiliza automáticamente tras un reinicio. Durante la conexión verás `starting` o `authenticated`; solo se informa `ready` cuando WhatsApp confirma que está conectado. Con el servidor apagado la API no está disponible. Si la sesión se recupera sin QR, `QR_NOT_AVAILABLE` es normal y no hace falta abrir esa página. WhatsApp puede solicitar volver a vincular si revoca la sesión.

Para conservar credenciales entre despliegues, `AUTH_DIR` debe apuntar a almacenamiento persistente. Si el entorno elimina esa carpeta al reiniciar o desplegar, será necesario escanear otro QR. El cierre normal del servidor destruye el navegador, sin hacer logout ni borrar las credenciales.

## Servicio 2: envío masivo

**POST `/api/messages/bulk`** con `multipart/form-data`.

| Campo | Tipo en Postman | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `contacts` | File | Sí | Archivo JSON UTF-8 de contactos, máximo 1 MB y de 1 a 1000 entradas |
| `message` | Text | Sí | Texto de 1 a 4096 caracteres, no vacío |
| `image` | File | No | Imagen PNG, JPEG o WebP, máximo 10 MB |

Ambos archivos se adjuntan desde tu equipo y se procesan en memoria; no se guardan ni se leen desde rutas del servidor. Se valida la lista completa y la imagen antes de enviar el primer mensaje. Los teléfonos se normalizan y se eliminan duplicados. Se admite JSON UTF-8 con o sin BOM.

El servicio ya no utiliza `CONTACTS_FILE`, `MEDIA_DIR` ni `imagePath`. Las peticiones con el antiguo body JSON deben migrarse a multipart. La imagen es opcional: sin `image` se envía solo texto; con `image`, el mensaje se utiliza como descripción de la imagen. Se verifica la firma del archivo, no solo su extensión o MIME declarado.

### PowerShell: solo texto

```powershell
curl.exe -X POST "http://127.0.0.1:3000/api/messages/bulk" -F "contacts=@contactos.json;type=application/json" --form-string "message=¡Tenemos una noticia hermosa!"
```

### PowerShell: con imagen

```powershell
curl.exe -X POST "http://127.0.0.1:3000/api/messages/bulk" -F "contacts=@contactos.json;type=application/json" --form-string "message=¡Vamos a ser papás! ❤️" -F "image=@noticia.jpg;type=image/jpeg"
```

Los archivos `contactos.json` y `noticia.jpg` están en la carpeta desde donde ejecutas curl. Puedes usar rutas completas. En Bash utiliza `curl` en lugar de `curl.exe`. Para un servidor remoto sustituye la URL local por su URL HTTPS; los archivos se siguen seleccionando desde tu equipo.

Con API key, agrega `-H "x-api-key: TU_CLAVE"`. No agregues manualmente `Content-Type`: `-F` genera `multipart/form-data` con su boundary.

### Postman

Selecciona **Body → form-data** y agrega las filas de la tabla: `contacts` como **File**, `message` como **Text** e `image` como **File** si deseas adjuntarla. Selecciona los archivos y marca sus casillas. El texto del mensaje es obligatorio aunque hayas adjuntado contactos e imagen.

Se admite un archivo por campo y un solo campo de texto `message`, de máximo 16 KB en el transporte. Los campos inesperados, archivos repetidos y formularios mal formados se rechazan. Los errores de transporte multipart se detectan antes de ejecutar el servicio; luego se comprueba la sesión y se valida el contenido.

### Respuesta

El POST espera a que termine la lista. `200` indica que todos los envíos fueron aceptados por el cliente; `207 Multi-Status` indica fallos o destinatarios omitidos.

```json
{
  "campaignId": "f49da1a7-6a64-4674-9c90-64a3716557b8",
  "total": 2,
  "sent": 1,
  "failed": 1,
  "skipped": 0,
  "results": [
    { "name": "Uno", "phone": "593990000000", "status": "sent", "messageId": "identificador-whatsapp" },
    { "name": "Dos", "phone": "593990000001", "status": "failed", "error": "NUMBER_NOT_REGISTERED" }
  ]
}
```

`sent` no confirma entrega ni lectura por parte de la persona. Si falla un destinatario, se continúa con los demás. Si se detecta una desconexión durante el lote, los pendientes quedan `skipped`. Los resultados no se almacenan: guarda la respuesta si necesitas consultarlos después.

Solo se procesa una campaña a la vez por proceso. **Repetir el POST vuelve a enviar a toda la lista**: no hay idempotencia ni reanudación persistente. Si el cliente HTTP pierde la conexión, el proceso puede seguir enviando; no reintentes automáticamente. Configura el timeout del cliente/proxy según la cantidad de contactos y la pausa entre mensajes. Ejecuta una única instancia por carpeta de sesión.

## Errores HTTP

### Compatibilidad de imágenes con WhatsApp Web

Para `whatsapp-web.js` 1.34.7 se aplica automáticamente, mediante `postinstall`, un parche puntual basado en la [corrección propuesta upstream #201923](https://github.com/wwebjs/whatsapp-web.js/pull/201923). Elimina `__x_id` del objeto saliente: ese campo interno del medio puede sobrescribir el identificador del mensaje y provocar `Data passed to getter must include an id property`.

El parche vive en `scripts/patch-whatsapp-media.js`, es idempotente y se reaplica con `npm install` o `npm ci`. Si instalas con `--ignore-scripts`, ejecuta `node scripts/patch-whatsapp-media.js` manualmente. Está limitado a la versión 1.34.7; al actualizar la librería hay que revisar si la corrección ya viene incluida. Reinicia Node y espera la recuperación automática de la sesión para cargar el código corregido en el navegador. No hace falta borrar las credenciales ni modificar el formulario multipart.

Si una campaña devuelve `SEND_FAILED`, cada resultado fallido incluye `detail` con la excepción de la librería (con datos sensibles del envío ocultos). La terminal de Node registra `[WhatsApp] Falló el envío` con el mismo `campaignId`, la posición del destinatario, tipo y tamaño del medio y la etapa: `resolve_recipient`, `send_image` o `send_text`. No se registran la lista de contactos, el mensaje ni el contenido de la imagen.

Después de modificar el código, reinicia Node antes de probar. Un fallo de envío no demuestra que el archivo multipart esté mal: si la validación de archivos falla, la API rechaza la solicitud antes de procesar destinatarios. Para diagnosticar, conserva `detail` y el registro de la terminal. No reintentes automáticamente la campaña completa, pues podrías duplicar mensajes aceptados previamente.

```json
{
  "error": {
    "code": "SESSION_NOT_CONNECTED",
    "message": "Conecta la sesión de WhatsApp antes de enviar mensajes."
  }
}
```

| HTTP | Motivo |
| --- | --- |
| `400` | Archivo contacts ausente, multipart, mensaje o imagen inválidos |
| `401` | API key ausente o incorrecta |
| `404` | Ruta inexistente |
| `409` | Sesión desconectada, campaña en curso o QR no disponible |
| `413` | Contactos superiores a 1 MB, imagen superior a 10 MB o campo de texto superior a 16 KB |
| `415` | El envío masivo requiere multipart/form-data |
| `422` | JSON/UTF-8 inválido, lista vacía o contactos inválidos |
| `500` | Error interno inesperado |

Si la sesión queda en `error`, revisa internet y la instalación de Chrome y repite el POST de sesión. Para volver a vincular desde cero, detén el servicio, revoca el dispositivo desde WhatsApp y elimina únicamente la carpeta configurada en `AUTH_DIR` antes de iniciar nuevamente.

## Estructura y pruebas

```text
src/
  index.js       Configuración y cierre del proceso
  server.js      Inicio HTTP y conexión automática de WhatsApp
  app.js         Configuración de Express y montaje de rutas
  container.js   Construcción e inyección de dependencias
  config/        Variables de entorno y rutas del proyecto
  routes/        Declaración de endpoints de sesión y mensajes
  controllers/   Traducción de solicitudes y respuestas HTTP
  services/      Campañas, sesión de WhatsApp y carga de imágenes
  repositories/  Lectura del JSON adjunto en memoria
  dto/           Validación de entrada y formato de resultados
  providers/     Creación del cliente y medios de whatsapp-web.js
  middlewares/   Carga multipart, autenticación, errores y rutas inexistentes
  errors/        Tipo de error compartido
  utils/         Normalización de teléfonos
  views/         HTML de la página del QR
data/            Ejemplo del archivo de contactos
media/           Carpeta opcional para tus imágenes de prueba (no la lee el servidor)
test/            Pruebas con cliente WhatsApp simulado
```

### Arquitectura en capas

El flujo de una solicitud es **ruta → controlador → servicio → repositorio/proveedor**. Las rutas declaran los endpoints; los controladores deciden el estado HTTP y la respuesta. Los servicios implementan las reglas del envío y el ciclo de vida de la sesión sin depender de `req` o `res`.

`ContactRepository` interpreta el JSON adjunto en memoria. `MediaService` valida la imagen adjunta y prepara su contenido para WhatsApp. `BulkMessageDto` valida el mensaje, `ContactDto` normaliza los contactos y `CampaignResultDto` construye el resumen de resultados. La validación del mensaje se ejecuta después de comprobar la sesión, conservando la respuesta `409` cuando no hay conexión.

`container.js` crea una única sesión y un único servicio de campañas por proceso e inyecta sus dependencias. `whatsapp.provider.js` concentra la construcción de `Client`, `LocalAuth` y `MessageMedia`. Las pruebas inyectan un cliente simulado. La vista del QR está separada en `views/`; el resto de la API devuelve JSON.

Las rutas de archivos siguen siendo relativas a la raíz del proyecto. La sesión continúa guardándose en `.wwebjs_auth/session-campaign-manager/` por defecto.

```bash
npm test
```

Las pruebas cubren los endpoints y reglas del servicio sin conectar cuentas ni enviar mensajes reales. La verificación de extremo a extremo requiere vincular una cuenta y enviar primero a un contacto propio: comprueba texto, imagen y el rechazo `409` antes de conectar.

Las pruebas verifican la carga de contactos e imagen por multipart, los límites, archivos inválidos, normalización de teléfonos, aislamiento entre campañas y los servicios de sesión. El envío real de texto e imagen requiere vincular una cuenta.

## Referencias y alcance

- [whatsapp-web.js](https://wwebjs.dev/): automatización de WhatsApp Web mediante Puppeteer.
- [Autenticación local](https://wwebjs.dev/guide/creating-your-bot/authentication.html).
- [Imágenes y archivos](https://wwebjs.dev/guide/creating-your-bot/handling-attachments).

Esta integración es no oficial y puede verse afectada por cambios de WhatsApp o restricciones de la cuenta. Úsala para comunicaciones esperadas por tus destinatarios. La pausa entre mensajes regula la ejecución y no garantiza evitar restricciones.
