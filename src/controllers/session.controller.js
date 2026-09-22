const { HttpError } = require('../errors/http-error');
const { renderSessionQr } = require('../views/session-qr.view');

class SessionController {
  constructor(session) {
    this.session = session;
  }

  async connect(req, res) {
    this.session.connect();
    const snapshot = await this.session.snapshot();
    res.status(snapshot.status === 'ready' ? 200 : 202).json(snapshot);
  }

  async getStatus(req, res) {
    res.json(await this.session.snapshot());
  }

  async getQr(req, res) {
    const snapshot = await this.session.snapshot();
    if (!snapshot.qrDataUrl) throw new HttpError(409, 'QR_NOT_AVAILABLE', 'No hay un QR pendiente. Consulta el estado de la sesión.');
    res.type('html').send(renderSessionQr(snapshot.qrDataUrl));
  }
}

module.exports = { SessionController };
