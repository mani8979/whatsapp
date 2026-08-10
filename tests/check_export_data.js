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
    if (!c.isMyContact && c.jid && c.jid.endsWith('@c.us')) {
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
        if (m.jid && m.jid.endsWith('@c.us') && !savedJids.has(m.jid)) {
          const user = m.jid.split('@')[0];
          if (user.length >= 9 && user !== '0') {
            unknownJids.add(m.jid);
          }
        }
      }
    }
  }

  console.log(`Unique unknown contacts to export: ${unknownJids.size}`);
  
  // Check if there are any duplicate JIDs in the Set
  // Sets by definition cannot have duplicates, but let's check number of unique phone numbers
  const uniquePhones = new Set();
  unknownJids.forEach(jid => {
    const phone = jid.split('@')[0];
    uniquePhones.add(phone);
  });
  
  console.log(`Unique phone numbers in export: ${uniquePhones.size}`);
  console.log(`Difference (duplicates by phone): ${unknownJids.size - uniquePhones.size}`);
  
  // Check if there are any fake numbers (like short digits)
  const fakeNumbers = Array.from(uniquePhones).filter(phone => phone.length < 9 || phone === '0');
  console.log(`Fake numbers in export:`, fakeNumbers);
  
  mongoose.connection.close();
};

run().catch(console.error);
