import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Log from '../models/Log.js';
import Area from '../models/Area.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('❌ JWT_SECRET puuttuu .env-tiedostosta - palvelinta ei käynnistetä turvattomalla oletusarvolla.');
}
const TOTAL_AREAS = 10;

// 🗺️ Alue-liitäntähelpperi
const attachAreaIfSession = async (session) => {
  if (!session) return null;
  const areaOrder = Math.min(parseInt(session.currentAreaIndex) || 1, TOTAL_AREAS);
  const area = await Area.findOne({ order: areaOrder });
  const sessionObject = session.toObject ? session.toObject() : session;
  return { ...sessionObject, currentArea: area || null };
};

// HTTPOnly-evästeen suojatut asetukset
const cookieOptions = {
  httpOnly: true,    // Estää frontin JavaScriptiä koskemasta tokeniin (XSS-suoja)
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict', // CSRF-suojaus
  maxAge: 24 * 60 * 60 * 1000 // 1 päivä
};

// --- KÄYTTÄJÄTUNNUKSEN JA SALASANAN VALIDOINTISÄÄNNÖT ---
const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,30}$/;
const PASSWORD_MIN_LENGTH = 8;
const FORBIDDEN_CHARS_REGEX = /[<>$;`\\|]/;

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

// REKISTERÖITYMINEN
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

    const newUser = new User({
      username,
      password: hashedPassword
    });

    await newUser.save();

    const token = jwt.sign(
      { id: newUser._id, role: newUser.role },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.cookie('token', token, cookieOptions);

    const newLog = new Log({
      action: 'USER_REGISTER',
      details: `Uusi käyttäjä ${username} rekisteröityi ja kirjautui sisään`,
      performedBy: username
    });
    await newLog.save();

    res.status(201).json({
      username: newUser.username,
      gameSessionId: null,
      session: null
    });
  } catch (error) {
    res.status(500).json({ message: 'Palvelinvirhe rekisteröinnissä', error: error.message });
  }
});

// KIRJAUTUMINEN
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

    const token = jwt.sign(
      { id: user._id, role: user.role },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

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
      gameSessionId: session ? session._id : null,
      session: sessionWithArea
    });
  } catch (error) {
    res.status(500).json({ message: 'Palvelinvirhe kirjautumisessa', error: error.message });
  }
});

// ISTUNNON TARKISTUS SIVUN PÄIVITYKSESSÄ
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
      gameSessionId: session ? session._id : null,
      session: sessionWithArea
    });
  } catch (error) {
    res.status(401).json({ message: 'Istunto vanhentunut' });
  }
});

// 🔥 ULOSKIRJAUTUMINEN: Nollaa automaattisesti tietokannasta, jos peli oli suoritettu loppuun
router.post('/logout', async (req, res) => {
  try {
    const token = req.cookies.token;
    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET);
      const userId = decoded.id;

      const GameSession = (await import('../models/GameSession.js')).default;
      const session = await GameSession.findOne({ userId });
      
      // Jos peli on suoritettu läpi, tuhotaan pelitallennus taustalla
      if (session && session.isGameCompleted) {
        await GameSession.findOneAndDelete({ userId });
        
        const newLog = new Log({
          action: 'GAME_RESET_ON_LOGOUT',
          details: `Pelaajan voitettu peli nollattiin automaattisesti uloskirjautumisen yhteydessä.`,
          performedBy: userId
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

// KÄYTTÄJÄTUNNUKSEN VAIHTO
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

// SALASANAN VAIHTO
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

// OMAN TILIN POISTO
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

export default router;