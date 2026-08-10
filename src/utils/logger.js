import fs from 'fs-extra';
import path from 'path';

/**
 * Custom lightweight logger that writes formatted text strings to files
 * and console (depending on silent/verbose configurations).
 */
class ExportLogger {
  constructor() {
    this.logsDir = path.resolve('./logs');
    this.silent = false;
    this.verbose = false;
  }

  /**
   * Initialize directory and configurations
   */
  async init(config = {}) {
    this.logsDir = config.logsDir || path.resolve('./logs');
    this.silent = !!config.silent;
    this.verbose = !!config.verbose;
    await fs.ensureDir(this.logsDir);
  }

  /**
   * Format message prefix with timestamp and level
   */
  _format(level, msg) {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    return `[${timestamp}] [${level.toUpperCase()}] ${msg}\n`;
  }

  /**
   * Append log line to a specific log file
   */
  async _write(filename, line) {
    const filePath = path.join(this.logsDir, filename);
    try {
      await fs.appendFile(filePath, line, 'utf8');
    } catch (err) {
      // Suppress logging write errors to stdout
    }
  }

  /**
   * Log informational progress message
   */
  async info(msg) {
    const line = this._format('info', msg);
    await this._write('export.log', line);
    if (!this.silent) {
      console.log(msg);
    }
  }

  /**
   * Log debugging information (only prints to screen in verbose mode)
   */
  async debug(msg) {
    const line = this._format('debug', msg);
    await this._write('export.log', line);
    if (!this.silent && this.verbose) {
      console.log(`[DEBUG] ${msg}`);
    }
  }

  /**
   * Log errors
   */
  async error(msg, errorObj = null) {
    let errorDetail = msg;
    if (errorObj) {
      errorDetail += ` | Error: ${errorObj.message}`;
      if (errorObj.stack && this.verbose) {
        errorDetail += `\nStack:\n${errorObj.stack}`;
      }
    }
    const line = this._format('error', errorDetail);
    await this._write('export.log', line);
    await this._write('error.log', line);
    if (!this.silent) {
      console.error(`[ERROR] ${errorDetail}`);
    }
  }

  /**
   * Log performance metrics
   */
  async performance(action, durationMs, details = '') {
    const summary = `${action} completed in ${durationMs}ms${details ? ` | ${details}` : ''}`;
    const line = this._format('perf', summary);
    await this._write('export.log', line);
    await this._write('performance.log', line);
    if (!this.silent && this.verbose) {
      console.log(`[PERF] ${summary}`);
    }
  }
}

const logger = new ExportLogger();
export default logger;
