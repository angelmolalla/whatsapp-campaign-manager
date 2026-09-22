function renderSessionQr(qrDataUrl) {
  return `<!doctype html><html lang="es"><meta charset="utf-8"><title>Conectar WhatsApp</title><h1>Vincula tu WhatsApp</h1><p>WhatsApp → Dispositivos vinculados → Vincular un dispositivo. Actualiza esta página si el QR expira.</p><img alt="Código QR para vincular WhatsApp" src="${qrDataUrl}"></html>`;
}

module.exports = { renderSessionQr };
