import mongoose from 'mongoose';
import Contact from '../src/models/contact.model.js';
import Group from '../src/models/group.model.js';
import connectDB from '../src/config/db.js';

async function main() {
  await connectDB();
  console.log('MongoDB connected successfully.\n');

  const totalContacts = await Contact.countDocuments({});
  const savedContacts = await Contact.countDocuments({ isMyContact: true });
  const unsavedContacts = await Contact.countDocuments({ isMyContact: { $ne: true } });
  const groupContacts = await Contact.countDocuments({ isGroup: true });
  const userContacts = await Contact.countDocuments({ isGroup: false });

  console.log(`Total Contacts in MongoDB: ${totalContacts}`);
  console.log(`Saved Contacts:           ${savedContacts}`);
  console.log(`Unsaved Contacts:         ${unsavedContacts}`);
  console.log(`Group Chats in Contacts:  ${groupContacts}`);
  console.log(`User Chats in Contacts:   ${userContacts}`);

  const totalGroups = await Group.countDocuments({});
  console.log(`\nTotal Groups in MongoDB:  ${totalGroups}`);

  const groups = await Group.find({});
  let totalMembersCount = 0;
  const uniqueMemberJids = new Set();
  
  for (const g of groups) {
    if (g.members) {
      totalMembersCount += g.members.length;
      for (const m of g.members) {
        uniqueMemberJids.add(m.jid);
      }
    }
  }
  console.log(`Total Group Members:      ${totalMembersCount}`);
  console.log(`Unique Group Member JIDs: ${uniqueMemberJids.size}`);

  // Inspect first 5 contacts where isMyContact is false
  console.log('\nSample Unsaved Contacts (First 5):');
  const samples = await Contact.find({ isMyContact: { $ne: true }, isGroup: false }).limit(5);
  samples.forEach(s => {
    console.log(`  JID: ${s.jid}, Name: "${s.name}", Pushname: "${s.pushname}", number: "${s.number}"`);
  });

  await mongoose.disconnect();
}

main().catch(console.error);
