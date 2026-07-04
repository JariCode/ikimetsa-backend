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
      // 1. Alue: Metsän reuna
      { 
        name: 'Varjohahmo', 
        hp: '25', 
        defense: '10', 
        attackBonus: '2', 
        damageMax: '8', 
        xpReward: '75',
        cssClass: 'varjohahmo',
        level: '1' // 👈 Hirviön taso lisätty!
      },
      // 2. Alue: Suo
      { 
        name: 'Suolieju', 
        hp: '35', 
        defense: '8', 
        attackBonus: '1', 
        damageMax: '10', 
        xpReward: '100',
        cssClass: 'suolieju',
        level: '2' // 👈 Hirviön taso lisätty!
      },
      // 3. Alue: Koski
      { 
        name: 'Koskenkuristaja', 
        hp: '45', 
        defense: '12', 
        attackBonus: '3', 
        damageMax: '12', 
        xpReward: '150',
        cssClass: 'koskenkuristaja',
        level: '3' // 👈 Hirviön taso lisätty!
      },
      // 4. Alue: Järvi
      { 
        name: 'Suomuinen Järvikäärme', 
        hp: '50', 
        defense: '14', 
        attackBonus: '3', 
        damageMax: '13', 
        xpReward: '250',
        cssClass: 'jarvikaarme',
        level: '4'
      },
      // 5. Alue: Luolasto (Vastus 1)
      { 
        name: 'Luolapeikko', 
        hp: '65', 
        defense: '11', 
        attackBonus: '4', 
        damageMax: '15', 
        xpReward: '350',
        cssClass: 'luolapeikko',
        level: '5'
      },
      // 5. Alue: Luolasto (Vastus 2)
      { 
        name: 'Jättiläishämähäkki', 
        hp: '65', 
        defense: '15', 
        attackBonus: '5', 
        damageMax: '15', 
        xpReward: '500',
        cssClass: 'hamahakki',
        level: '6'
      },
      // 6. Alue: Syvä metsä
      { 
        name: 'Metsäjättiläinen', 
        hp: '90', 
        defense: '10', 
        attackBonus: '5', 
        damageMax: '22', 
        xpReward: '750',
        cssClass: 'metsajattilainen',
        level: '7'
      },
      // 7. Alue: Hautausmaa
      { 
        name: 'Rypevä Zombie', 
        hp: '80', 
        defense: '8', 
        attackBonus: '4', 
        damageMax: '16', 
        xpReward: '900',
        cssClass: 'zombie',
        level: '8'
      },
      // 8. Alue: Synkkä sydänmetsä
      { 
        name: 'Ihmissusi', 
        hp: '110', 
        defense: '13', 
        attackBonus: '7', 
        damageMax: '20', 
        xpReward: '1050',
        cssClass: 'ihmissusi',
        level: '9'
      },
      // 9. Alue: Ränsistynyt mökki (PÄÄVASTUS)
      { 
        name: 'Kirottujen Velho', 
        hp: '150', 
        defense: '16', 
        attackBonus: '9', 
        damageMax: '26', 
        xpReward: '1200',
        cssClass: 'velho',
        level: '10'
      }
    ]);

    console.log('✅ Kaikki 10 hirviömuotoa asennettu onnistuneesti tietokantaan!');
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