import express from 'express';
import GameSession from '../models/GameSession.js';
import Log from '../models/Log.js';
import Monster from '../models/Monster.js'; // Tuodaan tietokantamalli hirviöille

const router = express.Router();

// Apufunktion nopanheitolle (min ja max väliltä)
const rollDice = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// TAISTELUVUORO
router.post('/turn', async (req, res) => {
  try {
    // Otetaan userId:n lisäksi vastaan hirviön senhetkinen HP frontendiltä
    const { userId, action, currentMonsterHp } = req.body; 

    const session = await GameSession.findOne({ userId });
    if (!session) {
      return res.status(404).json({ message: 'Pelitilaa ei löytynyt' });
    }

    // HAETAAN HIRVIÖN PERUSTIEDOT TIETOKANNASTA
    let dbMonster = await Monster.findOne({ name: 'Varjohahmo' });
    
    // Varmistus: jos tietokanta on vielä tyhjä, käytetään varalukuja
    if (!dbMonster) {
      dbMonster = { name: 'Varjohahmo', hp: '20', defense: '10', attackBonus: '2', damageMax: '8', xpReward: '20' };
    }

    // Luodaan vastustaja tietokantadatasta. 
    // Jos taistelu on jo käynnissä, otetaan hirviön HP frontendin muistista (currentMonsterHp).
    const monster = {
      name: dbMonster.name,
      hp: currentMonsterHp !== undefined ? currentMonsterHp : parseInt(dbMonster.hp),
      defense: parseInt(dbMonster.defense),
      attackBonus: parseInt(dbMonster.attackBonus),
      damageMax: parseInt(dbMonster.damageMax),
      xpReward: parseInt(dbMonster.xpReward)
    };

    let combatLog = [];
    let playerDamageDealt = 0;
    let monsterDamageDealt = 0;

    if (action === 'hyokkaa') {
      // 1. Aloite (Katsotaan kumpi lyö ensin)
      const playerInitiative = rollDice(1, 20) + (session.characterType === 'Metsästäjä' ? 4 : 0);
      const monsterInitiative = rollDice(1, 20);

      const playerGoesFirst = playerInitiative >= monsterInitiative;
      combatLog.push(playerGoesFirst ? 'Olet nopeampi ja aloitat hyökkäyksen!' : `${monster.name} syöksyy pimeydestä ensin!`);

      // Pelaajan varustettu ase
      let weapon = session.inventory[0];

      // 2. Pelaajan vuoro
      if (weapon && weapon.durability <= 0) {
        combatLog.push(`Aseesi (${weapon.name}) on rikki! Et voi hyökätä tehokkaasti.`);
      } else {
        const attackRoll = rollDice(1, 20);
        if (attackRoll >= monster.defense) {
          // Osuma! Lasketaan vahinko
          playerDamageDealt = rollDice(2, 8);
          monster.hp -= playerDamageDealt;
          combatLog.push(`Heitit ${attackRoll}: Osut! Teet ${playerDamageDealt} pistettä vahinkoa.`);

          // Kulutetaan aseen kestävyyttä
          if (weapon) {
            weapon.durability -= 1;
            if (weapon.durability === 0) {
              combatLog.push(`RAKS! Aseesi ${weapon.name} hajosi liitoksistaan!`);
            }
          }
        } else {
          combatLog.push(`Heitit ${attackRoll}: Svingasit ohi kohteesta.`);
        }
      }

      // 3. Hirviön vuoro (jos se on vielä hengissä)
      if (monster.hp > 0) {
        const monsterAttackRoll = rollDice(1, 20) + monster.attackBonus;
        const playerDefense = session.characterType === 'Metsästäjä' ? 12 : 10;

        if (monsterAttackRoll >= playerDefense) {
          monsterDamageDealt = rollDice(1, monster.damageMax);
          session.stats.hp -= monsterDamageDealt;
          if (session.stats.hp < 0) session.stats.hp = 0;
          combatLog.push(`Hirviö heitti ${monsterAttackRoll} ja osui sinuun! Menetät ${monsterDamageDealt} HP.`);
        } else {
          combatLog.push(`Hirviö heitti ${monsterAttackRoll} ja raapaisi ohi vaatteidesi.`);
        }
      } else {
        monster.hp = 0; // Estetään elämän meneminen miinukselle logeissa
        combatLog.push(`${monster.name} haihtuu mustaksi savuksi. Voitit taistelun!`);
        session.stats.xp += monster.xpReward; // Palkinto haetaan suoraan tietokannasta
        session.repairPoints += 2; // Saadaan korjauspisteitä
      }
    }

    // Tallennetaan muuttunut pelitila tietokantaan
    session.markModified('inventory');
    session.markModified('stats');
    await session.save();

    res.json({
      combatLog,
      playerHp: session.stats.hp,
      weaponDurability: session.inventory[0]?.durability || 0,
      monsterHp: monster.hp
    });

  } catch (error) {
    res.status(500).json({ message: 'Taistelu epäonnistui', error: error.message });
  }
});

export default router;