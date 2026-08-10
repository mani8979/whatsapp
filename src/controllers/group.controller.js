import whatsappService from '../services/whatsapp.service.js';
import logger from '../config/logger.js';
import Group from '../models/group.model.js';

/**
 * Retrieve all synced groups from DB or client.
 * @route GET /api/groups
 */
export const getGroups = async (req, res, next) => {
  try {
    // If client is ready, let's trigger a sync and get from DB to be fast and accurate
    if (whatsappService.isReady()) {
      await whatsappService.syncContactsAndGroups().catch(() => {});
    }
    
    const groups = await Group.find({});
    res.json({
      success: true,
      data: groups,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new WhatsApp group.
 * @route POST /api/groups
 */
export const createGroup = async (req, res, next) => {
  try {
    const { name, participants } = req.body;
    if (!name || !participants || !Array.isArray(participants)) {
      return res.status(400).json({ success: false, error: 'Group name and participants array are required' });
    }

    if (!whatsappService.isReady()) {
      return res.status(503).json({ success: false, error: 'WhatsApp client is not ready' });
    }

    const client = whatsappService.getClientInstance();
    const formattedParticipants = participants.map(whatsappService.formatJid);

    logger.info(`Creating group "${name}" with ${formattedParticipants.length} participants`);
    const groupResult = await client.createGroup(name, formattedParticipants);

    res.json({
      success: true,
      message: 'Group created successfully',
      data: {
        gid: groupResult.gid._serialized || groupResult.gid,
        missingParticipants: groupResult.missingParticipants,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Add members to a group.
 * @route POST /api/groups/add
 */
export const addMembers = async (req, res, next) => {
  try {
    const { groupJid, participants } = req.body;
    if (!groupJid || !participants || !Array.isArray(participants)) {
      return res.status(400).json({ success: false, error: 'groupJid and participants array are required' });
    }

    const client = whatsappService.getClientInstance();
    const chat = await client.getChatById(whatsappService.formatJid(groupJid));

    if (!chat.isGroup) {
      return res.status(400).json({ success: false, error: 'Target JID is not a group' });
    }

    const formattedParticipants = participants.map(whatsappService.formatJid);
    await chat.addParticipants(formattedParticipants);

    res.json({
      success: true,
      message: `Successfully added participants to group ${groupJid}`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Remove members from a group.
 * @route POST /api/groups/remove
 */
export const removeMembers = async (req, res, next) => {
  try {
    const { groupJid, participants } = req.body;
    if (!groupJid || !participants || !Array.isArray(participants)) {
      return res.status(400).json({ success: false, error: 'groupJid and participants array are required' });
    }

    const client = whatsappService.getClientInstance();
    const chat = await client.getChatById(whatsappService.formatJid(groupJid));

    if (!chat.isGroup) {
      return res.status(400).json({ success: false, error: 'Target JID is not a group' });
    }

    const formattedParticipants = participants.map(whatsappService.formatJid);
    await chat.removeParticipants(formattedParticipants);

    res.json({
      success: true,
      message: `Successfully removed participants from group ${groupJid}`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Promote members to admin.
 * @route POST /api/groups/promote
 */
export const promoteAdmin = async (req, res, next) => {
  try {
    const { groupJid, participants } = req.body;
    if (!groupJid || !participants || !Array.isArray(participants)) {
      return res.status(400).json({ success: false, error: 'groupJid and participants array are required' });
    }

    const client = whatsappService.getClientInstance();
    const chat = await client.getChatById(whatsappService.formatJid(groupJid));

    if (!chat.isGroup) {
      return res.status(400).json({ success: false, error: 'Target JID is not a group' });
    }

    const formattedParticipants = participants.map(whatsappService.formatJid);
    await chat.promoteParticipants(formattedParticipants);

    res.json({
      success: true,
      message: `Successfully promoted participants to admin in group ${groupJid}`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Demote members from admin.
 * @route POST /api/groups/demote
 */
export const demoteAdmin = async (req, res, next) => {
  try {
    const { groupJid, participants } = req.body;
    if (!groupJid || !participants || !Array.isArray(participants)) {
      return res.status(400).json({ success: false, error: 'groupJid and participants array are required' });
    }

    const client = whatsappService.getClientInstance();
    const chat = await client.getChatById(whatsappService.formatJid(groupJid));

    if (!chat.isGroup) {
      return res.status(400).json({ success: false, error: 'Target JID is not a group' });
    }

    const formattedParticipants = participants.map(whatsappService.formatJid);
    await chat.demoteParticipants(formattedParticipants);

    res.json({
      success: true,
      message: `Successfully demoted participants in group ${groupJid}`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Leave a group.
 * @route POST /api/groups/leave
 */
export const leaveGroup = async (req, res, next) => {
  try {
    const { groupJid } = req.body;
    if (!groupJid) return res.status(400).json({ success: false, error: 'groupJid is required' });

    const client = whatsappService.getClientInstance();
    const chat = await client.getChatById(whatsappService.formatJid(groupJid));

    if (!chat.isGroup) {
      return res.status(400).json({ success: false, error: 'Target JID is not a group' });
    }

    await chat.leave();

    res.json({
      success: true,
      message: `Successfully left group ${groupJid}`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Send group announcement setting (admins only or everyone can send messages).
 * @route POST /api/groups/announcement
 */
export const sendGroupAnnouncement = async (req, res, next) => {
  try {
    const { groupJid, announce } = req.body;
    if (!groupJid || announce === undefined) {
      return res.status(400).json({ success: false, error: 'groupJid and announce (boolean) are required' });
    }

    const client = whatsappService.getClientInstance();
    const chat = await client.getChatById(whatsappService.formatJid(groupJid));

    if (!chat.isGroup) {
      return res.status(400).json({ success: false, error: 'Target JID is not a group' });
    }

    // announce = true means messageAdminsOnly = true
    const success = await chat.setMessagesAdminsOnly(announce);

    res.json({
      success: success,
      message: `Group announcement mode set to: ${announce}`,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getGroups,
  createGroup,
  addMembers,
  removeMembers,
  promoteAdmin,
  demoteAdmin,
  leaveGroup,
  sendGroupAnnouncement,
};
