import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import logger from '../config/logger.js';
import Message from '../models/message.model.js';
import Contact from '../models/contact.model.js';
import env from '../config/env.js';
import { generateAIReply } from '../services/gemini.service.js';


const uploadsDir = 'uploads';

// Load auto-replies safely across all Node versions (keyword fallback)
const autoRepliesPath = path.join(path.resolve(), 'src', 'config', 'auto-replies.json');
let autoReplies = {};
try {
  autoReplies = JSON.parse(fs.readFileSync(autoRepliesPath, 'utf8'));
} catch (err) {
  logger.error(`Failed to load auto-replies.json: ${err.message}`);
}

// Ensure uploads directory exists
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

/**
 * Register all message-related event handlers for the client.
 * @param {import('whatsapp-web.js').Client} client 
 */
export const registerClientEvents = (client) => {
  
  // 1. Listen for all incoming/outgoing messages
  client.on('message_create', async (msg) => {
    try {
      // Avoid processing system status/notification events as normal chats
      if (!msg.id || msg.type === 'notification' || msg.type === 'gp2') return;

      const messageId = typeof msg.id === 'object' ? (msg.id._serialized || msg.id.id) : msg.id;
      if (!messageId) {
        logger.debug('Skipping message: messageId is null or undefined.');
        return;
      }
      const isGroup = msg.from.endsWith('@g.us') || msg.to.endsWith('@g.us');
      const groupJid = isGroup ? (msg.from.endsWith('@g.us') ? msg.from : msg.to) : null;
      const direction = msg.fromMe ? 'outgoing' : 'incoming';

      logger.info(`Message detected (${direction}): ID: ${messageId}, Type: ${msg.type}`);

      // Check if message already exists (due to dual trigger of message_create)
      const existing = await Message.findOne({ messageId });
      if (existing) return;

      let mediaPath = null;
      let fileName = null;
      let fileSize = null;

      // Handle media downloading
      if (msg.hasMedia) {
        try {
          logger.info(`Downloading media for message: ${messageId}`);
          const media = await msg.downloadMedia();
          if (media && media.data) {
            const ext = mime.extension(media.mimetype) || 'bin';
            const uniqueName = `${Date.now()}-${Math.floor(Math.random() * 100000)}.${ext}`;
            mediaPath = path.join(uploadsDir, uniqueName);
            fileName = media.filename || uniqueName;

            const buffer = Buffer.from(media.data, 'base64');
            fileSize = buffer.length;

            await fs.promises.writeFile(mediaPath, buffer);
            logger.info(`Saved received media to ${mediaPath}`);
          }
        } catch (mediaError) {
          logger.error(`Error saving message media: ${mediaError.message}`);
        }
      }

      // Store in MongoDB
      const newMessage = new Message({
        messageId,
        from: msg.from,
        to: msg.to,
        body: msg.body || '',
        hasMedia: msg.hasMedia,
        mediaPath,
        mimeType: msg.hasMedia ? msg.type : null,
        fileName,
        fileSize,
        type: msg.type,
        direction,
        isGroup,
        groupJid,
        location: msg.location ? {
          latitude: msg.location.latitude,
          longitude: msg.location.longitude,
          description: msg.location.description,
        } : undefined,
        vcard: msg.vcard ? {
          displayName: msg.vcard.displayName || 'Contact Card',
          card: msg.vcard.card,
        } : undefined,
        timestamp: new Date(msg.timestamp * 1000),
      });

      await newMessage.save();



      // Trigger Auto-Reply on INCOMING messages only
      if (direction === 'incoming') {
        await handleAutoReply(client, msg);
      }

    } catch (error) {
      logger.error(`Error processing message event: ${error.message}`);
    }
  });

  // 2. Listen for message edits
  client.on('message_edit', async (msg, newBody, prevBody) => {
    try {
      const messageId = typeof msg.id === 'object' ? (msg.id._serialized || msg.id.id) : msg.id;
      if (!messageId) return;
      logger.info(`Message edited. ID: ${messageId}`);
      await Message.findOneAndUpdate(
        { messageId },
        { 
          isEdited: true, 
          body: newBody, 
          originalBody: prevBody 
        }
      );
    } catch (error) {
      logger.error(`Error handling message edit: ${error.message}`);
    }
  });

  // 3. Listen for deleted messages
  client.on('message_revoke_everyone', async (after, before) => {
    try {
      const getMsgId = (m) => m ? (typeof m.id === 'object' ? (m.id._serialized || m.id.id) : m.id) : null;
      const messageId = getMsgId(after) || getMsgId(before);
      if (messageId) {
        logger.info(`Message deleted/revoked. ID: ${messageId}`);
        await Message.findOneAndUpdate(
          { messageId },
          { isDeleted: true }
        );
      }
    } catch (error) {
      logger.error(`Error handling message revoke: ${error.message}`);
    }
  });
};

/**
 * Auto-reply processor for incoming messages.
 *
 * Priority order:
 *   1. Gemini AI reply (if AI_AUTO_REPLY_ENABLED=true and GEMINI_API_KEY is set)
 *   2. Keyword-based reply from auto-replies.json (always available as fallback)
 *
 * @param {import('whatsapp-web.js').Client} client 
 * @param {import('whatsapp-web.js').Message} msg 
 */
const handleAutoReply = async (client, msg) => {
  // Avoid replying to ourselves, group chats (by default), or non-chat types
  if (msg.fromMe || msg.from.endsWith('@g.us') || msg.type !== 'chat') return;

  // Show blue tick (seen) and "typing..." indicator in WhatsApp chat header
  const chat = await msg.getChat().catch(() => null);
  if (chat) {
    await chat.sendSeen().catch(() => {});
    await chat.sendStateTyping().catch(() => {});
  }

  const normalizedText = (msg.body || '').trim().toLowerCase();
  let replyText = null;

  // ── 1. Try AI reply ──────────────────────────────────────────────────────
  if (env.AI_AUTO_REPLY_ENABLED) {
    try {
      replyText = await generateAIReply(msg.from, msg.body || '');
    } catch (aiErr) {
      logger.error(`AI auto-reply error: ${aiErr.message}`);
    }
  }

  // ── 2. Fallback: keyword-based reply ────────────────────────────────────
  if (!replyText) {
    for (const [keyword, response] of Object.entries(autoReplies)) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      if (regex.test(normalizedText)) {
        replyText = response;
        logger.info(`Keyword Auto-Reply triggered: "${keyword}" -> "${replyText}"`);
        break;
      }
    }
  }

  // ── 3. Send reply ─────────────────────────────────────────────────────────
  if (replyText) {
    try {
      if (chat) {
        await chat.clearState().catch(() => {});
      }
      await client.sendMessage(msg.from, replyText);
      logger.info(`Auto-reply sent to ${msg.from}`);
    } catch (sendError) {
      logger.error(`Error sending auto-reply message to ${msg.from}: ${sendError.message}`);
    }
  } else if (chat) {
    await chat.clearState().catch(() => {});
  }
};

export default {
  registerClientEvents,
};
