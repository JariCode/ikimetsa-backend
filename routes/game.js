import express from 'express';
import jwt from 'jsonwebtoken';
import GameSession from '../models/GameSession.js';
import CharacterClass from '../models/CharacterClass.js';
import Log from '../models/Log.js';
import Monster from '../models/Monster.js';
import Area from '../models/Area.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('❌ JWT_SECRET puuttuu .env-tiedostosta - palvelinta ei käynnistetä turvattomalla oletusarvolla.');
}
const TOTAL_AREAS = 10;

// 🛡️ Kumppanin HP ja puolustus skaalautuvat pelaajan tason mukana - sama periaate
// kuin pelaajan omassa HP-kasvussa (+10/taso), jotta kumppani pysyy hyödyllisenä
// eikä kuole joka taistelussa myöhemmillä, vaikeammilla alueilla.
const getCompanionStatsForLevel = (level) => {
  const lvl = parseInt(level) || 1;
  return {
    maxHp: 30 + (lvl - 1) * 10,
    defense: 9 + (lvl - 1)
  };
};

// 🗺️ Hakee session.currentAreaIndex:tä vastaavan Area-dokumentin ja liittää sen
// vastaukseen "currentArea"-kenttänä.
const attachAreaToSession = async (session) => {
  const areaOrder = Math.min(parseInt(session.currentAreaIndex) || 1, TOTAL_AREAS);
  const area = await Area.findOne({ order: areaOrder });
  const sessionObject = session.toObject ? session.toObject() : session;
  return { ...sessionObject, currentArea: area || null };
};

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

    let firstArea = await Area.findOne({ order: 1 });
    let firstMonsterName = firstArea ? firstArea.monsterName : 'Varjohahmo';

    let dbMonster = await Monster.findOne({ name: firstMonsterName });

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
      currentMonsterCssClass: dbMonster.cssClass || 'varjohahmo',
      combatInitiative: null,
      currentTurn: null,
      repairPoints: 5,
      hasEnteredCombat: false,
      currentAreaIndex: 1,
      isGameCompleted: false,
      checkpoint: { xp: 0, level: 1, maxHp: hpValue, repairPoints: 5 } // 🔥 Päivitetty muistamaan aloituspisteet
    });

    await newSession.save();

    const newLog = new Log({
      action: 'GAME_START',
      details: `Pelaaja alusti pelin hahmolla ${charClass.name}. Ensimmäinen alue: ${firstArea ? firstArea.name : 'Metsän reuna'}, vastus: ${dbMonster.name} (Lvl ${dbMonster.level})`,
      performedBy: userId
    });
    await newLog.save();

    const responseBody = await attachAreaToSession(newSession);
    res.status(201).json(responseBody);
  } catch (error) {
    res.status(500).json({ message: 'Pelin aloitus epäonnistui', error: error.message });
  }
});

// 🧑‍🤝‍🧑 Kumppanin löytäminen - kutsutaan kun pelaaja heittää ensimmäisen kuutosen alueella
// jolla on companionEvent eikä kumppania ole vielä löydetty. Ei vie taisteluun, vaan
// näyttää löytöruudun ja palauttaa pelaajan takaisin samalle liikkumisruudulle.
router.post('/find-companion', async (req, res) => {
  try {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ message: 'Ei oikeuksia' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.id;

    const session = await GameSession.findOne({ userId });
    if (!session) {
      return res.status(404).json({ message: 'Pelitilaa ei löytynyt' });
    }

    if (session.companionFound) {
      return res.status(400).json({ message: 'Kumppani on jo löydetty.' });
    }

    const currentArea = await Area.findOne({ order: parseInt(session.currentAreaIndex) || 1 });
    if (!currentArea || !currentArea.companionEvent || !currentArea.companionEvent.name) {
      return res.status(400).json({ message: 'Tällä alueella ei ole kumppanitapahtumaa.' });
    }

    session.companionFound = true;
    session.companionActive = true;
    session.companionName = currentArea.companionEvent.name;
    const foundStats = getCompanionStatsForLevel(session.stats.level);
    session.companionMaxHp = foundStats.maxHp;
    session.companionDefense = foundStats.defense;
    session.companionHp = foundStats.maxHp;
    session.companionWeaponName = currentArea.companionEvent.weaponName || 'Vanha ase';
    session.companionWeaponDurability = session.companionWeaponMaxDurability || 8;
    session.combatLogs = [...(session.combatLogs || []), `🧑‍🤝‍🧑 ${currentArea.companionEvent.name} liittyy seuraasi.`];

    session.markModified('combatLogs');
    await session.save();

    const newLog = new Log({
      action: 'COMPANION_FOUND',
      details: `Pelaaja löysi matkakumppanin: ${currentArea.companionEvent.name}`,
      performedBy: userId
    });
    await newLog.save();

    const responseBody = await attachAreaToSession(session);
    res.json(responseBody);
  } catch (error) {
    res.status(500).json({ message: 'Kumppanin löytäminen epäonnistui', error: error.message });
  }
});

