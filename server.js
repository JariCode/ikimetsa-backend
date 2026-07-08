import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.js';
import gameRoutes from './routes/game.js';
import combatRoutes from './routes/combat.js';

import sanitizeRequest from './middleware/sanitize.js';
import { generalLimiter, authLimiter } from './middleware/rateLimiters.js';

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

// 🔧 Render (ja muut pilvihostit) ovat käänteisproxyn takana. Tämä kertoo
// Expressille että se saa luottaa X-Forwarded-For -otsakkeeseen, jotta
// rate limiter näkee oikean käyttäjän IP:n eikä proxyn osoitetta.
app.set('trust proxy', 1);

// 🪖 Helmet asettaa turvalliset HTTP-otsakkeet (piilottaa X-Powered-By:n,
// suojaa clickjackingilta, pakottaa turvakäytäntöjä). Heti ensimmäisenä.
app.use(helmet());

// 🌐 CORS - vain oma frontend sallitaan, ja evästeet kulkevat mukana.
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}));

// 📦 JSON-body sallitaan, mutta kokoraja estää valtavat payloadit (DoS-suoja).
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// 🧼 Puhdistaa NoSQL-injektiot ($-operaattorit) kaikista pyynnöistä.
app.use(sanitizeRequest);

// 🚦 Yleinen pyyntörajoitin kaikille API-reiteille (DoS-suoja).
app.use('/api/', generalLimiter);

// 🚦 Tiukempi rajoitin kirjautumiseen ja rekisteröintiin (brute force -suoja).
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

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

// 🌱 Kaikki pelidata (hahmoluokat, hirviöt, alueet) asennetaan tietokantaan
// omilla asennustiedostoillaan komentoriviltä:
//   node initCharacters.js
//   node initMonsters.js
//   node initAreas.js
// Palvelin itse ei seedaa mitään, vaan lukee valmiin datan tietokannasta.

app.listen(PORT, () => {
  console.log(`Palvelin käynnissä portissa ${PORT}`);
});