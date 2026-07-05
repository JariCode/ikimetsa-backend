import express from 'express';
import jwt from 'jsonwebtoken';
import GameSession from '../models/GameSession.js';
import Log from '../models/Log.js';
import Monster from '../models/Monster.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('❌ JWT_SECRET puuttuu .env-tiedostosta - palvelinta ei käynnistetä turvattomalla oletusarvolla.');
}

const rollDice = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

router.post('/turn', async (req, res) => {
  try {
    const { action } = req.body;

    // Luetaan token evästeistä
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ message: 'Ei oikeuksia' });
    
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.id;

    const session = await GameSession.findOne({ userId });
    if (!session) {
      return res.status(404).json({ message: 'Pelitilaa ei löytynyt' });
    }

    // 👾Haetaan se hirviö, joka on parhaillaan merkitty istuntoon!
    const monsterNameInSession = session.currentMonsterName || 'Varjohahmo';
    let dbMonster = await Monster.findOne({ name: monsterNameInSession });
    if (!dbMonster) {
      dbMonster = { name: monsterNameInSession, hp: '25', defense: '10', attackBonus: '2', damageMax: '8', xpReward: '20' };
    }

    const maxMonsterHp = parseInt(dbMonster.hp) || 25;
    const monsterDefense = parseInt(dbMonster.defense) || 10;
    const monsterAttackBonus = parseInt(dbMonster.attackBonus) || 2;
    const monsterDamageMax = parseInt(dbMonster.damageMax) || 8;
    const monsterXpReward = parseInt(dbMonster.xpReward) || 20;

    const monster = {
      name: dbMonster.name,
      hp: typeof session.currentMonsterHp === 'number' ? session.currentMonsterHp : maxMonsterHp,
      defense: monsterDefense,
      attackBonus: monsterAttackBonus,
      damageMax: monsterDamageMax,
      xpReward: monsterXpReward
    };

    if (monster.hp <= 0 && !session.combatInitiative && !session.currentTurn) {
      return res.status(400).json({ message: `${monster.name} on jo voitettu. Aloita uusi taistelu pelissä jatkaaksesi.` });
    }

    const combatLogEntries = [];
    let playerDamageDealt = 0;
    let monsterDamageDealt = 0;
    let nextTurn = session.currentTurn || null;
    let initiativeWinner = session.combatInitiative || null;
    let displayRoll = null; // 🎲 Tämän kierroksen "puhdas" d20-heitto (ilman bonuksia) noppa-animaatiota varten
    let damageDie1 = null; // 🎲 Vahingon ensimmäinen d8-noppa (vain jos pelaaja osui) - vierekkäistä nopka-animaatiota varten
    let damageDie2 = null; // 🎲 Vahingon toinen d8-noppa

    if (action === 'hyokkaa') {
      if (!initiativeWinner) {
        const playerRawRoll = rollDice(1, 20);
        const playerInitiative = playerRawRoll + (session.characterType === 'Metsästäjä' ? 4 : 0);
        const monsterInitiative = rollDice(1, 20);
        displayRoll = playerRawRoll; // näytetään pelaajan oma raaka d20-heitto nopassa

        if (playerInitiative >= monsterInitiative) {
          initiativeWinner = 'pelaaja';
          nextTurn = 'pelaaja';
          combatLogEntries.push(`🎲 Aloiteheitto: Olet nopeampi (Sinä: ${playerInitiative} vs ${monster.name}: ${monsterInitiative}) ja aloitat taistelun!`);
        } else {
          initiativeWinner = 'hirviö';
          nextTurn = 'hirviö';
          combatLogEntries.push(`🎲 Aloiteheitto: ${monster.name} on nopeampi (${monster.name}: ${monsterInitiative} vs Sinä: ${playerInitiative}) ja syöksyy pimeydestä ensin!`);
        }

        session.combatInitiative = initiativeWinner;
        session.currentTurn = nextTurn;
      } else {
        let weapon = session.inventory[0];
        const playerDefense = session.characterType === 'Metsästäjä' ? 12 : 10;
        let currentPlayerHp = parseInt(session.stats.hp) || 40;

        if (nextTurn === 'pelaaja') {
          if (weapon && weapon.durability <= 0) {
            combatLogEntries.push(`⚠️ Aseesi (${weapon.name}) on rikki! Et voi hyökätä tehokkaasti.`);
          } else {
            // 🎯 Tasosta kasvava hyökkäysbonus
            const playerLevel = parseInt(session.stats.level) || 1;
            const playerAttackBonus = playerLevel;
            const rawAttackRoll = rollDice(1, 20);
            const attackRoll = rawAttackRoll + playerAttackBonus;
            displayRoll = rawAttackRoll;
            if (attackRoll >= monster.defense) {
              damageDie1 = rollDice(1, 8);
              damageDie2 = rollDice(1, 8);
              const weaponBonus = parseInt(session.weaponDamageBonus) || 0;
              playerDamageDealt = damageDie1 + damageDie2 + weaponBonus;
              monster.hp = Math.max(0, monster.hp - playerDamageDealt);
              const bonusText = weaponBonus > 0 ? ` +${weaponBonus} aseesta` : '';
              combatLogEntries.push(`⚔️ Heitit d20: [${rawAttackRoll}] (+${playerAttackBonus} tasosta) - Osut! Vahinko: [${damageDie1}] + [${damageDie2}]${bonusText} = ${playerDamageDealt} pistettä kohteeseen ${monster.name}.`);

              if (weapon) {
                weapon.durability = Math.max(0, (parseInt(weapon.durability) || 0) - 1);
                if (weapon.durability === 0) {
                  combatLogEntries.push(`RAKS! Aseesi ${weapon.name} hajosi liitoksistaan!`);
                }
              }
            } else {
              combatLogEntries.push(`⚔️ Heitit d20: [${rawAttackRoll}] (+${playerAttackBonus} tasosta) - Svingasit ohi kohteesta ${monster.name}.`);
            }
          }

          // 🧑‍🤝‍🦯 Kumppani iskee samalla jos aktiivinen - oma erillinen heitto, vahinko ja ase
          if (session.companionActive && monster.hp > 0) {
            if ((session.companionWeaponDurability || 0) <= 0) {
              combatLogEntries.push(`⚠️ ${session.companionName}:n ase (${session.companionWeaponName}) on rikki! Hän ei voi hyökätä tehokkaasti.`);
            } else {
              const companionRoll = rollDice(1, 20) + 4; // Kiinteä bonus, ei skaalaudu tason mukana
              if (companionRoll >= monster.defense) {
                const companionDamage = rollDice(1, 6);
                monster.hp = Math.max(0, monster.hp - companionDamage);
                combatLogEntries.push(`🗡️ ${session.companionName} iskee ${session.companionWeaponName}:llaan samalla ja tekee ${companionDamage} pistettä vahinkoa kohteeseen ${monster.name}.`);

                session.companionWeaponDurability = Math.max(0, (parseInt(session.companionWeaponDurability) || 0) - 1);
                if (session.companionWeaponDurability === 0) {
                  combatLogEntries.push(`RAKS! ${session.companionName}:n ase ${session.companionWeaponName} hajosi liitoksistaan!`);
                }
              } else {
                combatLogEntries.push(`🗡️ ${session.companionName} yrittää iskeä, mutta osuu ohi.`);
              }
            }
          }
          nextTurn = 'hirviö';
          session.currentTurn = nextTurn;

        } else if (nextTurn === 'hirviö') {
          const monsterRawRoll = rollDice(1, 20);
          const monsterAttackRoll = monsterRawRoll + monster.attackBonus;
          displayRoll = monsterRawRoll; // näytetään hirviön raaka d20-heitto nopassa

          // 🎯 Jos kumppani on mukana ja pystyssä, hirviö arpoo kohteekseen joko
          // sinut tai kumppanin (50/50). Kumppanin kaatuminen ei koskaan päätä peliäsi -
          // hän vain jää pois taistelusta kunnes toipuu seuraavalla nuotiolla/heräämisellä.
          const targetsCompanion = session.companionActive && (session.companionHp || 0) > 0 && Math.random() < 0.5;

          if (targetsCompanion) {
            const companionDefense = parseInt(session.companionDefense) || 9;
            if (monsterAttackRoll >= companionDefense) {
              const companionDamageTaken = rollDice(1, monster.damageMax);
              const newCompanionHp = Math.max(0, (session.companionHp || 0) - companionDamageTaken);
              session.companionHp = newCompanionHp;
              combatLogEntries.push(`💥 ${monster.name} iskee ${session.companionName}:a kohti! (Heitti d20: [${monsterRawRoll}] +${monster.attackBonus} voimasta) ja osuu! ${session.companionName} menettää ${companionDamageTaken} HP.`);

              if (newCompanionHp <= 0) {
                session.companionActive = false;
                combatLogEntries.push(`💫 ${session.companionName} kaatuu taistelukyvyttömäksi. Hän ei kuole, mutta ei voi enää taistella ennen kuin toipuu nuotion ääressä.`);
              }
            } else {
              combatLogEntries.push(`🛡️ ${monster.name} yrittää iskeä ${session.companionName}:a (Heitti d20: [${monsterRawRoll}] +${monster.attackBonus} voimasta) mutta osuu ohi.`);
            }
          } else if (monsterAttackRoll >= playerDefense) {
            monsterDamageDealt = rollDice(1, monster.damageMax);
            currentPlayerHp = Math.max(0, currentPlayerHp - monsterDamageDealt);
            combatLogEntries.push(`💥 ${monster.name} iskee! (Heitti d20: [${monsterRawRoll}] +${monster.attackBonus} voimasta) ja osui sinuun! Menetät ${monsterDamageDealt} HP.`);

            if (currentPlayerHp <= 0) {
              combatLogEntries.push(`💀 Sait kuolettavan iskun ja vaivut pimeyteen...`);
            }
          } else {
            combatLogEntries.push(`🛡️ ${monster.name} yrittää iskeä (Heitti d20: [${monsterRawRoll}] +${monster.attackBonus} voimasta) ja raapaisi ohi vaatteidesi.`);
          }
          nextTurn = 'pelaaja';
          session.currentTurn = nextTurn;
        }

        session.stats.hp = currentPlayerHp;
      }

      if (monster.hp <= 0) {
        monster.hp = 0;
        combatLogEntries.push(`💀 ${monster.name} haihtuu mustaksi savuksi. Voitit taistelun ja sait ${monster.xpReward} XP:tä ja 2 korjauspistettä!`);
        
        let currentXp = parseInt(session.stats.xp) || 0;
        let currentLevel = parseInt(session.stats.level) || 1;
        let currentMaxHp = parseInt(session.stats.maxHp) || 40;

        // Lisätään dynaaminen XP
        currentXp += monster.xpReward;
        let xpNeeded = currentLevel * 100;

       // 🌟 DYNAAMINEN LEVEL UP PROGRESSIO SILMUKASSA
        while (currentXp >= xpNeeded) {
          currentXp -= xpNeeded;
          currentLevel += 1;
          
          // 🔥Molemmat hahmot saavat nyt tismalleen saman +15 HP taistelun päättyessä
          const hpBonus = 15; 
          currentMaxHp += hpBonus;
          
          session.stats.hp = currentMaxHp; // Täytetään elämät tasonnousussa
          combatLogEntries.push(`✨ LEVEL UP! Saavutit tason ${currentLevel}! Maksimielämäsi nousivat arvoon ${currentMaxHp} HP!`);
          xpNeeded = currentLevel * 100;
        }

        session.stats.xp = currentXp;
        session.stats.level = currentLevel;
        session.stats.maxHp = currentMaxHp;

        // 🔥 NUOTIO: pelaaja lepää voiton jälkeen
        session.stats.hp = currentMaxHp;
        if (session.inventory[0]) {
          session.inventory[0].durability = session.inventory[0].maxDurability;
        }

        session.checkpoint = {
          xp: currentXp,
          level: currentLevel,
          maxHp: currentMaxHp
        };
        session.markModified('checkpoint');
        
        const currentPoints = parseInt(session.repairPoints) || 0;
        session.repairPoints = currentPoints + 2;

        session.currentMonsterHp = 0;
        session.combatInitiative = null;
        session.currentTurn = null;

        // 👑 OIKOPOLKU LOPPURUUTUUN: Jos ollaan alueella 10 (Velho), peli päättyy välittömästi!
        const currentAreaIndex = parseInt(session.currentAreaIndex) || 1;
        if (currentAreaIndex >= 10) {
          session.isGameCompleted = true; // Lukitaan tietokantaan
          session.hasEnteredCombat = false; // Poistutaan taistelutilasta taustalla
          
          combatLogEntries.push(`🏆 IKIMETSÄ ON VAPAA! Kirottujen Velho on lyöty lopullisesti!`);
          session.combatLogs = [...(session.combatLogs || []), ...combatLogEntries];
          
          await session.save();

          const newLog = new Log({
            action: 'GAME_COMPLETED',
            details: `Pelaaja läpäisi pelin onnistuneesti suoraan taistelusta!`,
            performedBy: userId
          });
          await newLog.save();

          // Palautetaan heti JSON-vastaus ja katkaistaan suoritus, jottei alempi oletus-res.json laukea
          return res.json({
            combatLogs: session.combatLogs,
            newLogs: combatLogEntries,
            playerHp: session.stats.hp,
            playerMaxHp: session.stats.maxHp,
            playerLevel: session.stats.level,
            playerXp: session.stats.xp,
            weaponDurability: session.inventory[0]?.durability || 0,
            monsterHp: 0,
            repairPoints: session.repairPoints,
            initiativeWinner: null,
            nextTurn: null,
            diceRoll: displayRoll,
            damageDie1,
            damageDie2,
            isGameCompleted: true, // 🔥 Lähetetään frontille käsky siirtyä VictoryScreeniin!
            companionActive: session.companionActive,
            companionHp: session.companionHp,
            companionMaxHp: session.companionMaxHp,
            companionName: session.companionName,
            companionWeaponName: session.companionWeaponName,
            companionWeaponDurability: session.companionWeaponDurability,
            companionWeaponMaxDurability: session.companionWeaponMaxDurability
          });
        }
      } else {
        session.currentMonsterHp = monster.hp;
      }
    }

    session.combatLogs = [...(session.combatLogs || []), ...combatLogEntries];

    session.markModified('inventory');
    session.markModified('stats');
    session.markModified('repairPoints');
    session.markModified('currentMonsterHp');
    session.markModified('combatInitiative');
    session.markModified('currentTurn');
    session.markModified('combatLogs');
    
    await session.save();

    // Palautetaan kaikki dynaamiset progression arvot JSON-vastauksessa frontendille lennosta
    res.json({
      combatLogs: session.combatLogs,
      newLogs: combatLogEntries,
      playerHp: session.stats.hp,
      playerMaxHp: session.stats.maxHp,
      playerLevel: session.stats.level,
      playerXp: session.stats.xp,
      weaponDurability: session.inventory[0]?.durability || 0,
      monsterHp: monster.hp,
      repairPoints: session.repairPoints,
      initiativeWinner,
      nextTurn,
      diceRoll: displayRoll,
      damageDie1,
      damageDie2,
      companionActive: session.companionActive,
      companionHp: session.companionHp,
      companionMaxHp: session.companionMaxHp,
      companionName: session.companionName,
      companionWeaponName: session.companionWeaponName,
      companionWeaponDurability: session.companionWeaponDurability,
      companionWeaponMaxDurability: session.companionWeaponMaxDurability
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
      return res.status(400).json({ message: 'Ei tarpeeksi korjauspisteitä (vaatii 2pts)' });
    }

    // 🎯 Kohde: 'player' (oletus) tai 'companion' - molemmat käyttävät samaa yhteistä korjauspistepottia
    const target = req.body?.target === 'companion' ? 'companion' : 'player';

    if (target === 'companion') {
      if (!session.companionActive) {
        return res.status(400).json({ message: 'Kumppani ei ole mukana taistelussa juuri nyt.' });
      }
      const maxDurability = parseInt(session.companionWeaponMaxDurability) || 8;
      session.repairPoints = currentPoints - 2;
      session.companionWeaponDurability = maxDurability;
      session.combatLogs = [...(session.combatLogs || []), `🔧 Korjaat ${session.companionName}:n aseen (${session.companionWeaponName}) takaisin huippukuntoon.`];

      session.markModified('repairPoints');
      session.markModified('combatLogs');
      await session.save();

      return res.json({ session, combatLogs: session.combatLogs });
    }

    let weapon = session.inventory[0];
    if (!weapon) {
      return res.status(400).json({ message: 'Sinulla ei ole asetta muistiinpanoissa' });
    }

    const maxDurability = parseInt(weapon.maxDurability) || 10;

    session.repairPoints = currentPoints - 2;
    weapon.durability = maxDurability;
    session.combatLogs = [...(session.combatLogs || []), `🔧 Kipunoita ja kolketta! Korjasit aseesi takaisin huippukuntoon.`];

    session.markModified('inventory');
    session.markModified('repairPoints');
    session.markModified('combatLogs');
    
    await session.save();

    return res.json({ session, combatLogs: session.combatLogs });

  } catch (error) {
    console.error("🔥 Virhe aseen korjauksessa backendissä:", error);
    return res.status(500).json({ message: 'Korjaus epäonnistui palvelimella', error: error.message });
  }
});

export default router;