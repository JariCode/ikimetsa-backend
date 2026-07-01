import express from 'express';
import GameSession from '../models/GameSession.js';
import Log from '../models/Log.js';

const router = express.Router();

// HAHMON VALINTA / PELIN ALUSTUS
router.post('/start-game', async (req, res) => {
  try {
    const { userId, characterType } = req.body;

    if (!userId || !characterType) {
      return res.status(400).json({ message: 'Käyttäjä ID ja hahmoluokka vaaditaan' });
    }

    // Tarkistetaan onko pelaajalla jo olemassa oleva peli
    const existingSession = await GameSession.findOne({ userId });
    if (existingSession) {
      return res.status(400).json({ message: 'Peli on jo aloitettu tällä käyttäjällä' });
    }

    // Määritetään statsit ja aseet valinnan mukaan ilma väliviivoja
    let hp = 0;
    let maxHp = 0;
    let startingWeapon = {};

    if (characterType === 'Metsästäjä') {
      hp = 40;
      maxHp = 40;
      startingWeapon = {
        name: 'Vanha puukko',
        type: 'weapon',
        durability: 10,
        maxDurability: 10
      };
    } else if (characterType === 'Mekaanikko') {
      hp = 55;
      maxHp = 55;
      startingWeapon = {
        name: 'Raskas jakoavain',
        type: 'weapon',
        durability: 15,
        maxDurability: 15
      };
    } else {
      return res.status(400).json({ message: 'Tuntematon hahmoluokka' });
    }

    // Luodaan uusi pelitila tietokantaan
    const newSession = new GameSession({
      userId,
      characterType,
      currentLocation: 'metsan_reuna',
      stats: { hp, maxHp, xp: 0, level: 1 },
      inventory: [startingWeapon],
      repairPoints: 5 // Aloituspisteet korjausta varten
    });

    await newSession.save();

    // Kirjoitetaan tapahtuma lokiin
    const newLog = new Log({
      action: 'GAME_START',
      details: `Pelaaja aloitti pelin hahmolla ${characterType}`,
      performedBy: userId // Käytetään id:tä tässä vaiheessa testinä
    });
    await newLog.save();

    res.status(201).json(newSession);
  } catch (error) {
    res.status(500).json({ message: 'Pelin aloitus epäonnistui', error: error.message });
  }
});

export default router;
