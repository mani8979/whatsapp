import pkg from 'whatsapp-web.js';
import path from 'path';
import fs from 'fs-extra';
const { Client, LocalAuth } = pkg;

async function run() {
  console.log('Initializing client...');
  
  const client = new Client({
    authStrategy: new LocalAuth({
      dataPath: './sessions', // Use the active session!
    }),
    webVersion: '2.3000.1043030358-alpha',
    webVersionCache: {
      type: 'local',
      path: './.wwebjs_cache/',
      strict: true,
    },
    puppeteer: {
      headless: true,
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    },
  });

  client.on('ready', async () => {
    console.log('Client is ready! Querying groups...');
    try {
      const chats = await client.pupPage.evaluate(() => {
        try {
          const models = window.require('WAWebCollections').Chat.getModelsArray();
          const groups = models.filter(c => !!c.groupMetadata);
          
          if (groups.length === 0) return { error: 'No groups found in memory.' };
          
          const sample = groups[0];
          const meta = sample.groupMetadata;
          
          return {
            totalGroups: groups.length,
            sampleGroupName: sample.name || sample.formattedTitle,
            hasMetadata: !!meta,
            metadataKeys: meta ? Object.keys(meta) : [],
            participantsType: meta && meta.participants ? typeof meta.participants : 'undefined',
            participantsIsArray: meta && meta.participants ? Array.isArray(meta.participants) : false,
            participantsLength: meta && meta.participants ? meta.participants.length : 0,
            participantsSample: meta && meta.participants && meta.participants.slice ? meta.participants.slice(0, 2) : null,
            rawMetadata: JSON.stringify(meta)
          };
        } catch (e) {
          return { error: e.message, stack: e.stack };
        }
      });
      console.log('Result from browser:', chats);
    } catch (err) {
      console.error('Error during query:', err);
    } finally {
      await client.destroy();
      process.exit(0);
    }
  });

  // Since we use the existing session, it should authenticate immediately.
  // Set a timeout of 30s to prevent hanging
  setTimeout(() => {
    console.log('Timeout reached. Destroying client...');
    client.destroy().then(() => process.exit(1));
  }, 30000);

  await client.initialize();
}

run().catch(console.error);
