import mongoose from 'mongoose';
import Contact from '../src/models/contact.model.js';
import Group from '../src/models/group.model.js';

async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/ailocal');
  console.log('MongoDB Connected');

  const dbGroups = await Group.find({});
  console.log('Total groups in MongoDB:', dbGroups.length);

  let totalMembersCount = 0;
  const uniqueGroupMemberJids = new Set();
  for (const g of dbGroups) {
    if (g.members) {
      totalMembersCount += g.members.length;
      for (const m of g.members) {
        if (m.jid) {
          uniqueGroupMemberJids.add(m.jid);
        }
      }
    }
  }
  console.log('Total members across all groups (including duplicates):', totalMembersCount);
  console.log('Unique group member JIDs:', uniqueGroupMemberJids.size);

  const dbContacts = await Contact.find({});
  const savedJids = new Set(dbContacts.filter(c => c.isMyContact).map(c => c.jid));
  console.log('Saved contact JIDs:', savedJids.size);

  const unsavedGroupMemberJids = new Set();
  for (const jid of uniqueGroupMemberJids) {
    if (!savedJids.has(jid) && jid.endsWith('@c.us')) {
      unsavedGroupMemberJids.add(jid);
    }
  }
  console.log('Unsaved unique group member JIDs:', unsavedGroupMemberJids.size);

  await mongoose.disconnect();
}

run().catch(console.error);
