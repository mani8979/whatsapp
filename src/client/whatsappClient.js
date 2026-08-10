import pkg from 'whatsapp-web.js';
import qrcodeTerminal from 'qrcode-terminal';
import logger from '../utils/logger.js';
import eventBus from '../utils/eventBus.js';

const { Client, LocalAuth } = pkg;

/**
 * Initializes and configures the WhatsApp Web Client wrapper.
 * Integrates event hooks directly with the global Event Bus.
 * 
 * @param {Object} config Resolved configuration settings
 * @returns {import('whatsapp-web.js').Client}
 */
export function createWhatsappClient(config) {
  logger.info(`Initializing WhatsApp Client. Session directory: ${config.sessionPath}`);

  const client = new Client({
    authStrategy: new LocalAuth({
      dataPath: config.sessionPath,
    }),
    webVersionCache: config.webVersionCache,
    qrTimeoutMs: 300000,
    authTimeoutMs: 300000,
    puppeteer: {
      headless: true,
      executablePath: config.chromePath,
      args: config.puppeteerArgs,
    },
  });

  // Bind Native Client Events to Event Bus singleton
  client.on('qr', (qr) => {
    logger.info('Scan request received.');
    eventBus.emit('client:qr', qr);
  });

  client.on('authenticated', () => {
    logger.info('WhatsApp authenticated successfully.');
    eventBus.emit('client:authenticated');
  });

  client.on('auth_failure', (msg) => {
    logger.error(`Authentication Failure: ${msg}`);
    eventBus.emit('client:auth_failure', msg);
  });

  client.on('ready', () => {
    logger.info('WhatsApp client connection is ready.');
    eventBus.emit('client:ready');
  });

  client.on('disconnected', (reason) => {
    logger.warn(`WhatsApp client connection was disconnected: ${reason}`);
    eventBus.emit('client:disconnected', reason);
  });

  return client;
}
export default createWhatsappClient;
