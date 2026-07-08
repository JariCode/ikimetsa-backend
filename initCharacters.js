import mongoose from 'mongoose';
import dotenv from 'dotenv';
import CharacterClass from './models/CharacterClass.js';

// Ladataan ympäristömuuttujat .env-tiedostosta, jotta saadaan tietokantaosoite
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

export const seedCharacters = async () => {
  try {
    if (!MONGODB_URI) {
      console.error('❌ Virhe: MONGODB_URI puuttuu .env-tiedostosta!');
      process.exit(1);
    }

    console.log('⏳ Yhdistetään tietokantaan hahmoluokkien asennusta varten...');
    await mongoose.connect(MONGODB_URI);
    console.log('🔗 Tietokantayhteys muodostettu!');

    console.log('🧹 Tyhjennetään vanha hahmoluokkakanta...');
    await CharacterClass.deleteMany({});

    console.log('🧑 Asennetaan Ikimetsän hahmoluokat...');
    await CharacterClass.create([
      {
        name: 'Metsästäjä',
        description: 'Tuntee metsän polut ja varjot.',
        baseHp: '40',
        startingWeapon: { name: 'Vanha puukko', maxDurability: '8' },
        initiativeBonus: '4'
      },
      {
        name: 'Mekaanikko',
        description: 'Kaupunkiolento raskailla työkaluilla.',
        baseHp: '55',
        startingWeapon: { name: 'Raskas jakoavain', maxDurability: '12' },
        initiativeBonus: '0'
      }
    ]);

    console.log('✅ Kaikki hahmoluokat asennettu onnistuneesti tietokantaan!');
  } catch (err) {
    console.error('❌ Hahmoluokkien asennus epäonnistui:', err);
  } finally {
    // Suljetaan tietokantayhteys siististi, jotta skripti sulkeutuu komentorivillä
    await mongoose.connection.close();
    console.log('👋 Yhteys suljettu. Asennus valmis!');
    process.exit(0);
  }
};

// 🚀 TÄMÄ KÄYNNISTÄÄ ASENNUKSEN kun tiedosto ajetaan komentoriviltä!
seedCharacters();