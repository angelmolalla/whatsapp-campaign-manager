const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { startServer } = require('../src/server');
const { WhatsAppSession } = require('../src/services/whatsapp-session.service');

async function boot(t, initialize) {
  const errors = [];
  let creations = 0;
  let destroyed = 0;
  const client = new EventEmitter();
  client.initialize = initialize;
  client.getState = async () => 'CONNECTED';
  client.destroy = async () => { destroyed++; };
  const session = new WhatsAppSession(() => { creations++; return client; }, {
    error: (...args) => errors.push(args),
  });
  const server = startServer({
    config: { port: 0, host: '127.0.0.1', apiKey: '' },
    session, campaign: {}, logger: { log() {} },
  });
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await session.close();
    assert.equal(destroyed, 1);
  });
  return { session, client, errors, base: `http://127.0.0.1:${server.address().port}`, creations: () => creations };
}

test('el arranque recupera la sesión sin POST ni QR y espera ready real', async t => {
  const f = await boot(t, async () => {});
  assert.equal(f.session.state, 'starting');
  await assert.rejects(f.session.assertReady(), { code: 'SESSION_NOT_CONNECTED' });
  f.client.emit('authenticated');
  assert.equal((await (await fetch(`${f.base}/api/session`)).json()).status, 'authenticated');
  f.client.emit('ready');
  const status = await (await fetch(`${f.base}/api/session`)).json();
  assert.equal(status.status, 'ready');
  assert.equal(status.qrDataUrl, null);
  await f.session.assertReady();
  await fetch(`${f.base}/api/session`, { method: 'POST' });
  assert.equal(f.creations(), 1);
});

test('sin credenciales válidas el arranque permite vincular con QR', async t => {
  const f = await boot(t, async () => {});
  f.client.emit('qr', 'test-qr');
  const response = await fetch(`${f.base}/api/session/qr`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /data:image\/png;base64,/);
});

test('un fallo de recuperación queda en error sin fingir que está ready', async t => {
  const f = await boot(t, async () => { throw new Error('browser failed'); });
  await f.session.pending;
  assert.equal((await (await fetch(`${f.base}/api/session`)).json()).status, 'error');
  assert.deepEqual(f.errors, [['[WhatsApp] Falló la inicialización', { detail: 'browser failed' }]]);
  assert.doesNotMatch(JSON.stringify(await f.session.snapshot()), /browser failed/);
  await assert.rejects(f.session.assertReady(), { code: 'SESSION_NOT_CONNECTED' });
});
