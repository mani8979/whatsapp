import path from 'path';
import fs from 'fs-extra';
import dotenv from 'dotenv';

// Load .env file
dotenv.config();

const DEFAULT_CHROME_WINDOWS = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

/**
 * Loads and merges configuration settings in order of priority:
 * 1. CLI Overrides
 * 2. Environment Variables
 * 3. config.json file
 * 4. System Defaults
 * 
 * @param {Object} cliOptions Options parsed from CLI arguments
 * @returns {Object} Final resolved configuration
 */
export function getConfig(cliOptions = {}) {
  // 1. Load config.json if it exists in project root
  let fileConfig = {};
  const configJsonPath = path.resolve('./config.json');
  if (fs.existsSync(configJsonPath)) {
    try {
      fileConfig = fs.readJsonSync(configJsonPath);
    } catch (err) {
      console.warn(`Warning: Failed to read config.json: ${err.message}`);
    }
  }

  // Helper to resolve parameter hierarchy
  const getParam = (cliKey, envKey, fileKey, defaultValue) => {
    if (cliOptions[cliKey] !== undefined && cliOptions[cliKey] !== null) {
      return cliOptions[cliKey];
    }
    if (process.env[envKey] !== undefined) {
      // Cast booleans
      if (process.env[envKey] === 'true') return true;
      if (process.env[envKey] === 'false') return false;
      return process.env[envKey];
    }
    if (fileConfig[fileKey] !== undefined) {
      return fileConfig[fileKey];
    }
    return defaultValue;
  };

  // Resolve directory paths
  const exportsDir = path.resolve(getParam('output', 'EXPORT_DIR', 'exportDir', './exports'));
  const logsDir = path.resolve(getParam('logDir', 'LOG_DIR', 'logDir', './logs'));
  const baseSessionPath = getParam('sessionPath', 'SESSION_PATH', 'sessionPath', './sessions');
  const account = getParam('account', 'ACCOUNT', 'account', null);
  const sessionPath = path.resolve(account ? path.join(baseSessionPath, account) : baseSessionPath);
  
  const resolvedConfig = {
    account,
    sessionPath,
    exportsDir,
    logsDir,
    chromePath: getParam('chromePath', 'PUPPETEER_EXECUTABLE_PATH', 'chromePath', DEFAULT_CHROME_WINDOWS),
    fallbackCountry: getParam('fallbackCountry', 'FALLBACK_COUNTRY', 'fallbackCountry', 'OM'),
    format: getParam('format', 'EXPORT_FORMAT', 'format', 'xlsx'),
    logLevel: getParam('logLevel', 'LOG_LEVEL', 'logLevel', 'info'),
    silent: getParam('silent', 'SILENT', 'silent', false),
    verbose: getParam('verbose', 'VERBOSE', 'verbose', false),
    overwrite: getParam('overwrite', 'OVERWRITE', 'overwrite', false),
    limit: getParam('limit', 'LIMIT', 'limit', null),
    offset: getParam('offset', 'OFFSET', 'offset', 0),
    dryRun: getParam('dryRun', 'DRY_RUN', 'dryRun', false),
    incremental: getParam('incremental', 'INCREMENTAL', 'incremental', false),
    
    // Puppeteer browser settings
    puppeteerArgs: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-extensions',
      '--proxy-server="direct://"',
      '--proxy-bypass-list=*',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-blink-features=AutomationControlled',
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
    ],
    
    webVersionCache: {
      type: 'remote',
      remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1044830814-alpha.html',
    }
  };

  // Convert limit and offset to numbers if present
  if (resolvedConfig.limit !== null) {
    resolvedConfig.limit = parseInt(resolvedConfig.limit, 10);
  }
  resolvedConfig.offset = parseInt(resolvedConfig.offset, 10);

  return resolvedConfig;
}
