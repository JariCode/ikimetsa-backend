import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.js';
import gameRoutes from './routes/game.js';
import combatRoutes from './routes/combat.js';

import CharacterClass from './models/CharacterClass.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Tietokantayhteys
const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Yhteys MongoDB Atlas -tietokantaan muodostettu onnistuneesti!'))
  .catch((err) => console.error('Tietokantayhteys epäonnistui:', err));

// Reitit
app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/combat', combatRoutes);

app.get('/', (req, res) => {
  res.send('Ikimetsän backend vastaa ja tietokantaa yhdistetään...');
});

// Alustetaan hahmoluokat (Teidän alkuperäinen siisti logiikka)
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
  } catch (err) {
    console.error('Tietokannan hahmoluokkien alustus epäonnistui:', err);
  }
};

// 🚀 AJETAAN VAIN HAHMOLUOKKIEN SIEMENTÄMINEN KUN YHTEYS AUKEAA
// Hirviöt asennetaan erikseen omalla asennustiedostolla komentoriviltä!
mongoose.connection.once('open', () => {
  seedDatabase(); // Hahmot
});

app.listen(PORT, () => {
  console.log(`Palvelin käynnissä portissa ${PORT}`);
});