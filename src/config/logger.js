import winston from 'winston';
import 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';
import env from './env.js';

const logDir = 'logs';

// Ensure log directory exists
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Log formats
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] ${level}: ${message}${stack ? `\n${stack}` : ''}${metaStr}`;
  })
);

// Daily Rotate File options
const fileOptions = {
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d',
};

const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: customFormat,
  transports: [
    // Console log
    new winston.transports.Console({
      format: consoleFormat,
    }),
    // Rotating file for all logs
    new winston.transports.DailyRotateFile({
      filename: path.join(logDir, 'combined-%DATE%.log'),
      ...fileOptions,
    }),
    // Rotating file for errors only
    new winston.transports.DailyRotateFile({
      filename: path.join(logDir, 'error-%DATE%.log'),
      level: 'error',
      ...fileOptions,
    }),
    // Rotating file for API logs
    new winston.transports.DailyRotateFile({
      filename: path.join(logDir, 'api-%DATE%.log'),
      level: 'info',
      ...fileOptions,
      // Only include API requests in api log
      format: winston.format.combine(
        winston.format((info) => {
          return info.isApiLog ? info : false;
        })()
      ),
    }),
  ],
});

export default logger;
