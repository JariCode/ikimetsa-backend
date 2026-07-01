import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import authRoutes from './routes/auth.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT;

app.use(cors());
app.use(express.json());

// Tietokantayhteys
const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Yhteys MongoDB Atlas -tietokantaan muodostettu onnistuneesti!'))
  .catch((err) => console.error('Tietokantayhteys epäonnistui:', err));

// Reitit
app.use('/api/auth', authRoutes);

// Testireitti
app.get('/', (req, res) => {
  res.send('Ikimetsän backend vastaa ja tietokantaa yhdistetään...');
});

app.listen(PORT, () => {
  console.log(`Palvelin käynnissä portissa ${PORT}`);
});