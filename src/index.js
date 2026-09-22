const { loadConfig } = require('./config/env');
const { createContainer } = require('./container');
const { createApp } = require('./app');

const config = loadConfig();
const { session, campaign } = createContainer(config);
const server = createApp({ session, campaign, apiKey: config.apiKey }).listen(config.port, config.host, () => {
  console.log(`API disponible en http://${config.host}:${config.port}`);
});
server.on('error', error => { console.error(`No se pudo iniciar la API: ${error.code}`); process.exitCode = 1; });
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  const timeout = setTimeout(() => process.exit(1), 10000).unref();
  const closed = new Promise(resolve => server.close(resolve));
  try { await session.close(); } catch { process.exitCode = 1; }
  await closed;
  clearTimeout(timeout);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
