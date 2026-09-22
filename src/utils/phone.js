function normalizePhone(value) {
  if (typeof value !== 'string' || !/^\+?[\d\s()-]+$/.test(value)) return null;
  let phone = value.replace(/[\s()-]/g, '').replace(/^\+/, '');
  if (/^09\d{8}$/.test(phone)) phone = `593${phone.slice(1)}`;
  return /^[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

module.exports = { normalizePhone };
