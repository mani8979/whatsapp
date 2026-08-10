import mongoose from 'mongoose';

const contactSchema = new mongoose.Schema(
  {
    jid: { type: String, required: true, unique: true, index: true },
    name: { type: String },
    pushname: { type: String },
    number: { type: String, required: true, index: true },
    isBlocked: { type: Boolean, default: false },
    isMyContact: { type: Boolean, default: false },
    profilePicUrl: { type: String },
    verifiedName: { type: String },
    isGroup: { type: Boolean, default: false },
    isOptedIn: { type: Boolean, default: false, index: true },
    relationship: { type: String, default: 'Friend' },
    conversationSummary: { type: String, default: '' },
    displayNameLID: { type: String },
  },
  { timestamps: true }
);

const Contact = mongoose.model('Contact', contactSchema);
export default Contact;
