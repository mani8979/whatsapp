import mongoose from 'mongoose';

const styleSchema = new mongoose.Schema(
  {
    jid: { type: String, required: true, unique: true, index: true }, // 'assistant' for self style clone, or contact JID
    greeting: [{ type: String }],
    neverSay: [{ type: String }],
    emojiFrequency: { type: String, default: 'low' },
    averageLength: { type: String, default: '2 sentences' },
    language: { type: String, default: 'English' },
    commonWords: [{ type: String }],
    typingStyle: {
      capitalization: { type: String, default: 'casual' },
      punctuation: { type: String, default: 'minimal' },
    },
  },
  { timestamps: true }
);

const Style = mongoose.model('Style', styleSchema);
export default Style;
