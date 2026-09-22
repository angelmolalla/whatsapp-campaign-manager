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
Copy-Item data/contacts.example.json data/contacts.json
```

En Bash:

```bash
cp .env.example .env
cp data/contacts.example.json data/contacts.json
```

**Reemplaza los números ficticios del ejemplo por tus destinatarios antes de enviar.** Puedes comenzar con un solo contacto propio para verificar el flujo.

```bash
npm start
# Desarrollo con reinicio automático:
npm run dev
```

La API escucha por defecto en `http://127.0.0.1:3000`. El arranque no conecta ni envía mensajes automáticamente.

## Configuración

| Variable | Valor predeterminado | Descripción |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Interfaz de escucha |
| `PORT` | `3000` | Puerto HTTP |
| `CONTACTS_FILE` | `./data/contacts.json` | Lista de destinatarios |
| `MEDIA_DIR` | `./media` | Carpeta permitida para imágenes |
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
- La lista debe tener entre 1 y 1000 entradas. Se valida completa antes de enviar y se vuelve a leer en cada POST.
- El mismo texto se envía a todos; `name` identifica el resultado y no es una variable de plantilla.

## Servicio 1: sesión y QR

### Iniciar o recuperar la sesión

```bash
curl -X POST http://127.0.0.1:3000/api/session
```

Responde `202 Accepted` mientras inicia o espera vinculación, y `200 OK` si ya está lista. Varias llamadas no crean sesiones duplicadas.

```json
{ "status": "starting", "qrDataUrl": null, "error": null }
```

### Consultar estado

```bash
curl http://127.0.0.1:3000/api/session
```

Estados: `disconnected`, `starting`, `qr`, `authenticated`, `ready` y `error`. Solo `ready`, junto con la comprobación de conexión activa, permite enviar. Cuando el estado es `qr`, `qrDataUrl` contiene la imagen PNG en formato data URL.

### Escanear QR

Después del POST, consulta hasta obtener `status: "qr"` y abre:

```text
http://127.0.0.1:3000/api/session/qr
```

En el teléfono: **WhatsApp → Dispositivos vinculados → Vincular un dispositivo**. Escanea el QR y consulta el estado hasta que sea `ready`. Actualiza la página si el QR cambia. Si todavía no hay QR o la sesión ya está vinculada, la página devuelve `409 QR_NOT_AVAILABLE`.

Si configuraste API key, envía el encabezado también al obtener la página:

```bash
curl -H "x-api-key: TU_CLAVE" http://127.0.0.1:3000/api/session/qr -o qr.html
```

Abre `qr.html` localmente y elimínalo al terminar. El QR y la carpeta de sesión son privados. `LocalAuth` permite recuperar la sesión tras un reinicio con otro POST a `/api/session`; WhatsApp puede solicitar volver a vincular.

## Servicio 2: envío masivo

**POST `/api/messages/bulk`** con `Content-Type: application/json`.

| Atributo | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `message` | string | Sí | Texto de 1 a 4096 caracteres, no vacío |
| `imagePath` | string | No | Ruta a una imagen dentro de `MEDIA_DIR` |

### Solo texto (Bash)

```bash
curl -X POST http://127.0.0.1:3000/api/messages/bulk -H "Content-Type: application/json" -d '{"message":"¡Tenemos una noticia hermosa: vamos a ser papás! ❤️"}'
```

### Texto con imagen (Bash)

Coloca tu archivo en `media/noticia.jpg`:

```bash
curl -X POST http://127.0.0.1:3000/api/messages/bulk -H "Content-Type: application/json" -d '{"message":"Con mucha alegría les compartimos la llegada de nuestro hijo. ❤️","imagePath":"noticia.jpg"}'
```

El texto se envía como descripción de la imagen. Si omites `imagePath`, se envía solo texto. Se aceptan PNG, JPEG y WebP de máximo 10 MB, con comprobación de firma del archivo. La ruta pertenece al **servidor**, no al equipo que llama a la API; este endpoint no sube archivos. También se permite una ruta absoluta si está dentro de `MEDIA_DIR`. Una imagen inexistente o inválida rechaza toda la solicitud sin enviar mensajes.

### PowerShell y curl con un archivo JSON

Crea `mensaje.json` en UTF-8:

```json
{
  "message": "¡Vamos a ser papás! Gracias por compartir nuestra alegría. ❤️",
  "imagePath": "noticia.jpg"
}
```

