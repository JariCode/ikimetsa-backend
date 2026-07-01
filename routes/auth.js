import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Log from '../models/Log.js';

const router = express.Router();

// REKISTERÖITYMINEN
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Käyttäjänimi ja salasana vaaditaan' });
    }

    // Tarkistetaan onko käyttäjä jo olemassa
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: 'Käyttäjänimi on jo varattu' });
    }

    // Salataan salasana
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Luodaan uusi käyttäjä
    const newUser = new User({
      username,
      password: hashedPassword
    });

    await newUser.save();

    // Kirjoitetaan tapahtuma lokiin
    const newLog = new Log({
      action: 'USER_REGISTER',
      details: `Uusi käyttäjä ${username} rekisteröityi`,
      performedBy: username
    });
    await newLog.save();

    res.status(201).json({ message: 'Käyttäjätunnus luotu onnistuneesti' });
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

    // Tarkistetaan salasana
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Väärä käyttäjänimi tai salasana' });
    }

    // Luodaan JWT-token istuntoa varten (salaisuus luetaan .env tiedostosta)
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET || 'ikimetsa_salaisuus_123',
      { expiresIn: '1d' }
    );

    // Kirjoitetaan kirjautuminen lokiin
    const newLog = new Log({
      action: 'USER_LOGIN',
      details: `Käyttäjä ${username} kirjautui sisään`,
      performedBy: username
    });
    await newLog.save();

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Palvelinvirhe kirjautumisessa', error: error.message });
  }
});

export default router;