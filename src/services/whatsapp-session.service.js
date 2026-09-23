const QRCode = require('qrcode');
const { HttpError } = require('../errors/http-error');
const { describeSendError } = require('../utils/send-diagnostics');

class WhatsAppSession {
  constructor(createClient, logger = console) {
    this.createClient = createClient;
    this.logger = logger;
    this.client = null;
    this.state = 'disconnected';
    this.qr = null;
    this.pending = null;
    this.lastError = null;
  }

  async snapshot() {
    const qr = this.qr;
    const qrDataUrl = qr ? await QRCode.toDataURL(qr) : null;
    return {
      status: this.state,
      qrDataUrl: this.qr === qr ? qrDataUrl : null,
      error: this.lastError,
    };
  }

  connect() {
    if (this.pending || ['starting', 'qr', 'authenticated', 'ready'].includes(this.state)) return;
    this.state = 'starting';
    this.qr = null;
    this.lastError = null;
    this.pending = this.initialize().catch(error => {
      this.state = 'error';
      this.qr = null;
      this.lastError = 'No se pudo iniciar WhatsApp. Revisa Chrome, la conexión y la carpeta de sesión.';
      this.logger.error('[WhatsApp] Falló la inicialización', {
        detail: describeSendError(error, [process.env.API_KEY]),
      });
    }).finally(() => { this.pending = null; });
  }

  async initialize() {
    if (this.client) {
      this.client.removeAllListeners();
      await this.client.destroy();
    }
    const client = this.createClient();
    this.client = client;
    client.on('session_error', error => {
      this.qr = null;
      this.state = 'error';
      this.lastError = 'Se perdió la conexión del navegador con WhatsApp. Inicia nuevamente la sesión.';
      this.logger.error('[WhatsApp] Falló la reinicialización', {
        detail: describeSendError(error, [process.env.API_KEY]),
      });
    });
    client.on('qr', qr => { this.qr = qr; this.state = 'qr'; });
    client.on('authenticated', () => { this.qr = null; this.state = 'authenticated'; });
    client.on('ready', () => { this.qr = null; this.state = 'ready'; this.lastError = null; });
    client.on('auth_failure', () => {
      this.qr = null;
      this.state = 'error';
      this.lastError = 'Falló la autenticación de WhatsApp.';
    });
    client.on('disconnected', () => { this.qr = null; this.state = 'disconnected'; });
    await client.initialize();
  }

  async assertReady() {
    let connected = false;
    if (this.state === 'ready' && this.client) {
      try { connected = await this.client.getState() === 'CONNECTED'; } catch { /* disconnected */ }
    }
    if (!connected) {
      if (this.state === 'ready') this.state = 'disconnected';
      throw new HttpError(409, 'SESSION_NOT_CONNECTED', 'Conecta la sesión de WhatsApp antes de enviar mensajes.');
    }
  }

  async send(phone, message, media) {
    let stage = 'resolve_recipient';
    try {
      const id = await this.client.getNumberId(phone);
      if (!id) throw new HttpError(422, 'NUMBER_NOT_REGISTERED', 'El número no está registrado en WhatsApp.');
      stage = media ? 'send_image' : 'send_text';
      return await this.client.sendMessage(id._serialized, media || message, media ? { caption: message } : {});
    } catch (cause) {
      const error = new Error(cause?.message || String(cause), { cause });
      error.code = cause?.code;
      error.sendStage = stage;
      throw error;
    }
  }

  async close() {
    if (this.client) await this.client.destroy();
  }
}
module.exports = { WhatsAppSession };
