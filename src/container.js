const { WhatsAppSession } = require('./services/whatsapp-session.service');
const { CampaignService } = require('./services/campaign.service');
const { ContactRepository } = require('./repositories/contact.repository');
const { MediaService } = require('./services/media.service');
const { createWhatsAppClient, createWhatsAppMedia } = require('./providers/whatsapp.provider');

function createContainer(config) {
  const session = new WhatsAppSession(() => createWhatsAppClient(config));
  const contactRepository = new ContactRepository(config.contactsFile);
  const mediaService = new MediaService(config.mediaDir, createWhatsAppMedia);
  const campaign = new CampaignService({ session, contactRepository, mediaService, delayMs: config.delayMs });
  return { session, campaign };
}

module.exports = { createContainer };
