import mongoose from 'mongoose';

const memorySchema = new mongoose.Schema(
  {
    jid: { type: String, required: true, index: true },
    factType: { type: String, required: true, index: true }, // name, birthday, family, college, job, food, plans, etc.
    factValue: { type: String, required: true },
    extractedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Compound index to quickly query all facts for a contact
memorySchema.index({ jid: 1, factType: 1 });

const Memory = mongoose.model('Memory', memorySchema);
export default Memory;
