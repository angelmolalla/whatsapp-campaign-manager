const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { createApp } = require('../src/app');
const { CampaignService } = require('../src/services/campaign.service');
const { WhatsAppSession } = require('../src/services/whatsapp-session.service');
const { HttpError } = require('../src/errors/http-error');
const { normalizePhone } = require('../src/utils/phone');
const { ContactRepository } = require('../src/repositories/contact.repository');
const { MediaService } = require('../src/services/media.service');
const { loadConfig } = require('../src/config/env');

async function fixture(t, options = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wa-campaign-test-'));
  const config = { contactsFile: path.join(dir, 'contacts.json'), mediaDir: path.join(dir, 'media'), delayMs: 0 };
  await fs.mkdir(config.mediaDir);
  await fs.writeFile(config.contactsFile, JSON.stringify([
    { name: 'Uno', phone: '0990000000' },
    { name: 'Duplicado', phone: '+593990000000' },
    { name: 'Dos', phone: '593990000001' },
  ]));
  const calls = [];
  const session = {
    connect() {},
    snapshot: async () => ({ status: 'ready', qrDataUrl: null, error: null }),
    assertReady: async () => {},
    send: async (...args) => { calls.push(args); return { id: { _serialized: 'message-id' } }; },
    ...options.session,
  };
  const campaign = new CampaignService({ session, contactRepository: new ContactRepository(config.contactsFile), mediaService: new MediaService(config.mediaDir, image => image), delayMs: config.delayMs });
  const server = createApp({ session, campaign, apiKey: options.apiKey }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await fs.rm(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body, headers = {}) => fetch(`${base}/api/messages/bulk`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
  return { dir, config, session, campaign, base, post, calls };
}

test('envío HTTP sin imagen normaliza y elimina duplicados', async t => {
  const f = await fixture(t);
  const response = await f.post({ message: '¡Vamos a ser papás!' });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.sent, 2);
  assert.equal(result.total, 2);
  assert.deepEqual(f.calls[0], ['593990000000', '¡Vamos a ser papás!', null]);
});

test('409 sin sesión antes de leer contactos o enviar', async t => {
  const f = await fixture(t, { session: { assertReady: async () => {
    throw new HttpError(409, 'SESSION_NOT_CONNECTED', 'Conecta WhatsApp.');
  } } });
  await fs.unlink(f.config.contactsFile);
  const response = await f.post({ message: 'Hola' });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, 'SESSION_NOT_CONNECTED');
  assert.equal(f.calls.length, 0);
});

test('imagen opcional se carga y se envía con el mensaje', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.config.mediaDir, 'foto.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6nWQAAAAASUVORK5CYII=', 'base64'));
  const response = await f.post({ message: 'Nuestra noticia', imagePath: 'foto.png' });
  assert.equal(response.status, 200);
  assert.equal(f.calls[0][1], 'Nuestra noticia');
  assert.equal(f.calls[0][2].mimetype, 'image/png');
});

test('imagen inválida, ausente y rutas fuera de media no envían mensajes', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.config.mediaDir, 'fake.png'), 'no es una imagen');
  for (const imagePath of ['fake.png', 'missing.png', '../contacts.json', '', null]) {
    assert.equal((await f.post({ message: 'Hola', imagePath })).status, 400);
  }
  assert.equal(f.calls.length, 0);
});

test('valida toda la lista antes de iniciar el envío', async t => {
  const f = await fixture(t);
  for (const content of ['{', '[]', '{}', '[{"phone":"593990000000"},{"phone":"mal"}]']) {
    await fs.writeFile(f.config.contactsFile, content);
    assert.equal((await f.post({ message: 'Hola' })).status, 422);
  }
  assert.equal(f.calls.length, 0);
});

test('400 para mensajes vacíos y JSON mal formado', async t => {
  const f = await fixture(t);
  for (const body of [{}, { message: ' ' }, { message: 123 }, { message: 'x'.repeat(4097) }]) {
    assert.equal((await f.post(body)).status, 400);
  }
  const response = await fetch(`${f.base}/api/messages/bulk`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'INVALID_JSON');
  assert.equal(f.calls.length, 0);
});

test('207 informa fallos individuales y continúa con otros contactos', async t => {
  const f = await fixture(t, { session: { send: async phone => {
    if (phone === '593990000000') throw new Error('fallo simulado');
    return { id: { _serialized: 'ok' } };
  } } });
  const response = await f.post({ message: 'Hola' });
  assert.equal(response.status, 207);
  const result = await response.json();
  assert.equal(result.sent, 1);
  assert.equal(result.failed, 1);
});

test('una desconexión intermedia omite los destinatarios pendientes', async t => {
  let checks = 0;
  const f = await fixture(t, { session: { assertReady: async () => {
    if (++checks >= 3) throw new Error('desconectado');
  } } });
  const response = await f.post({ message: 'Hola' });
  assert.equal(response.status, 207);
  const result = await response.json();
  assert.equal(result.sent, 1);
  assert.equal(result.skipped, 1);
  assert.equal(f.calls.length, 1);
});

