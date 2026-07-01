import mongoose from 'mongoose';

const characterClassSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true }, // esim. "Metsästäjä"
  description: { type: String, required: true },
  baseHp: { type: String, required: true }, // esim. "40"
  startingWeapon: {
    name: { type: String, required: true },
    maxDurability: { type: String, required: true }
  },
  initiativeBonus: { type: String, default: "0" }
});

export default mongoose.model('CharacterClass', characterClassSchema);