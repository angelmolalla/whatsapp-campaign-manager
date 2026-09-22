const express = require('express');
const { createSessionRouter } = require('./routes/session.routes');
const { createMessageRouter } = require('./routes/message.routes');
const { apiKeyMiddleware } = require('./middlewares/api-key.middleware');
const { notFoundHandler, errorHandler } = require('./middlewares/error.middleware');

function createApp({ session, campaign, apiKey = '' }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(apiKeyMiddleware(apiKey));
  app.use(express.json({ limit: '32kb' }));
  app.use('/api/session', createSessionRouter(session));
  app.use('/api/messages', createMessageRouter(campaign));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
