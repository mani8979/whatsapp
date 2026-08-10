import logger from './logger.js';

/**
 * Generic decorator to retry any async operation.
 * 
 * @param {Function} fn Async function to execute
 * @param {string} label Operation identifier for error logs
 * @param {number} [maxAttempts=3] Max executions
 * @param {number} [delayMs=300] Time in milliseconds between retries
 */
export async function retry(fn, label, maxAttempts = 3, delayMs = 300) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxAttempts) {
        logger.debug(`Operation permanently failed [${maxAttempts} attempts]: ${label} | Error: ${err.message}`);
        throw err;
      }
      logger.debug(`Operation failed [attempt ${attempt}/${maxAttempts}]: ${label}. Retrying in ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}
