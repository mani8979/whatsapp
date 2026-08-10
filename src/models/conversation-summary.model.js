import mongoose from 'mongoose';

const conversationSummarySchema = new mongoose.Schema(
  {
    jid: { type: String, required: true, index: true },
    summary: { type: String, required: true },
    rangeStart: { type: Date, required: true },
    rangeEnd: { type: Date, required: true },
    messageCount: { type: Number, required: true },
  },
  { timestamps: true }
);

const ConversationSummary = mongoose.model('ConversationSummary', conversationSummarySchema);
export default ConversationSummary;