test('rechaza campañas simultáneas y libera el bloqueo al terminar', async t => {
  let release;
  let started;
  const gate = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { started = resolve; });
  const f = await fixture(t, { session: { send: async () => { started(); await gate; } } });
  const first = f.campaign.send({ message: 'Uno' });
  await entered;
  await assert.rejects(f.campaign.send({ message: 'Dos' }), { code: 'CAMPAIGN_IN_PROGRESS' });
  release();
  await first;
  assert.equal(f.campaign.busy, false);
});

test('protege endpoints con API key y permite consultar la sesión', async t => {
  const f = await fixture(t, { apiKey: 'test-secret' });
  assert.equal((await fetch(`${f.base}/api/session`)).status, 401);
  assert.equal((await f.post({ message: 'Hola' })).status, 401);
  assert.equal((await fetch(`${f.base}/api/session`, { headers: { 'x-api-key': 'test-secret' } })).status, 200);
});

test('ciclo QR, autenticación, ready, desconexión y reconexión sin duplicar clientes', async () => {
  const clients = [];
  const session = new WhatsAppSession(() => {
    const client = new EventEmitter();
    client.initialize = async () => {};
    client.destroy = async () => {};
    client.getState = async () => 'CONNECTED';
    clients.push(client);
    return client;
  });
  session.connect();
  session.connect();
  await session.pending;
  assert.equal(clients.length, 1);
  clients[0].emit('qr', 'test-qr');
  assert.match((await session.snapshot()).qrDataUrl, /^data:image\/png;base64,/);
  clients[0].emit('authenticated');
  await assert.rejects(session.assertReady(), { code: 'SESSION_NOT_CONNECTED' });
  assert.equal((await session.snapshot()).qrDataUrl, null);
  clients[0].emit('ready');
  await session.assertReady();
  clients[0].emit('disconnected');
  await assert.rejects(session.assertReady(), { code: 'SESSION_NOT_CONNECTED' });
  session.connect();
  await session.pending;
  assert.equal(clients.length, 2);
  await session.close();
});

test('fallo al iniciar sesión queda disponible en el estado y admite reintento', async () => {
  const session = new WhatsAppSession(() => {
    const client = new EventEmitter();
    client.initialize = async () => { throw new Error('Chrome no disponible'); };
    client.destroy = async () => {};
    return client;
  });
  session.connect();
  await session.pending;
  assert.equal((await session.snapshot()).status, 'error');
  assert.equal(session.pending, null);
});

test('normalización de teléfonos y configuración', () => {
  assert.equal(normalizePhone('+593 99 000 0000'), '593990000000');
  assert.equal(normalizePhone('0990000000'), '593990000000');
  assert.equal(normalizePhone('593990000000@c.us'), null);
  assert.equal(normalizePhone(593990000000), null);
  assert.throws(() => loadConfig({ PORT: 'abc' }));
  assert.throws(() => loadConfig({ HOST: '0.0.0.0' }));
});

test('endpoints de inicio, estado y página QR', async t => {
  let connections = 0;
  const f = await fixture(t, { session: {
    connect: () => { connections++; },
    snapshot: async () => ({ status: 'qr', qrDataUrl: 'data:image/png;base64,AAAA', error: null }),
  } });
  const start = await fetch(`${f.base}/api/session`, { method: 'POST' });
  assert.equal(start.status, 202);
  assert.equal(connections, 1);
  assert.equal((await (await fetch(`${f.base}/api/session`)).json()).status, 'qr');
  const qr = await fetch(`${f.base}/api/session/qr`);
  assert.equal(qr.status, 200);
  assert.equal(qr.headers.get('cache-control'), 'no-store');
  assert.match(await qr.text(), /data:image\/png;base64,AAAA/);
  f.session.snapshot = async () => ({ status: 'ready', qrDataUrl: null });
  assert.equal((await fetch(`${f.base}/api/session/qr`)).status, 409);
  assert.equal((await fetch(`${f.base}/api/session`, { method: 'POST' })).status, 200);
});

test('adaptador WhatsApp envía texto o imagen con caption y rechaza números no registrados', async () => {
  const calls = [];
  const session = new WhatsAppSession(() => {});
  session.client = {
    getNumberId: async phone => phone === '593990000000' ? { _serialized: '593990000000@c.us' } : null,
    sendMessage: async (...args) => { calls.push(args); },
  };
  await session.send('593990000000', 'Hola', null);
  const media = { mimetype: 'image/png' };
  await session.send('593990000000', 'Noticia', media);
  assert.deepEqual(calls, [
    ['593990000000@c.us', 'Hola', {}],
    ['593990000000@c.us', media, { caption: 'Noticia' }],
  ]);
  await assert.rejects(session.send('593990000001', 'Hola', null), { code: 'NUMBER_NOT_REGISTERED' });
});
