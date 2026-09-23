const path = require('node:path');
const { HttpError } = require('../errors/http-error');

class MediaService {
  constructor(createMedia) {
    this.createMedia = createMedia;
  }

  async load(file) {
    if (file === undefined) return null;
    const data = file?.buffer;
    if (!Buffer.isBuffer(data) || !data.length) {
      throw new HttpError(400, 'INVALID_IMAGE', 'Adjunta una imagen no vacía en el campo image.');
    }
    if (data.length > 10 * 1024 * 1024) {
      throw new HttpError(413, 'UPLOAD_TOO_LARGE', 'La imagen admite máximo 10 MB.');
    }
    let mimetype;
    if (data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) mimetype = 'image/png';
    else if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) mimetype = 'image/jpeg';
    else if (data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') mimetype = 'image/webp';
    if (!mimetype) throw new HttpError(400, 'INVALID_IMAGE', 'Formato permitido: PNG, JPEG o WebP.');
    return this.createMedia({ mimetype, data: data.toString('base64'), filename: path.basename(file.originalname.replace(/\\/g, '/')) });
  }
}
module.exports = { MediaService };
