import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Area from './models/Area.js';

// Ladataan ympäristömuuttujat .env-tiedostosta, jotta saadaan tietokantaosoite
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

export const seedAreas = async () => {
  try {
    if (!MONGODB_URI) {
      console.error('❌ Virhe: MONGODB_URI puuttuu .env-tiedostosta!');
      process.exit(1);
    }

    console.log('⏳ Yhdistetään tietokantaan alueiden asennusta varten...');
    await mongoose.connect(MONGODB_URI);
    console.log('🔗 Tietokantayhteys muodostettu!');

    console.log('🧹 Tyhjennetään vanhat alueet...');
    await Area.deleteMany({});

    console.log('🗺️ Asennetaan Ikimetsän 10 aluetta...');
    await Area.create([
      {
        order: 1,
        name: 'Metsän reuna',
        locationLabel: 'SIJAINTI: METSÄN POLKU',
        monsterName: 'Varjohahmo',
        backgroundClass: 'traveling-background',
        encounterText: 'Äkillinen kylmyys jähmettää askeleesi. Pimeys tiivistyy suoraan silmiesi edessä...',
        goodRollTexts: [
          'Etenet sakean sumun seassa. Metsä tuntuu tarkkailevan jokaista hengitystäsi.',
          'Polku jatkuu mutkitellen mustien kuusien lomassa.',
          'Kostea sammal vaimentaa askeleesi kokonaan.'
        ],
        badRollTexts: [
          'Oksat raapivat kasvojasi ja raskaat askeleet kaikuvat märkien puiden rungoista.',
          'Kompastut näkymättömään juureen ja kaadut lähes maahan.',
          'Piikkipensas repii vaatteesi kun yrität väistää sitä.'
        ]
      },
      {
        order: 2,
        name: 'Suo',
        locationLabel: 'SIJAINTI: SUO',
        monsterName: 'Suolieju',
        backgroundClass: 'traveling-background-suo',
        encounterText: 'Lieju kuohahtaa jalkojesi alla. Jokin nousee pinnan alta kohti sinua...',
        goodRollTexts: [
          'Löydät kiinteän polun mättäiden välistä ja etenet varovasti.',
          'Sammakot vaikenevat kun kuljet ohi - jokin muu on liikkeellä.',
          'Suoveden pinta väreilee, mutta jatkat matkaasi ehjin nahoin.'
        ],
        badRollTexts: [
          'Jalkasi uppoaa mustaan liejuun polveen asti ennen kuin saat sen irti.',
          'Löyhkäävä kaasu nousee suosta ja saa sinut yskimään.',
          'Liukastut limaisella mättäällä ja kastut vyötäröä myöten.'
        ]
      },
      {
        order: 3,
        name: 'Koski',
        locationLabel: 'SIJAINTI: KOSKI',
        monsterName: 'Koskenkuristaja',
        backgroundClass: 'traveling-background-koski',
        encounterText: 'Vesi kuohahtaa väkivaltaisesti kosken partaalla. Jokin valtava nousee virrasta...',
        goodRollTexts: [
          'Ylität liukkaat kivet kosken partaalla varmoin askelin.',
          'Kosken pauhu kaikuu kallioiden välissä, mutta polku pitää pintansa.',
          'Löydät kapean reitin veden vierestä ja etenet kuivin jaloin.'
        ],
        badRollTexts: [
          'Roiskuva vesi tekee kivistä liukkaita ja horjahdat vaarallisesti.',
          'Kylmä vesiroiske iskee kasvoihisi ja sokaisee hetkeksi.',
          'Jyrkkä rantatörmä pettää jalkojesi alla.'
        ]
      },
     {
        order: 4,
        name: 'Järvi',
        locationLabel: 'SIJAINTI: JÄRVI',
        monsterName: 'Suomuinen Järvikäärme',
        backgroundClass: 'traveling-background-jarvi',
        encounterText: 'Vesi kuohahtaa lautan alla. Jokin suomuinen nousee pinnalle aivan vieressäsi...',
        goodRollTexts: [
          'Soudat tasaisin vedoin, lautta liukuu tyynesti veden pinnalla.',
          'Airo uppoaa veteen äänettömästi, matka etenee vakaasti kohti toista rantaa.',
          'Löydät hyvän rytmin soutuun, ranta jää kauas taaksesi.'
        ],
        badRollTexts: [
          'Airo luiskahtaa käsistäsi hetkeksi, lautta kieppuu paikallaan.',
          'Aalto keikauttaa lauttaa ja kastut viileällä vedellä.',
          'Väsyneet käsivartesi tekevät soutamisesta raskasta ja hidasta.'
        ]
      }, 
      {
        order: 5,
        name: 'Luolasto',
        locationLabel: 'SIJAINTI: LUOLASTO',
        monsterName: 'Luolapeikko',
        backgroundClass: 'traveling-background-luolasto',
        encounterText: 'Pimeydestä kuuluu raskaita askeleita. Jotain massiivista liikkuu luolan syvyyksissä...',
        goodRollTexts: [
          'Etenet luolaston kapeaa käytävää pitkin soihtusi valossa.',
          'Tippakivet kilisevät hiljaa yläpuolellasi, mutta mitään ei tapahdu.',
          'Löydät tasaisen kohdan kivikossa ja etenet varmoin askelin.'
        ],
        badRollTexts: [
          'Lyöt päätäsi mataliin kattoihin ja horjahdat pimeydessä.',
          'Terävä kivi viiltää kättäsi kun tuet itseäsi seinään.',
          'Luolan kylmyys tunkeutuu luihisi asti.'
        ]
      },
      {
      order: 6,
      name: 'Luolasto (syvemmällä)',
      locationLabel: 'SIJAINTI: LUOLASTON SYVYYS',
      monsterName: 'Jättiläishämähäkki',
      backgroundClass: 'traveling-background-luolasto',
      encounterText: 'Verkkoja roikkuu joka puolella. Kahdeksan silmää tuikkii pimeydessä edessäsi...',
      companionEvent: {
        name: 'Aarne',
        // 🔥 TÄMÄ RIVI TÄYSIN YHDELLE RIVILLE ILMAN KONEEN ENTERIÄ:
        discoveryText: 'Soihtusi valo osuu paksuun hämähäkinseittiin kallion kolossa.\nSen sisällä tuskin hengittää sidottu hahmo - eksynyt vaeltaja, kokonaan seitin peitossa mutta yhä elossa.',
        weaponName: 'Ruosteinen tikari'
      },
        goodRollTexts: [
          'Väistät hämähäkinseittejä varovasti edetessäsi syvemmälle.',
          'Kuulet rapinaa kallion koloista, mutta mikään ei hyökkää.',
          'Löydät turvallisen reitin verkkojen lomasta.'
        ],
        badRollTexts: [
          'Tarrainen seitti tarttuu kasvoihisi ja saat sen irti vain vaivalla.',
          'Jokin pieni ja monijalkainen juoksee jalkasi yli.',
          'Ilma on raskas ja myrkyllinen syvällä luolastossa.'
        ]
      },
      {
        order: 7,
        name: 'Syvä metsä',
        locationLabel: 'SIJAINTI: SYVÄ METSÄ',
        monsterName: 'Metsäjättiläinen',
        backgroundClass: 'traveling-background-metsa',
        encounterText: 'Maa jyrisee jokaisesta askeleesta. Puiden latvat väistyvät jonkin valtavan tieltä...',
        goodRollTexts: [
          'Vanhat puut kaartuvat yllesi kuin holvikatto, ja polku on tasainen.',
          'Metsän eläimet pakenevat hiljaa - ne tietävät jotain mitä sinä et.',
          'Auringonvalo pilkottaa oksien läpi ja valaisee polkusi hetkeksi.'
        ],
        badRollTexts: [
          'Valtavat juuret nousevat maasta ja pakottavat sinut kiertämään.',
          'Raskas oksa putoaa lähelle sinua varoittamatta.',
          'Metsä tummenee entisestään ja suunta hämärtyy hetkeksi.'
        ]
      },
      {
        order: 8,
        name: 'Hautausmaa',
        locationLabel: 'SIJAINTI: HAUTAUSMAA',
        monsterName: 'Rypevä Zombie',
        backgroundClass: 'traveling-background-hautausmaa',
        encounterText: 'Multa alkaa liikkua lähimmän hautakiven juurella. Mätänevä käsi puskee pintaan...',
        goodRollTexts: [
          'Kuljet vanhojen hautakivien lomassa, nimet niissä jo kuluneet pois.',
          'Hiljaisuus hautausmaalla on painostava, mutta mitään ei liiku.',
          'Sumu leijuu matalalla ruohikon yllä kun etenet varovasti.'
        ],
        badRollTexts: [
          'Kaatunut hautakivi lähes kaatuu päällesi kun kompastut siihen.',
          'Maa tuntuu ontolta jalkojesi alla joka askeleella.',
          'Löyhkä mädäntyneestä maasta saa vatsasi kääntymään.'
        ]
      },
      {
        order: 9,
        name: 'Synkkä sydänmetsä',
        locationLabel: 'SIJAINTI: SYNKKÄ SYDÄNMETSÄ',
        monsterName: 'Ihmissusi',
        backgroundClass: 'traveling-background-sydänmetsä',
        encounterText: 'Ulvonta kaikuu aivan liian läheltä. Oksat ratisevat kun jokin juoksee kohti sinua...',
        goodRollTexts: [
          'Kuunvalo tuskin läpäisee tiheää lehvästöä, mutta polku pitää.',
          'Kuulet murinaa kaukaa, mutta se ei lähesty.',
          'Etenet hiljaa ja huomaamattomasti pimeimmän metsän läpi.'
        ],
        badRollTexts: [
          'Jokin juoksee ohitsesi pimeydessä liian nopeasti nähtäväksi.',
          'Piikkilanka-ohdakkeet repivät ihoasi joka askeleella.',
          'Ulvonta saa niskakarvasi nousemaan pystyyn.'
        ]
      },
      {
        order: 10,
        name: 'Ränsistynyt mökki',
        locationLabel: 'SIJAINTI: RÄNSISTYNYT MÖKKI',
        monsterName: 'Kirottujen Velho',
        backgroundClass: 'traveling-background-mökki',
        encounterText: 'Mökin ovi avautuu itsestään. Kylmä, violetti valo virtaa ulos pimeydestä...',
        goodRollTexts: [
          'Lähestyt ränsistynyttä mökkiä varovasti, lattialaudat eivät vielä narahda.',
          'Ikkunoiden takaa ei näy liikettä - toistaiseksi.',
          'Kynnyksen yli astuminen tuntuu raskaalta, mutta jatkat silti.'
        ],
        badRollTexts: [
          'Lahonnut lattialauta pettää jalkasi alla äänekkäästi.',
          'Kylmä veto mökin sisältä tuntuu kuin joku hengittäisi niskaasi.',
          'Vanha peili seinällä heijastaa jotain mikä ei ole sinä.'
        ]
      }
    ]);

    console.log('✅ Kaikki 10 aluetta asennettu onnistuneesti tietokantaan!');
  } catch (err) {
    console.error('❌ Alueiden asennus epäonnistui:', err);
  } finally {
    await mongoose.connection.close();
    console.log('👋 Yhteys suljettu. Asennus valmis!');
    process.exit(0);
  }
};

// 🚀 TÄMÄ KÄYNNISTÄÄ ASENNUKSEN kun tiedosto ajetaan komentoriviltä!
seedAreas();