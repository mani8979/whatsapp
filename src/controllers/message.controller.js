import whatsappService from '../services/whatsapp.service.js';
import ScheduledMessage from '../models/scheduled-message.model.js';
import logger from '../config/logger.js';
import path from 'path';

/**
 * Send text message.
 * @route POST /api/send-message
 */
export const sendText = async (req, res, next) => {
  try {
    const { to, body } = req.body;
    const msg = await whatsappService.sendMessage(to, body);
    res.json({
      success: true,
      message: 'Message sent successfully',
      data: {
        id: msg.id._serialized,
        to: msg.to,
        body: msg.body,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Send image file.
 * @route POST /api/send-image
 */
export const sendImage = async (req, res, next) => {
  try {
    const { to } = req.body;
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Image file is required' });
    }

    const filePath = req.file.path;
    const originalName = req.file.originalname;

    const msg = await whatsappService.sendMediaMessage(to, filePath, 'image', originalName);

    res.json({
      success: true,
      message: 'Image sent successfully',
      data: {
        id: msg.id._serialized,
        to: msg.to,
        fileName: originalName,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Send document file (PDF, docx, etc.).
 * @route POST /api/send-document
 */
export const sendDocument = async (req, res, next) => {
  try {
    const { to } = req.body;
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Document file is required' });
    }

    const filePath = req.file.path;
    const originalName = req.file.originalname;

    const msg = await whatsappService.sendMediaMessage(to, filePath, 'document', originalName);

    res.json({
      success: true,
      message: 'Document sent successfully',
      data: {
        id: msg.id._serialized,
        to: msg.to,
        fileName: originalName,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Send audio file.
 * @route POST /api/send-audio
 */
export const sendAudio = async (req, res, next) => {
  try {
    const { to } = req.body;
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Audio file is required' });
    }

    const filePath = req.file.path;
    const originalName = req.file.originalname;

    const msg = await whatsappService.sendMediaMessage(to, filePath, 'audio', originalName);

    res.json({
      success: true,
      message: 'Audio voice note sent successfully',
      data: {
        id: msg.id._serialized,
        to: msg.to,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Send video file.
 * @route POST /api/send-video
 */
export const sendVideo = async (req, res, next) => {
  try {
    const { to } = req.body;
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Video file is required' });
    }

    const filePath = req.file.path;
    const originalName = req.file.originalname;

    const msg = await whatsappService.sendMediaMessage(to, filePath, 'video', originalName);

    res.json({
      success: true,
      message: 'Video sent successfully',
      data: {
        id: msg.id._serialized,
        to: msg.to,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Send sticker file.
 * @route POST /api/send-sticker
 */
export const sendSticker = async (req, res, next) => {
  try {
    const { to } = req.body;
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Sticker image file is required' });
    }

    const filePath = req.file.path;
    const msg = await whatsappService.sendMediaMessage(to, filePath, 'sticker');

    res.json({
      success: true,
      message: 'Sticker sent successfully',
      data: {
        id: msg.id._serialized,
        to: msg.to,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Send location.
 * @route POST /api/send-location
 */
export const sendLocation = async (req, res, next) => {
  try {
    const { to, latitude, longitude, description } = req.body;
    const msg = await whatsappService.sendLocationMessage(
      to,
      parseFloat(latitude),
      parseFloat(longitude),
      description || ''
    );

    res.json({
      success: true,
      message: 'Location sent successfully',
      data: {
        id: msg.id._serialized,
        to: msg.to,
        location: { latitude, longitude, description },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Send contact card.
 * @route POST /api/send-contact
 */
export const sendContact = async (req, res, next) => {
  try {
    const { to, displayName, vcard } = req.body;
    const msg = await whatsappService.sendContactMessage(to, displayName, vcard);

    res.json({
      success: true,
      message: 'Contact card sent successfully',
      data: {
        id: msg.id._serialized,
        to: msg.to,
        displayName,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Broadcast message to multiple numbers.
 * @route POST /api/broadcast
 */
export const broadcastMessage = async (req, res, next) => {
  try {
    const { to, body } = req.body;
    logger.info(`API Request: Broadcast message to ${to.length} recipients`);

    const results = [];
    for (const recipient of to) {
      try {
        const msg = await whatsappService.sendMessage(recipient, body);
        results.push({ recipient, success: true, messageId: msg.id._serialized });
      } catch (err) {
        logger.error(`Broadcast item failed for ${recipient}: ${err.message}`);
        results.push({ recipient, success: false, error: err.message });
      }
    }

    res.json({
      success: true,
      message: 'Broadcast completed',
      data: results,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Schedule a message to be sent later.
 * @route POST /api/schedule
 */
export const scheduleMessage = async (req, res, next) => {
  try {
    const { to, body, scheduledTime, type, location, contactCard } = req.body;
    logger.info(`API Request: Schedule message to ${to} at ${scheduledTime}`);

    const newScheduledMessage = new ScheduledMessage({
      to: Array.isArray(to) ? to.map(whatsappService.formatJid) : [whatsappService.formatJid(to)],
      body,
      scheduledTime: new Date(scheduledTime),
      type: type || 'text',
      location,
      contactCard,
    });

    await newScheduledMessage.save();

    res.json({
      success: true,
      message: 'Message scheduled successfully',
      data: newScheduledMessage,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  sendText,
  sendImage,
  sendDocument,
  sendAudio,
  sendVideo,
  sendSticker,
  sendLocation,
  sendContact,
  broadcastMessage,
  scheduleMessage,
};
