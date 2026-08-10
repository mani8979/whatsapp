import Broadcast from '../models/broadcast.model.js';
import whatsappService from './whatsapp.service.js';
import logger from '../config/logger.js';

const activeLoops = new Map(); // campaignId (string) -> setTimeout ID

/**
 * Reset interrupted campaigns to paused state on startup.
 */
export const initBroadcastQueue = async () => {
  try {
    const interrupted = await Broadcast.find({ status: 'processing' });
    for (const campaign of interrupted) {
      campaign.status = 'paused';
      await campaign.save();
      logger.info(`Interrupted campaign "${campaign.name}" (${campaign._id}) reset to paused.`);
    }
  } catch (error) {
    logger.error(`Error initializing broadcast queue: ${error.message}`);
  }
};

/**
 * Start or resume a broadcast campaign.
 * @param {string} campaignId 
 */
export const startCampaign = async (campaignId) => {
  try {
    const campaign = await Broadcast.findById(campaignId);
    if (!campaign) {
      throw new Error('Campaign not found');
    }

    if (campaign.status === 'completed' || campaign.status === 'cancelled') {
      throw new Error(`Cannot start a campaign that is already ${campaign.status}`);
    }

    if (activeLoops.has(campaignId.toString())) {
      logger.warn(`Campaign ${campaignId} is already running.`);
      return campaign;
    }

    campaign.status = 'processing';
    await campaign.save();

    logger.info(`Starting broadcast campaign "${campaign.name}" (${campaign._id})`);
    
    // Notify clients of status change
    emitCampaignUpdate(campaign);

    // Trigger the runner loop
    runCampaignLoop(campaignId);

    return campaign;
  } catch (error) {
    logger.error(`Failed to start campaign ${campaignId}: ${error.message}`);
    throw error;
  }
};

/**
 * Pause a campaign.
 * @param {string} campaignId 
 */
export const pauseCampaign = async (campaignId) => {
  try {
    const campaign = await Broadcast.findById(campaignId);
    if (!campaign) throw new Error('Campaign not found');

    if (campaign.status !== 'processing') {
      throw new Error('Only processing campaigns can be paused');
    }

    // Stop execution loop
    clearActiveLoop(campaignId);

    campaign.status = 'paused';
    await campaign.save();

    logger.info(`Campaign paused: "${campaign.name}" (${campaign._id})`);
    emitCampaignUpdate(campaign);

    return campaign;
  } catch (error) {
    logger.error(`Failed to pause campaign ${campaignId}: ${error.message}`);
    throw error;
  }
};

/**
 * Cancel a campaign.
 * @param {string} campaignId 
 */
export const cancelCampaign = async (campaignId) => {
  try {
    const campaign = await Broadcast.findById(campaignId);
    if (!campaign) throw new Error('Campaign not found');

    if (campaign.status === 'completed' || campaign.status === 'cancelled') {
      throw new Error('Campaign is already finished');
    }

    // Stop execution loop
    clearActiveLoop(campaignId);

    campaign.status = 'cancelled';
    await campaign.save();

    logger.info(`Campaign cancelled: "${campaign.name}" (${campaign._id})`);
    emitCampaignUpdate(campaign);

    return campaign;
  } catch (error) {
    logger.error(`Failed to cancel campaign ${campaignId}: ${error.message}`);
    throw error;
  }
};

/**
 * Clear the active timer loop.
 * @param {string} campaignId 
 */
const clearActiveLoop = (campaignId) => {
  const key = campaignId.toString();
  if (activeLoops.has(key)) {
    clearTimeout(activeLoops.get(key));
    activeLoops.delete(key);
  }
};

/**
 * Emit real-time updates of campaign state to Socket.io dashboard.
 * @param {import('mongoose').Document} campaign 
 */
const emitCampaignUpdate = (campaign) => {
  whatsappService.emitSocketEvent('broadcast_progress', {
    campaignId: campaign._id,
    name: campaign.name,
    body: campaign.body,
    status: campaign.status,
    totalRecipients: campaign.totalRecipients,
    sentCount: campaign.sentCount,
    failedCount: campaign.failedCount,
    recipients: campaign.recipients,
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt
  });
};

