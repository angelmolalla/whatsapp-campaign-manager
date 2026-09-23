const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWhatsAppClient } = require('../src/providers/whatsapp.provider');
const { Client } = require('whatsapp-web.js');

test('fallo de inject después del arranque se comunica sin rechazo no manejado', async t => {
  const failure = new Error('Protocol error: Target closed');
  t.mock.method(Client.prototype, 'inject', async () => { throw failure; });
  const client = createWhatsAppClient({ authDir: '.test-auth', noSandbox: false });
  await assert.rejects(client.inject(), failure);
  client.initialized = true;
  const errors = [];
  client.on('session_error', error => errors.push(error));
  await client.inject();
  assert.deepEqual(errors, [failure]);
  client.closing = true;
  await client.inject();
  assert.equal(errors.length, 1);
});

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
