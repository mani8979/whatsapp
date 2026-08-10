import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import https from 'https';
import Session from '../models/session.model.js';
import Contact from '../models/contact.model.js';
import Group from '../models/group.model.js';
import logger from '../config/logger.js';
import env from '../config/env.js';
import { registerClientEvents } from '../events/client.events.js';

const { Client, LocalAuth, MessageMedia, Location } = pkg;

let client = null;
let socketIO = null;
let connectionStatus = 'disconnected';
let qrCodeString = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
let reconnectTimeout = null;
let isSyncing = false;
let checkSyncInterval = null;
let isInitializing = false;

/**
 * Initialize WhatsApp Client.
 */
export const initClient = async (force = false) => {
  if (isInitializing && !force) {
    logger.info('Client is already initializing. Aborting duplicate initClient request.');
    return;
  }
  isInitializing = true;

  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  if (checkSyncInterval) {
    clearInterval(checkSyncInterval);
    checkSyncInterval = null;
  }

  // Cleanly destroy existing client first if initClient is called again
  if (client) {
    logger.warn('initClient called while client already exists. Destroying existing client first...');
    const clientToDestroy = client;
    client = null; // Re-assign first to avoid triggering the close listener of the old client
    try {
      await clientToDestroy.destroy();
    } catch (e) {
      logger.error(`Error destroying existing client: ${e.message}`);
    }
  }

  // Auto-kill any orphaned Chrome processes using our session directory on Windows
  if (process.platform === 'win32') {
    try {
      logger.info('Checking for and cleaning any orphaned Chrome processes locking the session...');
      const queryCmd = 'powershell.exe -Command "Get-CimInstance Win32_Process -Filter \\"name=\'chrome.exe\'\\" | Select-Object ProcessId, CommandLine | ConvertTo-Json -Compress"';
      let output = '';
      try {
        output = execSync(queryCmd, { stdio: ['inherit', 'pipe', 'ignore'] }).toString().trim();
      } catch (err) {
        // Suppress errors if command fails
      }
      if (output) {
        const data = JSON.parse(output.startsWith('[') ? output : `[${output}]`);
        logger.info(`Process cleanup found ${data.length} chrome processes in system list.`);
        let killedCount = 0;
        for (const proc of data) {
          const cmdLine = proc.CommandLine || '';
          const match = cmdLine.includes('sessions/session') || cmdLine.includes('sessions\\session');
          if (match) {
            try {
              execSync(`taskkill /F /PID ${proc.ProcessId}`, { stdio: 'ignore' });
              killedCount++;
              logger.info(`Killed process ${proc.ProcessId} with command line: ${cmdLine}`);
            } catch (err) {
              logger.warn(`Failed to kill process ${proc.ProcessId}: ${err.message}`);
            }
          }
        }
        logger.info(`Orphaned Chrome processes cleanup completed. Killed ${killedCount} processes.`);
      } else {
        logger.info('No orphaned Chrome processes found in PowerShell query.');
      }
      
      // Clean up leftover lock and devtools port files to prevent browser is already running error
      const lockfilePath = 'D:\\whatsapp\\sessions\\session\\lockfile';
      const devtoolsPath = 'D:\\whatsapp\\sessions\\session\\DevToolsActivePort';
      
      if (fs.existsSync(lockfilePath)) {
        try {
          fs.unlinkSync(lockfilePath);
          logger.info('Successfully removed leftover session lockfile.');
        } catch (err) {
          logger.warn(`Failed to remove leftover session lockfile: ${err.message}`);
        }
      }
      
      if (fs.existsSync(devtoolsPath)) {
        try {
          fs.unlinkSync(devtoolsPath);
          logger.info('Successfully removed leftover DevToolsActivePort.');
        } catch (err) {
          logger.warn(`Failed to remove leftover DevToolsActivePort: ${err.message}`);
        }
      }
    } catch (e) {
      logger.warn(`Failed to run orphaned Chrome processes cleanup: ${e.message}`);
    }
  }


  // Ensure the local version cache file exists in the cache directory to prevent strict resolve failures
  const cacheDirPath = './.wwebjs_cache';
  const targetCacheFile = path.join(cacheDirPath, '2.3000.1044830814-alpha.html');
  const backupVersionFile = './wwebjs_version.html';

  if (!fs.existsSync(targetCacheFile)) {
    try {
      logger.info('Local version cache file missing. Restoring...');
      if (!fs.existsSync(cacheDirPath)) {
        fs.mkdirSync(cacheDirPath, { recursive: true });
      }
      if (fs.existsSync(backupVersionFile)) {
        fs.copyFileSync(backupVersionFile, targetCacheFile);
        logger.info('Restored version cache file from backup.');
      } else {
        logger.info('Backup version file missing. Downloading from remote repository...');
        await new Promise((resolve, reject) => {
          const fileStream = fs.createWriteStream(targetCacheFile);
          https.get('https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1044830814-alpha.html', (response) => {
            if (response.statusCode !== 200) {
              reject(new Error(`Failed to download: Status Code ${response.statusCode}`));
              return;
            }
            response.pipe(fileStream);
            fileStream.on('finish', () => {
              fileStream.close();
              resolve();
            });
          }).on('error', (err) => {
            fs.unlink(targetCacheFile, () => {});
            reject(err);
          });
        });
        // Save a copy as backup
        fs.copyFileSync(targetCacheFile, backupVersionFile);
        logger.info('Successfully downloaded and restored version cache file.');
      }
    } catch (err) {
      logger.error(`Failed to restore version cache: ${err.message}`);
    }
  }

  logger.info('Initializing WhatsApp Client...');
  updateConnectionStatus('connecting');

  client = new Client({
    authStrategy: new LocalAuth({
      dataPath: './sessions',
    }),
    webVersion: '2.3000.1044830814-alpha',
    webVersionCache: {
      type: 'local',
      path: './.wwebjs_cache/',
      strict: true,
    },
    qrTimeoutMs: 300000, // 5 minutes timeout for QR scan
    authTimeoutMs: 300000, // 5 minutes timeout for authentication handshake
    puppeteer: {
      headless: true,
      protocolTimeout: 180000, // 3 minutes protocol timeout
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-extensions',
        '--proxy-server=direct://',
        '--proxy-bypass-list=*',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-blink-features=AutomationControlled',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
      ],
    },
  });

  // Handle Event Hooks
  registerEventHandlers();
  registerClientEvents(client);

  try {
    const initPromise = client.initialize();

    // Workaround for ready event not firing when session is restored already synced
    checkSyncInterval = setInterval(async () => {
      try {
        if (client && client.pupPage) {
          const isSynced = await client.pupPage.evaluate(() => {
            try {
              return window.require('WAWebSocketModel').Socket.hasSynced === true;
            } catch (e) {
              return false;
            }
          });

          if (isSynced) {
            logger.info('Detected restored session is already synced. Triggering ready state manually.');
            await client.pupPage.evaluate(() => {
              if (typeof window.onAppStateHasSyncedEvent === 'function') {
                window.onAppStateHasSyncedEvent();
              }
            });
            clearInterval(checkSyncInterval);
            checkSyncInterval = null;
          }
        }
      } catch (e) {
        // Page/Puppeteer objects may not be fully set up yet
      }
    }, 2000);

    await initPromise;

    // Set up crash/exit listener on the browser process
    if (client && client.pupBrowser) {
      const proc = client.pupBrowser.process();
      if (proc) {
        const currentClient = client; // Keep a closure reference
        proc.once('close', (code, signal) => {
          // Only handle if this is still the active client
          if (client !== currentClient) {
            logger.info('WhatsApp browser process close event ignored as client has been re-assigned.');
            return;
          }
          logger.warn(`WhatsApp browser process exited (code: ${code}, signal: ${signal}).`);
          if (checkSyncInterval) {
            clearInterval(checkSyncInterval);
            checkSyncInterval = null;
          }
          if (connectionStatus !== 'disconnected' && connectionStatus !== 'auth_failure') {
            updateConnectionStatus('disconnected');
            scheduleReconnect();
          }
        });
      }
    }
    isInitializing = false;
  } catch (error) {
    isInitializing = false;
    if (checkSyncInterval) {
      clearInterval(checkSyncInterval);
      checkSyncInterval = null;
    }
    logger.error(`Error during client.initialize(): ${error.message}`);
    updateConnectionStatus('disconnected');
    scheduleReconnect();
  }
};

