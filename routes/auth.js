import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Log from '../models/Log.js';
import Area from '../models/Area.js';
import Monster from '../models/Monster.js';
import CharacterClass from '../models/CharacterClass.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('❌ JWT_SECRET puuttuu .env-tiedostosta - palvelinta ei käynnistetä turvattomalla oletusarvolla.');
}
const TOTAL_AREAS = 10;

const attachAreaIfSession = async (session) => {
  if (!session) return null;
  const areaOrder = Math.min(parseInt(session.currentAreaIndex) || 1, TOTAL_AREAS);
  const area = await Area.findOne({ order: areaOrder });
  const sessionObject = session.toObject ? session.toObject() : session;
  return { ...sessionObject, currentArea: area || null };
};

const isProduction = process.env.NODE_ENV === 'production';

const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? 'none' : 'lax',
  maxAge: 24 * 60 * 60 * 1000
};

const USERNAME_REGEX = /^[a-zA-ZäöåÄÖÅ0-9_-]{3,30}$/;
const PASSWORD_MIN_LENGTH = 8;
const FORBIDDEN_CHARS_REGEX = /[<>$;`\\|]/;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN;
if (!JWT_EXPIRES_IN) {
  throw new Error('❌ JWT_EXPIRES_IN puuttuu .env-tiedostosta.');
}

function validateUsername(username) {
  if (typeof username !== 'string' || username.trim().length === 0) {
    return 'Käyttäjätunnus vaaditaan';
  }
  if (FORBIDDEN_CHARS_REGEX.test(username)) {
    return 'Käyttäjätunnus sisältää kiellettyjä merkkejä';
  }
  if (!USERNAME_REGEX.test(username)) {
    return 'Käyttäjätunnuksen pitää olla 3-30 merkkiä pitkä ja sisältää vain kirjaimia, numeroita, alaviivan tai väliviivan';
  }
  return null;
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    return 'Salasana vaaditaan';
  }
  if (FORBIDDEN_CHARS_REGEX.test(password)) {
    return 'Salasana sisältää kiellettyjä merkkejä';
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return 'Salasanan pitää olla vähintään 8 merkkiä pitkä';
  }
  return null;
}

function getUserIdFromRequest(req) {
  const token = req.cookies.token;
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded.id;
  } catch (error) {
    return null;
  }
}

function getAuthFromRequest(req) {
  const token = req.cookies.token;
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return { id: decoded.id, role: decoded.role };
  } catch (error) {
    return null;
  }
}

router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Käyttäjänimi ja salasana vaaditaan' });
    }

    const usernameError = validateUsername(username);
    if (usernameError) return res.status(400).json({ message: usernameError });

    const passwordError = validatePassword(password);
    if (passwordError) return res.status(400).json({ message: passwordError });

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: 'Käyttäjänimi on jo varattu' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();

    const token = jwt.sign({ id: newUser._id, role: newUser.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    res.cookie('token', token, cookieOptions);

    const newLog = new Log({
      action: 'USER_REGISTER',
      details: `Uusi käyttäjä ${username} rekisteröityi ja kirjautui sisään`,
      performedBy: username
    });
    await newLog.save();

    res.status(201).json({ username: newUser.username, gameSessionId: null, session: null });
  } catch (error) {
    res.status(500).json({ message: 'Palvelinvirhe rekisteröinnissä', error: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ message: 'Väärä käyttäjänimi tai salasana' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Väärä käyttäjänimi tai salasana' });
    }

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    res.cookie('token', token, cookieOptions);

    const newLog = new Log({
      action: 'USER_LOGIN',
      details: `Käyttäjä ${username} kirjautui sisään`,
      performedBy: username
    });
    await newLog.save();

    const GameSession = (await import('../models/GameSession.js')).default;
    const session = await GameSession.findOne({ userId: user._id });
    const sessionWithArea = await attachAreaIfSession(session);

    res.json({
      username: user.username,
      role: user.role,
      gameSessionId: session ? session._id : null,
      session: sessionWithArea
    });
  } catch (error) {
    res.status(500).json({ message: 'Palvelinvirhe kirjautumisessa', error: error.message });
  }
});

router.get('/me', async (req, res) => {
  try {
    const token = req.cookies.token;
    if (!token) {
      return res.status(401).json({ message: 'Ei tokenia' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ message: 'Käyttäjää ei löytynyt' });
    }

    const GameSession = (await import('../models/GameSession.js')).default;
    const session = await GameSession.findOne({ userId: decoded.id });
    const sessionWithArea = await attachAreaIfSession(session);

    res.json({
      loggedIn: true,
      username: user.username,
      role: user.role,
      gameSessionId: session ? session._id : null,
      session: sessionWithArea
    });
  } catch (error) {
    res.status(401).json({ message: 'Istunto vanhentunut' });
  }
});

router.post('/logout', async (req, res) => {
  try {
    const token = req.cookies.token;
    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET);
      const userId = decoded.id;

      const loggedOutUser = await User.findById(userId);
      const logoutName = loggedOutUser ? loggedOutUser.username : 'Tuntematon';

      const newLogoutLog = new Log({
        action: 'USER_LOGOUT',
        details: `Käyttäjä ${logoutName} kirjautui ulos`,
        performedBy: logoutName
      });
      await newLogoutLog.save();

      const GameSession = (await import('../models/GameSession.js')).default;
      const session = await GameSession.findOne({ userId });

      if (session && session.isGameCompleted) {
        await GameSession.findOneAndDelete({ userId });

        const newLog = new Log({
          action: 'GAME_RESET_ON_LOGOUT',
          details: `Pelaajan voitettu peli nollattiin automaattisesti uloskirjautumisen yhteydessä.`,
          performedBy: logoutName
        });
        await newLog.save();
      }
    }
  } catch (e) {
    console.error("Virhe istunnon nollauksessa uloskirjautuessa:", e);
  }

  res.clearCookie('token', cookieOptions);
  res.json({ message: 'Kirjauduttu ulos ja evästeet pyyhitty' });
});

router.patch('/username', async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Ei oikeuksia' });
    }

    const { newUsername, currentPassword } = req.body;

    const usernameError = validateUsername(newUsername);
    if (usernameError) return res.status(400).json({ message: usernameError });

    if (!currentPassword) {
      return res.status(400).json({ message: 'Nykyinen salasana vaaditaan vahvistukseksi' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Käyttäjää ei löytynyt' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Väärä salasana' });
    }

    const existingUser = await User.findOne({ username: newUsername });
    if (existingUser && String(existingUser._id) !== String(user._id)) {
      return res.status(400).json({ message: 'Käyttäjätunnus on jo varattu' });
    }

    const oldUsername = user.username;
    user.username = newUsername;
    await user.save();

    const newLog = new Log({
      action: 'USER_USERNAME_CHANGE',
      details: `Käyttäjä vaihtoi tunnuksen ${oldUsername} -> ${newUsername}`,
      performedBy: newUsername
    });
    await newLog.save();

    res.json({ username: user.username });
  } catch (error) {
    res.status(500).json({ message: 'Palvelinvirhe käyttäjätunnuksen vaihdossa', error: error.message });
  }
});

router.patch('/password', async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Ei oikeuksia' });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword) {
      return res.status(400).json({ message: 'Nykyinen salasana vaaditaan' });
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) return res.status(400).json({ message: passwordError });

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Käyttäjää ei löytynyt' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Väärä nykyinen salasana' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    const newLog = new Log({
      action: 'USER_PASSWORD_CHANGE',
      details: `Käyttäjä ${user.username} vaihtoi salasanansa`,
      performedBy: user.username
    });
    await newLog.save();

    res.json({ message: 'Salasana vaihdettu onnistuneesti' });
  } catch (error) {
    res.status(500).json({ message: 'Palvelinvirhe salasanan vaihdossa', error: error.message });
  }
});

router.delete('/account', async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Ei oikeuksia' });
    }

    const { currentPassword } = req.body;

    if (!currentPassword) {
      return res.status(400).json({ message: 'Nykyinen salasana vaaditaan tilin poistoon' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Käyttäjää ei löytynyt' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Väärä salasana' });
    }

    if (user.role === 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount <= 1) {
        return res.status(403).json({ message: 'Et voi poistaa tiliäsi, koska olet järjestelmän ainoa ylläpitäjä. Nimitä ensin toinen ylläpitäjä.' });
      }
    }

    const deletedUsername = user.username;

    const GameSession = (await import('../models/GameSession.js')).default;
    await GameSession.deleteOne({ userId: user._id });
    await User.deleteOne({ _id: user._id });

    const newLog = new Log({
      action: 'USER_ACCOUNT_DELETE',
      details: `Käyttäjä ${deletedUsername} poisti oman tilinsä ja pelitietonsa`,
      performedBy: deletedUsername
    });
    await newLog.save();

    res.clearCookie('token', cookieOptions);
    res.json({ message: 'Tili ja pelitiedot poistettu' });
  } catch (error) {
    res.status(500).json({ message: 'Palvelinvirhe tilin poistossa', error: error.message });
  }
});

async function requireAdmin(req, res) {
  const auth = getAuthFromRequest(req);
  if (!auth || !auth.id) {
    res.status(401).json({ message: 'Ei oikeuksia' });
    return null;
  }
  if (auth.role !== 'admin') {
    res.status(403).json({ message: 'Vain ylläpitäjillä on pääsy tähän.' });
    return null;
  }
  return auth;
}

router.get('/admin/users', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const users = await User.find({}, 'username role createdAt').sort({ createdAt: -1 });
    res.json({ users, currentAdminId: admin.id });
  } catch (error) {
    res.status(500).json({ message: 'Käyttäjien haku epäonnistui', error: error.message });
  }
});

router.get('/admin/logs', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const adminRelevantActions = [
      'USER_REGISTER',
      'USER_LOGIN',
      'USER_LOGOUT',
      'USER_USERNAME_CHANGE',
      'USER_PASSWORD_CHANGE',
      'USER_ACCOUNT_DELETE',
      'ADMIN_USER_DELETE',
      'ADMIN_ROLE_CHANGE',
      'ADMIN_MONSTER_UPDATE',
      'ADMIN_CHARACTER_UPDATE'
    ];

    const logs = await Log.find({ action: { $in: adminRelevantActions } })
      .sort({ createdAt: -1 })
      .limit(500);
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ message: 'Lokien haku epäonnistui', error: error.message });
  }
});

router.patch('/admin/user/:id/role', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const targetId = req.params.id;
    const { role } = req.body;

    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Virheellinen rooli.' });
    }

    if (targetId === admin.id && role !== 'admin') {
      return res.status(403).json({ message: 'Et voi poistaa omaa ylläpitäjän rooliasi.' });
    }

    const target = await User.findById(targetId);
    if (!target) {
      return res.status(404).json({ message: 'Käyttäjää ei löytynyt' });
    }

    if (target.role === 'admin' && role !== 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount <= 1) {
        return res.status(403).json({ message: 'Järjestelmässä on oltava vähintään yksi ylläpitäjä.' });
      }
    }

    const oldRole = target.role;
    target.role = role;
    await target.save();

    const adminUser = await User.findById(admin.id);
    const newLog = new Log({
      action: 'ADMIN_ROLE_CHANGE',
      details: `Rooli vaihdettu käyttäjälle ${target.username}: ${oldRole} -> ${role}`,
      performedBy: adminUser ? adminUser.username : 'Tuntematon ylläpitäjä'
    });
    await newLog.save();

    res.json({ message: 'Rooli päivitetty', username: target.username, role: target.role });
  } catch (error) {
    res.status(500).json({ message: 'Roolin vaihto epäonnistui', error: error.message });
  }
});

router.delete('/admin/user/:id', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const targetId = req.params.id;

    if (targetId === admin.id) {
      return res.status(403).json({ message: 'Et voi poistaa itseäsi ylläpitopaneelista.' });
    }

    const target = await User.findById(targetId);
    if (!target) {
      return res.status(404).json({ message: 'Käyttäjää ei löytynyt' });
    }

    const deletedUsername = target.username;

    const GameSession = (await import('../models/GameSession.js')).default;
    await GameSession.deleteOne({ userId: target._id });
    await User.deleteOne({ _id: target._id });

    const adminUser = await User.findById(admin.id);
    const newLog = new Log({
      action: 'ADMIN_USER_DELETE',
      details: `Ylläpitäjä poisti käyttäjän ${deletedUsername} ja hänen pelitietonsa`,
      performedBy: adminUser ? adminUser.username : 'Tuntematon ylläpitäjä'
    });
    await newLog.save();

    res.json({ message: 'Käyttäjä poistettu', username: deletedUsername });
  } catch (error) {
    res.status(500).json({ message: 'Käyttäjän poisto epäonnistui', error: error.message });
  }
});

router.get('/admin/monsters', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const monsters = await Monster.find({});
    monsters.sort((a, b) => (parseInt(a.level) || 0) - (parseInt(b.level) || 0));
    res.json({ monsters });
  } catch (error) {
    res.status(500).json({ message: 'Hirviöiden haku epäonnistui', error: error.message });
  }
});

router.patch('/admin/monster/:id', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const monster = await Monster.findById(req.params.id);
    if (!monster) {
      return res.status(404).json({ message: 'Hirviötä ei löytynyt' });
    }

    const { hp, defense, attackBonus, damageMax, xpReward, level } = req.body;

    if (hp !== undefined) monster.hp = String(hp);
    if (defense !== undefined) monster.defense = String(defense);
    if (attackBonus !== undefined) monster.attackBonus = String(attackBonus);
    if (damageMax !== undefined) monster.damageMax = String(damageMax);
    if (xpReward !== undefined) monster.xpReward = String(xpReward);
    if (level !== undefined) monster.level = String(level);

    await monster.save();

    const adminUser = await User.findById(admin.id);
    const newLog = new Log({
      action: 'ADMIN_MONSTER_UPDATE',
      details: `Ylläpitäjä muokkasi hirviötä "${monster.name}"`,
      performedBy: adminUser ? adminUser.username : 'Tuntematon ylläpitäjä'
    });
    await newLog.save();

    res.json({ monster });
  } catch (error) {
    res.status(500).json({ message: 'Hirviön muokkaus epäonnistui', error: error.message });
  }
});

router.get('/admin/characters', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const characters = await CharacterClass.find({});
    characters.sort((a, b) => (parseInt(a.baseHp) || 0) - (parseInt(b.baseHp) || 0));
    res.json({ characters });
  } catch (error) {
    res.status(500).json({ message: 'Hahmoluokkien haku epäonnistui', error: error.message });
  }
});

router.patch('/admin/character/:id', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const character = await CharacterClass.findById(req.params.id);
    if (!character) {
      return res.status(404).json({ message: 'Hahmoluokkaa ei löytynyt' });
    }

    const { baseHp, startingWeaponMaxDurability, initiativeBonus, baseDefense } = req.body;

    if (baseHp !== undefined) character.baseHp = String(baseHp);
    if (initiativeBonus !== undefined) character.initiativeBonus = String(initiativeBonus);
    if (baseDefense !== undefined) character.baseDefense = String(baseDefense);

    if (startingWeaponMaxDurability !== undefined) character.startingWeapon.maxDurability = String(startingWeaponMaxDurability);

    await character.save();

    const adminUser = await User.findById(admin.id);
    const newLog = new Log({
      action: 'ADMIN_CHARACTER_UPDATE',
      details: `Ylläpitäjä muokkasi hahmoluokkaa "${character.name}"`,
      performedBy: adminUser ? adminUser.username : 'Tuntematon ylläpitäjä'
    });
    await newLog.save();

    res.json({ character });
  } catch (error) {
    res.status(500).json({ message: 'Hahmoluokan muokkaus epäonnistui', error: error.message });
  }
});

export default router;