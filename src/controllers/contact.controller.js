import whatsappService from '../services/whatsapp.service.js';
import Contact from '../models/contact.model.js';
import Group from '../models/group.model.js';
import logger from '../config/logger.js';
import path from 'path';
import fs from 'fs-extra';
import { getConfig } from '../config/config.js';
import { collectSavedContacts, collectUnknownContacts } from '../services/contactCollector.js';
import { validateContact } from '../services/contactValidator.js';
import { normalizeContact, normalizeUnknownContact } from '../services/contactNormalizer.js';
import { removeDuplicates } from '../services/duplicateRemover.js';
import { exportData } from '../services/exportService.js';

/**
 * Get all synced contacts from database.
 * @route GET /api/contacts
 */
export const getContacts = async (req, res, next) => {
  try {
    const contacts = await Contact.find({});
    res.json({
      success: true,
      data: contacts,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get specific contact info by JID.
 * @route GET /api/contacts/:jid
 */
export const getContactInfo = async (req, res, next) => {
  try {
    const { jid } = req.params;
    const targetJid = whatsappService.formatJid(jid);

    let contact = await Contact.findOne({ jid: targetJid });

    // Fallback to direct client query if not in DB
    if (!contact && whatsappService.isReady()) {
      const client = whatsappService.getClientInstance();
      const rawContact = await client.getContactById(targetJid);
      
      let profilePicUrl = null;
      try {
        profilePicUrl = await client.getProfilePicUrl(targetJid);
      } catch (e) {
        // Ignore profile picture fetch failure
      }

      contact = await Contact.findOneAndUpdate(
        { jid: targetJid },
        {
          name: rawContact.name,
          pushname: rawContact.pushname,
          number: rawContact.number || rawContact.id.user,
          isBlocked: rawContact.isBlocked || false,
          isMyContact: rawContact.isMyContact || false,
          profilePicUrl: profilePicUrl,
          isGroup: rawContact.isGroup || false,
        },
        { upsert: true, new: true }
      );
    }

    if (!contact) {
      return res.status(404).json({ success: false, error: 'Contact not found' });
    }

    res.json({
      success: true,
      data: contact,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Fetch profile picture of a contact.
 * @route GET /api/contacts/:jid/profile-picture
 */
export const getProfilePicture = async (req, res, next) => {
  try {
    const { jid } = req.params;
    const targetJid = whatsappService.formatJid(jid);

    if (!whatsappService.isReady()) {
      return res.status(503).json({ success: false, error: 'WhatsApp client is not ready' });
    }

    const client = whatsappService.getClientInstance();
    const profilePicUrl = await client.getProfilePicUrl(targetJid);

    // Save/update in DB
    await Contact.findOneAndUpdate({ jid: targetJid }, { profilePicUrl });

    res.json({
      success: true,
      data: {
        jid: targetJid,
        profilePicUrl: profilePicUrl || null,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Block a contact.
 * @route POST /api/contacts/block
 */
export const blockContact = async (req, res, next) => {
  try {
    const { jid } = req.body;
    if (!jid) return res.status(400).json({ success: false, error: 'Contact JID is required' });

    const targetJid = whatsappService.formatJid(jid);
    if (!whatsappService.isReady()) {
      return res.status(503).json({ success: false, error: 'WhatsApp client is not ready' });
    }

    const client = whatsappService.getClientInstance();
    const contact = await client.getContactById(targetJid);
    await contact.block();

    // Sync state in DB
    await Contact.findOneAndUpdate({ jid: targetJid }, { isBlocked: true });

    res.json({
      success: true,
      message: `Contact ${jid} blocked successfully`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Unblock a contact.
 * @route POST /api/contacts/unblock
 */
export const unblockContact = async (req, res, next) => {
  try {
    const { jid } = req.body;
    if (!jid) return res.status(400).json({ success: false, error: 'Contact JID is required' });

    const targetJid = whatsappService.formatJid(jid);
    if (!whatsappService.isReady()) {
      return res.status(503).json({ success: false, error: 'WhatsApp client is not ready' });
    }

    const client = whatsappService.getClientInstance();
    const contact = await client.getContactById(targetJid);
    await contact.unblock();

    // Sync state in DB
    await Contact.findOneAndUpdate({ jid: targetJid }, { isBlocked: false });

    res.json({
      success: true,
      message: `Contact ${jid} unblocked successfully`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update contact relationship.
 * @route POST /api/contacts/relationship
 */
export const updateRelationship = async (req, res, next) => {
  try {
    const { jid, relationship } = req.body;
    if (!jid) return res.status(400).json({ success: false, error: 'Contact JID is required' });
    if (!relationship) return res.status(400).json({ success: false, error: 'Relationship status is required' });

    const targetJid = whatsappService.formatJid(jid);

    const contact = await Contact.findOneAndUpdate(
      { jid: targetJid },
      { $set: { relationship } },
      { new: true }
    );

    if (!contact) {
      return res.status(404).json({ success: false, error: 'Contact not found' });
    }

    whatsappService.emitSocketEvent('contact_relationship_updated', contact);

    res.json({
      success: true,
      message: `Relationship for ${jid} updated to ${relationship} successfully`,
      data: contact,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Export saved contacts to styled Excel/CSV/JSON.
 * @route GET /api/contacts/export
 */
export const exportContacts = async (req, res, next) => {
  try {
    if (!whatsappService.isReady()) {
      return res.status(503).json({ success: false, error: 'WhatsApp client is not ready' });
    }

    const format = req.query.format || 'xlsx';
    if (!['xlsx', 'csv', 'json'].includes(format)) {
      return res.status(400).json({ success: false, error: 'Invalid export format' });
    }

    const exportType = req.query.type || 'all';
    const client = whatsappService.getClientInstance();
    const config = getConfig();

    logger.info(`Starting web-triggered contact export in format: ${format}, type: ${exportType}`);

    // Run the pipeline by loading data from MongoDB collections (completely bypassing slow/timeout-prone Puppeteer client calls)
    let filteredRaw = [];
    if (exportType === 'unknown') {
      logger.info('Fetching unsaved contacts and groups from MongoDB for export...');
      const dbContacts = await Contact.find({ isGroup: false });
      const dbGroups = await Group.find({});

      const contactsMap = new Map();
      const savedJids = new Set();
      for (const c of dbContacts) {
        contactsMap.set(c.jid, c);
        if (c.isMyContact) {
          savedJids.add(c.jid);
        }
      }

      const unknownJids = new Set();

      // A. Add unsaved contacts from DB contacts collection
      for (const c of dbContacts) {
        if (!c.isMyContact && c.jid && (c.jid.endsWith('@c.us') || c.jid.endsWith('@lid'))) {
          const user = c.jid.split('@')[0];
          if (user.length >= 9 && user !== '0') {
            unknownJids.add(c.jid);
          }
        }
      }

      // B. Add unsaved contacts from all group members in MongoDB
      for (const g of dbGroups) {
        if (g.members && Array.isArray(g.members)) {
          for (const m of g.members) {
            if (m.jid && (m.jid.endsWith('@c.us') || m.jid.endsWith('@lid')) && !savedJids.has(m.jid)) {
              const user = m.jid.split('@')[0];
              if (user.length >= 9 && user !== '0') {
                unknownJids.add(m.jid);
              }
            }
          }
        }
      }

      logger.info(`Found ${unknownJids.size} unique unknown contacts in MongoDB. Mapping raw list...`);
      for (const jid of unknownJids) {
        const dbContact = contactsMap.get(jid);
        if (dbContact) {
          filteredRaw.push({
            id: { server: jid.endsWith('@lid') ? 'lid' : 'c.us', user: dbContact.number, _serialized: dbContact.jid },
            number: dbContact.number,
            name: dbContact.name,
            pushname: dbContact.pushname,
            verifiedName: dbContact.verifiedName,
            isBusiness: dbContact.isBusiness || false,
            isMyContact: false,
            isGroup: false,
            isUser: true,
            isWAContact: true,
            labels: [],
            displayNameLID: dbContact.displayNameLID
          });
        } else {
          // Construct lightweight mock contact
          const user = jid.split('@')[0];
          filteredRaw.push({
            id: { server: jid.endsWith('@lid') ? 'lid' : 'c.us', user: user, _serialized: jid },
            number: user,
            name: undefined,
            pushname: undefined,
            verifiedName: undefined,
            isBusiness: false,
            isMyContact: false,
            isGroup: false,
            isUser: true,
            isWAContact: true,
            labels: []
          });
        }
      }
    } else {
      logger.info('Fetching saved contacts from MongoDB for export...');
      const dbContacts = await Contact.find({ isMyContact: true, isGroup: false });
      logger.info(`Found ${dbContacts.length} saved contacts in MongoDB.`);
      for (const dbContact of dbContacts) {
        filteredRaw.push({
          id: { server: 'c.us', user: dbContact.number, _serialized: dbContact.jid },
          number: dbContact.number,
          name: dbContact.name,
          pushname: dbContact.pushname,
          verifiedName: dbContact.verifiedName,
          isBusiness: dbContact.isBusiness || false,
          isMyContact: true,
          isGroup: false,
          isUser: true,
          isWAContact: true,
          labels: []
        });
      }
    }
    const totalRawCount = filteredRaw.length;

    const processed = [];
    let invalidCount = 0;
    for (const raw of filteredRaw) {
      if (!validateContact(raw)) {
        invalidCount++;
        continue;
      }
      const normalized = exportType === 'unknown'
        ? normalizeUnknownContact(raw, config)
        : normalizeContact(raw, config);
      if (normalized) {
        processed.push(normalized);
      } else {
        invalidCount++;
      }
    }

    const exportContactsList = removeDuplicates(processed);
    const duplicatesRemovedCount = processed.length - exportContactsList.length;

    const businessCount = exportContactsList.filter(c => c.isBusiness).length;
    const personalCount = exportContactsList.length - businessCount;
    const countries = new Set(exportContactsList.map(c => c.country).filter(Boolean));

    const stats = {
      durationMs: 0,
      totalScanned: totalRawCount,
      savedCount: exportContactsList.length,
      businessCount,
      personalCount,
      duplicatesRemoved: duplicatesRemovedCount,
      invalidCount,
      countriesCount: countries.size,
      incremental: false,
      exportType
    };

    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '_');
    const baseFilename = exportType === 'unknown' ? 'Unknown_WaVault_Export' : 'Contacts_WaVault_Export';
    const filename = `${baseFilename}_${dateStr}.${format}`;
    
    // Write to a temporary file inside exports directory
    await fs.ensureDir(config.exportsDir);
    const tempFilePath = path.join(config.exportsDir, `temp_${exportType}_${Date.now()}_export.${format}`);

    await exportData(exportContactsList, tempFilePath, format, stats, config);

    // Send the file to the client browser
    res.download(tempFilePath, filename, async (err) => {
      // Clean up the temp file after download finishes/cancels
      try {
        await fs.remove(tempFilePath);
      } catch (removeErr) {
        logger.error(`Failed to delete temporary export file: ${removeErr.message}`);
      }
      if (err && !res.headersSent) {
        next(err);
      }
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getContacts,
  getContactInfo,
  getProfilePicture,
  blockContact,
  unblockContact,
  updateRelationship,
  exportContacts,
};
