import express from 'express';
import jwt from 'jsonwebtoken';
import GameSession from '../models/GameSession.js';
import Log from '../models/Log.js';
import Monster from '../models/Monster.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'ikimetsa_salaisuus_123';

const rollDice = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

router.post('/turn', async (req, res) => {
  try {
    const { action, currentMonsterHp, hasInitiative, currentTurn } = req.body; 

    // Luetaan token evästeistä
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ message: 'Ei oikeuksia' });
    
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.id;

    const session = await GameSession.findOne({ userId });
    if (!session) {
      return res.status(404).json({ message: 'Pelitilaa ei löytynyt' });
    }

    let dbMonster = await Monster.findOne({ name: 'Varjohahmo' });
    if (!dbMonster) {
      dbMonster = { name: 'Varjohahmo', hp: '25', defense: '10', attackBonus: '2', damageMax: '8', xpReward: '20' };
    }

    const maxMonsterHp = parseInt(dbMonster.hp) || 25;
    const monsterDefense = parseInt(dbMonster.defense) || 10;
    const monsterAttackBonus = parseInt(dbMonster.attackBonus) || 2;
    const monsterDamageMax = parseInt(dbMonster.damageMax) || 8;
    const monsterXpReward = parseInt(dbMonster.xpReward) || 20;

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
        let weapon = session.inventory[0];
        const playerDefense = session.characterType === 'Metsästäjä' ? 12 : 10;
        let currentPlayerHp = parseInt(session.stats.hp) || 40;

        if (nextTurn === 'pelaaja') {
          if (weapon && weapon.durability <= 0) {
            combatLog.push(`⚠️ Aseesi (${weapon.name}) on rikki! Et voi hyökätä tehokkaasti.`);
          } else {
            const attackRoll = rollDice(1, 20);
            if (attackRoll >= monster.defense) {
              playerDamageDealt = rollDice(2, 8);
              monster.hp = Math.max(0, monster.hp - playerDamageDealt);
              combatLog.push(`⚔️ Heitit d20: [${attackRoll}] - Osut! Teet ${playerDamageDealt} pistettä vahinkoa.`);

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
          nextTurn = 'hirviö';

        } else if (nextTurn === 'hirviö') {
          const monsterAttackRoll = rollDice(1, 20) + monster.attackBonus;

          if (monsterAttackRoll >= playerDefense) {
            monsterDamageDealt = rollDice(1, monster.damageMax);
            currentPlayerHp = Math.max(0, currentPlayerHp - monsterDamageDealt);
            combatLog.push(`💥 ${monster.name} iskee! (Heitti ${monsterAttackRoll}) ja osui sinuun! Menetät ${monsterDamageDealt} HP.`);
          } else {
            combatLog.push(`🛡️ ${monster.name} yrittää iskeä (Heitti ${monsterAttackRoll}) ja raapaisi ohi vaatteidesi.`);
          }
          nextTurn = 'pelaaja';
        }

        session.stats.hp = currentPlayerHp;
      }

      if (monster.hp <= 0) {
        monster.hp = 0;
        combatLog.push(`💀 ${monster.name} haihtuu mustaksi savuksi. Voitit taistelun ja sait 2 pistettä!`);
        
        const currentXp = parseInt(session.stats.xp) || 0;
        session.stats.xp = currentXp + monster.xpReward;
        
        const currentPoints = parseInt(session.repairPoints) || 0;
        session.repairPoints = currentPoints + 2;
      }
    }

    session.markModified('inventory');
    session.markModified('stats');
    session.markModified('repairPoints');
    
    await session.save();

    res.json({
      combatLog,
      playerHp: session.stats.hp,
      weaponDurability: session.inventory[0]?.durability || 0,
      monsterHp: monster.hp,
      repairPoints: session.repairPoints,
      initiativeWinner,
      nextTurn
    });

  } catch (error) {
    console.error("🔥 Kriittinen taisteluvirhe backendissä:", error);
    res.status(500).json({ message: 'Taistelu epäonnistui', error: error.message });
  }
});

router.post('/repair-weapon', async (req, res) => {
  try {
    // Luetaan token evästeistä
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ message: 'Ei oikeuksia' });
    
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.id;

    const session = await GameSession.findOne({ userId });
    if (!session) {
      return res.status(404).json({ message: 'Pelitilaa ei löytynyt' });
    }

    const currentPoints = parseInt(session.repairPoints) || 0;
    if (currentPoints < 2) {
      return res.status(400).json({ message: 'Ei tarpeeksi pisteitä (vaatii 2pts)' });
    }

    let weapon = session.inventory[0];
    if (!weapon) {
      return res.status(400).json({ message: 'Sinulla ei ole asetta muistiinpanoissa' });
    }

    const maxDurability = parseInt(weapon.maxDurability) || 10;

    session.repairPoints = currentPoints - 2;
    weapon.durability = maxDurability;

    session.markModified('inventory');
    session.markModified('repairPoints');
    
    await session.save();

    return res.json({ session });

  } catch (error) {
    console.error("🔥 Virhe aseen korjauksessa backendissä:", error);
    return res.status(500).json({ message: 'Korjaus epäonnistui palvelimella', error: error.message });
  }
});

export default router;