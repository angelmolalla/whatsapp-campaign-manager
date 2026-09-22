class MessageController {
  constructor(campaign) {
    this.campaign = campaign;
  }

  async sendBulk(req, res) {
    const result = await this.campaign.send(req.body);
    res.status(result.failed || result.skipped ? 207 : 200).json(result);
  }
}

module.exports = { MessageController };
