import mongoose from 'mongoose';

const gameSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  characterType: { type: String, enum: ['Metsästäjä', 'Mekaanikko'], required: true },
  currentLocation: { type: String, default: 'metsan_reuna' },
  stats: {
    hp: { type: Number, required: true },
    maxHp: { type: Number, required: true },
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 }
  },
  inventory: [
    {
      name: { type: String, required: true },
      type: { type: String, default: 'weapon' },
      durability: { type: Number, required: true },
      maxDurability: { type: Number, required: true }
    }
  ],
  repairPoints: { type: Number, default: 0 }
}, { timestamps: true });

export default mongoose.model('GameSession', gameSessionSchema);