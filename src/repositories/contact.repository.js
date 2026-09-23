const { HttpError } = require('../errors/http-error');
const { ContactDto } = require('../dto/contact.dto');

async function readContacts(file) {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw new HttpError(400, 'CONTACTS_FILE_REQUIRED', 'Adjunta el archivo JSON en el campo contacts.');
  }
  if (!file.originalname?.toLowerCase().endsWith('.json')) {
    throw new HttpError(400, 'INVALID_CONTACTS_EXTENSION', 'El archivo contacts debe tener extensión .json.');
  }
  if (file.buffer.length > 1024 * 1024) {
    throw new HttpError(413, 'UPLOAD_TOO_LARGE', 'El archivo de contactos admite máximo 1 MB.');
  }
  let contacts;
  let content;
  try {
    content = new TextDecoder('utf-8', { fatal: true }).decode(file.buffer).replace(/^\uFEFF/, '');
  } catch {
    throw new HttpError(422, 'INVALID_CONTACTS_FILE', 'No se pudo leer el archivo de contactos como JSON.');
  }
  if (!content.trim()) {
    throw new HttpError(422, 'EMPTY_CONTACTS_FILE', 'El archivo contacts está vacío. Adjunta un JSON con al menos un contacto.');
  }
  try {
    contacts = JSON.parse(content);
  } catch {
    throw new HttpError(422, 'INVALID_CONTACTS_FILE', 'No se pudo leer el archivo de contactos como JSON.');
  }
  if (Array.isArray(contacts) && !contacts.length) {
    throw new HttpError(422, 'EMPTY_CONTACTS_FILE', 'El archivo contacts debe contener al menos un contacto.');
  }
  if (!Array.isArray(contacts) || !contacts.length || contacts.length > 1000) {
    throw new HttpError(422, 'INVALID_CONTACTS_FILE', 'El JSON debe contener entre 1 y 1000 contactos.');
  }
  const unique = new Map();
  contacts.forEach((contact, index) => {
    const dto = ContactDto.from(contact, index);
    if (!unique.has(dto.phone)) unique.set(dto.phone, dto);
  });
  return [...unique.values()];
}
class ContactRepository {
  async findAll(file) {
    return readContacts(file);
  }
}
module.exports = { ContactRepository };
