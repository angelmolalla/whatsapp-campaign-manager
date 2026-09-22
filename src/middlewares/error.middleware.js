const { HttpError } = require('../errors/http-error');

function notFoundHandler(req, res, next) {
  next(new HttpError(404, 'NOT_FOUND', 'Servicio no encontrado.'));
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  const malformed = error.type === 'entity.parse.failed';
  const tooLarge = error.type === 'entity.too.large';
  res.status(error instanceof HttpError ? error.status : malformed ? 400 : tooLarge ? 413 : 500).json({
    error: {
      code: error instanceof HttpError ? error.code : malformed ? 'INVALID_JSON' : tooLarge ? 'BODY_TOO_LARGE' : 'INTERNAL_ERROR',
      message: error instanceof HttpError ? error.message : malformed ? 'El body no es un JSON válido.' : tooLarge ? 'El body supera 32 KB.' : 'Error interno del servidor.',
    },
  });
}

module.exports = { notFoundHandler, errorHandler };
