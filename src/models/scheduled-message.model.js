import mongoose from 'mongoose';

const scheduledMessageSchema = new mongoose.Schema(
  {
    to: { type: [String], required: true }, // Array of JIDs/Numbers to support single and broadcasts
    body: { type: String },
    type: { type: String, enum: ['text', 'image', 'document', 'location', 'contact'], default: 'text' },
    mediaPath: { type: String },
    fileName: { type: String },
    location: {
      latitude: { type: Number },
      longitude: { type: Number },
      description: { type: String },
    },
    contactCard: {
      displayName: { type: String },
      card: { type: String },
    },
    scheduledTime: { type: Date, required: true, index: true },
    status: { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending', index: true },
    sentAt: { type: Date },
    attempts: { type: Number, default: 0 },
    error: { type: String },
  },
  { timestamps: true }
);

const ScheduledMessage = mongoose.model('ScheduledMessage', scheduledMessageSchema);
export default ScheduledMessage;