/**
 * Register all event handlers for the client.
 */
const registerEventHandlers = () => {
  // QR Code received
  client.on('qr', async (qr) => {
    try {
      logger.info('Scan the QR Code below to log in:');
      qrcode.generate(qr, { small: true });

      // Generate base64 QR code image on the server side
      const qrImageDataUrl = await QRCode.toDataURL(qr);
      qrCodeString = qrImageDataUrl;
      updateConnectionStatus('qr_ready', qrImageDataUrl);
    } catch (err) {
      logger.error(`Failed to generate QR image: ${err.message}`);
      qrCodeString = qr;
      updateConnectionStatus('qr_ready', qr);
    }
  });

  // Authenticated
  client.on('authenticated', () => {
    logger.info('WhatsApp Client Authenticated successfully.');
    reconnectAttempts = 0;
  });

  // Auth Failure
  client.on('auth_failure', async (msg) => {
    logger.error(`WhatsApp Authentication Failure: ${msg}`);
    updateConnectionStatus('auth_failure');
    if (checkSyncInterval) {
      clearInterval(checkSyncInterval);
      checkSyncInterval = null;
    }
    
    // Increment auth failure count in Session
    await Session.findOneAndUpdate(
      { sessionId: 'default' },
      { $inc: { authFailuresCount: 1 } },
      { upsert: true }
    );
  });

  // Ready
  client.on('ready', async () => {
    logger.info('WhatsApp Client is Ready!');

    // Check if the logged-in user JID has changed
    const currentUserJid = client.info && client.info.wid ? client.info.wid._serialized : null;
    if (currentUserJid) {
      try {
        const session = await Session.findOne({ sessionId: 'default' });
        const lastUserJid = session ? session.userJid : null;

        if (lastUserJid !== currentUserJid) {
          logger.info(`New number detected (Current: ${currentUserJid}, Previous: ${lastUserJid}). Wiping DB contacts and groups...`);
          await Contact.deleteMany({});
          await Group.deleteMany({});
        }
      } catch (dbErr) {
        logger.error(`Failed to check number change or clear DB: ${dbErr.message}`);
      }
    }

    updateConnectionStatus('authenticated');
    if (checkSyncInterval) {
      clearInterval(checkSyncInterval);
      checkSyncInterval = null;
    }
    
    // Sync contacts and groups in background
    syncContactsAndGroups().catch((err) => {
      logger.error(`Failed to sync contacts/groups: ${err.message}`);
    });
  });

  // Disconnected
  client.on('disconnected', async (reason) => {
    logger.warn(`WhatsApp Client Disconnected. Reason: ${reason}`);
    updateConnectionStatus('disconnected');
    if (checkSyncInterval) {
      clearInterval(checkSyncInterval);
      checkSyncInterval = null;
    }

    // On any disconnection, schedule automatic reconnection with existing session
    // Sessions are NOT wiped here so the linked device pairing is preserved
    scheduleReconnect();
  });
};

