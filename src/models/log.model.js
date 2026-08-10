import mongoose from 'mongoose';

const logSchema = new mongoose.Schema(
  {
    level: { type: String, required: true, index: true },
    message: { type: String, required: true },
    meta: { type: mongoose.Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

const Log = mongoose.model('Log', logSchema);
export default Log;
