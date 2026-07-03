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

// 🗺️ Hakee session.currentAreaIndex:tä vastaavan Area-dokumentin ja liittää sen
// vastaukseen "currentArea"-kenttänä. Ei ole osa GameSession-skeemaa itsessään,
// vaan lasketaan aina tuoreeltaan vastausta rakennettaessa.
const attachAreaToSession = async (session) => {
  const areaOrder = Math.min(session.currentAreaIndex || 1, TOTAL_AREAS);
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

    // 🗺️ Ensimmäinen alue (order: 1) määrää ensimmäisen vastustajan - ei enää kovakoodattu
    let firstArea = await Area.findOne({ order: 1 });
    let firstMonsterName = firstArea ? firstArea.monsterName : 'Varjohahmo';

    let dbMonster = await Monster.findOne({ name: firstMonsterName });

    // Vararatkaisu vain jos tietokannassa ei jostain syystä ole vielä ladattuna mörköjä/alueita
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
      // 🔥 Ensimmäinen tallennuspiste on itse pelin alku - jos hahmo kuolee ennen ensimmäistä
      // voittoa, tänne palataan (nolla XP, taso 1, alkuperäinen maksimikunto)
      checkpoint: { xp: 0, level: 1, maxHp: hpValue }
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

// 🔥 Kuoleman jälkeinen paluu viimeisimpään tallennuspisteeseen (nuotioon).
// Palauttaa hahmon täyteen kuntoon ja täysiin korjauspisteisiin, säilyttäen
// tallennuspisteen kokemuspisteet/tason - ei nykyisiä, koska niitä ei ole vielä tallennettu.
// TÄRKEÄÄ: currentAreaIndex EI muutu tässä - kuolema palauttaa aina samaan alueeseen
// jossa checkpoint viimeksi asetettiin, ei alkuun asti.
const STARTING_REPAIR_POINTS = 5;

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

    // 🛡️ Palvelin päättää onko hahmo oikeasti kuollut - ei luoteta clientin väitteeseen
    if (session.stats.hp > 0) {
      return res.status(400).json({ message: 'Hahmo ei ole kuollut - paluuta tallennuspisteeseen ei voi tehdä.' });
    }

    // Haetaan tuore hirviö samalla tavalla kuin pelin alussa - sama hirviö/alue kuin ennen kuolemaa
    let dbMonster = await Monster.findOne({ name: session.currentMonsterName || 'Varjohahmo' });
    if (!dbMonster) {
      dbMonster = { name: 'Varjohahmo', hp: '25', level: '1' };
    }
    const freshMonsterHp = parseInt(dbMonster.hp) || 25;

    const checkpoint = session.checkpoint || { xp: 0, level: 1, maxHp: session.stats.maxHp || 40 };

    session.stats.xp = checkpoint.xp;
    session.stats.level = checkpoint.level;
    session.stats.maxHp = checkpoint.maxHp;
    session.stats.hp = checkpoint.maxHp;

    if (session.inventory[0]) {
      session.inventory[0].durability = session.inventory[0].maxDurability;
    }
    session.repairPoints = STARTING_REPAIR_POINTS;

    session.currentMonsterHp = freshMonsterHp;
    session.currentMonsterCssClass = dbMonster.cssClass || 'varjohahmo';
    session.combatInitiative = null;
    session.currentTurn = null;
    session.hasEnteredCombat = false;
    session.combatLogs = [`🔥 Heräät nuotion äärestä. Taipaleesi jatkuu tasolta ${checkpoint.level} (${checkpoint.xp} XP).`];

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

// 🔥 Voiton jälkeen: pelaaja lähtee nuotiolta jatkamaan matkaa SEURAAVAAN alueeseen.
// Tämä on kohta jossa aluejärjestys oikeasti etenee - currentAreaIndex kasvaa yhdellä,
// ja uusi alue määrää seuraavan hirviön. Jos pelaaja on jo viimeisellä alueella (Kirottujen
// Velho voitettu), jäädään toistaiseksi viimeiselle alueelle (peli ei vielä pääty erikseen).
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

    // 🛡️ Palvelin varmistaa ettei tätä voi kutsua kesken elävän taistelun tai kuolleena
    if (session.stats.hp <= 0) {
      return res.status(400).json({ message: 'Hahmo on kaatunut - käytä nuotiolta heräämistä.' });
    }
    if (session.currentMonsterHp > 0) {
      return res.status(400).json({ message: 'Nykyistä vastustajaa ei ole vielä voitettu.' });
    }

    const nextAreaIndex = Math.min((session.currentAreaIndex || 1) + 1, TOTAL_AREAS);
    const nextArea = await Area.findOne({ order: nextAreaIndex });

    let dbMonster = null;
    if (nextArea) {
      dbMonster = await Monster.findOne({ name: nextArea.monsterName });
    }
    if (!dbMonster) {
      dbMonster = { name: session.currentMonsterName || 'Varjohahmo', hp: '25', level: '1' };
    }

    session.currentAreaIndex = nextAreaIndex;
    session.currentMonsterName = dbMonster.name;
    session.currentMonsterLevel = parseInt(dbMonster.level) || 1;
    session.currentMonsterHp = parseInt(dbMonster.hp) || 25;
    session.currentMonsterCssClass = dbMonster.cssClass || 'varjohahmo';
    session.hasEnteredCombat = false;
    session.combatInitiative = null;
    session.currentTurn = null;
    session.combatLogs = [];

    // 🔥 Nuotiolla levätään oikeasti: täysi kunto ja korjattu ase, niin kuin tarinateksti lupaa
    session.stats.hp = session.stats.maxHp;
    if (session.inventory[0]) {
      session.inventory[0].durability = session.inventory[0].maxDurability;
    }

    session.markModified('stats');
    session.markModified('inventory');
    session.markModified('combatLogs');
    await session.save();

    const responseBody = await attachAreaToSession(session);
    res.json(responseBody);
  } catch (error) {
    res.status(500).json({ message: 'Matkan jatkaminen epäonnistui', error: error.message });
  }
});

export default router;