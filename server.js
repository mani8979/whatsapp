import http from 'http';
import { Server } from 'socket.io';
import app from './src/app.js';
import connectDB from './src/config/db.js';
import env from './src/config/env.js';
import logger from './src/config/logger.js';
import whatsappService from './src/services/whatsapp.service.js';
import { destroyClient } from './src/services/whatsapp.service.js';
import { startScheduler } from './src/services/scheduler.service.js';
import { initBroadcastQueue } from './src/services/broadcast.service.js';
import { initDb } from './src/storage/sqlite.js';

// Catch uncaught exceptions to prevent crashes due to library lockfile issues on Windows
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught Exception: ${err.stack || err.message}`);
  // Ignore Windows file lock errors from the whatsapp-web.js library
  if (err.message.includes('EBUSY') && err.message.includes('lockfile')) {
    logger.warn('Caught EBUSY lockfile error. Ignoring to prevent crash.');
    return;
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
});

// Bootstrap Server & WhatsApp Automation Client
const bootstrap = async () => {
  try {
    // 1. Connect to MongoDB
    await connectDB();

    // 1b. Initialize SQLite contact database
    await initDb();
    logger.info('SQLite contact database initialized.');


    // 2. Create HTTP Server
    const server = http.createServer(app);

    // 3. Initialize Socket.io
    const io = new Server(server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    // 4. Attach SocketIO to Services
    whatsappService.setSocketIO(io);

    // 5. Start HTTP Server immediately
    server.listen(env.PORT, () => {
      logger.info(`==================================================`);
      logger.info(`  WhatsApp Automation Server is running on port ${env.PORT}`);
      logger.info(`  Dashboard: http://localhost:${env.PORT}`);
      logger.info(`  Swagger Docs: http://localhost:${env.PORT}/api-docs`);
      logger.info(`  Environment: ${env.NODE_ENV}`);
      logger.info(`==================================================`);
    });

    // 6. Start WhatsApp client wrapper (runs asynchronously in background)
    whatsappService.initClient().catch((err) => {
      logger.error(`WhatsApp client initialization error: ${err.message}`);
    });

    // 7. Start Message Scheduler
    startScheduler();

    // 8. Initialize Broadcast Queue (resets interrupted campaigns to paused state)
    await initBroadcastQueue();

    // Handle process termination signals cleanly
    const handleShutdown = async (signal) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);

      // Step 1: Destroy Chrome/WhatsApp client (preserves session files)
      try {
        await destroyClient();
      } catch (err) {
        logger.error(`Error during client shutdown: ${err.message}`);
      }

      // Step 2: Close HTTP server so port 3001 is released BEFORE the new process starts
      await new Promise((resolve) => server.close(resolve));
      logger.info('HTTP server closed. Port released.');

      if (signal === 'SIGUSR2') {
        // Re-signal nodemon that we are done so it can spawn the new process
        process.kill(process.pid, 'SIGUSR2');
      } else {
        process.exit(0);
      }
    };

    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.once('SIGUSR2', () => handleShutdown('SIGUSR2'));

  } catch (error) {
    logger.error(`Fatal Server Error: ${error.message}`);
    process.exit(1);
  }
};

bootstrap();