```powershell
curl.exe -X POST http://127.0.0.1:3000/api/messages/bulk -H "Content-Type: application/json" --data-binary "@mensaje.json"
```

Alternativa nativa:

```powershell
$body = @{ message = '¡Vamos a ser papás! ❤️'; imagePath = 'noticia.jpg' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3000/api/messages/bulk' -ContentType 'application/json; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes($body))
```

Con `API_KEY`, agrega `-H "x-api-key: TU_CLAVE"` a los curls o `-Headers @{ 'x-api-key' = 'TU_CLAVE' }` a `Invoke-RestMethod`. En PowerShell usa `curl.exe` también para los endpoints de sesión.

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
| `400` | Body JSON, mensaje o imagen inválidos |
| `401` | API key ausente o incorrecta |
| `404` | Ruta inexistente |
| `409` | Sesión desconectada, campaña en curso o QR no disponible |
| `413` | Body superior a 32 KB |
| `422` | Archivo de contactos ilegible, vacío o con registros inválidos |
| `500` | Error interno inesperado |

Si la sesión queda en `error`, revisa internet y la instalación de Chrome y repite el POST de sesión. Para volver a vincular desde cero, detén el servicio, revoca el dispositivo desde WhatsApp y elimina únicamente la carpeta configurada en `AUTH_DIR` antes de iniciar nuevamente.

## Estructura y pruebas

```text
src/
  index.js       Arranque del servidor y cierre
  app.js         Configuración de Express y montaje de rutas
  container.js   Construcción e inyección de dependencias
  config/        Variables de entorno y rutas del proyecto
  routes/        Declaración de endpoints de sesión y mensajes
  controllers/   Traducción de solicitudes y respuestas HTTP
  services/      Campañas, sesión de WhatsApp y carga de imágenes
  repositories/  Acceso al archivo JSON de contactos
  dto/           Validación de entrada y formato de resultados
  providers/     Creación del cliente y medios de whatsapp-web.js
  middlewares/   Autenticación, errores y rutas inexistentes
  errors/        Tipo de error compartido
  utils/         Normalización de teléfonos
  views/         HTML de la página del QR
data/            Contactos locales y ejemplo
media/           Imágenes locales
test/            Pruebas con cliente WhatsApp simulado
```

### Arquitectura en capas

El flujo de una solicitud es **ruta → controlador → servicio → repositorio/proveedor**. Las rutas declaran los endpoints; los controladores deciden el estado HTTP y la respuesta. Los servicios implementan las reglas del envío y el ciclo de vida de la sesión sin depender de `req` o `res`.

`ContactRepository` encapsula la lectura del JSON. `MediaService` valida y carga imágenes. `BulkMessageDto` valida el mensaje, `ContactDto` normaliza los contactos y `CampaignResultDto` construye el resumen de resultados. La validación del mensaje se ejecuta después de comprobar la sesión, conservando la respuesta `409` cuando no hay conexión.

`container.js` crea una única sesión y un único servicio de campañas por proceso e inyecta sus dependencias. `whatsapp.provider.js` concentra la construcción de `Client`, `LocalAuth` y `MessageMedia`. Las pruebas inyectan un cliente simulado. La vista del QR está separada en `views/`; el resto de la API devuelve JSON.

Las rutas de archivos siguen siendo relativas a la raíz del proyecto. La sesión continúa guardándose en `.wwebjs_auth/session-campaign-manager/` por defecto.

```bash
npm test
```

Las pruebas cubren los endpoints y reglas del servicio sin conectar cuentas ni enviar mensajes reales. La verificación de extremo a extremo requiere vincular una cuenta y enviar primero a un contacto propio: comprueba texto, imagen y el rechazo `409` antes de conectar.

Verificación inicial: 15 pruebas automatizadas aprobadas, arranque de Chromium comprobado y generación de un QR real de WhatsApp Web comprobada sin vincular una cuenta. El envío real de texto e imagen queda pendiente de esa vinculación.

## Referencias y alcance

- [whatsapp-web.js](https://wwebjs.dev/): automatización de WhatsApp Web mediante Puppeteer.
- [Autenticación local](https://wwebjs.dev/guide/creating-your-bot/authentication.html).
- [Imágenes y archivos](https://wwebjs.dev/guide/creating-your-bot/handling-attachments).

Esta integración es no oficial y puede verse afectada por cambios de WhatsApp o restricciones de la cuenta. Úsala para comunicaciones esperadas por tus destinatarios. La pausa entre mensajes regula la ejecución y no garantiza evitar restricciones.
