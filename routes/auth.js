import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Log from '../models/Log.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'ikimetsa_salaisuus_123';

// HTTPOnly-evästeen suojatut asetukset
const cookieOptions = {
  httpOnly: true,    // Estää frontin JavaScriptiä koskemasta tokeniin (XSS-suoja)
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict', // CSRF-suojaus
  maxAge: 24 * 60 * 60 * 1000 // 1 päivä
};

// REKISTERÖITYMINEN
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Käyttäjänimi ja salasana vaaditaan' });
    }

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

    // Kirjoitetaan JWT evästeeseen
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

    // Kirjoitetaan JWT evästeeseen
    res.cookie('token', token, cookieOptions);

    const newLog = new Log({
      action: 'USER_LOGIN',
      details: `Käyttäjä ${username} kirjautui sisään`,
      performedBy: username
    });
    await newLog.save();

    const GameSession = (await import('../models/GameSession.js')).default;
    const session = await GameSession.findOne({ userId: user._id });

    res.json({
      username: user.username,
      gameSessionId: session ? session._id : null, // Tämä ohjataan sessionStorageen
      session: session || null
    });
  } catch (error) {
    res.status(500).json({ message: 'Palvelinvirhe kirjautumisessa', error: error.message });
  }
});

// ISTUNNON TARKISTUS SIVUN PÄIVITYKSESSÄ (Luetaan evästeistä)
router.get('/me', async (req, res) => {
  try {
    const token = req.cookies.token; // 🍪 Luetaan suoraan OnlyCookies-rakenteesta
    if (!token) {
      return res.status(401).json({ message: 'Ei tokenia' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const GameSession = (await import('../models/GameSession.js')).default;
    const session = await GameSession.findOne({ userId: decoded.id });

    res.json({
      loggedIn: true,
      gameSessionId: session ? session._id : null,
      session: session || null
    });
  } catch (error) {
    res.status(401).json({ message: 'Istunto vanhentunut' });
  }
});

// ULOSKIRJAUTUMINEN (Tyhjennetään eväste kokonaan)
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Kirjauduttu ulos ja evästeet pyyhitty' });
});

export default router;