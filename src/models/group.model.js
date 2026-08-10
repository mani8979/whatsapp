import mongoose from 'mongoose';

const memberSchema = new mongoose.Schema({
  jid: { type: String, required: true },
  isAdmin: { type: Boolean, default: false },
  isSuperAdmin: { type: Boolean, default: false },
}, { _id: false });

const groupSchema = new mongoose.Schema(
  {
    jid: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    owner: { type: String },
    description: { type: String },
    membersCount: { type: Number, default: 0 },
    members: [memberSchema],
    isAnnouncementOnly: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Group = mongoose.model('Group', groupSchema);
export default Group;
