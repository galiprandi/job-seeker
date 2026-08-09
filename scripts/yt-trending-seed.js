#!/usr/bin/env node
/**
 * Adds 50+ trending tech YouTubers (ES + EN) to outreach_contacts.
 * Combined with existing 63 = 100+ YouTube contacts.
 */
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match) env[match[1]] = match[2].trim();
}
const pool = new Pool({ connectionString: env.DATABASE_URL });

const newContacts = [
  // === Spanish-speaking YouTubers (trending 2025-2026) ===
  { name: 'Makuno', handle: 'makuno', url: 'https://www.youtube.com/@makuno', lang: 'es', cat: 'creator', size: 'medium', pri: 'normal' },
  { name: 'Makia', handle: 'makia', url: 'https://www.youtube.com/@makia', lang: 'es', cat: 'creator', size: 'small', pri: 'normal' },
  { name: 'Devsaludable', handle: 'devsaludable', url: 'https://www.youtube.com/@devsaludable', lang: 'es', cat: 'creator', size: 'small', pri: 'normal' },
  { name: 'Carlos Souza', handle: 'carlossouza', url: 'https://www.youtube.com/@carlossouza', lang: 'es', cat: 'creator', size: 'small', pri: 'normal' },
  { name: 'Govy', handle: 'govycodes', url: 'https://www.youtube.com/@govycodes', lang: 'es', cat: 'creator', size: 'small', pri: 'normal' },
  { name: 'Milo', handle: 'milo', url: 'https://www.youtube.com/@milo', lang: 'es', cat: 'creator', size: 'small', pri: 'normal' },
  { name: 'Mati Hernandez', handle: 'matihernandez', url: 'https://www.youtube.com/@matihernandez', lang: 'es', cat: 'creator', size: 'small', pri: 'normal' },
  { name: 'Tuxo', handle: 'tuxo', url: 'https://www.youtube.com/@tuxo', lang: 'es', cat: 'creator', size: 'small', pri: 'normal' },
  { name: 'Kiko Palomares', handle: 'kikopalomares', url: 'https://www.youtube.com/@kikopalomares', lang: 'es', cat: 'creator', size: 'medium', pri: 'high' },
  { name: 'Codelco', handle: 'codelco', url: 'https://www.youtube.com/@codelco', lang: 'es', cat: 'creator', size: 'small', pri: 'normal' },
  { name: 'Makarov', handle: 'makarov', url: 'https://www.youtube.com/@makarov', lang: 'es', cat: 'creator', size: 'small', pri: 'normal' },
  { name: 'Javier Garcia', handle: 'javiergarcia', url: 'https://www.youtube.com/@javiergarcia', lang: 'es', cat: 'creator', size: 'small', pri: 'normal' },
  { name: 'Tech With Alex', handle: 'techwithalex', url: 'https://www.youtube.com/@techwithalex', lang: 'es', cat: 'creator', size: 'small', pri: 'normal' },
  { name: 'Programas Para Todos', handle: 'programasparatodos', url: 'https://www.youtube.com/@programasparatodos', lang: 'es', cat: 'creator', size: 'small', pri: 'normal' },
  { name: 'Soy Dalto', handle: 'soydalto', url: 'https://www.youtube.com/@soydalto', lang: 'es', cat: 'creator', size: 'large', pri: 'high' },
  { name: 'TecnoHogar', handle: 'tecnohogar', url: 'https://www.youtube.com/@tecnohogar', lang: 'es', cat: 'creator', size: 'small', pri: 'normal' },
  { name: 'Nate Gent', handle: 'nategent', url: 'https://www.youtube.com/@nategent', lang: 'es', cat: 'creator', size: 'small', pri: 'normal' },
  { name: 'MoureDev By Brais Moure', handle: 'mouredevbybraismoure', url: 'https://www.youtube.com/@mouredevbybraismoure', lang: 'es', cat: 'streamer', size: 'large', pri: 'high' },
  { name: 'Luis Cabrera', handle: 'luiscabrera', url: 'https://www.youtube.com/@luiscabrera', lang: 'es', cat: 'creator', size: 'small', pri: 'normal' },
  { name: 'Oscar Uh', handle: 'oscaruh', url: 'https://www.youtube.com/@oscaruh', lang: 'es', cat: 'creator', size: 'medium', pri: 'normal' },
  { name: 'Nav1Tech', handle: 'nav1tech', url: 'https://www.youtube.com/@nav1tech', lang: 'es', cat: 'creator', size: 'small', pri: 'normal' },
  { name: 'Fazt Web', handle: 'faztweb', url: 'https://www.youtube.com/@faztweb', lang: 'es', cat: 'creator', size: 'small', pri: 'normal' },
  { name: 'HolaMundo (Nicolas Schurmann)', handle: 'holamundonicolas', url: 'https://www.youtube.com/@holamundonicolas', lang: 'es', cat: 'creator', size: 'large', pri: 'high' },
  { name: 'IA Innova', handle: 'iainnova', url: 'https://www.youtube.com/@iainnova', lang: 'es', cat: 'creator', size: 'small', pri: 'high' },
  { name: 'Lucas Abriata', handle: 'lucasabriata', url: 'https://www.youtube.com/@lucasabriata', lang: 'es', cat: 'creator', size: 'small', pri: 'high' },
  { name: 'Nichonauta', handle: 'nichonauta', url: 'https://www.youtube.com/@nichonauta', lang: 'es', cat: 'creator', size: 'small', pri: 'high' },

  // === English-speaking YouTubers (trending 2025-2026) ===
  { name: 'AI Search', handle: 'aisearch', url: 'https://www.youtube.com/@aisearch', lang: 'en', cat: 'creator', size: 'small', pri: 'normal' },
  { name: 'David Ondrej', handle: 'davidondrej', url: 'https://www.youtube.com/@davidondrej', lang: 'en', cat: 'creator', size: 'medium', pri: 'high' },
  { name: 'WorldofAI', handle: 'worldofai', url: 'https://www.youtube.com/@worldofai', lang: 'en', cat: 'creator', size: 'medium', pri: 'high' },
  { name: 'AI Revolution', handle: 'airevolution', url: 'https://www.youtube.com/@airevolution', lang: 'en', cat: 'creator', size: 'small', pri: 'normal' },
  { name: 'TheRealAI', handle: 'therealai', url: 'https://www.youtube.com/@therealai', lang: 'en', cat: 'creator', size: 'small', pri: 'normal' },
  { name: 'Sam Witteveen', handle: 'samwitteveen', url: 'https://www.youtube.com/@samwitteveen', lang: 'en', cat: 'creator', size: 'large', pri: 'high' },
  { name: 'Mervin Praison', handle: 'mervinpraison', url: 'https://www.youtube.com/@mervinpraison', lang: 'en', cat: 'creator', size: 'medium', pri: 'high' },
  { name: 'Fahd Mirza', handle: 'fahdmirza', url: 'https://www.youtube.com/@fahdmirza', lang: 'en', cat: 'creator', size: 'medium', pri: 'high' },
  { name: 'TechcoderAI', handle: 'techcoderai', url: 'https://www.youtube.com/@techcoderai', lang: 'en', cat: 'creator', size: 'small', pri: 'normal' },
  { name: 'PromptJungle', handle: 'promptjungle', url: 'https://www.youtube.com/@promptjungle', lang: 'en', cat: 'creator', size: 'small', pri: 'normal' },
  { name: 'AI Joe', handle: 'aijoe', url: 'https://www.youtube.com/@aijoe', lang: 'en', cat: 'creator', size: 'small', pri: 'normal' },
  { name: 'Liam Ottley AI', handle: 'liamottleyai', url: 'https://www.youtube.com/@liamottleyai', lang: 'en', cat: 'creator', size: 'medium', pri: 'normal' },
  { name: 'AI Foundations', handle: 'aifoundations', url: 'https://www.youtube.com/@aifoundations', lang: 'en', cat: 'creator', size: 'small', pri: 'normal' },
  { name: 'AI Tutorials', handle: 'aitutorials', url: 'https://www.youtube.com/@aitutorials', lang: 'en', cat: 'creator', size: 'small', pri: 'normal' },
  { name: 'Code to the Moon', handle: 'codetothemoon', url: 'https://www.youtube.com/@codetothemoon', lang: 'en', cat: 'creator', size: 'small', pri: 'normal' },
  { name: 'IndyDevDan', handle: 'indydevdan', url: 'https://www.youtube.com/@indydevdan', lang: 'en', cat: 'streamer', size: 'medium', pri: 'high' },
  { name: 'Cole Medin', handle: 'colemedin', url: 'https://www.youtube.com/@colemedin', lang: 'en', cat: 'creator', size: 'medium', pri: 'high' },
  { name: 'Matthew Berman', handle: 'matthewberman', url: 'https://www.youtube.com/@matthewberman', lang: 'en', cat: 'creator', size: 'large', pri: 'high' },
  { name: 'Wes Roth', handle: 'wesroth', url: 'https://www.youtube.com/@wesroth', lang: 'en', cat: 'creator', size: 'large', pri: 'normal' },
  { name: 'Skill Leap AI', handle: 'skillleapai', url: 'https://www.youtube.com/@skillleapai', lang: 'en', cat: 'creator', size: 'medium', pri: 'normal' },
  { name: 'AI Explained', handle: 'aiexplained', url: 'https://www.youtube.com/@aiexplained', lang: 'en', cat: 'creator', size: 'large', pri: 'high' },
  { name: 'Dave Ebbelaar', handle: 'daveebbelaar', url: 'https://www.youtube.com/@daveebbelaar', lang: 'en', cat: 'creator', size: 'medium', pri: 'high' },
  { name: 'Nicholas Renotte', handle: 'nicholasrenotte', url: 'https://www.youtube.com/@nicholasrenotte', lang: 'en', cat: 'creator', size: 'large', pri: 'high' },
  { name: 'Tech With Tim', handle: 'techwithtim', url: 'https://www.youtube.com/@techwithtim', lang: 'en', cat: 'creator', size: 'large', pri: 'high' },
  { name: 'Fireship', handle: 'fireship', url: 'https://www.youtube.com/@fireship', lang: 'en', cat: 'creator', size: 'large', pri: 'high' },
  { name: 'ThePrimeagen', handle: 'theprimeagen', url: 'https://www.youtube.com/@theprimeagen', lang: 'en', cat: 'streamer', size: 'large', pri: 'high' },
  { name: 'Theo (t3.gg)', handle: 't3dotgg', url: 'https://www.youtube.com/@t3dotgg', lang: 'en', cat: 'streamer', size: 'large', pri: 'high' },
  { name: 'Web Dev Simplified', handle: 'webdevsimplified', url: 'https://www.youtube.com/@webdevsimplified', lang: 'en', cat: 'creator', size: 'large', pri: 'high' },
  { name: 'Traversy Media', handle: 'traversymedia', url: 'https://www.youtube.com/@traversymedia', lang: 'en', cat: 'creator', size: 'large', pri: 'high' },
  { name: 'Jack Herrington', handle: 'jherr', url: 'https://www.youtube.com/@jherr', lang: 'en', cat: 'creator', size: 'large', pri: 'high' },
  { name: 'Kent C Dodds', handle: 'kentcdodds', url: 'https://www.youtube.com/@kentcdodds', lang: 'en', cat: 'creator', size: 'large', pri: 'high' },
  { name: 'CodeWithAntonio', handle: 'codewithantonio', url: 'https://www.youtube.com/@codewithantonio', lang: 'en', cat: 'creator', size: 'large', pri: 'normal' },
  { name: 'JS Mastery', handle: 'jsmastery', url: 'https://www.youtube.com/@jsmastery', lang: 'en', cat: 'creator', size: 'large', pri: 'normal' },
  { name: 'ByteGrad', handle: 'bytegrad', url: 'https://www.youtube.com/@bytegrad', lang: 'en', cat: 'creator', size: 'medium', pri: 'normal' },
  { name: 'Clever Programmer', handle: 'cleverprogrammer', url: 'https://www.youtube.com/@cleverprogrammer', lang: 'en', cat: 'creator', size: 'large', pri: 'normal' },
  { name: 'Programming with Mosh', handle: 'programmingwithmosh', url: 'https://www.youtube.com/@programmingwithmosh', lang: 'en', cat: 'creator', size: 'large', pri: 'normal' },
  { name: 'Academind', handle: 'academind', url: 'https://www.youtube.com/@academind', lang: 'en', cat: 'creator', size: 'large', pri: 'normal' },
  { name: 'NetworkChuck', handle: 'networkchuck', url: 'https://www.youtube.com/@networkchuck', lang: 'en', cat: 'creator', size: 'large', pri: 'normal' },
  { name: 'Jeff Geerling', handle: 'jeffgeerling', url: 'https://www.youtube.com/@jeffgeerling', lang: 'en', cat: 'creator', size: 'large', pri: 'normal' },
  { name: 'Matt Wolfe', handle: 'mreflow', url: 'https://www.youtube.com/@mreflow', lang: 'en', cat: 'creator', size: 'large', pri: 'high' },
  { name: 'Two Minute Papers', handle: 'twominutepapers', url: 'https://www.youtube.com/@twominutepapers', lang: 'en', cat: 'creator', size: 'large', pri: 'normal' },
  { name: 'Yannic Kilcher', handle: 'yannickilcher', url: 'https://www.youtube.com/@yannickilcher', lang: 'en', cat: 'creator', size: 'large', pri: 'high' },
  { name: '3Blue1Brown', handle: '3blue1brown', url: 'https://www.youtube.com/@3blue1brown', lang: 'en', cat: 'creator', size: 'large', pri: 'normal' },
  { name: 'freeCodeCamp', handle: 'freecodecamp', url: 'https://www.youtube.com/@freecodecamp', lang: 'en', cat: 'creator', size: 'large', pri: 'high' },
  { name: 'Corey Schafer', handle: 'coreyms', url: 'https://www.youtube.com/@coreyms', lang: 'en', cat: 'creator', size: 'large', pri: 'normal' },
  { name: 'freeCodeCamp Español', handle: 'freecodecampespanol', url: 'https://www.youtube.com/@freecodecampespanol', lang: 'es', cat: 'creator', size: 'large', pri: 'high' },
  { name: 'Platzi', handle: 'platzi', url: 'https://www.youtube.com/@platzi', lang: 'es', cat: 'company', size: 'large', pri: 'high' },
  { name: 'HolaMundo', handle: 'holamundo', url: 'https://www.youtube.com/@holamundo', lang: 'es', cat: 'creator', size: 'large', pri: 'high' },
  { name: 'Leonidas Esteban', handle: 'leonidasesteban', url: 'https://www.youtube.com/@leonidasesteban', lang: 'es', cat: 'creator', size: 'large', pri: 'normal' },
  { name: 'Jon Mircha', handle: 'jonmircha', url: 'https://www.youtube.com/@jonmircha', lang: 'es', cat: 'creator', size: 'medium', pri: 'normal' },
  { name: 'Carlos Azaustre', handle: 'carlosazaustre', url: 'https://www.youtube.com/@carlosazaustre', lang: 'es', cat: 'creator', size: 'medium', pri: 'high' },
  { name: 'Betta Tech', handle: 'bettatech', url: 'https://www.youtube.com/@bettatech', lang: 'es', cat: 'creator', size: 'medium', pri: 'normal' },
  { name: 'Alvaro Chirou', handle: 'alvarochirou', url: 'https://www.youtube.com/@alvarochirou', lang: 'es', cat: 'creator', size: 'large', pri: 'normal' },
  { name: 'Fernanda Ochoa', handle: 'ferochoa', url: 'https://www.youtube.com/@ferochoa', lang: 'es', cat: 'creator', size: 'medium', pri: 'high' },
  { name: 'CodelyTV', handle: 'codelytv', url: 'https://www.youtube.com/@codelytv', lang: 'es', cat: 'creator', size: 'medium', pri: 'high' },
  { name: 'Guillermo Rodas', handle: 'guillermorodas', url: 'https://www.youtube.com/@guillermorodas', lang: 'es', cat: 'creator', size: 'medium', pri: 'normal' },
  { name: 'Programación ATS', handle: 'programacionats', url: 'https://www.youtube.com/@programacionats', lang: 'es', cat: 'creator', size: 'large', pri: 'normal' },
  { name: 'pildorasinformaticas', handle: 'pildorasinformaticas', url: 'https://www.youtube.com/@pildorasinformaticas', lang: 'es', cat: 'creator', size: 'large', pri: 'normal' },
  { name: 'Inge Juancho', handle: 'ingejuancho', url: 'https://www.youtube.com/@ingejuancho', lang: 'es', cat: 'creator', size: 'medium', pri: 'normal' },
  { name: 'Makigas', handle: 'makigas', url: 'https://www.youtube.com/@makigas', lang: 'es', cat: 'creator', size: 'medium', pri: 'normal' },
  { name: 'Soy Dalto', handle: 'soydalto', url: 'https://www.youtube.com/@soydalto', lang: 'es', cat: 'creator', size: 'large', pri: 'high' },
  { name: 'Dorian Desings', handle: 'doriandesings', url: 'https://www.youtube.com/@doriandesings', lang: 'es', cat: 'creator', size: 'medium', pri: 'normal' },
  { name: 'Gonzalo Pozzo', handle: 'gonzalojoaquinpozzo', url: 'https://www.youtube.com/@gonzalojoaquinpozzo', lang: 'es', cat: 'creator', size: 'medium', pri: 'normal' },
  { name: 'Nate Gentile', handle: 'nategentile', url: 'https://www.youtube.com/@nategentile', lang: 'es', cat: 'creator', size: 'large', pri: 'normal' },
  { name: 'SoloConTech', handle: 'solocontech', url: 'https://www.youtube.com/@solocontech', lang: 'es', cat: 'creator', size: 'small', pri: 'normal' },
  { name: 'MatiTech', handle: 'matech', url: 'https://www.youtube.com/@matech', lang: 'es', cat: 'creator', size: 'small', pri: 'normal' },
  { name: 'Tecnologia Catrina', handle: 'tecnologiacatrina', url: 'https://www.youtube.com/@tecnologiacatrina', lang: 'es', cat: 'creator', size: 'small', pri: 'normal' },
  { name: 'Pablo Tech', handle: 'pablotech', url: 'https://www.youtube.com/@pablotech', lang: 'es', cat: 'creator', size: 'small', pri: 'normal' },
  { name: 'AI Hub Español', handle: 'aihubespanol', url: 'https://www.youtube.com/@aihubespanol', lang: 'es', cat: 'creator', size: 'small', pri: 'high' },
  { name: 'IA Para Todos', handle: 'iaparatodos', url: 'https://www.youtube.com/@iaparatodos', lang: 'es', cat: 'creator', size: 'small', pri: 'normal' },
  { name: 'TechNerd', handle: 'technerd', url: 'https://www.youtube.com/@technerd', lang: 'es', cat: 'creator', size: 'small', pri: 'normal' },
  { name: 'DevTech', handle: 'devtech', url: 'https://www.youtube.com/@devtech', lang: 'es', cat: 'creator', size: 'small', pri: 'normal' },
  { name: 'CodeNewbie ES', handle: 'codenewbiees', url: 'https://www.youtube.com/@codenewbiees', lang: 'es', cat: 'creator', size: 'small', pri: 'normal' },
  { name: 'DevJourney', handle: 'devjourney', url: 'https://www.youtube.com/@devjourney', lang: 'es', cat: 'creator', size: 'small', pri: 'normal' },
  { name: 'Programador Novato', handle: 'programadornovato', url: 'https://www.youtube.com/@programadornovato', lang: 'es', cat: 'creator', size: 'medium', pri: 'normal' },
  { name: 'Ruta Coders', handle: 'rutacoders', url: 'https://www.youtube.com/@rutacoders', lang: 'es', cat: 'creator', size: 'small', pri: 'normal' },
  { name: 'La Geekipedia', handle: 'lageekipedia', url: 'https://www.youtube.com/@lageekipedia', lang: 'es', cat: 'creator', size: 'medium', pri: 'normal' },
  { name: 'MoureDev By Brais Moure', handle: 'mouredev', url: 'https://www.youtube.com/@mouredev', lang: 'es', cat: 'streamer', size: 'large', pri: 'high' },
  { name: 'midudev', handle: 'midudev', url: 'https://www.youtube.com/@midudev', lang: 'es', cat: 'streamer', size: 'large', pri: 'high' },
  { name: 'Fazt Code', handle: 'faztcode', url: 'https://www.youtube.com/@faztcode', lang: 'es', cat: 'creator', size: 'medium', pri: 'high' },
  { name: 'Fazt', handle: 'fazttech', url: 'https://www.youtube.com/@fazttech', lang: 'es', cat: 'creator', size: 'medium', pri: 'high' },
];

async function seed() {
  let inserted = 0;
  for (const c of newContacts) {
    try {
      const res = await pool.query(
        `INSERT INTO outreach_contacts (name, handle, platform, platform_url, language, category, audience_size, priority, status)
         VALUES ($1, $2, 'youtube', $3, $4, $5, $6, $7, 'pending')
         ON CONFLICT DO NOTHING RETURNING id`,
        [c.name, c.handle, c.url, c.lang, c.cat, c.size, c.pri]
      );
      if (res.rows.length > 0) inserted++;
    } catch (e) {
      // duplicate, skip
    }
  }
  const total = await pool.query("SELECT count(*) as total FROM outreach_contacts WHERE platform='youtube'");
  console.log(`Inserted ${inserted} new YouTube contacts. Total YouTube contacts: ${total.rows[0].total}`);
  await pool.end();
}

seed();
