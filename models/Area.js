import mongoose from 'mongoose';

// 🗺️ ALUE: yksi liikkumisosuus + sen päässä odottava hirviö. Alueet käydään läpi
// order-kentän mukaisessa järjestyksessä (1-10). Kun hirviö kaadetaan, /continue-journey
// siirtää pelaajan seuraavaan alueeseen. Kuolema EI vaihda aluetta - respawn palauttaa
// aina samaan alueeseen jossa checkpoint viimeksi asetettiin.
const areaSchema = new mongoose.Schema({
  order: { type: Number, required: true, unique: true }, // 1-10
  name: { type: String, required: true }, // esim. "Suo"
  locationLabel: { type: String, required: true }, // liikkumisruudun otsikko, esim. "SIJAINTI: SUO"
  monsterName: { type: String, required: true }, // viittaa Monster.name-kenttään
  encounterText: { type: String, required: true }, // teksti kun kuutonen heitetään ja taistelu alkaa
  backgroundClass: { type: String, default: 'traveling-background' }, // 🎨 Liikkumisruudun tausta-animaation CSS-luokka (MovementStyles.css)
  goodRollTexts: { type: [String], default: [] }, // satunnaisesti arvottava teksti heitoille 3-5
  badRollTexts: { type: [String], default: [] }, // satunnaisesti arvottava teksti heitoille 1-2
  mechanic: { type: String, default: 'normal' } // 'normal' | 'swamp_sink' jne - laajennettavissa myöhemmin
});

export default mongoose.model('Area', areaSchema);