import express from 'express';
import jwt from 'jsonwebtoken';
import GameSession from '../models/GameSession.js';
import CharacterClass from '../models/CharacterClass.js';
import Log from '../models/Log.js';

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
    
    // Luetaan token turvallisesti evästeistä
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
      repairPoints: 5
    });

    await newSession.save();

    const newLog = new Log({
      action: 'GAME_START',
      details: `Pelaaja alusti pelin tietokantahahmolla ${charClass.name}`,
      performedBy: userId
    });
    await newLog.save();

    res.status(201).json(newSession);
  } catch (error) {
    res.status(500).json({ message: 'Pelin aloitus epäonnistui', error: error.message });
  }
});

export default router;