const { createApp } = require('./app');

function startServer({ config, session, campaign, logger = console }) {
  const server = createApp({ session, campaign, apiKey: config.apiKey }).listen(config.port, config.host, () => {
    session.connect();
    logger.log(`API disponible en http://${config.host}:${server.address().port}. Recuperando sesión de WhatsApp...`);
  });
  return server;
}

module.exports = { startServer };
