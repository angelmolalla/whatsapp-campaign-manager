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
  const config = { delayMs: 0 };

  const contactsFile = { originalname: 'contacts.json', buffer: Buffer.from(JSON.stringify([
    { name: 'Uno', phone: '0990000000' },
    { name: 'Duplicado', phone: '+593990000000' },
    { name: 'Dos', phone: '593990000001' },
  ])) };
  const calls = [];
  const session = {
    connect() {},
    snapshot: async () => ({ status: 'ready', qrDataUrl: null, error: null }),
    assertReady: async () => {},
    send: async (...args) => { calls.push(args); return { id: { _serialized: 'message-id' } }; },
    ...options.session,
  };
  const campaign = new CampaignService({ session, contactRepository: new ContactRepository(), mediaService: new MediaService(image => image), delayMs: config.delayMs });
  const server = createApp({ session, campaign, apiKey: options.apiKey }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await fs.rm(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body, headers = {}, files = { contacts: contactsFile }) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(body)) form.append(key, String(value));
    for (const [key, file] of Object.entries(files)) {
      if (file) form.append(key, new Blob([file.buffer]), file.originalname);
    }
    return fetch(`${base}/api/messages/bulk`, { method: 'POST', headers, body: form });
  };
  return { dir, config, session, campaign, base, post, calls, contactsFile };
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
  f.contactsFile.buffer = Buffer.from('invalid JSON');
  const response = await f.post({ message: 'Hola' });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, 'SESSION_NOT_CONNECTED');
  assert.equal(f.calls.length, 0);
});

test('imagen adjunta se envía con el mensaje y sin escribir archivos', async t => {
  const f = await fixture(t);
  const image = { originalname: 'foto.png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6nWQAAAAASUVORK5CYII=', 'base64') };
  const response = await f.post({ message: 'Nuestra noticia' }, {}, { contacts: f.contactsFile, image });
  assert.equal(response.status, 200);
  assert.equal(f.calls[0][1], 'Nuestra noticia');
  assert.equal(f.calls[0][2].mimetype, 'image/png');
  assert.equal(f.calls[0][2].data, image.buffer.toString('base64'));
  assert.deepEqual(await fs.readdir(f.dir), []);
});

test('imagen inválida o vacía y antiguo imagePath rechazan el lote', async t => {
  const f = await fixture(t);
  for (const buffer of [Buffer.from('no es imagen'), Buffer.alloc(0)]) {
    assert.equal((await f.post({ message: 'Hola' }, {}, { contacts: f.contactsFile, image: { originalname: 'fake.png', buffer } })).status, 400);
  }
  assert.equal((await f.post({ message: 'Hola', imagePath: 'foto.png' })).status, 400);
  assert.equal(f.calls.length, 0);
});
test('valida toda la lista antes de iniciar el envío', async t => {
  const f = await fixture(t);
  for (const content of ['{', '[]', '{}', '[{"phone":"593990000000"},{"phone":"mal"}]']) {
    f.contactsFile.buffer = Buffer.from(content);
    assert.equal((await f.post({ message: 'Hola' })).status, 422);
  }
  assert.equal(f.calls.length, 0);
});

