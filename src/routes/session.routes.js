const { Router } = require('express');
const { SessionController } = require('../controllers/session.controller');

function createSessionRouter(session) {
  const router = Router();
  const controller = new SessionController(session);
  router.post('/', controller.connect.bind(controller));
  router.get('/', controller.getStatus.bind(controller));
  router.get('/qr', controller.getQr.bind(controller));
  return router;
}

module.exports = { createSessionRouter };
