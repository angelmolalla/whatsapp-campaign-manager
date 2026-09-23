const fs = require('node:fs');
const path = require('node:path');

const marker = '        // campaign-manager: upstream media id compatibility fix';
const anchor = "        // Bot's won't reply if canonicalUrl is set (linking)";

function patchSource(source) {
  if (source.includes(marker)) return source;
  if (source.split(anchor).length !== 2) {
    throw new Error('Cambió el código de whatsapp-web.js: revisa el parche de medios antes de continuar.');
  }
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  return source.replace(anchor, [marker, '        delete message.__x_id;', '', anchor].join(newline));
}

function applyPatch() {
  const manifest = require.resolve('whatsapp-web.js/package.json');
  const version = JSON.parse(fs.readFileSync(manifest, 'utf8')).version;
  if (version !== '1.34.7') throw new Error(`Revisa el parche de medios para whatsapp-web.js ${version}.`);
  const target = path.join(path.dirname(manifest), 'src/util/Injected/Utils.js');
  const source = fs.readFileSync(target, 'utf8');
  const patched = patchSource(source);
  if (source !== patched) fs.writeFileSync(target, patched);
  console.log('Parche de compatibilidad de imágenes de WhatsApp aplicado.');
}

if (require.main === module) applyPatch();
module.exports = { patchSource };