test('400 para mensajes vacíos y JSON mal formado', async t => {
  const f = await fixture(t);
  for (const body of [{}, { message: ' ' }, { message: 'x'.repeat(4097) }]) {
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
  const first = f.campaign.send({ message: 'Uno' }, { contacts: f.contactsFile });
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

test('solo GET del QR es público y conserva no-store', async t => {
  const f = await fixture(t, { apiKey: 'test-secret', session: {
    snapshot: async () => ({ status: 'qr', qrDataUrl: 'data:image/png;base64,dGVzdA==', error: null }),
  } });
  for (const path of ['/api/session/qr', '/api/session/qr?', '/api/session/qr/']) {
    const response = await fetch(`${f.base}${path}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(await response.text(), /data:image\/png;base64,/);
  }
  for (const [path, method] of [['/api/session', 'GET'], ['/api/session', 'POST'], ['/api/session/qr', 'POST'], ['/api/session/qr/extra', 'GET'], ['/api/messages/bulk', 'POST']]) {
    assert.equal((await fetch(`${f.base}${path}`, { method })).status, 401);
  }
});

test('QR público sin QR pendiente devuelve 409', async t => {
  const f = await fixture(t, { apiKey: 'test-secret' });
  const response = await fetch(`${f.base}/api/session/qr`);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, 'QR_NOT_AVAILABLE');
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

test('contacts obligatorio y límites de contactos e imagen', async t => {
  const f = await fixture(t);
  const response = await f.post({ message: 'Hola' }, {}, {});
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'CONTACTS_FILE_REQUIRED');
  assert.equal((await f.post({ message: 'Hola' }, {}, { contacts: { originalname: 'lista.txt', buffer: f.contactsFile.buffer } })).status, 400);
  assert.equal((await f.post({ message: 'Hola' }, {}, { contacts: { originalname: 'lista.json', buffer: Buffer.alloc(1024 * 1024 + 1) } })).status, 413);
  assert.equal((await f.post({ message: 'Hola' }, {}, { contacts: f.contactsFile, image: { originalname: 'large.png', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) } })).status, 413);
  assert.equal(f.calls.length, 0);
});

test('rechaza contacts vacío, espacios, BOM o lista vacía sin enviar mensajes', async t => {
  const f = await fixture(t);
  for (const content of ['', ' \r\n\t ', '\uFEFF', '\uFEFF \n', '[]', '[  ]']) {
    const response = await f.post({ message: 'Hola' }, {}, {
      contacts: { originalname: 'contacts.json', buffer: Buffer.from(content) },
    });
    assert.equal(response.status, 422);
    assert.equal((await response.json()).error.code, 'EMPTY_CONTACTS_FILE');
    assert.equal(f.calls.length, 0);
  }
  assert.equal((await f.post({ message: 'Hola' })).status, 200);
});

test('rechaza formato anterior y archivos extra o repetidos', async t => {
  const f = await fixture(t);
  assert.equal((await fetch(`${f.base}/api/messages/bulk`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"message":"Hola"}' })).status, 415);
  assert.equal((await fetch(`${f.base}/api/messages/bulk`, { method: 'POST', headers: { 'Content-Type': 'multipart/form-data' }, body: 'invalid' })).status, 400);
  for (const names of [['other'], ['contacts', 'contacts'], ['image', 'image']]) {
    const form = new FormData();
    form.append('message', 'Hola');
    for (const name of names) form.append(name, new Blob([f.contactsFile.buffer]), 'contacts.json');
    assert.equal((await fetch(`${f.base}/api/messages/bulk`, { method: 'POST', body: form })).status, 400);
  }
  assert.equal(f.calls.length, 0);
});

test('cada campaña utiliza sus contactos adjuntos, admite BOM y no persiste archivos', async t => {
  const f = await fixture(t);
  await f.post({ message: 'Uno' });
  const contacts = { originalname: 'otra-lista.json', buffer: Buffer.from('\uFEFF[{"phone":"593990000002"}]') };
  const result = await f.post({ message: 'Dos' }, {}, { contacts });
  assert.equal(result.status, 200);
  assert.equal((await result.json()).total, 1);
  assert.equal(f.calls[2][0], '593990000002');
  assert.deepEqual(await fs.readdir(f.dir), []);
});

test('rechaza UTF-8 inválido y más de 1000 contactos antes de enviar', async t => {
  const f = await fixture(t);
  for (const buffer of [Buffer.from([0xff]), Buffer.from(JSON.stringify(Array(1001).fill({ phone: '593990000000' })))]) {
    assert.equal((await f.post({ message: 'Hola' }, {}, { contacts: { originalname: 'lista.json', buffer } })).status, 422);
  }
  assert.equal(f.calls.length, 0);
});

test('fallos de imagen incluyen detalle y log correlacionado sin datos del mensaje', async t => {
  const f = await fixture(t, { session: { send: async () => {
    const error = new Error('Media upload failed for 593990000000: mensaje privado');
    error.sendStage = 'send_image';
    throw error;
  } } });
  const logs = [];
  f.campaign.logger = { error: (...args) => logs.push(args) };
  const image = { originalname: 'foto.png', buffer: Buffer.from('89504e470d0a1a0a', 'hex') };
  const response = await f.post({ message: 'mensaje privado' }, {}, { contacts: f.contactsFile, image });
  assert.equal(response.status, 207);
  const result = await response.json();
  assert.equal(result.failed, 2);
  assert.match(result.results[0].detail, /Media upload failed/);
  assert.equal(logs[0][1].campaignId, result.campaignId);
  assert.equal(logs[0][1].stage, 'send_image');
  assert.equal(logs[0][1].mediaType, 'image/png');
  assert.doesNotMatch(JSON.stringify(logs), /593990000000|mensaje privado|foto.png/);
});

test('adaptador conserva la causa y distingue resolución de destinatario de envío', async () => {
  const session = new WhatsAppSession(() => {});
  session.client = {
    getNumberId: async () => ({ _serialized: 'test@c.us' }),
    sendMessage: async () => { throw new Error('Data passed to getter must include an id property'); },
  };
  await assert.rejects(session.send('test', 'Hola', { mimetype: 'image/jpeg' }), {
    sendStage: 'send_image', message: 'Data passed to getter must include an id property',
  });
  session.client.getNumberId = async () => { throw new Error('lookup failed'); };
  await assert.rejects(session.send('test', 'Hola', null), { sendStage: 'resolve_recipient' });
});
