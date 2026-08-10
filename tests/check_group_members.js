import mongoose from 'mongoose';
import connectDB from '../src/config/db.js';
import Group from '../src/models/group.model.js';

const run = async () => {
  await connectDB();
  const groups = await Group.find({});
  console.log(`Total groups in DB: ${groups.length}`);
  
  let totalMembersInDB = 0;
  const uniqueMembers = new Set();
  
  groups.forEach(g => {
    const mCount = g.members ? g.members.length : 0;
    totalMembersInDB += mCount;
    if (g.members) {
      g.members.forEach(m => uniqueMembers.add(m.jid));
    }
    console.log(`Group: ${g.name || 'Unnamed'} | JID: ${g.jid} | Members in DB: ${mCount}`);
  });
  
  console.log(`--------------------------------------------------`);
  console.log(`Total group members (sum): ${totalMembersInDB}`);
  console.log(`Unique group members: ${uniqueMembers.size}`);
  
  mongoose.connection.close();
};

run().catch(console.error);