/**
 * Handle reconnection logic.
 */
const scheduleReconnect = () => {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
  }

  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    logger.error(`Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Please manual restart or re-scan.`);
    return;
  }

  reconnectAttempts++;
  const delay = Math.min(reconnectAttempts * 5000, 30000); // Backoff 5s, 10s, 15s... max 30s
  logger.info(`Scheduling reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay / 1000}s...`);
  
  reconnectTimeout = setTimeout(async () => {
    reconnectTimeout = null;
    const clientToDestroy = client;
    client = null; // Re-assign first to avoid triggering the close listener
    try {
      if (clientToDestroy) {
        await Promise.race([
          clientToDestroy.destroy(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('client.destroy timed out')), 3000))
        ]).catch(err => logger.warn(`Client destroy timed out or failed during reconnect: ${err.message}`));
      }
    } catch (e) {
      logger.error(`Error destroying client: ${e.message}`);
    }
    initClient();
  }, delay);
};

/**
 * Set SocketIO instance for real-time dashboard events.
 * @param {import('socket.io').Server} io 
 */
export const setSocketIO = (io) => {
  socketIO = io;
  // If we have an active connection status, emit it to new connections
  io.on('connection', (socket) => {
    socket.emit('status_change', { status: connectionStatus, qr: qrCodeString });
  });
};

/**
 * Update connection status state, update MongoDB, and emit via Socket.io.
 * @param {string} status 
 * @param {string} [qr=null] 
 */
const updateConnectionStatus = async (status, qr = null) => {
  connectionStatus = status;
  if (status !== 'qr_ready') {
    qrCodeString = null;
  }

  logger.info(`Connection status changed to: ${status}`);

  // Save to DB
  try {
    const updateData = { status, qrCode: qr, lastActive: new Date() };
    if (status === 'authenticated' && client && client.info && client.info.wid) {
      updateData.userJid = client.info.wid._serialized;
    }
    await Session.findOneAndUpdate(
      { sessionId: 'default' },
      updateData,
      { upsert: true }
    );
  } catch (error) {
    logger.error(`Failed to save session state to database: ${error.message}`);
  }

  // Broadcast to Web Dashboard
  if (socketIO) {
    socketIO.emit('status_change', { status, qr: qrCodeString || qr });
  }
};

