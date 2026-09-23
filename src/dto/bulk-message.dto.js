const { HttpError } = require('../errors/http-error');

class BulkMessageDto {
  static from(body) {
    if (!body || typeof body.message !== 'string' || !body.message.trim() || body.message.length > 4096) {
      throw new HttpError(400, 'INVALID_MESSAGE', 'message es obligatorio y debe contener entre 1 y 4096 caracteres.');
    }
    return { message: body.message };
  }
}

module.exports = { BulkMessageDto };