/**
 * The main runner loop for processing a campaign.
 * Takes the next batch of queued recipients, sends messages with a delay,
 * updates DB records, and schedules the next batch.
 * @param {string} campaignId 
 */
const runCampaignLoop = async (campaignId) => {
  const key = campaignId.toString();

  try {
    // 1. Fetch current campaign details
    const campaign = await Broadcast.findById(campaignId);
    if (!campaign || campaign.status !== 'processing') {
      clearActiveLoop(campaignId);
      return;
    }

    // 2. Check WhatsApp client readiness
    if (!whatsappService.isReady()) {
      logger.warn(`Campaign "${campaign.name}" paused because WhatsApp client is disconnected.`);
      campaign.status = 'paused';
      await campaign.save();
      emitCampaignUpdate(campaign);
      clearActiveLoop(campaignId);
      return;
    }

    // 3. Find queued recipients
    const queuedRecipients = campaign.recipients.filter(r => r.status === 'queued');
    if (queuedRecipients.length === 0) {
      logger.info(`Campaign "${campaign.name}" has completed all recipients.`);
      campaign.status = 'completed';
      await campaign.save();
      emitCampaignUpdate(campaign);
      clearActiveLoop(campaignId);
      return;
    }

    // 4. Take the next batch
    const batch = queuedRecipients.slice(0, campaign.batchSize);
    logger.info(`Processing batch of ${batch.length} messages for campaign "${campaign.name}"`);

    // 5. Send messages sequentially inside the batch
    for (let i = 0; i < batch.length; i++) {
      // Re-verify campaign state before sending each message (in case pause/cancel clicked)
      const currentCampaign = await Broadcast.findById(campaignId);
      if (!currentCampaign || currentCampaign.status !== 'processing') {
        clearActiveLoop(campaignId);
        return;
      }

      const recipient = batch[i];
      const recipientId = recipient._id;

      try {
        // Send WhatsApp Message (Text or Media with Caption)
        if (currentCampaign.mediaPath) {
          await whatsappService.sendMediaMessage(
            recipient.number,
            currentCampaign.mediaPath,
            currentCampaign.mediaType,
            currentCampaign.fileName,
            currentCampaign.body || null
          );
        } else {
          await whatsappService.sendMessage(recipient.number, currentCampaign.body);
        }
        
        // Update database with success
        await Broadcast.updateOne(
          { _id: campaignId, 'recipients._id': recipientId },
          {
            $set: {
              'recipients.$.status': 'sent',
              'recipients.$.sentAt': new Date(),
              'recipients.$.error': null
            },
            $inc: { sentCount: 1 }
          }
        );
      } catch (err) {
        logger.error(`Broadcast message failed to ${recipient.number}: ${err.message}`);
        const attempts = recipient.attempts + 1;
        const willRetry = attempts < 3;
        const newStatus = willRetry ? 'queued' : 'failed';

        // Update database with failure / retry status
        await Broadcast.updateOne(
          { _id: campaignId, 'recipients._id': recipientId },
          {
            $set: {
              'recipients.$.status': newStatus,
              'recipients.$.attempts': attempts,
              'recipients.$.error': err.message
            },
            $inc: newStatus === 'failed' ? { failedCount: 1 } : {}
          }
        );
      }

      // Emit real-time progress update after each message
      const progressCampaign = await Broadcast.findById(campaignId);
      if (progressCampaign) {
        emitCampaignUpdate(progressCampaign);
      }

      // Delay between individual messages
      if (i < batch.length - 1) {
        await new Promise(resolve => setTimeout(resolve, currentCampaign.delayBetweenMessages));
      }
    }

    // 6. Schedule next batch loop
    const recheckedCampaign = await Broadcast.findById(campaignId);
    if (recheckedCampaign && recheckedCampaign.status === 'processing') {
      const timeoutId = setTimeout(() => {
        runCampaignLoop(campaignId);
      }, recheckedCampaign.delayBetweenBatches);
      activeLoops.set(key, timeoutId);
    }

  } catch (error) {
    logger.error(`Error in runCampaignLoop for campaign ${campaignId}: ${error.message}`);
    clearActiveLoop(campaignId);
  }
};

export default {
  initBroadcastQueue,
  startCampaign,
  pauseCampaign,
  cancelCampaign,
};
