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

  // ⚔️ Parempi ase löytyy kerran (alue 8) - korvaa pysyvästi alkuperäisen aseen
  weaponFound: { type: Boolean, default: false },
  weaponDamageBonus: { type: Number, default: 0 },
  // 🎒 Aarrepussi löytyy kerran (alue 4, Järvi) - antaa korjauspisteitä ja pysyvän max HP -bonuksen
  treasureFound: { type: Boolean, default: false },

  // 🧑‍🤝‍🧑 Matkakumppani - löytyy kerran (companionFound estää löytöruudun toistumisen),
  // ja kun aktiivinen, osallistuu jokaiseen taisteluun pelaajan hyökkäysvuoron yhteydessä.
  companionFound: { type: Boolean, default: false },
  companionActive: { type: Boolean, default: false }, // false = kaatunut väliaikaisesti, palautuu nuotiolla/respawnissa
  companionName: { type: String, default: null },
  companionHp: { type: Number, default: 30 },
  companionMaxHp: { type: Number, default: 30 },
  companionDefense: { type: Number, default: 9 }, // 🛡️ Skaalautuu pelaajan tason mukana - katso getCompanionStatsForLevel
  companionWeaponName: { type: String, default: null },
  companionWeaponDurability: { type: Number, default: 8 },
  companionWeaponMaxDurability: { type: Number, default: 8 },
  
  // 🔥 LISÄTTY: Kertoo onko Velho lyöty ja peli pelattu onnistuneesti läpi!
  isGameCompleted: { type: Boolean, default: false },

  // 🔥 TALLENNUSPISTE (nuotio): viimeisin hetki jolloin pelaaja lepäsi hirviön kaatamisen jälkeen.
  checkpoint: {
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    maxHp: { type: Number, default: 40 },
    repairPoints: { type: Number, default: 5 } // 🔧 Lisätty tämä rivi!
  }
}, { timestamps: true });

export default mongoose.model('GameSession', gameSessionSchema);