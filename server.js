import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.js';
import gameRoutes from './routes/game.js';
import combatRoutes from './routes/combat.js';

import CharacterClass from './models/CharacterClass.js';

// 🛡️ Kaikki ympäristömuuttujat vaaditaan eksplisiittisesti .env-tiedostosta -
// ei kovakoodattuja oletusarvoja jotka voisivat piilottaa puuttuvan asetuksen.
const PORT = process.env.PORT;
if (!PORT) {
  throw new Error('❌ PORT puuttuu .env-tiedostosta.');
}

const FRONTEND_URL = process.env.FRONTEND_URL;
if (!FRONTEND_URL) {
  throw new Error('❌ FRONTEND_URL puuttuu .env-tiedostosta.');
}

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  throw new Error('❌ MONGODB_URI puuttuu .env-tiedostosta.');
}

const app = express();

app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Tietokantayhteys
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