import cron from 'node-cron';
import ScheduledMessage from '../models/scheduled-message.model.js';
import whatsappService from './whatsapp.service.js';
import logger from '../config/logger.js';

let cronJob = null;

/**
 * Process a single scheduled message task.
 * Handles broadcasting to multiple targets if 'to' is an array.
 * @param {import('mongoose').Document} task 
 */
const executeTask = async (task) => {
  task.status = 'processing';
  await task.save();

  logger.info(`Processing scheduled message job: ${task._id}`);

  try {
    const targets = task.to;
    let errors = [];

    // Process targets sequentially to avoid rate limits
    for (const target of targets) {
      try {
        let sentMsg = null;
        if (task.type === 'text') {
          sentMsg = await whatsappService.sendMessage(target, task.body);
        } else if (task.type === 'image' || task.type === 'document') {
          sentMsg = await whatsappService.sendMediaMessage(target, task.mediaPath, task.type, task.fileName);
        } else if (task.type === 'location') {
          sentMsg = await whatsappService.sendLocationMessage(target, task.location.latitude, task.location.longitude, task.location.description);
        } else if (task.type === 'contact') {
          sentMsg = await whatsappService.sendContactMessage(target, task.contactCard.displayName, task.contactCard.card);
        }

        if (!sentMsg) {
          throw new Error('Failed to send message: Client not ready or operation failed');
        }
      } catch (err) {
        logger.error(`Failed to send scheduled message item to ${target}: ${err.message}`);
        errors.push(`${target}: ${err.message}`);
      }
    }

    if (errors.length === targets.length) {
      // All targets failed
      throw new Error(`All recipients failed: ${errors.join('; ')}`);
    } else if (errors.length > 0) {
      // Partial failure
      task.status = 'completed';
      task.sentAt = new Date();
      task.error = `Partial success. Failures: ${errors.join('; ')}`;
      await task.save();
    } else {
      // Full success
      task.status = 'completed';
      task.sentAt = new Date();
      task.error = null;
      await task.save();
    }
  } catch (error) {
    logger.error(`Error executing scheduled message ${task._id}: ${error.message}`);
    task.attempts += 1;
    if (task.attempts >= 3) {
      task.status = 'failed';
    } else {
      task.status = 'pending'; // Retry in next cron tick
    }
    task.error = error.message;
    await task.save();
  }
};

/**
 * Query and execute pending scheduled messages.
 */
export const processScheduledMessages = async () => {
  if (!whatsappService.isReady()) {
    logger.debug('Scheduler: WhatsApp client is not ready. Skipping check.');
    return;
  }

  try {
    const now = new Date();
    const tasks = await ScheduledMessage.find({
      status: 'pending',
      scheduledTime: { $lte: now },
    });

    if (tasks.length > 0) {
      logger.info(`Scheduler found ${tasks.length} pending task(s) to execute.`);
      // Execute tasks concurrently (sequential inside executeTask for each broadcast list)
      await Promise.all(tasks.map((task) => executeTask(task)));
    }
  } catch (error) {
    logger.error(`Scheduler processing error: ${error.message}`);
  }
};

/**
 * Initialize and start the scheduler service.
 */
export const startScheduler = () => {
  if (cronJob) {
    logger.warn('Scheduler is already running.');
    return;
  }

  // Schedule task execution every minute
  cronJob = cron.schedule('* * * * *', async () => {
    logger.debug('Running scheduled messages checker...');
    await processScheduledMessages();
  });

  logger.info('Scheduler service initialized (runs once per minute).');
};

/**
 * Stop the scheduler service.
 */
export const stopScheduler = () => {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    logger.info('Scheduler service stopped.');
  }
};

export default {
  startScheduler,
  stopScheduler,
  processScheduledMessages,
};
