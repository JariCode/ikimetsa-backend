import mongoose from 'mongoose';

const monsterSchema = new mongoose.Schema({
  name: { type: String, required: true }, // esim. "Varjohahmo"
  hp: { type: String, required: true },
  defense: { type: String, required: true },
  attackBonus: { type: String, default: "0" },
  damageMax: { type: String, required: true },
  xpReward: { type: String, required: true }
});

export default mongoose.model('Monster', monsterSchema);