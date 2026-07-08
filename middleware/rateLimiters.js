// 🚦 Pyyntörajoittimet (rate limiting)
//
// Estävät sekä palvelinta kuormittavat massapyynnöt (DoS) että salasanojen
// arvaamisen toistuvilla kirjautumisyrityksillä (brute force).

import rateLimit from 'express-rate-limit';

// Yleinen rajoitin kaikille API-reiteille - reilu raja normaalille pelaamiselle,
// mutta pysäyttää selvän väärinkäytön (esim. skripti joka pommittaa reittejä).
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuuttia
  max: 500, // per IP per ikkuna - pelaaminen klikkailee paljon, joten raja on väljä
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Liikaa pyyntöjä. Odota hetki ja yritä uudelleen.' }
});

// Tiukka rajoitin kirjautumiselle ja rekisteröinnille - estää salasanojen
// arvaamisen. Vähän yrityksiä lyhyessä ajassa riittää oikealle käyttäjälle.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuuttia
  max: 5, // per IP per ikkuna - normaali käyttäjä ei tarvitse enempää
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // onnistuneet kirjautumiset eivät kuluta kiintiötä
  message: { message: 'Liikaa kirjautumisyrityksiä. Yritä myöhemmin uudelleen.' }
});
