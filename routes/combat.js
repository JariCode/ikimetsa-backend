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
    // Otetaan userId:n lisäksi vastaan hirviön senhetkinen HP frontendiltä sekä vuorotiedot
    const { userId, action, currentMonsterHp, hasInitiative, currentTurn } = req.body; 

    const session = await GameSession.findOne({ userId });
    if (!session) {
      return res.status(404).json({ message: 'Pelitilaa ei löytynyt' });
    }

    // HAETAAN HIRVIÖN PERUSTIEDOT TIETOKANNASTA
    let dbMonster = await Monster.findOne({ name: 'Varjohahmo' });
    
    // Varmistus: jos tietokanta on vielä tyhjä, käytetään varalukuja
    if (!dbMonster) {
      dbMonster = { name: 'Varjohahmo', hp: '25', defense: '10', attackBonus: '2', damageMax: '8', xpReward: '20' };
    }

    // Luetaan numerot puhtaiksi
    const maxMonsterHp = parseInt(dbMonster.hp) || 25;
    const monsterDefense = parseInt(dbMonster.defense) || 10;
    const monsterAttackBonus = parseInt(dbMonster.attackBonus) || 2;
    const monsterDamageMax = parseInt(dbMonster.damageMax) || 8;
    const monsterXpReward = parseInt(dbMonster.xpReward) || 20;

    // Luodaan vastustaja tietokantadatasta. 
    // Jos taistelu on jo käynnissä, otetaan hirviön HP frontendin muistista (currentMonsterHp).
    const monster = {
      name: dbMonster.name,
      hp: currentMonsterHp !== undefined ? parseInt(currentMonsterHp) : maxMonsterHp,
      defense: monsterDefense,
      attackBonus: monsterAttackBonus,
      damageMax: monsterDamageMax,
      xpReward: monsterXpReward
    };

    let combatLog = [];
    let playerDamageDealt = 0;
    let monsterDamageDealt = 0;
    let nextTurn = currentTurn;
    let initiativeWinner = hasInitiative;

    if (action === 'hyokkaa') {
      // 1. ALOITEHEITTO (Ainoastaan aivan taistelun alussa, kun initiativeWinner puuttuu)
      if (!initiativeWinner) {
        const playerInitiative = rollDice(1, 20) + (session.characterType === 'Metsästäjä' ? 4 : 0);
        const monsterInitiative = rollDice(1, 20);

        if (playerInitiative >= monsterInitiative) {
          initiativeWinner = 'pelaaja';
          nextTurn = 'pelaaja';
          combatLog.push(`🎲 Aloiteheitto: Olet nopeampi (Sinä: ${playerInitiative} vs Hirviö: ${monsterInitiative}) ja aloitat taistelun!`);
        } else {
          initiativeWinner = 'hirviö';
          nextTurn = 'hirviö';
          combatLog.push(`🎲 Aloiteheitto: ${monster.name} on nopeampi (Hirviö: ${monsterInitiative} vs Sinä: ${playerInitiative}) ja syöksyy pimeydestä ensin!`);
        }
      } else {
        // Pelaajan varustettu ase ja puolustus
        let weapon = session.inventory[0];
        const playerDefense = session.characterType === 'Metsästäjä' ? 12 : 10;
        let currentPlayerHp = parseInt(session.stats.hp) || 40;

        // 2. SUORITETAAN VUOROSSA OLEVAN OSAPUOLEN ISKU
        if (nextTurn === 'pelaaja') {
          // PELAAJAN VUORO
          if (weapon && weapon.durability <= 0) {
            combatLog.push(`⚠️ Aseesi (${weapon.name}) on rikki! Et voi hyökätä tehokkaasti.`);
          } else {
            const attackRoll = rollDice(1, 20);
            if (attackRoll >= monster.defense) {
              // Osuma! Lasketaan vahinko
              playerDamageDealt = rollDice(2, 8);
              monster.hp = Math.max(0, monster.hp - playerDamageDealt);
              combatLog.push(`⚔️ Heitit d20: [${attackRoll}] - Osut! Teet ${playerDamageDealt} pistettä vahinkoa.`);

              // Kulutetaan aseen kestävyyttä
              if (weapon) {
                weapon.durability = Math.max(0, (parseInt(weapon.durability) || 0) - 1);
                if (weapon.durability === 0) {
                  combatLog.push(`RAKS! Aseesi ${weapon.name} hajosi liitoksistaan!`);
                }
              }
            } else {
              combatLog.push(`⚔️ Heitit d20: [${attackRoll}] - Svingasit ohi kohteesta.`);
            }
          }
          // Vuoro siirtyy hirviölle
          nextTurn = 'hirviö';

        } else if (nextTurn === 'hirviö') {
          // HIRVIÖN VUORO
          const monsterAttackRoll = rollDice(1, 20) + monster.attackBonus;

          if (monsterAttackRoll >= playerDefense) {
            monsterDamageDealt = rollDice(1, monster.damageMax);
            currentPlayerHp = Math.max(0, currentPlayerHp - monsterDamageDealt);
            combatLog.push(`💥 ${monster.name} iskee! (Heitti ${monsterAttackRoll}) ja osui sinuun! Menetät ${monsterDamageDealt} HP.`);
          } else {
            combatLog.push(`🛡️ ${monster.name} yrittää iskeä (Heitti ${monsterAttackRoll}) ja raapaisi ohi vaatteidesi.`);
          }
          // Vuoro siirtyy takaisin pelaajalle
          nextTurn = 'pelaaja';
        }

        // Päivitetään muuttunut HP takaisin sessioon
        session.stats.hp = currentPlayerHp;
      }

      // 3. TARKISTETAAN JOS HIRVIÖ KUOLI TÄLLÄ VUOROLLA
      if (monster.hp <= 0) {
        monster.hp = 0; // Estetään elämän meneminen miinukselle logeissa
        combatLog.push(`💀 ${monster.name} haihtuu mustaksi savuksi. Voitit taistelun!`);
        
        const currentXp = parseInt(session.stats.xp) || 0;
        session.stats.xp = currentXp + monster.xpReward; // Palkinto haetaan suoraan tietokannasta
        
        const currentPoints = parseInt(session.repairPoints) || 0;
        session.repairPoints = currentPoints + 2; // Saadaan korjauspisteitä
      }
    }

    // Tallennetaan muuttunut pelitila tietokantaan
    session.markModified('inventory');
    session.markModified('stats');
    if (session.repairPoints !== undefined) {
      session.markModified('repairPoints');
    }
    await session.save();

    res.json({
      combatLog,
      playerHp: session.stats.hp,
      weaponDurability: session.inventory[0]?.durability || 0,
      monsterHp: monster.hp,
      initiativeWinner,
      nextTurn
    });

  } catch (error) {
    console.error("🔥 Kriittinen taisteluvirhe backendissä:", error);
    res.status(500).json({ message: 'Taistelu epäonnistui', error: error.message });
  }
});

export default router;