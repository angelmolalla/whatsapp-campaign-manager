const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWhatsAppClient } = require('../src/providers/whatsapp.provider');

test('destroy cierra Chromium con Puppeteer 25 y libera el perfil sin logout', async () => {
  const client = createWhatsAppClient({ authDir: '.test-auth', noSandbox: false });
  let closes = 0;
  let destroys = 0;
  client.authStrategy.destroy = async () => { destroys++; };
  client.authStrategy.logout = async () => { assert.fail('No debe borrar credenciales'); };
  client.pupBrowser = {
    connected: true,
    async close() { closes++; this.connected = false; },
  };
  await client.destroy();
  await client.destroy();
  assert.equal(closes, 1);
  assert.equal(destroys, 2);
});

test('destroy mantiene compatibilidad con navegadores que tienen isConnected', async () => {
  const client = createWhatsAppClient({ authDir: '.test-auth', noSandbox: false });
  let closes = 0;
  client.pupBrowser = { isConnected: () => true, close: async () => { closes++; } };
  await client.destroy();
  assert.equal(closes, 1);
});