// ⚔️ Paremman aseen löytäminen - kutsutaan kun pelaaja heittää ensimmäisen kuutosen
// alueella jolla on weaponEvent eikä asetta ole vielä löydetty. Ei vie taisteluun,
// vaan näyttää löytöruudun ja palauttaa pelaajan takaisin samalle liikkumisruudulle.
router.post('/find-weapon', async (req, res) => {
  try {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ message: 'Ei oikeuksia' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.id;

    const session = await GameSession.findOne({ userId });
    if (!session) {
      return res.status(404).json({ message: 'Pelitilaa ei löytynyt' });
    }

    if (session.weaponFound) {
      return res.status(400).json({ message: 'Parempi ase on jo löydetty.' });
    }

    const currentArea = await Area.findOne({ order: parseInt(session.currentAreaIndex) || 1 });
    if (!currentArea || !currentArea.weaponEvent || !currentArea.weaponEvent.discoveryText) {
      return res.status(400).json({ message: 'Tällä alueella ei ole asetapahtumaa.' });
    }

    const newWeaponName = session.characterType === 'Metsästäjä'
      ? currentArea.weaponEvent.hunterWeaponName
      : currentArea.weaponEvent.mechanicWeaponName;

    session.weaponFound = true;
    session.weaponDamageBonus = currentArea.weaponEvent.damageBonus || 0;

    if (session.inventory[0]) {
      session.inventory[0].name = newWeaponName || session.inventory[0].name;
      // 🛠️ Sama kestävyys kuin vanhalla aseella - korjataan täyteen kuntoon vaihdon yhteydessä
      session.inventory[0].durability = session.inventory[0].maxDurability;
    }

    session.combatLogs = [...(session.combatLogs || []), `⚔️ Löysit uuden aseen: ${newWeaponName}!`];

    session.markModified('inventory');
    session.markModified('combatLogs');
    await session.save();

    const newLog = new Log({
      action: 'WEAPON_FOUND',
      details: `Pelaaja löysi paremman aseen: ${newWeaponName}`,
      performedBy: userId
    });
    await newLog.save();

    const responseBody = await attachAreaToSession(session);
    res.json(responseBody);
  } catch (error) {
    res.status(500).json({ message: 'Aseen löytäminen epäonnistui', error: error.message });
  }
});

// 🎒 Aarrepussi (alue 4, Järvi) - kelluva pussi jonka pelaaja voi nostaa vedestä
// kerran. Antaa korjauspisteitä ja pysyvän max HP -bonuksen. Sama kertaluontoinen
// löytölogiikka kuin aseella ja kumppanilla (treasureFound estää toiston).
router.post('/find-treasure', async (req, res) => {
  try {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ message: 'Ei oikeuksia' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.id;

    const session = await GameSession.findOne({ userId });
    if (!session) {
      return res.status(404).json({ message: 'Pelitilaa ei löytynyt' });
    }

    if (session.treasureFound) {
      return res.status(400).json({ message: 'Aarrepussi on jo löydetty.' });
    }

    const currentArea = await Area.findOne({ order: parseInt(session.currentAreaIndex) || 1 });
    if (!currentArea || !currentArea.treasureEvent || !currentArea.treasureEvent.discoveryText) {
      return res.status(400).json({ message: 'Tällä alueella ei ole aarretapahtumaa.' });
    }

    const repairBonus = parseInt(currentArea.treasureEvent.repairPointsBonus) || 0;
    const hpBonus = parseInt(currentArea.treasureEvent.maxHpBonus) || 0;

    session.treasureFound = true;

    // Korjauspisteet lisätään pottiin
    session.repairPoints = (parseInt(session.repairPoints) || 0) + repairBonus;

    // Max HP nousee pysyvästi, ja nykyinen HP nousee saman verran (juoma parantaa heti)
    const oldMaxHp = parseInt(session.stats.maxHp) || 40;
    session.stats.maxHp = oldMaxHp + hpBonus;
    session.stats.hp = (parseInt(session.stats.hp) || oldMaxHp) + hpBonus;

    // Bonukset päivitetään myös checkpointiin, jottei ne katoa respawnissa
    if (session.checkpoint) {
      session.checkpoint.maxHp = (parseInt(session.checkpoint.maxHp) || oldMaxHp) + hpBonus;
      session.markModified('checkpoint');
    }

    session.combatLogs = [...(session.combatLogs || []), `🎒 Avasit haltijoiden pussin: +${repairBonus} korjauspistettä ja +${hpBonus} elinvoimaa!`];

    session.markModified('stats');
    session.markModified('repairPoints');
    session.markModified('combatLogs');
    await session.save();

    const newLog = new Log({
      action: 'TREASURE_FOUND',
      details: `Pelaaja löysi aarrepussin: +${repairBonus} korjauspistettä, +${hpBonus} max HP`,
      performedBy: userId
    });
    await newLog.save();

    const responseBody = await attachAreaToSession(session);
    res.json(responseBody);
  } catch (error) {
    res.status(500).json({ message: 'Aarrepussin löytäminen epäonnistui', error: error.message });
  }
});

