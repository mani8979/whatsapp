import Broadcast from '../models/broadcast.model.js';
import Contact from '../models/contact.model.js';
import broadcastService from '../services/broadcast.service.js';
import whatsappService from '../services/whatsapp.service.js';
import logger from '../config/logger.js';

/**
 * Get all broadcast campaigns history.
 * @route GET /api/broadcasts
 */
export const getCampaigns = async (req, res, next) => {
  try {
    const campaigns = await Broadcast.find({}).sort({ createdAt: -1 });
    res.json({
      success: true,
      data: campaigns,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get details of a specific campaign.
 * @route GET /api/broadcasts/:id
 */
export const getCampaign = async (req, res, next) => {
  try {
    const campaign = await Broadcast.findById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }
    res.json({
      success: true,
      data: campaign,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create and start a new broadcast campaign.
 * @route POST /api/broadcasts
 */
export const createCampaign = async (req, res, next) => {
  try {
    const { name, body, recipients, csvConsentConfirmed, batchSize, delayBetweenMessages, delayBetweenBatches } = req.body;

    let parsedRecipients = recipients;
    if (typeof recipients === 'string') {
      try {
        parsedRecipients = JSON.parse(recipients);
      } catch (e) {
        return res.status(400).json({ success: false, error: 'Invalid recipients JSON array format' });
      }
    }

    let mediaPath = null;
    let mediaType = null;
    let fileName = null;

    if (req.file) {
      mediaPath = req.file.path;
      fileName = req.file.originalname;
      const mime = req.file.mimetype;
      if (mime.startsWith('image/')) {
        mediaType = 'image';
      } else if (mime.startsWith('video/')) {
        mediaType = 'video';
      } else if (mime.startsWith('audio/')) {
        mediaType = 'audio';
      } else {
        mediaType = 'document';
      }
    }

    if (!name || (!body && !mediaPath) || !parsedRecipients || !Array.isArray(parsedRecipients) || parsedRecipients.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: campaign name, message text (or media attachment), and recipients are required.'
      });
    }

    // Normalize and filter duplicate recipients by phone number
    const uniqueRecipientsMap = new Map();
    for (const r of parsedRecipients) {
      const rawNumber = typeof r === 'string' ? r : r.number;
      const rName = typeof r === 'object' ? r.name : '';
      if (!rawNumber) continue;

      const Jid = whatsappService.formatJid(rawNumber);
      if (!uniqueRecipientsMap.has(Jid)) {
        uniqueRecipientsMap.set(Jid, {
          number: Jid,
          name: rName || ''
        });
      }
    }

    const uniqueRecipients = Array.from(uniqueRecipientsMap.values());
    const targetJids = uniqueRecipients.map(r => r.number);

    // Consent check filtering
    let allowedRecipients = [];
    const isConsentConfirmed = csvConsentConfirmed === true || csvConsentConfirmed === 'true';

    if (isConsentConfirmed) {
      // The user explicitly verified consent for this list. 
      // We will automatically import/upsert these as opted-in contacts in the DB.
      allowedRecipients = uniqueRecipients;

      // Upsert them in background using bulkWrite
      const bulkOps = [];
      for (const rec of uniqueRecipients) {
        const formattedNum = rec.number.replace(/\D/g, '').replace('c.us', '').replace('@', '');
        bulkOps.push({
          updateOne: {
            filter: { jid: rec.number },
            update: {
              $set: {
                number: formattedNum,
                name: rec.name || formattedNum,
                isOptedIn: true
              }
            },
            upsert: true
          }
        });
      }
      if (bulkOps.length > 0) {
        Contact.bulkWrite(bulkOps).catch(err => logger.error(`Error saving CSV contacts in bulk: ${err.message}`));
      }
    } else {
      // Must query the database to find which contacts have already opted in
      const optedInContacts = await Contact.find({
        jid: { $in: targetJids },
        isOptedIn: true
      });

      const optedInJids = new Set(optedInContacts.map(c => c.jid));
      
      // Filter the list of unique recipients to only include opted-in ones
      allowedRecipients = uniqueRecipients.filter(r => optedInJids.has(r.number));
    }

    if (allowedRecipients.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No recipients have opted in. Message consent is required by policy.'
      });
    }

    // Create the Broadcast document
    const campaign = new Broadcast({
      name,
      body: body || '',
      mediaPath,
      mediaType,
      fileName,
      status: 'pending',
      recipients: allowedRecipients.map(r => ({
        number: r.number,
        name: r.name,
        status: 'queued',
        attempts: 0
      })),
      totalRecipients: allowedRecipients.length,
      batchSize: parseInt(batchSize, 10) || 5,
      delayBetweenMessages: parseInt(delayBetweenMessages, 10) || 2000,
      delayBetweenBatches: parseInt(delayBetweenBatches, 10) || 5000,
    });

    await campaign.save();

    // Start background processing
    broadcastService.startCampaign(campaign._id).catch(err => {
      logger.error(`Error starting campaign auto loop: ${err.message}`);
    });

    res.status(201).json({
      success: true,
      message: 'Campaign created and queued for delivery',
      data: campaign
    });

  } catch (error) {
    next(error);
  }
};

/**
 * Handle actions (pause, resume, cancel) on a campaign.
 * @route POST /api/broadcasts/:id/action
 */
export const campaignAction = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { action } = req.body;

    if (!['pause', 'resume', 'cancel'].includes(action)) {
      return res.status(400).json({ success: false, error: 'Invalid action. Must be pause, resume, or cancel.' });
    }

    let campaign;
    if (action === 'pause') {
      campaign = await broadcastService.pauseCampaign(id);
    } else if (action === 'resume') {
      campaign = await broadcastService.startCampaign(id);
    } else if (action === 'cancel') {
      campaign = await broadcastService.cancelCampaign(id);
    }

    res.json({
      success: true,
      message: `Campaign action ${action} executed successfully`,
      data: campaign
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Toggle opt-in consent for a contact.
 * @route POST /api/contacts/consent
 */
export const toggleContactConsent = async (req, res, next) => {
  try {
    const { jid, isOptedIn } = req.body;
    if (!jid) {
      return res.status(400).json({ success: false, error: 'Contact JID is required' });
    }

    const targetJid = whatsappService.formatJid(jid);
    const cleanNumber = targetJid.split('@')[0];

    const contact = await Contact.findOneAndUpdate(
      { jid: targetJid },
      {
        $set: { isOptedIn: !!isOptedIn },
        $setOnInsert: { number: cleanNumber, isGroup: false }
      },
      { upsert: true, new: true }
    );

    // Notify UI of contact consent updates
    whatsappService.emitSocketEvent('contact_consent_updated', contact);

    res.json({
      success: true,
      message: `Consent updated for ${contact.jid}`,
      data: contact
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Bulk opt-in/opt-out contacts.
 * @route POST /api/contacts/bulk-consent
 */
export const bulkUpdateConsent = async (req, res, next) => {
  try {
    const { jids, isOptedIn } = req.body;
    if (!jids || !Array.isArray(jids)) {
      return res.status(400).json({ success: false, error: 'Array of JIDs is required' });
    }

    const targetJids = jids.map(whatsappService.formatJid);

    await Contact.updateMany(
      { jid: { $in: targetJids } },
      { $set: { isOptedIn: !!isOptedIn } }
    );

    res.json({
      success: true,
      message: `Bulk consent update completed for ${targetJids.length} contacts`
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Manually add a new contact with consent.
 * @route POST /api/contacts/create
 */
export const addContact = async (req, res, next) => {
  try {
    const { number, name, isOptedIn } = req.body;
    if (!number) {
      return res.status(400).json({ success: false, error: 'Phone number is required' });
    }

    const targetJid = whatsappService.formatJid(number);
    const cleanNumber = targetJid.split('@')[0];

    const contact = await Contact.findOneAndUpdate(
      { jid: targetJid },
      {
        number: cleanNumber,
        name: name || cleanNumber,
        isOptedIn: !!isOptedIn
      },
      { upsert: true, new: true }
    );

    res.status(201).json({
      success: true,
      message: 'Contact added successfully',
      data: contact
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Sync WhatsApp contacts manually.
 * @route POST /api/contacts/sync
 */
export const syncContacts = async (req, res, next) => {
  try {
    if (!whatsappService.isReady()) {
      return res.status(503).json({ success: false, error: 'WhatsApp client is not ready' });
    }
    
    // Run sync in background
    whatsappService.syncContactsAndGroups().catch(err => {
      logger.error(`Manual contact sync failed: ${err.message}`);
    });

    res.json({
      success: true,
      message: 'Contact synchronization triggered in the background'
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getCampaigns,
  getCampaign,
  createCampaign,
  campaignAction,
  toggleContactConsent,
  bulkUpdateConsent,
  addContact,
  syncContacts
};
