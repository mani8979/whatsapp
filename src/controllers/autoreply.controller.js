/**
 * autoreply.controller.js
 *
 * REST endpoints for managing AI auto-reply configuration at runtime.
 *
 * GET  /api/auto-reply/status   — View current auto-reply settings
 * POST /api/auto-reply/toggle   — Enable or disable AI auto-reply
 * GET  /api/auto-reply/prompt   — View the current system prompt
 * POST /api/auto-reply/prompt   — Update the system prompt at runtime
 */

import fs from 'fs';
import path from 'path';
import env from '../config/env.js';
import logger from '../config/logger.js';

const systemPromptPath = path.join(path.resolve(), 'src', 'config', 'ai-system-prompt.txt');

/**
 * GET /api/auto-reply/status
 * Returns current auto-reply configuration.
 */
export const getAutoReplyStatus = (req, res) => {
  res.json({
    aiAutoReplyEnabled: env.AI_AUTO_REPLY_ENABLED,
    nvidiaModel: env.NVIDIA_MODEL,
    contextMessages: env.AI_CONTEXT_MESSAGES,
    apiKeyConfigured: !!(env.NVIDIA_API_KEY && env.NVIDIA_API_KEY !== 'your_nvidia_api_key_here'),
  });
};

/**
 * POST /api/auto-reply/toggle
 * Body: { enabled: true | false }
 * Toggles AI auto-reply on or off at runtime (in-memory only, restarts reset to .env value).
 */
export const toggleAutoReply = (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: '`enabled` must be a boolean (true or false)' });
  }
  env.AI_AUTO_REPLY_ENABLED = enabled;
  logger.info(`AI auto-reply ${enabled ? 'ENABLED' : 'DISABLED'} via API.`);
  res.json({ success: true, aiAutoReplyEnabled: env.AI_AUTO_REPLY_ENABLED });
};

/**
 * GET /api/auto-reply/prompt
 * Returns the current AI system prompt text.
 */
export const getSystemPrompt = (req, res) => {
  try {
    const prompt = fs.readFileSync(systemPromptPath, 'utf8');
    res.json({ prompt });
  } catch (err) {
    logger.error(`Failed to read system prompt: ${err.message}`);
    res.status(500).json({ error: 'Failed to read system prompt' });
  }
};

/**
 * POST /api/auto-reply/prompt
 * Body: { prompt: "New system prompt text..." }
 * Saves a new system prompt to disk so it persists across restarts.
 */
export const updateSystemPrompt = (req, res) => {
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: '`prompt` must be a non-empty string' });
  }
  try {
    fs.writeFileSync(systemPromptPath, prompt.trim(), 'utf8');
    logger.info('System prompt updated via API.');
    res.json({ success: true, message: 'System prompt updated. Changes take effect immediately.' });
  } catch (err) {
    logger.error(`Failed to update system prompt: ${err.message}`);
    res.status(500).json({ error: 'Failed to write system prompt to disk' });
  }
};

export default {
  getAutoReplyStatus,
  toggleAutoReply,
  getSystemPrompt,
  updateSystemPrompt,
};