// 📝 Tallentaa yksittäisen lokirivin, jota ei muuten tallennettaisi minnekään -
// käytetään liikkumisruudun nopanheittoteksteille ja vastaavalle selainpuolen
// tekstille joka ei muuten koskaan kulkisi palvelimen kautta.
router.post('/log-message', async (req, res) => {
  try {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ message: 'Ei oikeuksia' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.id;

    const { message } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ message: 'Viesti puuttuu.' });
    }

    // 🛡️ Pituusraja estää tietokannan paisuttamisen ylipitkillä viesteillä.
    // Ei luoteta siihen että viesti tulee omasta frontendista - kuka tahansa voi
    // lähettää pyynnön suoraan tähän reittiin, joten raja pakotetaan palvelimella.
    // Normaalit pelilokiviestit ovat noin 100-200 merkkiä, joten 500 on väljä.
    if (message.length > 500) {
      return res.status(400).json({ message: 'Viesti on liian pitkä.' });
    }

    const session = await GameSession.findOne({ userId });
    if (!session) {
      return res.status(404).json({ message: 'Pelitilaa ei löytynyt' });
    }

    session.combatLogs = [...(session.combatLogs || []), message];
    session.markModified('combatLogs');
    await session.save();

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: 'Lokin tallennus epäonnistui', error: error.message });
  }
});

