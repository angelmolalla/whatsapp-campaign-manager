const { setTimeout: delay } = require('node:timers/promises');
const { randomUUID } = require('node:crypto');
const { HttpError } = require('../errors/http-error');
const { BulkMessageDto } = require('../dto/bulk-message.dto');
const { CampaignResultDto } = require('../dto/campaign-result.dto');

class CampaignService {
  constructor({ session, contactRepository, mediaService, delayMs }) {
    Object.assign(this, { session, contactRepository, mediaService, delayMs });
    this.busy = false;
  }

  async send(body) {
    if (this.busy) throw new HttpError(409, 'CAMPAIGN_IN_PROGRESS', 'Ya hay un envío en curso.');
    this.busy = true;
    try {
      await this.session.assertReady();
      const request = BulkMessageDto.from(body);
      const contacts = await this.contactRepository.findAll();
      const media = await this.mediaService.load(request.imagePath);
      const results = [];
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
          results.push({ ...contact, status: 'failed', error: error.code === 'NUMBER_NOT_REGISTERED' ? error.code : 'SEND_FAILED' });
        }
      }
      return CampaignResultDto.from(randomUUID(), results);
    } finally { this.busy = false; }
  }
}
module.exports = { CampaignService };
