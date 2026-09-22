const fs = require('node:fs/promises');
const { HttpError } = require('../errors/http-error');
const { ContactDto } = require('../dto/contact.dto');

async function readContacts(file) {
  let contacts;
  try {
    contacts = JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
  } catch {
    throw new HttpError(422, 'INVALID_CONTACTS_FILE', 'No se pudo leer el archivo de contactos como JSON.');
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
  constructor(file) {
    this.file = file;
  }

  async findAll() {
    return readContacts(this.file);
  }
}
module.exports = { ContactRepository };
