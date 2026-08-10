import mongoose from 'mongoose';
import connectDB from '../src/config/db.js';
import Contact from '../src/models/contact.model.js';

const run = async () => {
  await connectDB();
  const contacts = await Contact.find({});
  console.log(`Total contacts in DB: ${contacts.length}`);
  
  const shortNumbers = contacts.filter(c => {
    const num = c.number || '';
    return num.length < 8;
  });
  
  console.log(`Contacts with phone number < 8 digits: ${shortNumbers.length}`);
  shortNumbers.forEach(c => {
    console.log(`JID: ${c.jid} | Name: ${c.name} | Number: ${c.number}`);
  });
  
  mongoose.connection.close();
};

run().catch(console.error);
