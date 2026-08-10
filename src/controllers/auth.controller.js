import whatsappService, { getChannels as fetchChannels, getChannelSubscribers } from '../services/whatsapp.service.js';
import logger from '../config/logger.js';

/**
 * Get current connection and session status.
 * @route GET /api/status
 */
export const getStatus = async (req, res, next) => {
  try {
    const statusInfo = whatsappService.getStatus();
    res.json({
      success: true,
      data: statusInfo,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Log out and destroy current session.
 * @route POST /api/logout
 */
export const logoutSession = async (req, res, next) => {
  try {
    logger.info('API Request: Logout session');
    await whatsappService.logout();
    res.json({
      success: true,
      message: 'Logged out successfully and session destroyed.',
    });
  } catch (error) {
    next(error);
  }
};

export const getScreenshot = async (req, res, next) => {
  try {
    const client = whatsappService.getClientInstance();
    if (!client || !client.pupPage) {
      return res.status(400).json({ error: 'Client or page not initialized' });
    }
    const screenshot = await client.pupPage.screenshot({ encoding: 'base64' });
    res.setHeader('Content-Type', 'text/html');
    res.send(`<img src="data:image/png;base64,${screenshot}" style="max-width: 100%; border: 1px solid #ccc;" />`);
  } catch (error) {
    next(error);
  }
};

/**
 * Get WhatsApp Channels (newsletters) the user follows.
 * @route GET /api/channels
 */
export const getWhatsAppChannels = async (req, res, next) => {
  try {
    const channels = await fetchChannels();
    res.json({ success: true, data: channels });
  } catch (error) {
    next(error);
  }
};

/**
 * Get subscribers (phone numbers) from a specific WhatsApp Channel.
 * @route GET /api/channels/:channelId/subscribers
 */
export const getChannelSubscribersController = async (req, res, next) => {
  try {
    const { channelId } = req.params;
    if (!channelId) return res.status(400).json({ success: false, error: 'channelId is required' });
    const subscribers = await getChannelSubscribers(decodeURIComponent(channelId));
    res.json({ success: true, count: subscribers.length, data: subscribers });
  } catch (error) {
    next(error);
  }
};

export default {
  getStatus,
  logoutSession,
  getScreenshot,
  getWhatsAppChannels,
  getChannelSubscribersController,
};
