const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');

class CompatibleClient extends Client {
  async initialize() {
    this.initialized = false;
    this.closing = false;
    await super.initialize();
    this.initialized = true;
  }

  async inject() {
    try {
      await super.inject();
    } catch (error) {
      if (this.closing) return;
      // Navigation callbacks are async, but the page emitter does not await them.
      // Initial startup must still reject so the session can handle it normally.
      if (!this.initialized) throw error;
      this.emit('session_error', error);
    }
  }

  async destroy() {
    this.closing = true;
    // Puppeteer 25 removed isConnected(); upstream destroy still checks it.
    if (this.pupBrowser && typeof this.pupBrowser.isConnected !== 'function' && this.pupBrowser.connected) {
      await this.pupBrowser.close();
    }
    await super.destroy();
  }
}

function createWhatsAppClient(config) {
  return new CompatibleClient({
    authStrategy: new LocalAuth({ clientId: 'campaign-manager', dataPath: config.authDir }),
    puppeteer: {
      headless: true,
      executablePath: config.executablePath,
      args: config.noSandbox ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] : [],
    },
    authTimeoutMs: 60000,
    qrMaxRetries: 5,
  });
}

function createWhatsAppMedia(image) {
  return new MessageMedia(image.mimetype, image.data, image.filename);
}

module.exports = { createWhatsAppClient, createWhatsAppMedia };
