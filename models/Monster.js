import mongoose from 'mongoose';

const monsterSchema = new mongoose.Schema({
  name: { type: String, required: true }, // esim. "Varjohahmo"
  hp: { type: String, required: true },
  defense: { type: String, required: true },
  attackBonus: { type: String, default: "0" },
  damageMax: { type: String, required: true },
  xpReward: { type: String, required: true },
  cssClass: { type: String, default: "varjohahmo" },
  level: { type: String, default: "1" }
});

export default mongoose.model('Monster', monsterSchema);