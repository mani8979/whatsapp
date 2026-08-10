import mongoose from 'mongoose';
import connectDB from '../src/config/db.js';
import Contact from '../src/models/contact.model.js';
import Group from '../src/models/group.model.js';

const run = async () => {
  await connectDB();
  
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

  console.log(`--- DIRECT EXPORT SIMULATION ---`);
  console.log(`Total DB contacts: ${dbContacts.length}`);
  console.log(`Total DB groups: ${dbGroups.length}`);
  console.log(`Unique unknown contacts resolved for export: ${unknownJids.size}`);
  
  // Count how many are @lid
  const lidCount = Array.from(unknownJids).filter(j => j.endsWith('@lid')).length;
  console.log(`- c.us JIDs: ${unknownJids.size - lidCount}`);
  console.log(`- lid JIDs: ${lidCount}`);
  
  mongoose.connection.close();
};

run().catch(console.error);
