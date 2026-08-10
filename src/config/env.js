import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3001', 10),
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/whatsapp_automation',
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 mins
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  // NVIDIA NIM AI Auto-Reply
  NVIDIA_API_KEY: process.env.NVIDIA_API_KEY || '',
  AI_AUTO_REPLY_ENABLED: process.env.AI_AUTO_REPLY_ENABLED === 'true',
  AI_CONTEXT_MESSAGES: parseInt(process.env.AI_CONTEXT_MESSAGES || '10', 10),
  NVIDIA_MODEL: process.env.NVIDIA_MODEL || 'nvidia/llama-3.3-nemotron-super-49b-v1',
};

// Simple validation
if (!env.MONGODB_URI) {
  console.error('ERROR: MONGODB_URI is required in environment variables!');
  process.exit(1);
}

export default env;
