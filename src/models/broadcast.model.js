import mongoose from 'mongoose';

const recipientSchema = new mongoose.Schema({
  number: { type: String, required: true },
  name: { type: String },
  status: { type: String, enum: ['queued', 'sent', 'failed'], default: 'queued', index: true },
  attempts: { type: Number, default: 0 },
  error: { type: String },
  sentAt: { type: Date }
});

const broadcastSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    body: { type: String },
    mediaPath: { type: String },
    mediaType: { type: String },
    fileName: { type: String },
    status: {
      type: String,
      enum: ['pending', 'processing', 'paused', 'completed', 'cancelled'],
      default: 'pending',
      index: true
    },
    recipients: [recipientSchema],
    totalRecipients: { type: Number, default: 0 },
    sentCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    batchSize: { type: Number, default: 5 },
    delayBetweenMessages: { type: Number, default: 2000 }, // in ms
    delayBetweenBatches: { type: Number, default: 5000 } // in ms
  },
  { timestamps: true }
);

const Broadcast = mongoose.model('Broadcast', broadcastSchema);
export default Broadcast;
