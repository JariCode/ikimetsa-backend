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

    session.hasEnteredCombat = true;
    await session.save();

    res.json({ hasEnteredCombat: true });
  } catch (error) {
    res.status(500).json({ message: 'Taisteluun siirtymisen tallennus epäonnistui', error: error.message });
  }
});

export default router;