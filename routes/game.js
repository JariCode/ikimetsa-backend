import express from 'express';
import jwt from 'jsonwebtoken';
import GameSession from '../models/GameSession.js';
import CharacterClass from '../models/CharacterClass.js';
import Log from '../models/Log.js';
import Monster from '../models/Monster.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'ikimetsa_salaisuus_123';

router.get('/classes', async (req, res) => {
  try {
    const classes = await CharacterClass.find();
    res.json(classes);
  } catch (error) {
    res.status(500).json({ message: 'Hahmoluokkien haku epäonnistui' });
  }
});

router.post('/start-game', async (req, res) => {
  try {
    const { characterClassName } = req.body;
    
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ message: 'Ei oikeuksia' });
    
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.id;

    const existingSession = await GameSession.findOne({ userId });
    if (existingSession) {
      return res.status(400).json({ message: 'Peli on jo aloitettu tällä käyttäjällä' });
    }

    const charClass = await CharacterClass.findOne({ name: characterClassName });
    if (!charClass) {
      return res.status(404).json({ message: 'Valittua hahmoluokkaa ei löydy tietokannasta' });
    }

    // 🔒 LUKITTU: Haetaan tietokannasta nimenomaan Varjohahmo ensimmäiseksi vastustajaksi!
    let dbMonster = await Monster.findOne({ name: 'Varjohahmo' });
    
    // Vararatkaisu vain jos tietokannassa ei jostain syystä ole vielä ladattuna mörköjä
    if (!dbMonster) {
      dbMonster = { name: 'Varjohahmo', hp: '25', level: '1' };
    }

    const startingMonsterHp = parseInt(dbMonster.hp) || 25;
    const hpValue = parseInt(charClass.baseHp);
    const maxDurabilityValue = parseInt(charClass.startingWeapon.maxDurability);

    const newSession = new GameSession({
      userId,
      characterType: charClass.name,
      currentLocation: 'metsan_reuna',
      stats: { hp: hpValue, maxHp: hpValue, xp: 0, level: 1 },
      inventory: [{
        name: charClass.startingWeapon.name,
        type: 'weapon',
        durability: maxDurabilityValue,
        maxDurability: maxDurabilityValue
      }],
      currentMonsterName: dbMonster.name, 
      currentMonsterLevel: parseInt(dbMonster.level),
      currentMonsterHp: startingMonsterHp,
      combatInitiative: null,
      currentTurn: null,
      repairPoints: 5,
      hasEnteredCombat: false
    });

    await newSession.save();

    const newLog = new Log({
      action: 'GAME_START',
      details: `Pelaaja alusti pelin hahmolla ${charClass.name}. Ensimmäinen vastus lukittu: ${dbMonster.name} (Lvl ${dbMonster.level})`,
      performedBy: userId
    });
    await newLog.save();

    res.status(201).json(newSession);
  } catch (error) {
    res.status(500).json({ message: 'Pelin aloitus epäonnistui', error: error.message });
  }
});

// 🌟 Merkitään pelisessioon että pelaaja on astunut taisteluun (liikkumisnopalla heitetty kuutonen).
// Tämän avulla "Jatka taivalta" osaa jatkossa palauttaa pelaajan oikeaan paikkaan
// (liikkumiseen vai suoraan taisteluun) vaikka hän kirjautuisi välissä ulos.
// Palkitaan samalla pieni XP siitä että pelaaja selvisi liikkumisosuuden läpi asti taisteluun -
// vain kerran per kohtaaminen (hasEnteredCombat-suoja estää tuplapalkinnon).
const MOVEMENT_XP_REWARD = 10;

router.post('/enter-combat', async (req, res) => {
  try {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ message: 'Ei oikeuksia' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.id;

    const session = await GameSession.findOne({ userId });
    if (!session) {
      return res.status(404).json({ message: 'Pelitilaa ei löytynyt' });
    }

    const levelUpLogs = [];

    if (!session.hasEnteredCombat) {
      let currentXp = (parseInt(session.stats.xp) || 0) + MOVEMENT_XP_REWARD;
      let currentLevel = parseInt(session.stats.level) || 1;
      let currentMaxHp = parseInt(session.stats.maxHp) || 40;
      let xpNeeded = currentLevel * 100;

      // 🌟 Sama dynaaminen level up -silmukka kuin taistelussa
      while (currentXp >= xpNeeded) {
        currentXp -= xpNeeded;
        currentLevel += 1;

        const hpBonus = session.characterType === 'Mekaanikko' ? 15 : 10;
        currentMaxHp += hpBonus;

        session.stats.hp = currentMaxHp;
        levelUpLogs.push(`✨ LEVEL UP! Saavutit tason ${currentLevel}! Maksimielämäsi nousivat arvoon ${currentMaxHp} HP ja kuntosi palautui täyteen!`);
        xpNeeded = currentLevel * 100;
      }

      session.stats.xp = currentXp;
      session.stats.level = currentLevel;
      session.stats.maxHp = currentMaxHp;

      if (levelUpLogs.length > 0) {
        session.combatLogs = [...(session.combatLogs || []), ...levelUpLogs];
      }
    }

    session.hasEnteredCombat = true;
    session.markModified('stats');
    session.markModified('combatLogs');
    await session.save();

    res.json({
      hasEnteredCombat: true,
      playerHp: session.stats.hp,
      playerMaxHp: session.stats.maxHp,
      playerLevel: session.stats.level,
      playerXp: session.stats.xp,
      combatLogs: session.combatLogs
    });
  } catch (error) {
    res.status(500).json({ message: 'Taisteluun siirtymisen tallennus epäonnistui', error: error.message });
  }
});

export default router;