const MOVEMENT_XP_REWARD = 50;

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

      while (currentXp >= xpNeeded) {
        currentXp -= xpNeeded;
        currentLevel += 1;

        const hpBonus = 15; // Molemmat hahmot saavat +15 HP taistelun päättyessä, ei enää eroa luokkien välillä
        currentMaxHp += hpBonus;

        session.stats.hp = currentMaxHp;
        levelUpLogs.push(`✨ LEVEL UP! Saavutit tason ${currentLevel}! Maksimielämäsi nousivat arvoon ${currentMaxHp} HP!`);
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

router.post('/respawn', async (req, res) => {
  try {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ message: 'Ei oikeuksia' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.id;

    const session = await GameSession.findOne({ userId });
    if (!session) {
      return res.status(404).json({ message: 'Pelitilaa ei löytynyt' });
    }

    if (session.stats.hp > 0) {
      return res.status(400).json({ message: 'Hahmo ei ole kuollut - paluuta tallennuspisteeseen ei voi tehdä.' });
    }

    let dbMonster = await Monster.findOne({ name: session.currentMonsterName || 'Varjohahmo' });
    if (!dbMonster) {
      dbMonster = { name: 'Varjohahmo', hp: '25', level: '1' };
    }
    const freshMonsterHp = parseInt(dbMonster.hp) || 25;

    const checkpoint = session.checkpoint || { xp: 0, level: 1, maxHp: session.stats.maxHp || 40, repairPoints: 5 };

    session.stats.xp = checkpoint.xp;
    session.stats.level = checkpoint.level;
    session.stats.maxHp = checkpoint.maxHp;
    session.stats.hp = checkpoint.maxHp;

    if (session.inventory[0]) {
      session.inventory[0].durability = session.inventory[0].maxDurability;
    }
    // 🔥 Haetaan pisteet tallennuspisteestä, mutta varmistetaan vähintään 5 pisteen armopala suojaksi!
    session.repairPoints = Math.max(5, checkpoint.repairPoints !== undefined ? checkpoint.repairPoints : 5);

    session.currentMonsterHp = freshMonsterHp;
    session.currentMonsterCssClass = dbMonster.cssClass || 'varjohahmo';
    session.combatInitiative = null;
    session.currentTurn = null;
    session.hasEnteredCombat = false;

    // 🧑‍🤝‍🧑 Kumppani herää mukanasi jos hän on löydetty - paranee täyteen kuntoon
    let respawnMessage = `🔥 Heräät nuotion äärestä. Taipaleesi jatkuu tasolta ${checkpoint.level} (${checkpoint.xp} XP).`;
    if (session.companionFound) {
      const wasDown = !session.companionActive;
      const stats = getCompanionStatsForLevel(session.stats.level);
      session.companionActive = true;
      session.companionMaxHp = stats.maxHp;
      session.companionDefense = stats.defense;
      session.companionHp = stats.maxHp;
      session.companionWeaponDurability = session.companionWeaponMaxDurability || 8;
      if (wasDown) {
        respawnMessage += ` ${session.companionName} herää myös vierestäsi, haavat parantuneina.`;
      }
    }
    session.combatLogs = [...(session.combatLogs || []), respawnMessage];

    session.markModified('stats');
    session.markModified('inventory');
    session.markModified('combatLogs');
    await session.save();

    const newLog = new Log({
      action: 'PLAYER_RESPAWN',
      details: `Pelaaja kuoli ja palasi tallennuspisteeseen (taso ${checkpoint.level}, ${checkpoint.xp} XP)`,
      performedBy: userId
    });
    await newLog.save();

    const responseBody = await attachAreaToSession(session);
    res.json(responseBody);
  } catch (error) {
    res.status(500).json({ message: 'Tallennuspisteeseen palaaminen epäonnistui', error: error.message });
  }
});

// 🔥 Voiton jälkeen siirrytään nuotiolta eteenpäin
router.post('/continue-journey', async (req, res) => {
  try {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ message: 'Ei oikeuksia' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.id;

    const session = await GameSession.findOne({ userId });
    if (!session) {
      return res.status(404).json({ message: 'Pelitilaa ei löytynyt' });
    }

    if (session.stats.hp <= 0) {
      return res.status(400).json({ message: 'Hahmo on kaatunut - käytä nuotiolta heräämistä.' });
    }
    if (session.currentMonsterHp > 0) {
      return res.status(400).json({ message: 'Nykyistä vastustajaa ei ole vielä voitettu.' });
    }

    const currentAreaIndex = parseInt(session.currentAreaIndex) || 1;

    // 🛡️ KORJATTU LOPPURUUTU-LOGIIKKA: Varmistetaan että tieto menee perille fronttiin satavarmasti
    if (currentAreaIndex >= TOTAL_AREAS) {
      session.isGameCompleted = true; 
      session.hasEnteredCombat = false;
      session.currentMonsterHp = 0;
      await session.save();

      const newLog = new Log({
        action: 'GAME_COMPLETED',
        details: `Pelaaja läpäisi pelin onnistuneesti! Kirottujen Velho on lyöty.`,
        performedBy: userId
      });
      await newLog.save();

      const responseBody = await attachAreaToSession(session);
      // 🔥 PAKOTETAAN kenttä suoraan palautettavaan vastaukseen ohi toObject-muunnoksen!
      responseBody.isGameCompleted = true;
      return res.json(responseBody);
    }

    const nextAreaIndex = Math.min(currentAreaIndex + 1, TOTAL_AREAS);
    const nextArea = await Area.findOne({ order: nextAreaIndex });

    let dbMonster = null;
    if (nextArea) {
      dbMonster = await Monster.findOne({ name: nextArea.monsterName });
    }
    if (!dbMonster) {
      dbMonster = { name: 'Varjohahmo', hp: '25', level: '1' };
    }

    session.currentAreaIndex = nextAreaIndex;
    session.currentMonsterName = dbMonster.name;
    session.currentMonsterLevel = parseInt(dbMonster.level) || 1;
    session.currentMonsterHp = parseInt(dbMonster.hp) || 25;
    session.currentMonsterCssClass = dbMonster.cssClass || 'varjohahmo';
    session.hasEnteredCombat = false;
    session.combatInitiative = null;
    session.currentTurn = null;

    // 🧑‍🤝‍🧑 Kumppani paranee täyteen kuntoon nuotiolla ja palaa mukaan jos oli kaatunut
    if (session.companionFound) {
      const wasDown = !session.companionActive;
      const stats = getCompanionStatsForLevel(session.stats.level);
      session.companionActive = true;
      session.companionMaxHp = stats.maxHp;
      session.companionDefense = stats.defense;
      session.companionHp = stats.maxHp;
      session.companionWeaponDurability = session.companionWeaponMaxDurability || 8;
      if (wasDown) {
        session.combatLogs = [...(session.combatLogs || []), `${session.companionName} toipuu nuotion ääressä ja liittyy taas rinnallesi.`];
      }
    }

    session.checkpoint = {
      xp: session.stats.xp,
      level: session.stats.level,
      maxHp: session.stats.maxHp,
      repairPoints: session.repairPoints // 🔥 Tallennettaan korjauspisteet matkan jatkuessa nuotiolta
    };

    session.stats.hp = session.stats.maxHp;
    if (session.inventory[0]) {
      session.inventory[0].durability = session.inventory[0].maxDurability;
    }

    session.markModified('stats');
    session.markModified('inventory');
    session.markModified('checkpoint');
    session.markModified('combatLogs');
    await session.save();

    const responseBody = await attachAreaToSession(session);
    res.json(responseBody);
  } catch (error) {
    res.status(500).json({ message: 'Matkan jatkaminen epäonnistui', error: error.message });
  }
});

export default router;