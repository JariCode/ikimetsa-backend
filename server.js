import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import authRoutes from './routes/auth.js';
import gameRoutes from './routes/game.js';
import combatRoutes from './routes/combat.js'; // ⚔️ LISÄTTY: Tuodaan taistelureitit sisään!

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000; // Lisätty varmistus portille 5000, jos .env reistailee

app.use(cors());
app.use(express.json());

// Tietokantayhteys
const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Yhteys MongoDB Atlas -tietokantaan muodostettu onnistuneesti!'))
  .catch((err) => console.error('Tietokantayhteys epäonnistui:', err));

// Reitit
app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/combat', combatRoutes); // ⚔️ LISÄTTY: Kytketään taistelureitit polun taakse!

// Testireitti
app.get('/', (req, res) => {
  res.send('Ikimetsän backend vastaa ja tietokantaa yhdistetään...');
});

import CharacterClass from './models/CharacterClass.js';
import Monster from './models/Monster.js';

const seedDatabase = async () => {
  try {
    const classCount = await CharacterClass.countDocuments();
    if (classCount === 0) {
      await CharacterClass.create([
        { name: 'Metsästäjä', description: 'Tuntee metsän polut ja varjot.', baseHp: '40', startingWeapon: { name: 'Vanha puukko', maxDurability: '10' }, initiativeBonus: '4' },
        { name: 'Mekaanikko', description: 'Kaupunkiolento raskailla työkaluilla.', baseHp: '55', startingWeapon: { name: 'Raskas jakoavain', maxDurability: '15' }, initiativeBonus: '0' }
      ]);
      console.log('Hahmoluokat alustettu tietokantaan!');
    }

    const monsterCount = await Monster.countDocuments();
    if (monsterCount === 0) {
      await Monster.create([
        { name: 'Varjohahmo', hp: '25', defense: '10', attackBonus: '2', damageMax: '8', xpReward: '20' }
      ]);
      console.log('Hirviöt alustettu tietokantaan!');
    }
  } catch (err) {
    console.error('Tietokannan alustus epäonnistui:', err);
  }
};

// Ajetaan alustustarkistus aina kun yhteys aukeaa
mongoose.connection.once('open', () => {
  seedDatabase();
});

app.listen(PORT, () => {
  console.log(`Palvelin käynnissä portissa ${PORT}`);
});