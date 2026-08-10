import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true, default: 'default' },
    status: {
      type: String,
      enum: ['disconnected', 'qr_ready', 'connecting', 'authenticated', 'auth_failure'],
      default: 'disconnected',
    },
    qrCode: { type: String }, // Base64 or raw string to render QR code on frontend
    userJid: { type: String }, // JID of the currently logged in user
    lastActive: { type: Date, default: Date.now },
    authFailuresCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const Session = mongoose.model('Session', sessionSchema);
export default Session;
