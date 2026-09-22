const { timingSafeEqual } = require('node:crypto');
const { HttpError } = require('../errors/http-error');

function apiKeyMiddleware(apiKey) {
  return (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (apiKey) {
      const supplied = Buffer.from(req.get('x-api-key') || '');
      const expected = Buffer.from(apiKey);
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
        return next(new HttpError(401, 'UNAUTHORIZED', 'API key inválida.'));
      }
    }
    next();
  };
}

module.exports = { apiKeyMiddleware };
