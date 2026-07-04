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
  combatLogs: { type: [String], default: [] },
  currentMonsterName: { type: String, default: 'Varjohahmo' }, 
  currentMonsterLevel: { type: Number, default: 1 },         
  currentMonsterHp: { type: Number, default: 25 },
  currentMonsterCssClass: { type: String, default: 'varjohahmo' }, // 🎨 Määrää minkä hirviön jumpscare-taide näytetään (viittaa Monster.cssClass-kenttään)
  combatInitiative: { type: String, default: null },
  currentTurn: { type: String, default: null },
  repairPoints: { type: Number, default: 0 },
  hasEnteredCombat: { type: Boolean, default: false }, // 🌟 Kertoo palvelimella onko pelaaja jo astunut taisteluun tässä kohtaamisessa
  currentAreaIndex: { type: Number, default: 1 }, // 🗺️ Mikä 10 alueesta on käynnissä (viittaa Area.order-kenttään). Kuolema EI muuta tätä.
  
  // 🔥 LISÄTTY: Kertoo onko Velho lyöty ja peli pelattu onnistuneesti läpi!
  isGameCompleted: { type: Boolean, default: false },

  // 🔥 TALLENNUSPISTE (nuotio): viimeisin hetki jolloin pelaaja lepäsi hirviön kaatamisen jälkeen.
  checkpoint: {
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    maxHp: { type: Number, default: 40 }
  }
}, { timestamps: true });

export default mongoose.model('GameSession', gameSessionSchema);