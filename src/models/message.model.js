import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    messageId: { type: String, required: true, unique: true },
    from: { type: String, required: true, index: true },
    to: { type: String, required: true, index: true },
    body: { type: String },
    hasMedia: { type: Boolean, default: false },
    mediaPath: { type: String },
    mimeType: { type: String },
    fileName: { type: String },
    fileSize: { type: Number },
    type: { type: String, required: true }, // chat, image, video, document, audio, location, vcard
    direction: { type: String, enum: ['incoming', 'outgoing'], required: true, index: true },
    isGroup: { type: Boolean, default: false, index: true },
    groupJid: { type: String, index: true },
    isEdited: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    originalBody: { type: String },
    location: {
      latitude: { type: Number },
      longitude: { type: Number },
      description: { type: String },
    },
    vcard: {
      displayName: { type: String },
      card: { type: String },
    },
    timestamp: { type: Date, required: true, index: true },
    detectedLanguage: { type: String },
    detectedMood: { type: String },
    detectedTopic: { type: String },
    embedding: { type: [Number], select: false },
  },
  { timestamps: true }
);

messageSchema.index({ from: 1, timestamp: -1 });
messageSchema.index({ to: 1, timestamp: -1 });

const Message = mongoose.model('Message', messageSchema);
export default Message;
