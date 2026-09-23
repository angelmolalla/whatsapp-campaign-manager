function describeSendError(error, sensitiveValues = []) {
  let detail = String(error?.message || error || 'Error desconocido');
  for (const value of sensitiveValues.filter(value => typeof value === 'string' && value.length)) {
    detail = detail.split(value).join('[oculto]');
  }
  return detail
    .replace(/\b\d{7,}(?::\d+)?(?:@\S+)?/g, '[identificador oculto]')
    .replace(/[A-Za-z0-9+/=]{100,}/g, '[datos ocultos]')
    .slice(0, 1500);
}

module.exports = { describeSendError };