/**
 * Sync all contacts and groups to the MongoDB collections.
 */
export const syncContactsAndGroups = async () => {
  if (!client) return;
  if (isSyncing) {
    logger.info('Contact sync already in progress. Skipping duplicate request.');
    return;
  }
  isSyncing = true;
  logger.info('Syncing contacts and groups with MongoDB...');
  emitSocketEvent('contacts_sync_started');

  try {
    // Clean out any existing LID contacts from MongoDB first
    await Contact.deleteMany({ jid: /@lid$/ });

    // 1. Contacts Sync (Union of contacts and chats list)
    logger.info('Fetching contacts list from browser...');
    const contactsList = await client.pupPage.evaluate(() => {
      try {
        const models = window.require('WAWebCollections').Contact.getModelsArray();
        const ContactMethods = window.require('WAWebContactGetters');
        const { getIsMyContact } = window.require('WAWebFrontendContactGetters');
        const LidMigrationUtils = window.require('WAWebLidMigrationUtils');
        const toPn = LidMigrationUtils && typeof LidMigrationUtils.toPn === 'function' ? LidMigrationUtils.toPn : null;

        return models.map(c => {
          try {
            let id = c.id;
            if (id && id._serialized.endsWith('@lid')) {
              if (toPn) {
                const converted = toPn(id);
                if (converted) id = converted;
              }
              if (id && id._serialized.endsWith('@lid')) {
                try {
                  const phoneWid = window.require('WAWebApiContact').getPhoneNumber(id);
                  if (phoneWid) id = phoneWid;
                } catch (e) {}
              }
            }
            return {
              id: id ? { _serialized: id._serialized, user: id.user } : null,
              name: ContactMethods.getName(c) || '',
              pushname: ContactMethods.getPushname(c) || '',
              number: id ? id.user : null,
              isBlocked: c.isContactBlocked || false,
              isMyContact: typeof getIsMyContact === 'function' ? getIsMyContact(c) : (c.isMyContact || false),
              isGroup: c.isGroup || false,
              displayNameLID: c.displayNameLID || null
            };
          } catch (itemErr) {
            return null;
          }
        }).filter(Boolean);
      } catch (err) {
        return [];
      }
    });

    logger.info(`Fetched ${contactsList.length} contacts. Fetching chats list...`);

    const chatsList = await client.pupPage.evaluate(() => {
      try {
        const ChatColl = window.require('WAWebCollections').Chat;
        const GroupMetadataColl = window.require('WAWebCollections').GroupMetadata || window.require('WAWebCollections').WAWebGroupMetadataCollection;
        const LidMigrationUtils = window.require('WAWebLidMigrationUtils');
        const toPn = LidMigrationUtils && typeof LidMigrationUtils.toPn === 'function' ? LidMigrationUtils.toPn : null;

        const resolveLidPn = (wid) => {
          if (!wid || typeof wid._serialized !== 'string') return wid;
          if (wid._serialized.endsWith('@lid')) {
            if (toPn) {
              const converted = toPn(wid);
              if (converted) return converted;
            }
            try {
              const phoneWid = window.require('WAWebApiContact').getPhoneNumber(wid);
              if (phoneWid) return phoneWid;
            } catch (e) {}
          }
          return wid;
        };

        const chatModels = ChatColl.getModelsArray();
        const groupMetaModels = GroupMetadataColl.getModelsArray();
        const existingGroupJids = new Set();

        const results = chatModels.map(c => {
          try {
            let id = resolveLidPn(c.id);

            const isGroup = id && typeof id._serialized === 'string' && id._serialized.endsWith('@g.us');
            if (isGroup && id) {
              existingGroupJids.add(id._serialized);
            }

            let participants = [];
            let owner = null;
            let description = '';
            let announce = false;
            
            if (isGroup) {
              const metadata = GroupMetadataColl.get(c.id);
              if (metadata) {
                const serializedMeta = typeof metadata.serialize === 'function' ? metadata.serialize() : {};
                participants = (serializedMeta.participants || [])
                  .map(p => {
                    const pId = resolveLidPn(p.id);
                    return {
                      id: pId ? { _serialized: pId._serialized } : null,
                      isAdmin: p.isAdmin || false,
                      isSuperAdmin: p.isSuperAdmin || false
                    };
                  })
                  .filter(p => p.id && typeof p.id._serialized === 'string');
                owner = serializedMeta.owner ? { _serialized: serializedMeta.owner._serialized || serializedMeta.owner } : null;
                description = serializedMeta.desc || '';
                announce = serializedMeta.announce || false;
              }
            }
            
            return {
              id: id ? { _serialized: id._serialized, user: id.user } : null,
              name: c.name || c.formattedTitle || '',
              isGroup,
              participants,
              owner,
              description,
              groupMetadata: { announce }
            };
          } catch (itemErr) {
            return null;
          }
        }).filter(Boolean);

        // Add groups from GroupMetadata collection that are not in Chat collection
        groupMetaModels.forEach(m => {
          try {
            if (!m.id) return;
            const jid = m.id._serialized;
            if (existingGroupJids.has(jid)) return; // Already processed
            
            let name = 'Group ' + jid.split('@')[0];
            const chat = ChatColl.get(m.id);
            if (chat) {
              name = chat.name || chat.formattedTitle || name;
            }

            const serializedMeta = typeof m.serialize === 'function' ? m.serialize() : {};
            const participants = (serializedMeta.participants || [])
              .map(p => {
                const pId = resolveLidPn(p.id);
                return {
                  id: pId ? { _serialized: pId._serialized } : null,
                  isAdmin: p.isAdmin || false,
                  isSuperAdmin: p.isSuperAdmin || false
                };
              })
              .filter(p => p.id && typeof p.id._serialized === 'string');

            const owner = serializedMeta.owner ? { _serialized: serializedMeta.owner._serialized || serializedMeta.owner } : null;
            const description = serializedMeta.desc || '';
            const announce = serializedMeta.announce || false;

            results.push({
              id: { _serialized: jid, user: m.id.user },
              name,
              isGroup: true,
              participants,
              owner,
              description,
              groupMetadata: { announce }
            });
            existingGroupJids.add(jid);
          } catch (err) {
            // Ignore missing group errors
          }
        });

        return results;
      } catch (err) {
        return [];
      }
    });

    logger.info(`Fetched ${chatsList.length} chats. Processing background group metadata updates...`);

    const groupsToUpdate = chatsList.filter(c => c.isGroup);
    logger.info(`Found ${groupsToUpdate.length} groups requiring metadata updates.`);

    for (let i = 0; i < groupsToUpdate.length; i++) {
      const group = groupsToUpdate[i];
      logger.info(`[Sync] Updating metadata for group ${i + 1}/${groupsToUpdate.length}: ${group.name} (${group.id?._serialized})`);
      try {
        await client.pupPage.evaluate(async (jidStr) => {
          const GroupMetadataColl = window.require('WAWebCollections').GroupMetadata || window.require('WAWebCollections').WAWebGroupMetadataCollection;
          const WidFactory = window.require('WAWebWidFactory');
          const chatWid = WidFactory.createWid(jidStr);
          await GroupMetadataColl.update(chatWid);
        }, group.id._serialized);
        
        // Fetch the updated participants for this group from the browser
        const updatedGroup = await client.pupPage.evaluate(async (jidStr) => {
          const WidFactory = window.require('WAWebWidFactory');
          const chatWid = WidFactory.createWid(jidStr);
          const GroupMetadataColl = window.require('WAWebCollections').GroupMetadata || window.require('WAWebCollections').WAWebGroupMetadataCollection;
          const metadata = GroupMetadataColl.get(chatWid);
          if (metadata) {
            const serializedMeta = typeof metadata.serialize === 'function' ? metadata.serialize() : {};
            const LidMigrationUtils = window.require('WAWebLidMigrationUtils');
            const toPn = LidMigrationUtils && typeof LidMigrationUtils.toPn === 'function' ? LidMigrationUtils.toPn : null;
            const WAWebApiContact = window.require('WAWebApiContact');

            const rawParticipants = serializedMeta.participants || [];
            const processedParticipants = await Promise.all(rawParticipants.map(async (p) => {
              let pId = p.id;
              if (pId && pId._serialized.endsWith('@lid')) {
                if (toPn) {
                  const converted = toPn(pId);
                  if (converted) pId = converted;
                }
                if (pId && pId._serialized.endsWith('@lid') && WAWebApiContact) {
                  try {
                    const phoneWid = WAWebApiContact.getPhoneNumber(pId);
                    if (phoneWid) pId = phoneWid;
                  } catch (e) {}
                }
                if (pId && pId._serialized.endsWith('@lid') && window.WWebJS && window.WWebJS.enforceLidAndPnRetrieval) {
                  try {
                    const res = await window.WWebJS.enforceLidAndPnRetrieval(pId._serialized);
                    if (res && res.phone) {
                      pId = res.phone;
                    }
                  } catch (e) {}
                }
              }
              return {
                id: pId ? { _serialized: pId._serialized } : null,
                isAdmin: p.isAdmin || false,
                isSuperAdmin: p.isSuperAdmin || false
              };
            }));

            const participants = processedParticipants.filter(p => p.id && typeof p.id._serialized === 'string');
            return {
              participants,
              owner: serializedMeta.owner ? { _serialized: serializedMeta.owner._serialized || serializedMeta.owner } : null,
              description: serializedMeta.desc || '',
              announce: serializedMeta.announce || false
            };
          }
          return null;
        }, group.id._serialized);
        
        if (updatedGroup) {
          group.participants = updatedGroup.participants;
          group.owner = updatedGroup.owner;
          group.description = updatedGroup.description;
          group.groupMetadata.announce = updatedGroup.announce;
        }
      } catch (updateErr) {
        logger.warn(`Failed to update metadata for group ${group.name}: ${updateErr.message}`);
      }
      // Add 200ms delay to prevent rate-limiting or CPU spikes
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    logger.info(`Fetched ${chatsList.length} chats. Processing sync...`);

    const allContactsMap = new Map();

    for (const c of contactsList) {
      if (!c.id || !c.id.user) continue;
      const user = c.id.user;
      if (user.length < 9 || user === '0') continue; // Skip fake/short numbers
      allContactsMap.set(c.id._serialized, {
        jid: c.id._serialized,
        name: c.name,
        pushname: c.pushname,
        number: c.number || c.id.user,
        isBlocked: c.isBlocked || false,
        isMyContact: c.isMyContact || false,
        isGroup: c.isGroup || false,
        displayNameLID: c.displayNameLID || null,
      });
    }

    for (const chat of chatsList) {
      if (!chat.id || !chat.id.user) continue;
      const user = chat.id.user;
      if (user.length < 9 || user === '0') continue; // Skip fake/short numbers
      const jid = chat.id._serialized;

      if (!allContactsMap.has(jid)) {
        allContactsMap.set(jid, {
          jid: jid,
          name: chat.name,
          pushname: undefined,
          number: chat.id.user,
          isBlocked: false,
          isMyContact: false,
          isGroup: chat.isGroup || false,
          displayNameLID: chat.displayNameLID || null,
        });
      } else {
        const existing = allContactsMap.get(jid);
        if (chat.isGroup) {
          existing.isGroup = true;
        }
      }
    }

    const contactOps = [];
    for (const [jid, data] of allContactsMap) {
      contactOps.push({
        updateOne: {
          filter: { jid: jid },
          update: { $set: data },
          upsert: true,
        }
      });
    }

    if (contactOps.length > 0) {
      await Contact.bulkWrite(contactOps);
    }
    logger.info(`Synced ${allContactsMap.size} unique contacts.`);

    // 2. Groups Sync
    const groupsList = chatsList.filter((chat) => chat.isGroup);
    
    const groupOps = [];
    for (const g of groupsList) {
      const members = g.participants.map((p) => ({
        jid: p.id._serialized,
        isAdmin: p.isAdmin,
        isSuperAdmin: p.isSuperAdmin,
      }));

      groupOps.push({
        updateOne: {
          filter: { jid: g.id._serialized },
          update: {
            $set: {
              name: g.name,
              owner: g.owner?._serialized || null,
              description: g.description || '',
              membersCount: members.length,
              members: members,
              isAnnouncementOnly: g.groupMetadata?.announce || false,
            }
          },
          upsert: true,
        }
      });
    }

    if (groupOps.length > 0) {
      await Group.bulkWrite(groupOps);
    }
    logger.info(`Synced ${groupsList.length} groups.`);
    emitSocketEvent('contacts_synced', {
      contactsCount: allContactsMap.size,
      groupsCount: groupsList.length
    });
  } catch (err) {
    logger.error(`Syncing error: ${err.message}`);
  } finally {
    isSyncing = false;
  }
};

/**
 * Helper to standardise WhatsApp JID/Number format.
 * @param {string} number 
 * @returns {string} 
 */
export const formatJid = (number) => {
  if (!number) return '';
  if (number.endsWith('@c.us') || number.endsWith('@g.us')) {
    return number;
  }
  // Remove non-digit characters
  const cleaned = number.replace(/\D/g, '');
  return cleaned.length > 15 ? `${cleaned}@g.us` : `${cleaned}@c.us`;
};

// --- CLIENT ACTIONS ---

export const getStatus = () => ({
  status: connectionStatus,
  qrCode: qrCodeString,
  ready: connectionStatus === 'authenticated',
});

export const isReady = () => connectionStatus === 'authenticated';

export const getClientInstance = () => client;

/**
 * Fetch all WhatsApp Channels (newsletters) the user follows.
 */
export const getChannels = async () => {
  if (!isReady()) throw new Error('WhatsApp client is not connected');
  const channels = await client.getChannels();
  return channels.map((ch) => ({
    id: ch.id?._serialized ?? ch.id,
    name: ch.name ?? 'Unnamed Channel',
    description: ch.description ?? '',
    unreadCount: ch.unreadCount ?? 0,
    isMuted: ch.isMuted ?? false,
    timestamp: ch.timestamp ?? null,
    isChannel: true,
  }));
};

export const getChannelSubscribers = async (channelId) => {
  if (!isReady()) throw new Error('WhatsApp client is not connected');

  const subscribers = await client.pupPage.evaluate(async (targetChannelId) => {
    const collections = window.require('WAWebCollections');
    const action = window.require('WAWebNewsletterSubscriberListAction');
    if (!collections || !collections.WAWebNewsletterCollection || !action) {
      throw new Error('Required WhatsApp modules are not available');
    }

    const models = collections.WAWebNewsletterCollection.getModelsArray();
    const channelModel = models.find((m) => (m.id?._serialized || m.id) === targetChannelId);
    if (!channelModel) throw new Error('Channel not found in collection');

    // Call native method
    const response = await action.getNewsletterSubscribersAction(channelModel, 500);
    if (!response || !response.subscribers) return [];

    // Map using the internal contact model helper
    return response.subscribers.map((sub) => {
      const contactObj = sub.contact;
      const contactModel = window.WWebJS.getContactModel(contactObj);
      return {
        name: contactModel.name || contactModel.pushname || '',
        jid: contactModel.id?._serialized || contactModel.id,
        role: sub.role || 'subscriber',
        isMyContact: contactModel.isMyContact || false,
      };
    });
  }, channelId);

  return subscribers.map((sub) => {
    const number = sub.jid.split('@')[0];
    return {
      name: sub.name,
      number: number ? `+${number}` : '',
      jid: sub.jid,
      role: sub.role,
      isMyContact: sub.isMyContact,
    };
  });
};

/**
 * Destroy the browser client cleanly WITHOUT deleting session files.
 * Used for graceful shutdown / nodemon restarts.
 */
export const destroyClient = async () => {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  let browserPid = null;
  try {
    if (client && client.pupBrowser) {
      const proc = client.pupBrowser.process();
      if (proc && proc.pid) {
        browserPid = proc.pid;
      }
    }
  } catch (e) {
    logger.warn(`Could not retrieve browser PID during destroy: ${e.message}`);
  }

  const clientToDestroy = client;
  client = null; // Re-assign first to avoid triggering the close listener

  try {
    if (clientToDestroy) {
      logger.info('Destroying WhatsApp client (session files preserved)...');
      await clientToDestroy.destroy();
    }
  } catch (err) {
    logger.error(`Error during client destroy: ${err.message}`);
  }

  if (browserPid) {
    try {
      process.kill(browserPid, 0);
      logger.info(`Browser process ${browserPid} is still running during destroy. Force killing...`);
      process.kill(browserPid, 'SIGKILL');
    } catch (err) {
      logger.info(`Browser process ${browserPid} has exited cleanly.`);
    }
  }
};

/**
 * Log out current session AND delete all credentials (full wipe).
 * Only called from the dashboard Logout button.
 */
export const logout = async () => {
  logger.info('Logging out and destroying WhatsApp session...');
  
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  // 1. Get browser PID if possible to ensure we can force kill it if needed
  let browserPid = null;
  try {
    if (client && client.pupBrowser) {
      const proc = client.pupBrowser.process();
      if (proc && proc.pid) {
        browserPid = proc.pid;
      }
    }
  } catch (e) {
    logger.warn(`Could not retrieve browser PID: ${e.message}`);
  }

  const clientToDestroy = client;
  client = null; // Re-assign first to avoid triggering the close listener

  // 2. Try logout if client is ready (with a 4s timeout to prevent hanging), then destroy
  try {
    if (clientToDestroy) {
      if (connectionStatus === 'authenticated') {
        logger.info('Attempting client.logout() with timeout...');
        await Promise.race([
          clientToDestroy.logout(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('client.logout timed out')), 4000))
        ]).catch(err => logger.warn(`WhatsApp logout request skipped/timed out: ${err.message}`));
      }
      logger.info('Destroying client instance...');
      await clientToDestroy.destroy();
    }
  } catch (err) {
    logger.error(`Error during client logout/destroy: ${err.message}`);
  }

  // 3. Force kill browser process if it's still running
  if (browserPid) {
    try {
      process.kill(browserPid, 0);
      logger.info(`Browser process ${browserPid} is still running after destroy. Force killing...`);
      process.kill(browserPid, 'SIGKILL');
      // Give the OS a tiny moment to release file handles
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (err) {
      logger.info(`Browser process ${browserPid} has exited.`);
    }
  }

  // 4. Wipe the sessions and cache folder to force a fresh QR on next boot with retry logic
  const sessionDir = path.resolve('./sessions');
  const cacheDir = path.resolve('./.wwebjs_cache');
  
  const deleteFolderWithRetry = async (dirPath, maxAttempts = 5) => {
    if (!fs.existsSync(dirPath)) return;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        logger.info(`Deleting directory (attempt ${attempt}/${maxAttempts}): ${dirPath}`);
        fs.rmSync(dirPath, { recursive: true, force: true });
        logger.info(`Successfully deleted directory: ${dirPath}`);
        return;
      } catch (err) {
        if (attempt === maxAttempts) {
          logger.error(`Failed to delete directory ${dirPath} after ${maxAttempts} attempts: ${err.message}`);
        } else {
          logger.warn(`Attempt ${attempt} to delete ${dirPath} failed. Retrying in 1000ms...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
  };

  await deleteFolderWithRetry(sessionDir);
  await deleteFolderWithRetry(cacheDir);

  // 5. Clear session status and JID in database, and clear contacts/groups
  try {
    await Session.findOneAndUpdate(
      { sessionId: 'default' },
      { status: 'disconnected', qrCode: null, userJid: null, lastActive: new Date() },
      { upsert: true }
    );
    await Contact.deleteMany({});
    await Group.deleteMany({});
    logger.info('Wiped contacts and groups on logout.');
  } catch (error) {
    logger.error(`Failed to clear session/data on logout: ${error.message}`);
  }

  // 6. Start a fresh client session
  initClient().catch(err => {
    logger.error(`Error re-initializing client: ${err.message}`);
  });
};

/**
 * Send standard text message.
 */
export const sendMessage = async (to, body) => {
  if (!isReady()) throw new Error('WhatsApp client is not connected');
  const target = formatJid(to);
  logger.info(`Sending text message to ${target}`);
  const msg = await client.sendMessage(target, body);
  return msg;
};

/**
 * Send media file from file path (images, pdfs, audio, video).
 */
export const sendMediaMessage = async (to, filePath, type, fileName = null, caption = null) => {
  if (!isReady()) throw new Error('WhatsApp client is not connected');
  if (!fs.existsSync(filePath)) throw new Error(`Media file does not exist at: ${filePath}`);

  const target = formatJid(to);
  logger.info(`Sending ${type} media to ${target} from ${filePath}`);
  
  const media = MessageMedia.fromFilePath(filePath);
  if (fileName) {
    media.filename = fileName;
  }

  const options = {};
  if (caption) {
    options.caption = caption;
  }
  if (type === 'audio') {
    options.sendAudioAsVoice = true;
  } else if (type === 'sticker') {
    options.sendMediaAsSticker = true;
  }

  const msg = await client.sendMessage(target, media, options);
  return msg;
};

/**
 * Send location message.
 */
export const sendLocationMessage = async (to, latitude, longitude, description = '') => {
  if (!isReady()) throw new Error('WhatsApp client is not connected');
  const target = formatJid(to);
  logger.info(`Sending location to ${target} (Lat: ${latitude}, Lng: ${longitude})`);
  
  const loc = new Location(latitude, longitude, description);
  const msg = await client.sendMessage(target, loc);
  return msg;
};

/**
 * Send contact card (vcard).
 */
export const sendContactMessage = async (to, displayName, vcardText) => {
  if (!isReady()) throw new Error('WhatsApp client is not connected');
  const target = formatJid(to);
  logger.info(`Sending contact card (${displayName}) to ${target}`);
  
  const msg = await client.sendMessage(target, vcardText, { parseVCards: true });
  return msg;
};

/**
 * Helper to emit socket events if Socket.io is initialized.
 * @param {string} event 
 * @param {any} data 
 */
export const emitSocketEvent = (event, data) => {
  if (socketIO) {
    socketIO.emit(event, data);
  }
};

export default {
  initClient,
  setSocketIO,
  getStatus,
  isReady,
  getClientInstance,
  logout,
  sendMessage,
  sendMediaMessage,
  sendLocationMessage,
  sendContactMessage,
  syncContactsAndGroups,
  formatJid,
  emitSocketEvent,
};
