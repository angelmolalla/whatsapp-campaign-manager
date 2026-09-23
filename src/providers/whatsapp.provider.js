const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');

function createWhatsAppClient(config) {
  return new Client({
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
