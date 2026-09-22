const { Router } = require('express');
const { MessageController } = require('../controllers/message.controller');

function createMessageRouter(campaign) {
  const router = Router();
  const controller = new MessageController(campaign);
  router.post('/bulk', controller.sendBulk.bind(controller));
  return router;
}

module.exports = { createMessageRouter };
