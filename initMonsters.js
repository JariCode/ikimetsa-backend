import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Monster from './models/Monster.js';

// Ladataan ympäristömuuttujat .env-tiedostosta, jotta saadaan tietokantaosoite
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

export const seedMonsters = async () => {
  try {
    if (!MONGODB_URI) {
      console.error('❌ Virhe: MONGODB_URI puuttuu .env-tiedostosta!');
      process.exit(1);
    }

    console.log('⏳ Yhdistetään tietokantaan hirviöiden asennusta varten...');
    await mongoose.connect(MONGODB_URI);
    console.log('🔗 Tietokantayhteys muodostettu!');

    console.log('🧹 Tyhjennetään vanha hirviökanta...');
    await Monster.deleteMany({}); 

    console.log('👾 Asennetaan uudet Ikimetsän hirviöt tasoineen...');
    await Monster.create([
      { 
        name: 'Varjohahmo', 
        hp: '25', 
        defense: '10', 
        attackBonus: '2', 
        damageMax: '8', 
        xpReward: '20',
        cssClass: 'varjohahmo',
        level: '1' // 👈 Hirviön taso lisätty!
      },
      { 
        name: 'Suolieju', 
        hp: '35', 
        defense: '8', 
        attackBonus: '1', 
        damageMax: '10', 
        xpReward: '30',
        cssClass: 'suolieju',
        level: '2' // 👈 Hirviön taso lisätty!
      },
      { 
        name: 'Koskenkuristaja', 
        hp: '45', 
        defense: '12', 
        attackBonus: '3', 
        damageMax: '12', 
        xpReward: '50',
        cssClass: 'koskenkuristaja',
        level: '3' // 👈 Hirviön taso lisätty!
      }
    ]);

    console.log('✅ Kaikki 3 hirviötä asennettu onnistuneesti tietokantaan!');
  } catch (err) {
    console.error('❌ Hirviöiden asennus epäonnistui:', err);
  } finally {
    // Suljetaan tietokantayhteys siististi, jotta skripti sulkeutuu komentorivillä
    await mongoose.connection.close();
    console.log('👋 Yhteys suljettu. Asennus valmis!');
    process.exit(0);
  }
};

// 🚀 TÄMÄ KÄYNNISTÄÄ ASENNUKSEN kun tiedosto ajetaan komentoriviltä!
seedMonsters();