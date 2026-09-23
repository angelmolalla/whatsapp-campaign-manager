const multer = require('multer');
const { HttpError } = require('../errors/http-error');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 2, fields: 1, parts: 3, fieldSize: 16 * 1024 },
}).fields([{ name: 'contacts', maxCount: 1 }, { name: 'image', maxCount: 1 }]);

function bulkUpload(req, res, next) {
  if (!req.is('multipart/form-data')) {
    return next(new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Usa multipart/form-data con contacts, message e image opcional.'));
  }
  upload(req, res, error => {
    if (error) {
      const tooLarge = ['LIMIT_FILE_SIZE', 'LIMIT_FIELD_VALUE'].includes(error.code);
      return next(new HttpError(tooLarge ? 413 : 400, tooLarge ? 'UPLOAD_TOO_LARGE' : 'INVALID_UPLOAD',
        tooLarge ? 'Máximo 10 MB por imagen y 16 KB por campo de texto.' : 'Adjunta contacts, image opcional y un único campo de texto message.'));
    }
    if (Object.keys(req.body).some(key => key !== 'message')) {
      return next(new HttpError(400, 'INVALID_UPLOAD', 'El único campo de texto permitido es message; contacts e image deben ser archivos.'));
    }
    next();
  });
}

module.exports = { bulkUpload };
