const fs = require('node:fs/promises');
const path = require('node:path');
const { HttpError } = require('../errors/http-error');

async function readImage(imagePath, mediaDir) {
  if (imagePath === undefined) return null;
  if (typeof imagePath !== 'string' || !imagePath.trim()) {
    throw new HttpError(400, 'INVALID_IMAGE_PATH', 'imagePath debe ser una ruta no vacía dentro de MEDIA_DIR.');
  }
  let root, file, data;
  try {
    root = await fs.realpath(mediaDir);
    file = await fs.realpath(path.resolve(root, imagePath));
    const relative = path.relative(root, file);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new HttpError(400, 'INVALID_IMAGE_PATH', 'La imagen debe estar dentro de MEDIA_DIR.');
    }
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size > 10 * 1024 * 1024) {
      throw new HttpError(400, 'INVALID_IMAGE', 'La imagen debe ser un archivo de máximo 10 MB.');
    }
    data = await fs.readFile(file);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'IMAGE_NOT_FOUND', 'No se pudo leer la imagen indicada.');
  }
  let mimetype;
  if (data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) mimetype = 'image/png';
  else if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) mimetype = 'image/jpeg';
  else if (data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') mimetype = 'image/webp';
  if (!mimetype) throw new HttpError(400, 'INVALID_IMAGE', 'Formato permitido: PNG, JPEG o WebP.');
  return { mimetype, data: data.toString('base64'), filename: path.basename(file) };
}
class MediaService {
  constructor(mediaDir, createMedia) {
    this.mediaDir = mediaDir;
    this.createMedia = createMedia;
  }

  async load(imagePath) {
    const image = await readImage(imagePath, this.mediaDir);
    return image ? this.createMedia(image) : null;
  }
}
module.exports = { MediaService };
