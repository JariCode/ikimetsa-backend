// 🧼 NoSQL-injektiosuojaus (Express 5 -yhteensopiva)
//
// MongoDB-operaattorit alkavat dollarimerkillä ($gt, $ne, $where ym.) ja pisteellä
// voi porautua sisäkkäisiin kenttiin. Jos hyökkääjä lähettää arvon sijaan objektin
// kuten { "$ne": null }, se voi ohittaa kirjautumisen tai vuotaa dataa.
//
// Tämä middleware puhdistaa req.body-, req.params- ja req.query-rakenteet poistamalla
// avaimet jotka alkavat $-merkillä tai sisältävät pisteen. Toisin kuin hylätty
// express-mongo-sanitize, tämä EI korvaa req.query-objektia (joka on Express 5:ssä
// read-only), vaan muokkaa avaimia paikan päällä, joten se toimii Express 5:ssä.

// Puhdistaa yksittäisen objektin rekursiivisesti poistamalla vaaralliset avaimet.
function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') return;

  for (const key of Object.keys(obj)) {
    // Poista avaimet jotka alkavat $-merkillä tai sisältävät pisteen
    if (key.startsWith('$') || key.includes('.')) {
      delete obj[key];
      continue;
    }
    // Käy rekursiivisesti läpi sisäkkäiset objektit ja taulukot
    const value = obj[key];
    if (value && typeof value === 'object') {
      sanitizeObject(value);
      // Jos sisäkkäinen objekti tyhjeni kokonaan puhdistuksessa (eli se sisälsi
      // vain vaarallisia $-operaattoreita), poista koko avain. Näin esim.
      // { username: { $ne: null } } ei jää muotoon { username: {} }, mikä voisi
      // silti sotkea Mongoose-kyselyn.
      if (!Array.isArray(value) && Object.keys(value).length === 0) {
        delete obj[key];
      }
    }
  }
}

// Express-middleware joka puhdistaa kaikki pyynnön käyttäjäsyötteet.
export default function sanitizeRequest(req, res, next) {
  // req.body ja req.params ovat muokattavia
  sanitizeObject(req.body);
  sanitizeObject(req.params);

  // req.query on Express 5:ssä read-only (getter), joten emme korvaa sitä vaan
  // puhdistamme sen avaimet paikan päällä. Jos se ei ole muokattavissa, ohitetaan
  // hiljaa - varsinaiset kyselyt käyttävät joka tapauksessa req.body:a.
  try {
    sanitizeObject(req.query);
  } catch (e) {
    // req.query saattaa olla suojattu Express 5:ssä; ei kaadeta pyyntöä tämän takia.
  }

  next();
}
