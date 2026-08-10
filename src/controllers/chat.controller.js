import whatsappService from '../services/whatsapp.service.js';
import logger from '../config/logger.js';

/**
 * Retrieve all active chats.
 * @route GET /api/chats
 */
export const getChats = async (req, res, next) => {
  try {
    if (!whatsappService.isReady()) {
      return res.status(503).json({ success: false, error: 'WhatsApp client is not ready' });
    }

    const client = whatsappService.getClientInstance();
    const chats = await client.getChats();
    
    // Map minimal data to return to client
    const mappedChats = chats.map((chat) => ({
      jid: chat.id._serialized,
      name: chat.name,
      unreadCount: chat.unreadCount,
      timestamp: chat.timestamp,
      isGroup: chat.isGroup,
      isReadOnly: chat.isReadOnly,
      isPinned: chat.pinned,
      isArchived: chat.archived,
    }));

    res.json({
      success: true,
      data: mappedChats,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Archive a chat.
 * @route POST /api/chats/archive
 */
export const archiveChat = async (req, res, next) => {
  try {
    const { jid } = req.body;
    if (!jid) return res.status(400).json({ success: false, error: 'Chat JID is required' });

    const client = whatsappService.getClientInstance();
    const chat = await client.getChatById(whatsappService.formatJid(jid));
    await chat.archive();

    res.json({
      success: true,
      message: `Chat ${jid} archived successfully`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Unarchive a chat.
 * @route POST /api/chats/unarchive
 */
export const unarchiveChat = async (req, res, next) => {
  try {
    const { jid } = req.body;
    if (!jid) return res.status(400).json({ success: false, error: 'Chat JID is required' });

    const client = whatsappService.getClientInstance();
    const chat = await client.getChatById(whatsappService.formatJid(jid));
    await chat.unarchive();

    res.json({
      success: true,
      message: `Chat ${jid} unarchived successfully`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Pin a chat.
 * @route POST /api/chats/pin
 */
export const pinChat = async (req, res, next) => {
  try {
    const { jid } = req.body;
    if (!jid) return res.status(400).json({ success: false, error: 'Chat JID is required' });

    const client = whatsappService.getClientInstance();
    const chat = await client.getChatById(whatsappService.formatJid(jid));
    const success = await chat.pin();

    res.json({
      success: success,
      message: success ? `Chat ${jid} pinned successfully` : `Failed to pin chat ${jid}`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Unpin a chat.
 * @route POST /api/chats/unpin
 */
export const unpinChat = async (req, res, next) => {
  try {
    const { jid } = req.body;
    if (!jid) return res.status(400).json({ success: false, error: 'Chat JID is required' });

    const client = whatsappService.getClientInstance();
    const chat = await client.getChatById(whatsappService.formatJid(jid));
    const success = await chat.unpin();

    res.json({
      success: success,
      message: success ? `Chat ${jid} unpinned successfully` : `Failed to unpin chat ${jid}`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Mark chat as unread.
 * @route POST /api/chats/mark-unread
 */
export const markAsUnread = async (req, res, next) => {
  try {
    const { jid } = req.body;
    if (!jid) return res.status(400).json({ success: false, error: 'Chat JID is required' });

    const client = whatsappService.getClientInstance();
    const chat = await client.getChatById(whatsappService.formatJid(jid));
    await chat.markAsUnread();

    res.json({
      success: true,
      message: `Chat ${jid} marked as unread`,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getChats,
  archiveChat,
  unarchiveChat,
  pinChat,
  unpinChat,
  markAsUnread,
};
