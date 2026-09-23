const { setTimeout: delay } = require('node:timers/promises');
const { randomUUID } = require('node:crypto');
const { HttpError } = require('../errors/http-error');
const { BulkMessageDto } = require('../dto/bulk-message.dto');
const { CampaignResultDto } = require('../dto/campaign-result.dto');
const { describeSendError } = require('../utils/send-diagnostics');

class CampaignService {
  constructor({ session, contactRepository, mediaService, delayMs, logger = console }) {
    Object.assign(this, { session, contactRepository, mediaService, delayMs, logger });
    this.busy = false;
  }

  async send(body, files = {}) {
    if (this.busy) throw new HttpError(409, 'CAMPAIGN_IN_PROGRESS', 'Ya hay un envío en curso.');
    this.busy = true;
    try {
      await this.session.assertReady();
      const request = BulkMessageDto.from(body);
      const contacts = await this.contactRepository.findAll(files.contacts);
      const media = await this.mediaService.load(files.image);
      const results = [];
      const campaignId = randomUUID();
      let disconnected = false;
      for (const [index, contact] of contacts.entries()) {
        if (index && !disconnected) await delay(this.delayMs);
        if (disconnected) {
          results.push({ ...contact, status: 'skipped', error: 'SESSION_NOT_CONNECTED' });
          continue;
        }
        try {
          await this.session.assertReady();
        } catch {
          disconnected = true;
          results.push({ ...contact, status: 'skipped', error: 'SESSION_NOT_CONNECTED' });
          continue;
        }
        try {
          const sent = await this.session.send(contact.phone, request.message, media);
          results.push({ ...contact, status: 'sent', messageId: sent?.id?._serialized || null });
        } catch (error) {
          const code = error.code === 'NUMBER_NOT_REGISTERED' ? error.code : 'SEND_FAILED';
          const detail = describeSendError(error, [contact.phone, contact.name, request.message, media?.data, media?.filename]);
          this.logger.error('[WhatsApp] Falló el envío', {
            campaignId, recipientIndex: index + 1, code,
            stage: error.sendStage || 'send',
            mediaType: media?.mimetype || null,
            mediaBytes: media?.data ? Buffer.byteLength(media.data, 'base64') : 0,
            detail,
          });
          results.push({ ...contact, status: 'failed', error: code, detail });
        }
      }
      return CampaignResultDto.from(campaignId, results);
    } finally { this.busy = false; }
  }
}
module.exports = { CampaignService };
