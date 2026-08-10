/**
 * gemini.service.js  (now powered by NVIDIA NIM — OpenAI-compatible API)
 *
 * Handles AI-powered auto-reply generation using NVIDIA's LLM API.
 * Fetches recent conversation history from MongoDB and passes it
 * to the model along with the system prompt defined in ai-system-prompt.txt.
 *
 * NVIDIA NIM is fully OpenAI-compatible, so we use the `openai` npm package
 * pointed at https://integrate.api.nvidia.com/v1
 */

import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import env from '../config/env.js';
import logger from '../config/logger.js';
import Message from '../models/message.model.js';

// ── System Prompt ────────────────────────────────────────────────────────────

const systemPromptPath = path.join(path.resolve(), 'src', 'config', 'ai-system-prompt.txt');
let systemPrompt = '';
try {
  systemPrompt = fs.readFileSync(systemPromptPath, 'utf8').trim();
  logger.info('NvidiaAI: Loaded system prompt from ai-system-prompt.txt');
} catch (err) {
  logger.error(`NvidiaAI: Failed to load system prompt: ${err.message}`);
}

// Reload the system prompt from disk on every call so live edits via the API
// take effect without restarting the server.
const getSystemPrompt = () => {
  try {
    return fs.readFileSync(systemPromptPath, 'utf8').trim();
  } catch {
    return systemPrompt; // fall back to startup-loaded value
  }
};

// ── NVIDIA OpenAI Client (lazy) ──────────────────────────────────────────────

let openaiClient = null;
const getClient = () => {
  if (!openaiClient) {
    if (!env.NVIDIA_API_KEY || env.NVIDIA_API_KEY === 'your_nvidia_api_key_here') {
      throw new Error('NVIDIA_API_KEY is not configured in .env');
    }
    openaiClient = new OpenAI({
      apiKey: env.NVIDIA_API_KEY,
      baseURL: 'https://integrate.api.nvidia.com/v1',
      timeout: 30000,
      maxRetries: 2,
    });
  }
  return openaiClient;
};

// ── Conversation History ─────────────────────────────────────────────────────

/**
 * Fetch the last N messages for a given chat JID from MongoDB,
 * ordered oldest → newest.
 *
 * @param {string} jid   - WhatsApp chat JID (e.g. "919876543210@c.us")
 * @param {number} limit - How many messages to use as context
 * @returns {Promise<Array>}
 */
const fetchConversationHistory = async (jid, limit = env.AI_CONTEXT_MESSAGES) => {
  try {
    const dbPromise = Message.find({
      $or: [{ from: jid }, { to: jid }],
      isDeleted: false,
      isGroup: false,
      type: 'chat',
    })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve([]), 2500));
    const messages = await Promise.race([dbPromise, timeoutPromise]);
    return Array.isArray(messages) ? messages.reverse() : [];
  } catch (err) {
    logger.error(`NvidiaAI: Failed to fetch conversation history: ${err.message}`);
    return [];
  }
};

/**
 * Build the conversation history block as a plain-text context string.
 * This is injected into the system prompt so the model sees it as
 * background context, NOT as a conversation it should continue from.
 *
 * @param {Array} history - Message documents from MongoDB (oldest → newest)
 * @returns {string}      - Human-readable chat log
 */
const buildHistoryBlock = (history) => {
  if (!history.length) return '';

  const lines = history.map((msg) => {
    if (!msg.body) return null;
    const speaker = msg.direction === 'outgoing' ? 'Assistant' : 'User';
    return `${speaker}: ${msg.body}`;
  }).filter(Boolean);

  return lines.join('\n');
};

// ── Main Export ───────────────────────────────────────────────────────────────

/**
 * Generate an AI reply for an incoming WhatsApp message using NVIDIA LLM.
 *
 * @param {string} senderJid    - Sender's WhatsApp JID
 * @param {string} incomingText - Incoming message body
 * @returns {Promise<string|null>} - Reply text, or null on failure/disabled
 */
export const generateAIReply = async (senderJid, incomingText) => {
  if (!env.AI_AUTO_REPLY_ENABLED) {
    logger.debug('NvidiaAI: AI auto-reply is disabled (AI_AUTO_REPLY_ENABLED=false)');
    return null;
  }

  if (!incomingText || !incomingText.trim()) {
    logger.debug('NvidiaAI: Skipping empty message body');
    return null;
  }

  try {
    const client = getClient();

    // 1. Fetch prior conversation context from DB
    const rawHistory = await fetchConversationHistory(senderJid, env.AI_CONTEXT_MESSAGES + 1);
    const history = rawHistory.filter(
      (m) => !(m.direction === 'incoming' && m.body === incomingText)
    ).slice(-env.AI_CONTEXT_MESSAGES);

    logger.info(`NvidiaAI: Using ${history.length} context messages for ${senderJid}`);

    // 2. Build history as a plain-text block inside the system prompt.
    const historyBlock = buildHistoryBlock(history);
    const fullSystemPrompt = historyBlock
      ? `${getSystemPrompt()}\n\n--- CONVERSATION HISTORY (context only, do NOT reply to these) ---\n${historyBlock}\n--- END HISTORY ---`
      : getSystemPrompt();

    // 3. Final user turn is ONLY the message we need to reply to
    const finalUserTurn = `Reply to this message: ${incomingText}`;

    // 4. Call NVIDIA NIM with robust 25s timeout and automatic fallback
    const primaryModel = env.NVIDIA_MODEL || 'meta/llama-3.2-11b-vision-instruct';
    const fallbackModel = 'nvidia/llama-3.3-nemotron-super-49b-v1';

    let response = null;

    // Primary attempt
    try {
      response = await client.chat.completions.create(
        {
          model: primaryModel,
          messages: [
            { role: 'system', content: fullSystemPrompt },
            { role: 'user',   content: finalUserTurn },
          ],
          temperature: 0.7,
          max_tokens: 80,
        },
        { timeout: 25000 }
      );
    } catch (primaryErr) {
      logger.warn(`NvidiaAI: Primary model (${primaryModel}) failed (${primaryErr.message}). Trying fallback (${fallbackModel})...`);
      
      // Fallback attempt
      try {
        response = await client.chat.completions.create(
          {
            model: fallbackModel,
            messages: [
              { role: 'system', content: fullSystemPrompt },
              { role: 'user',   content: finalUserTurn },
            ],
            temperature: 0.7,
            max_tokens: 80,
          },
          { timeout: 25000 }
        );
      } catch (fallbackErr) {
        logger.error(`NvidiaAI: Fallback model also failed: ${fallbackErr.message}`);
        return null;
      }
    }

    const replyText = response.choices?.[0]?.message?.content?.trim();
    logger.debug(`NvidiaAI: RAW_RESPONSE ${JSON.stringify(response, null, 2)}`);
    if (!replyText) {
      logger.warn('NvidiaAI: Received empty response from API');
      return null;
    }

    logger.info(`NvidiaAI: Reply for ${senderJid}: "${replyText.substring(0, 80)}..."`);
    return replyText;
  } catch (err) {
    logger.error(`NvidiaAI: Error generating reply: ${err.message}`);
    return null;
  }
};

export default { generateAIReply };
