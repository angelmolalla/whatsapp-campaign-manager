const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { patchSource } = require('../scripts/patch-whatsapp-media');

const target = path.join(path.dirname(require.resolve('whatsapp-web.js/package.json')), 'src/util/Injected/Utils.js');

test('parche idempotente y protegido frente a cambios de versión del código', () => {
  const source = fs.readFileSync(target, 'utf8');
  assert.equal(patchSource(patchSource(source)), patchSource(source));
  assert.throws(() => patchSource('código incompatible'), /Cambió el código/);
});

test('objeto saliente real conserva id, caption y campos de subida sin __x_id', () => {
  const source = patchSource(fs.readFileSync(target, 'utf8'));
  const start = source.indexOf('        const message = {');
  const end = source.indexOf("        // Bot's won't reply", start);
  assert.ok(start >= 0 && end > start);
  for (const mediaOptions of [{}, { __x_id: undefined, mimetype: 'image/jpeg', clientUrl: 'upload-url', uploadhash: 'hash', toJSON: () => ({ caption: 'Noticia' }) }]) {
    const context = {
      options: {}, newMsgKey: { id: 'valid-id' }, content: 'Hola', from: 'sender', chat: { id: 'recipient' },
      ephemeralFields: {}, mediaOptions, quotedMsgOptions: {}, locationOptions: {}, pollOptions: {},
      eventOptions: {}, vcardOptions: {}, buttonOptions: {}, listOptions: {}, botOptions: {}, extraOptions: {},
    };
    const message = vm.runInNewContext(source.slice(start, end) + '\nmessage;', context);
    assert.equal(message.id.id, 'valid-id');
    assert.equal(Object.hasOwn(message, '__x_id'), false);
    assert.equal(message.body, 'Hola');
    if (mediaOptions.mimetype) {
      assert.equal(message.caption, 'Noticia');
      assert.equal(message.clientUrl, 'upload-url');
      assert.equal(message.uploadhash, 'hash');
    }
  }
});
