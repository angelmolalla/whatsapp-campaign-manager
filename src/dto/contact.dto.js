const { normalizePhone } = require('../utils/phone');
const { HttpError } = require('../errors/http-error');

class ContactDto {
  static from(contact, index) {
    const phone = normalizePhone(contact?.phone);
    if (!phone || (contact.name !== undefined && typeof contact.name !== 'string')) {
      throw new HttpError(422, 'INVALID_CONTACT', `Contacto inválido en la posición ${index + 1}. Usa name y phone (texto).`);
    }
    return { name: contact.name || '', phone };
  }
}

module.exports = { ContactDto };
