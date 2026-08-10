import express from 'express';
import { upload } from '../middleware/fileUpload.js';
import authController from '../controllers/auth.controller.js';
import messageController from '../controllers/message.controller.js';
import chatController from '../controllers/chat.controller.js';
import groupController from '../controllers/group.controller.js';
import contactController from '../controllers/contact.controller.js';
import broadcastController from '../controllers/broadcast.controller.js';
import autoReplyController from '../controllers/autoreply.controller.js';
import * as whatsappService from '../services/whatsapp.service.js';

import {
  validateSendMessage,
  validateSendMedia,
  validateSendLocation,
  validateSendContact,
  validateBroadcast,
  validateScheduleMessage,
} from '../middleware/validation.js';

const router = express.Router();

/**
 * @openapi
 * /api/status:
 *   get:
 *     summary: Get connection status
 *     description: Retrieve connection status and QR code if the device is not authenticated.
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/status', authController.getStatus);

/**
 * @openapi
 * /api/logout:
 *   post:
 *     summary: Log out from WhatsApp session
 *     responses:
 *       200:
 *         description: Success
 */
router.post('/logout', authController.logoutSession);
router.get('/screenshot', authController.getScreenshot);
router.post('/debug-eval', async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Code is required' });
    const client = whatsappService.getClientInstance();
    if (!client || !client.pupPage) return res.status(503).json({ error: 'Client/browser is not ready' });
    const result = await client.pupPage.evaluate(new Function(code));
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
router.get('/channels', authController.getWhatsAppChannels);
router.get('/channels/:channelId/subscribers', authController.getChannelSubscribersController);

// --- MESSAGING ---

/**
 * @openapi
 * /api/send-message:
 *   post:
 *     summary: Send text message
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [to, body]
 *             properties:
 *               to: { type: string, example: "919876543210" }
 *               body: { type: string, example: "Hello World!" }
 *     responses:
 *       200:
 *         description: Success
 */
router.post('/send-message', validateSendMessage, messageController.sendText);

/**
 * @openapi
 * /api/send-image:
 *   post:
 *     summary: Send image message
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [to, image]
 *             properties:
 *               to: { type: string, example: "919876543210" }
 *               image: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Success
 */
router.post('/send-image', upload.single('image'), validateSendMedia, messageController.sendImage);

/**
 * @openapi
 * /api/send-document:
 *   post:
 *     summary: Send PDF/document message
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [to, document]
 *             properties:
 *               to: { type: string, example: "919876543210" }
 *               document: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Success
 */
router.post('/send-document', upload.single('document'), validateSendMedia, messageController.sendDocument);

/**
 * @openapi
 * /api/send-audio:
 *   post:
 *     summary: Send voice note / audio message
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [to, audio]
 *             properties:
 *               to: { type: string }
 *               audio: { type: string, format: binary }
 */
router.post('/send-audio', upload.single('audio'), validateSendMedia, messageController.sendAudio);

/**
 * @openapi
 * /api/send-video:
 *   post:
 *     summary: Send video message
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [to, video]
 *             properties:
 *               to: { type: string }
 *               video: { type: string, format: binary }
 */
router.post('/send-video', upload.single('video'), validateSendMedia, messageController.sendVideo);

/**
 * @openapi
 * /api/send-sticker:
 *   post:
 *     summary: Send sticker message
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [to, sticker]
 *             properties:
 *               to: { type: string }
 *               sticker: { type: string, format: binary }
 */
router.post('/send-sticker', upload.single('sticker'), validateSendMedia, messageController.sendSticker);

/**
 * @openapi
 * /api/send-location:
 *   post:
 *     summary: Send location card
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [to, latitude, longitude]
 *             properties:
 *               to: { type: string }
 *               latitude: { type: number }
 *               longitude: { type: number }
 *               description: { type: string }
 */
router.post('/send-location', validateSendLocation, messageController.sendLocation);

/**
 * @openapi
 * /api/send-contact:
 *   post:
 *     summary: Send contact vcard
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [to, displayName, vcard]
 *             properties:
 *               to: { type: string }
 *               displayName: { type: string }
 *               vcard: { type: string }
 */
router.post('/send-contact', validateSendContact, messageController.sendContact);

/**
 * @openapi
 * /api/broadcast:
 *   post:
 *     summary: Broadcast message to multiple numbers
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [to, body]
 *             properties:
 *               to: { type: array, items: { type: string } }
 *               body: { type: string }
 */
router.post('/broadcast', validateBroadcast, messageController.broadcastMessage);

/**
 * @openapi
 * /api/schedule:
 *   post:
 *     summary: Schedule message for a future date
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [to, scheduledTime]
 *             properties:
 *               to: { type: array, items: { type: string } }
 *               body: { type: string }
 *               scheduledTime: { type: string, format: date-time }
 */
router.post('/schedule', validateScheduleMessage, messageController.scheduleMessage);

// --- CHATS ---

/**
 * @openapi
 * /api/chats:
 *   get:
 *     summary: Get all chats
 */
router.get('/chats', chatController.getChats);

/**
 * @openapi
 * /api/chats/archive:
 *   post:
 *     summary: Archive a chat
 */
router.post('/chats/archive', chatController.archiveChat);

/**
 * @openapi
 * /api/chats/unarchive:
 *   post:
 *     summary: Unarchive a chat
 */
router.post('/chats/unarchive', chatController.unarchiveChat);

/**
 * @openapi
 * /api/chats/pin:
 *   post:
 *     summary: Pin a chat
 */
router.post('/chats/pin', chatController.pinChat);

/**
 * @openapi
 * /api/chats/unpin:
 *   post:
 *     summary: Unpin a chat
 */
router.post('/chats/unpin', chatController.unpinChat);

/**
 * @openapi
 * /api/chats/mark-unread:
 *   post:
 *     summary: Mark chat as unread
 */
router.post('/chats/mark-unread', chatController.markAsUnread);

// --- GROUPS ---

/**
 * @openapi
 * /api/groups:
 *   get:
 *     summary: Get all joined groups
 */
router.get('/groups', groupController.getGroups);

/**
 * @openapi
 * /api/groups:
 *   post:
 *     summary: Create a WhatsApp group
 */
router.post('/groups', groupController.createGroup);

/**
 * @openapi
 * /api/groups/add:
 *   post:
 *     summary: Add members to group
 */
router.post('/groups/add', groupController.addMembers);

/**
 * @openapi
 * /api/groups/remove:
 *   post:
 *     summary: Remove members from group
 */
router.post('/groups/remove', groupController.removeMembers);

/**
 * @openapi
 * /api/groups/promote:
 *   post:
 *     summary: Promote members to admin
 */
router.post('/groups/promote', groupController.promoteAdmin);

/**
 * @openapi
 * /api/groups/demote:
 *   post:
 *     summary: Demote admin members
 */
router.post('/groups/demote', groupController.demoteAdmin);

/**
 * @openapi
 * /api/groups/leave:
 *   post:
 *     summary: Leave a group
 */
router.post('/groups/leave', groupController.leaveGroup);

/**
 * @openapi
 * /api/groups/announcement:
 *   post:
 *     summary: Set group announcement mode (admins only)
 */
router.post('/groups/announcement', groupController.sendGroupAnnouncement);

// --- CONTACTS ---

/**
 * @openapi
 * /api/contacts:
 *   get:
 *     summary: Get all synced contacts
 */
router.get('/contacts', contactController.getContacts);
router.get('/contacts/export', contactController.exportContacts);

/**
 * @openapi
 * /api/contacts/{jid}:
 *   get:
 *     summary: Get contact info
 */
router.get('/contacts/:jid', contactController.getContactInfo);

/**
 * @openapi
 * /api/contacts/{jid}/profile-picture:
 *   get:
 *     summary: Get profile picture URL
 */
router.get('/contacts/:jid/profile-picture', contactController.getProfilePicture);

/**
 * @openapi
 * /api/contacts/block:
 *   post:
 *     summary: Block a contact
 */
router.post('/contacts/block', contactController.blockContact);
router.post('/contacts/unblock', contactController.unblockContact);
router.post('/contacts/relationship', contactController.updateRelationship);

// --- CAMPAIGNS & CONSENT ---
router.get('/broadcasts', broadcastController.getCampaigns);
router.get('/broadcasts/:id', broadcastController.getCampaign);
router.post('/broadcasts', upload.single('media'), broadcastController.createCampaign);
router.post('/broadcasts/:id/action', broadcastController.campaignAction);

router.post('/contacts/consent', broadcastController.toggleContactConsent);
router.post('/contacts/bulk-consent', broadcastController.bulkUpdateConsent);
router.post('/contacts/create', broadcastController.addContact);
router.post('/contacts/sync', broadcastController.syncContacts);

// --- AI AUTO-REPLY ---

/**
 * @openapi
 * /api/auto-reply/status:
 *   get:
 *     summary: Get AI auto-reply configuration status
 *     responses:
 *       200:
 *         description: Current auto-reply settings
 */
router.get('/auto-reply/status', autoReplyController.getAutoReplyStatus);

/**
 * @openapi
 * /api/auto-reply/toggle:
 *   post:
 *     summary: Enable or disable AI auto-reply at runtime
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [enabled]
 *             properties:
 *               enabled: { type: boolean }
 */
router.post('/auto-reply/toggle', autoReplyController.toggleAutoReply);

/**
 * @openapi
 * /api/auto-reply/prompt:
 *   get:
 *     summary: Get the current AI system prompt
 *   post:
 *     summary: Update the AI system prompt
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [prompt]
 *             properties:
 *               prompt: { type: string }
 */
router.get('/auto-reply/prompt', autoReplyController.getSystemPrompt);
router.post('/auto-reply/prompt', autoReplyController.updateSystemPrompt);

export default router;

