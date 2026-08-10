import path from 'path';

/**
 * Get configuration settings for the WhatsApp Exporter
 * @param {Object} options Options passed from CLI arguments
 * @returns {Object} Config object
 */
export function getConfig(options = {}) {
  const sessionPath = options.sessionPath || './sessions';
  const resolvedSessionPath = path.resolve(sessionPath);

  return {
    sessionPath: resolvedSessionPath,
    // Use environment variable or default Windows Chrome path
    chromePath: process.env.PUPPETEER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
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
    // Web version cache is important to prevent outdated version prompts
    webVersionCache: {
      type: 'remote',
      remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1044830814-alpha.html',
    },
    exportsDir: path.resolve('./exports'),
    logsDir: path.resolve('./logs'),
  };
}
