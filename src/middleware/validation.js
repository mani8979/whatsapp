import { body, validationResult } from 'express-validator';
import logger from '../config/logger.js';

/**
 * Common middleware to validate and reject requests with error details.
 */
export const validateFields = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn(`Validation failed for path: ${req.path}. Errors: ${JSON.stringify(errors.array())}`);
    return res.status(400).json({
      success: false,
      errors: errors.array().map((err) => ({ field: err.path, message: err.msg })),
    });
  }
  next();
};

export const validateSendMessage = [
  body('to').notEmpty().withMessage('Recipient number/JID is required').trim(),
  body('body').notEmpty().withMessage('Message body is required').trim(),
  validateFields,
];

export const validateSendMedia = [
  body('to').notEmpty().withMessage('Recipient number/JID is required').trim(),
  validateFields,
];

export const validateSendLocation = [
  body('to').notEmpty().withMessage('Recipient number/JID is required').trim(),
  body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Latitude must be between -90 and 90'),
  body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Longitude must be between -180 and 180'),
  body('description').optional().trim(),
  validateFields,
];

export const validateSendContact = [
  body('to').notEmpty().withMessage('Recipient number/JID is required').trim(),
  body('displayName').notEmpty().withMessage('Display name is required').trim(),
  body('vcard').notEmpty().withMessage('vcard formatted contact card string is required').trim(),
  validateFields,
];

export const validateBroadcast = [
  body('to').isArray({ min: 1 }).withMessage('to must be a non-empty array of recipient strings'),
  body('body').notEmpty().withMessage('Message body is required').trim(),
  validateFields,
];

export const validateScheduleMessage = [
  body('to').isArray({ min: 1 }).withMessage('to must be a non-empty array of recipient strings (or single string in array)'),
  body('scheduledTime').isISO8601().withMessage('scheduledTime must be a valid ISO 8601 timestamp'),
  body('type').optional().isIn(['text', 'image', 'document', 'location', 'contact']).withMessage('Invalid message type'),
  validateFields,
];
