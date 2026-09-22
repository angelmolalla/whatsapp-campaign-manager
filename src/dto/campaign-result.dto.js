class CampaignResultDto {
  static from(campaignId, results) {
    return {
      campaignId,
      total: results.length,
      sent: results.filter(r => r.status === 'sent').length,
      failed: results.filter(r => r.status === 'failed').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      results,
    };
  }
}

module.exports = { CampaignResultDto };
