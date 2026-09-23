const path = require('node:path');
const root = path.resolve(__dirname, '../..');

function integer(value, fallback, min, max, name) {
  const result = Number(value ?? fallback);
  if (!Number.isInteger(result) || result < min || result > max) {
    throw new Error(`${name} debe estar entre ${min} y ${max}.`);
  }
  return result;
}

function loadConfig(env = process.env) {
  const host = env.HOST || '127.0.0.1';
  const apiKey = env.API_KEY || '';
  if (!['127.0.0.1', 'localhost'].includes(host) && !apiKey) {
    throw new Error('Configura API_KEY antes de exponer el servidor fuera de localhost.');
  }
  return {
    host, apiKey,
    port: integer(env.PORT, 3000, 1, 65535, 'PORT'),
    delayMs: integer(env.MESSAGE_DELAY_MS, 1500, 0, 60000, 'MESSAGE_DELAY_MS'),
    authDir: path.resolve(root, env.AUTH_DIR || '.wwebjs_auth'),
    executablePath: env.PUPPETEER_EXECUTABLE_PATH || undefined,
    noSandbox: env.PUPPETEER_NO_SANDBOX === 'true',
  };
}
module.exports = { loadConfig };
