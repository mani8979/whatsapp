import mongoose from 'mongoose';
import connectDB from '../src/config/db.js';
import Group from '../src/models/group.model.js';

const run = async () => {
  await connectDB();
  const groups = await Group.find({});
  console.log(`Total groups in DB: ${groups.length}`);
  
  // Sort groups by member count descending
  groups.sort((a, b) => (b.members?.length || 0) - (a.members?.length || 0));
  
  groups.forEach((g, idx) => {
    console.log(`${idx + 1}. Group: ${g.name} | Members: ${g.members?.length || 0} | JID: ${g.jid}`);
  });
  
  mongoose.connection.close();
};

run().catch(console.error);
