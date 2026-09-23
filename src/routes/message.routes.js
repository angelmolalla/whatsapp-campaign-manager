const { Router } = require('express');
const { MessageController } = require('../controllers/message.controller');
const { bulkUpload } = require('../middlewares/bulk-upload.middleware');

function createMessageRouter(campaign) {
  const router = Router();
  const controller = new MessageController(campaign);
  router.post('/bulk', bulkUpload, controller.sendBulk.bind(controller));
  return router;
}

module.exports = { createMessageRouter };
