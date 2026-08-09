#!/usr/bin/env node
/**
 * Seeds the outreach_contacts table with 100+ streamers, creators and influencers.
 * Candidate-agnostic: no personal data of the user is stored here.
 * Run: node scripts/outreach-seed.js
 */
const { execSync } = require('child_process');

const contacts = [
  // === Spanish-speaking tech streamers/creators ===
  { name: 'midudev', handle: 'midudev', platform: 'twitch', platform_url: 'https://www.twitch.tv/midudev', language: 'es', category: 'streamer', audience_size: 'large', priority: 'high' },
  { name: 'midudev', handle: 'midudev', platform: 'youtube', platform_url: 'https://www.youtube.com/@midudev', language: 'es', category: 'streamer', audience_size: 'large', priority: 'high' },
  { name: 'midudev', handle: 'midudev', platform: 'twitter', platform_url: 'https://twitter.com/midudev', language: 'es', category: 'streamer', audience_size: 'large', priority: 'high' },
  { name: 'Fazt', handle: 'FaztCode', platform: 'youtube', platform_url: 'https://www.youtube.com/@FaztCode', language: 'es', category: 'creator', audience_size: 'medium', priority: 'high' },
  { name: 'Fazt', handle: 'fazttech', platform: 'twitter', platform_url: 'https://twitter.com/fazttech', language: 'es', category: 'creator', audience_size: 'medium', priority: 'high' },
  { name: 'Nicolas Schurmann', handle: 'nicolasschurmann', platform: 'youtube', platform_url: 'https://www.youtube.com/@nicolasschurmann', language: 'es', category: 'creator', audience_size: 'large', priority: 'high' },
  { name: 'HolaMundo', handle: 'holamundo', platform: 'youtube', platform_url: 'https://www.youtube.com/@HolaMundo', language: 'es', category: 'creator', audience_size: 'large', priority: 'high' },
  { name: 'MoureDev', handle: 'mouredev', platform: 'youtube', platform_url: 'https://www.youtube.com/@mouredev', language: 'es', category: 'streamer', audience_size: 'large', priority: 'high' },
  { name: 'MoureDev', handle: 'mouredev', platform: 'twitch', platform_url: 'https://www.twitch.tv/mouredev', language: 'es', category: 'streamer', audience_size: 'large', priority: 'high' },
  { name: 'Brais Moure', handle: 'mouredev', platform: 'twitter', platform_url: 'https://twitter.com/mouredev', language: 'es', category: 'streamer', audience_size: 'large', priority: 'high' },
  { name: 'Carlos Azaustre', handle: 'carlosazaustre', platform: 'youtube', platform_url: 'https://www.youtube.com/@carlosazaustre', language: 'es', category: 'creator', audience_size: 'medium', priority: 'high' },
  { name: 'Carlos Azaustre', handle: 'carlosazaustre', platform: 'twitter', platform_url: 'https://twitter.com/carlosazaustre', language: 'es', category: 'creator', audience_size: 'medium', priority: 'high' },
  { name: 'Betta Tech', handle: 'bettatech', platform: 'youtube', platform_url: 'https://www.youtube.com/@bettatech', language: 'es', category: 'creator', audience_size: 'medium', priority: 'normal' },
  { name: 'Leonidas Esteban', handle: 'leonidasesteban', platform: 'youtube', platform_url: 'https://www.youtube.com/@leonidasesteban', language: 'es', category: 'creator', audience_size: 'large', priority: 'normal' },
  { name: 'Jon Mircha', handle: 'jonmircha', platform: 'youtube', platform_url: 'https://www.youtube.com/@jonmircha', language: 'es', category: 'creator', audience_size: 'medium', priority: 'normal' },
  { name: 'freeCodeCamp Español', handle: 'freeCodeCampEspanol', platform: 'youtube', platform_url: 'https://www.youtube.com/@freeCodeCampEspanol', language: 'es', category: 'creator', audience_size: 'large', priority: 'high' },
  { name: 'Programación ATS', handle: 'programacionats', platform: 'youtube', platform_url: 'https://www.youtube.com/@programacionats', language: 'es', category: 'creator', audience_size: 'large', priority: 'normal' },
  { name: 'pildorasinformaticas', handle: 'pildorasinformaticas', platform: 'youtube', platform_url: 'https://www.youtube.com/@pildorasinformaticas', language: 'es', category: 'creator', audience_size: 'large', priority: 'normal' },
  { name: 'Fernanda Ochoa', handle: 'ferochoa', platform: 'youtube', platform_url: 'https://www.youtube.com/@ferochoa', language: 'es', category: 'creator', audience_size: 'medium', priority: 'high' },
  { name: 'Fernanda Ochoa', handle: 'ferochoa', platform: 'twitter', platform_url: 'https://twitter.com/ferochoa', language: 'es', category: 'creator', audience_size: 'medium', priority: 'high' },
  { name: 'Paulina Ochoa', handle: 'paulinaochoa', platform: 'youtube', platform_url: 'https://www.youtube.com/@paulinaochoa', language: 'es', category: 'creator', audience_size: 'small', priority: 'normal' },
  { name: 'Alvaro Chirou', handle: 'alvarochirou', platform: 'youtube', platform_url: 'https://www.youtube.com/@alvarochirou', language: 'es', category: 'creator', audience_size: 'large', priority: 'normal' },
  { name: 'Platzi', handle: 'platzi', platform: 'youtube', platform_url: 'https://www.youtube.com/@platzi', language: 'es', category: 'company', audience_size: 'large', priority: 'high' },
  { name: 'Platzi', handle: 'platzi', platform: 'twitter', platform_url: 'https://twitter.com/platzi', language: 'es', category: 'company', audience_size: 'large', priority: 'high' },
  { name: 'Freddy Vega', handle: 'freddyvega', platform: 'twitter', platform_url: 'https://twitter.com/freddyvega', language: 'es', category: 'creator', audience_size: 'large', priority: 'high' },
  { name: 'Inge Juancho', handle: 'ingejuancho', platform: 'youtube', platform_url: 'https://www.youtube.com/@ingejuancho', language: 'es', category: 'creator', audience_size: 'medium', priority: 'normal' },
  { name: 'Makigas', handle: 'makigas', platform: 'youtube', platform_url: 'https://www.youtube.com/@makigas', language: 'es', category: 'creator', audience_size: 'medium', priority: 'normal' },
  { name: 'CodelyTV', handle: 'CodelyTV', platform: 'youtube', platform_url: 'https://www.youtube.com/@CodelyTV', language: 'es', category: 'creator', audience_size: 'medium', priority: 'high' },
  { name: 'CodelyTV', handle: 'codelytv', platform: 'twitter', platform_url: 'https://twitter.com/codelytv', language: 'es', category: 'creator', audience_size: 'medium', priority: 'high' },
  { name: 'Rafa Gomez', handle: 'rafagomez', platform: 'youtube', platform_url: 'https://www.youtube.com/@rafagomez', language: 'es', category: 'creator', audience_size: 'small', priority: 'normal' },
  { name: 'Oscar Barajas', handle: 'oscarbarajas', platform: 'twitch', platform_url: 'https://www.twitch.tv/oscarbarajas', language: 'es', category: 'streamer', audience_size: 'medium', priority: 'normal' },
  { name: 'Oscar Barajas', handle: 'oscarbarajas', platform: 'youtube', platform_url: 'https://www.youtube.com/@oscarbarajas', language: 'es', category: 'streamer', audience_size: 'medium', priority: 'normal' },
  { name: 'Gonzalo Pozzo', handle: 'gonzalojoaquínpozzo', platform: 'youtube', platform_url: 'https://www.youtube.com/@gonzalojoaquinpozzo', language: 'es', category: 'creator', audience_size: 'medium', priority: 'normal' },
  { name: 'DorianDesings', handle: 'DorianDesings', platform: 'youtube', platform_url: 'https://www.youtube.com/@DorianDesings', language: 'es', category: 'creator', audience_size: 'medium', priority: 'normal' },
  { name: 'Jonatan Aristequi', handle: 'jonatanaristequi', platform: 'youtube', platform_url: 'https://www.youtube.com/@jonatanaristequi', language: 'es', category: 'creator', audience_size: 'small', priority: 'normal' },
  { name: 'MiduDev (LinkedIn)', handle: 'midudev', platform: 'linkedin', platform_url: 'https://www.linkedin.com/in/midudev', language: 'es', category: 'streamer', audience_size: 'large', priority: 'high' },
  { name: 'MoureDev (LinkedIn)', handle: 'mouredev', platform: 'linkedin', platform_url: 'https://www.linkedin.com/in/mouredev', language: 'es', category: 'streamer', audience_size: 'large', priority: 'high' },
  { name: 'Carlos Azaustre (LinkedIn)', handle: 'carlosazaustre', platform: 'linkedin', platform_url: 'https://www.linkedin.com/in/carlosazaustre', language: 'es', category: 'creator', audience_size: 'medium', priority: 'high' },
  { name: 'Fernanda Ochoa (LinkedIn)', handle: 'ferochoa', platform: 'linkedin', platform_url: 'https://www.linkedin.com/in/ferochoa', language: 'es', category: 'creator', audience_size: 'medium', priority: 'high' },
  { name: 'Nicolas Schurmann (LinkedIn)', handle: 'nicolasschurmann', platform: 'linkedin', platform_url: 'https://www.linkedin.com/in/nicolasschurmann', language: 'es', category: 'creator', audience_size: 'large', priority: 'high' },

  // === English-speaking tech streamers/creators ===
  { name: 'ThePrimeagen', handle: 'theprimeagen', platform: 'twitch', platform_url: 'https://www.twitch.tv/theprimeagen', language: 'en', category: 'streamer', audience_size: 'large', priority: 'high' },
  { name: 'ThePrimeagen', handle: 'theprimeagen', platform: 'youtube', platform_url: 'https://www.youtube.com/@theprimeagen', language: 'en', category: 'streamer', audience_size: 'large', priority: 'high' },
  { name: 'ThePrimeagen', handle: 'theprimeagen', platform: 'twitter', platform_url: 'https://twitter.com/theprimeagen', language: 'en', category: 'streamer', audience_size: 'large', priority: 'high' },
  { name: 'Theo (t3.gg)', handle: 't3dotgg', platform: 'youtube', platform_url: 'https://www.youtube.com/@t3dotgg', language: 'en', category: 'streamer', audience_size: 'large', priority: 'high' },
  { name: 'Theo (t3.gg)', handle: 'theo', platform: 'twitch', platform_url: 'https://www.twitch.tv/t3dotgg', language: 'en', category: 'streamer', audience_size: 'large', priority: 'high' },
  { name: 'Theo (t3.gg)', handle: 't3dotgg', platform: 'twitter', platform_url: 'https://twitter.com/t3dotgg', language: 'en', category: 'streamer', audience_size: 'large', priority: 'high' },
  { name: 'Fireship', handle: 'fireship_dev', platform: 'youtube', platform_url: 'https://www.youtube.com/@Fireship', language: 'en', category: 'creator', audience_size: 'large', priority: 'high' },
  { name: 'Fireship', handle: 'fireship_dev', platform: 'twitter', platform_url: 'https://twitter.com/fireship_dev', language: 'en', category: 'creator', audience_size: 'large', priority: 'high' },
  { name: 'Web Dev Simplified', handle: 'WebDevSimplified', platform: 'youtube', platform_url: 'https://www.youtube.com/@WebDevSimplified', language: 'en', category: 'creator', audience_size: 'large', priority: 'high' },
  { name: 'Web Dev Simplified', handle: 'WebDevSimplified', platform: 'twitter', platform_url: 'https://twitter.com/WebDevSimplified', language: 'en', category: 'creator', audience_size: 'large', priority: 'high' },
  { name: 'Traversy Media', handle: 'TraversyMedia', platform: 'youtube', platform_url: 'https://www.youtube.com/@TraversyMedia', language: 'en', category: 'creator', audience_size: 'large', priority: 'high' },
  { name: 'Traversy Media', handle: 'traversymedia', platform: 'twitter', platform_url: 'https://twitter.com/traversymedia', language: 'en', category: 'creator', audience_size: 'large', priority: 'high' },
  { name: 'freeCodeCamp', handle: 'freeCodeCamp', platform: 'youtube', platform_url: 'https://www.youtube.com/@freeCodeCamp', language: 'en', category: 'creator', audience_size: 'large', priority: 'high' },
  { name: 'freeCodeCamp', handle: 'freeCodeCamp', platform: 'twitter', platform_url: 'https://twitter.com/freeCodeCamp', language: 'en', category: 'creator', audience_size: 'large', priority: 'high' },
  { name: 'NetworkChuck', handle: 'networkchuck', platform: 'youtube', platform_url: 'https://www.youtube.com/@networkchuck', language: 'en', category: 'creator', audience_size: 'large', priority: 'normal' },
  { name: 'Jeff Geerling', handle: 'jeffgeerling', platform: 'youtube', platform_url: 'https://www.youtube.com/@jeffgeerling', language: 'en', category: 'creator', audience_size: 'large', priority: 'normal' },
  { name: 'Jeff Geerling', handle: 'geerlingguy', platform: 'twitter', platform_url: 'https://twitter.com/geerlingguy', language: 'en', category: 'creator', audience_size: 'large', priority: 'normal' },
  { name: 'Matt Wolfe', handle: 'mreflow', platform: 'youtube', platform_url: 'https://www.youtube.com/@mreflow', language: 'en', category: 'creator', audience_size: 'large', priority: 'high' },
  { name: 'Matt Wolfe', handle: 'mreflow', platform: 'twitter', platform_url: 'https://twitter.com/mreflow', language: 'en', category: 'creator', audience_size: 'large', priority: 'high' },
  { name: 'AI Explained', handle: 'aiexplained', platform: 'youtube', platform_url: 'https://www.youtube.com/@aiexplained', language: 'en', category: 'creator', audience_size: 'large', priority: 'high' },
  { name: 'Two Minute Papers', handle: 'TwoMinutePapers', platform: 'youtube', platform_url: 'https://www.youtube.com/@TwoMinutePapers', language: 'en', category: 'creator', audience_size: 'large', priority: 'normal' },
  { name: 'Yannic Kilcher', handle: 'YannicKilcher', platform: 'youtube', platform_url: 'https://www.youtube.com/@YannicKilcher', language: 'en', category: 'creator', audience_size: 'large', priority: 'high' },
  { name: '3Blue1Brown', handle: '3blue1brown', platform: 'youtube', platform_url: 'https://www.youtube.com/@3blue1brown', language: 'en', category: 'creator', audience_size: 'large', priority: 'normal' },
  { name: 'Latent Space', handle: 'latent_space', platform: 'twitter', platform_url: 'https://twitter.com/latent_space', language: 'en', category: 'newsletter', audience_size: 'medium', priority: 'high' },
  { name: 'Latent Space Podcast', handle: 'latent_space', platform: 'youtube', platform_url: 'https://www.youtube.com/@latent_space', language: 'en', category: 'podcast', audience_size: 'medium', priority: 'high' },
  { name: 'AI Jason', handle: 'aijason', platform: 'youtube', platform_url: 'https://www.youtube.com/@aijason', language: 'en', category: 'creator', audience_size: 'medium', priority: 'normal' },
  { name: 'Dave Ebbelaar', handle: 'daveebbelaar', platform: 'youtube', platform_url: 'https://www.youtube.com/@daveebbelaar', language: 'en', category: 'creator', audience_size: 'medium', priority: 'high' },
  { name: 'Dave Ebbelaar', handle: 'daveebbelaar', platform: 'twitter', platform_url: 'https://twitter.com/daveebbelaar', language: 'en', category: 'creator', audience_size: 'medium', priority: 'high' },
  { name: 'Nicholas Renotte', handle: 'nicholasrenotte', platform: 'youtube', platform_url: 'https://www.youtube.com/@nicholasrenotte', language: 'en', category: 'creator', audience_size: 'large', priority: 'high' },
  { name: 'Nicholas Renotte', handle: 'nickrenotte', platform: 'twitter', platform_url: 'https://twitter.com/nickrenotte', language: 'en', category: 'creator', audience_size: 'large', priority: 'high' },
  { name: 'Tech With Tim', handle: 'TechWithTim', platform: 'youtube', platform_url: 'https://www.youtube.com/@TechWithTim', language: 'en', category: 'creator', audience_size: 'large', priority: 'high' },
  { name: 'Tech With Tim', handle: 'techwithtim', platform: 'twitter', platform_url: 'https://twitter.com/techwithtim', language: 'en', category: 'creator', audience_size: 'large', priority: 'high' },
  { name: 'Corey Schafer', handle: 'coreyms', platform: 'youtube', platform_url: 'https://www.youtube.com/@coreyms', language: 'en', category: 'creator', audience_size: 'large', priority: 'normal' },
  { name: 'FCC (Quincy Larson)', handle: 'ossia', platform: 'twitter', platform_url: 'https://twitter.com/ossia', language: 'en', category: 'creator', audience_size: 'large', priority: 'high' },
  { name: 'Quincy Larson', handle: 'quincylarson', platform: 'linkedin', platform_url: 'https://www.linkedin.com/in/quincylarson', language: 'en', category: 'creator', audience_size: 'large', priority: 'high' },
  { name: 'Sahil Lavingia', handle: 'shl', platform: 'twitter', platform_url: 'https://twitter.com/shl', language: 'en', category: 'creator', audience_size: 'large', priority: 'normal' },
  { name: 'Pieter Levels', handle: 'levelsio', platform: 'twitter', platform_url: 'https://twitter.com/levelsio', language: 'en', category: 'creator', audience_size: 'large', priority: 'high' },
  { name: 'Marc Lou', handle: 'marc_louvion', platform: 'twitter', platform_url: 'https://twitter.com/marc_louvion', language: 'en', category: 'creator', audience_size: 'medium', priority: 'high' },
  { name: 'Marc Lou', handle: 'marc_louvion', platform: 'youtube', platform_url: 'https://www.youtube.com/@marc_louvion', language: 'en', category: 'creator', audience_size: 'medium', priority: 'high' },
  { name: 'Indie Maker (Danny Postma)', handle: 'dannypostmaa', platform: 'twitter', platform_url: 'https://twitter.com/dannypostmaa', language: 'en', category: 'creator', audience_size: 'medium', priority: 'normal' },
  { name: 'Dex Morgan', handle: 'dexmorgan', platform: 'youtube', platform_url: 'https://www.youtube.com/@dexmorgan', language: 'en', category: 'creator', audience_size: 'small', priority: 'normal' },

  // === AI / Agent focused creators ===
  { name: 'Matt Shumer', handle: 'mattshumer', platform: 'twitter', platform_url: 'https://twitter.com/mattshumer', language: 'en', category: 'ai-builder', audience_size: 'large', priority: 'high' },
  { name: 'Harrison Chase', handle: 'hwchase17', platform: 'twitter', platform_url: 'https://twitter.com/hwchase17', language: 'en', category: 'ai-builder', audience_size: 'large', priority: 'high' },
  { name: 'LangChain', handle: 'langchain', platform: 'twitter', platform_url: 'https://twitter.com/langchain', language: 'en', category: 'company', audience_size: 'large', priority: 'high' },
  { name: 'Cognition Labs', handle: 'cognition_labs', platform: 'twitter', platform_url: 'https://twitter.com/cognition_labs', language: 'en', category: 'company', audience_size: 'large', priority: 'high' },
  { name: 'Devin AI', handle: 'devin_ai', platform: 'twitter', platform_url: 'https://twitter.com/devin_ai', language: 'en', category: 'company', audience_size: 'large', priority: 'high' },
  { name: 'Andrej Karpathy', handle: 'karpathy', platform: 'twitter', platform_url: 'https://twitter.com/karpathy', language: 'en', category: 'ai-builder', audience_size: 'large', priority: 'high' },
  { name: 'Simon Willison', handle: 'simonw', platform: 'twitter', platform_url: 'https://twitter.com/simonw', language: 'en', category: 'creator', audience_size: 'large', priority: 'high' },
  { name: 'Simon Willison', handle: 'simonw', platform: 'linkedin', platform_url: 'https://www.linkedin.com/in/simonwillison', language: 'en', category: 'creator', audience_size: 'large', priority: 'high' },
  { name: 'Swyx', handle: 'swyx', platform: 'twitter', platform_url: 'https://twitter.com/swyx', language: 'en', category: 'creator', audience_size: 'large', priority: 'high' },
  { name: 'Latent Space (Swyx)', handle: 'swyx', platform: 'linkedin', platform_url: 'https://www.linkedin.com/in/swyx', language: 'en', category: 'creator', audience_size: 'large', priority: 'high' },
  { name: 'Alessio Fanelli', handle: 'fanales', platform: 'twitter', platform_url: 'https://twitter.com/fanales', language: 'en', category: 'podcast', audience_size: 'medium', priority: 'high' },
  { name: 'Smol AI', handle: 'smol_ai', platform: 'twitter', platform_url: 'https://twitter.com/smol_ai', language: 'en', category: 'community', audience_size: 'medium', priority: 'normal' },
  { name: 'AI Jason (LinkedIn)', handle: 'aijason', platform: 'linkedin', platform_url: 'https://www.linkedin.com/in/aijason', language: 'en', category: 'creator', audience_size: 'medium', priority: 'normal' },
  { name: 'Matt Wolfe (LinkedIn)', handle: 'mreflow', platform: 'linkedin', platform_url: 'https://www.linkedin.com/in/mreflow', language: 'en', category: 'creator', audience_size: 'large', priority: 'high' },
  { name: 'Nicholas Renotte (LinkedIn)', handle: 'nicholasrenotte', platform: 'linkedin', platform_url: 'https://www.linkedin.com/in/nicholasrenotte', language: 'en', category: 'creator', audience_size: 'large', priority: 'high' },
  { name: 'Tech With Tim (LinkedIn)', handle: 'techwithtim', platform: 'linkedin', platform_url: 'https://www.linkedin.com/in/techwithtim', language: 'en', category: 'creator', audience_size: 'large', priority: 'high' },
  { name: 'Traversy Media (LinkedIn)', handle: 'traversymedia', platform: 'linkedin', platform_url: 'https://www.linkedin.com/in/traversymedia', language: 'en', category: 'creator', audience_size: 'large', priority: 'high' },
  { name: 'Fireship (LinkedIn)', handle: 'fireship_dev', platform: 'linkedin', platform_url: 'https://www.linkedin.com/in/fireship_dev', language: 'en', category: 'creator', audience_size: 'large', priority: 'high' },
  { name: 'ThePrimeagen (LinkedIn)', handle: 'theprimeagen', platform: 'linkedin', platform_url: 'https://www.linkedin.com/in/theprimeagen', language: 'en', category: 'streamer', audience_size: 'large', priority: 'high' },
  { name: 'Theo (LinkedIn)', handle: 't3dotgg', platform: 'linkedin', platform_url: 'https://www.linkedin.com/in/t3dotgg', language: 'en', category: 'streamer', audience_size: 'large', priority: 'high' },

  // === Dev tools / OSS communities ===
  { name: 'GitHub', handle: 'github', platform: 'twitter', platform_url: 'https://twitter.com/github', language: 'en', category: 'company', audience_size: 'large', priority: 'normal' },
  { name: 'Vercel', handle: 'vercel', platform: 'twitter', platform_url: 'https://twitter.com/vercel', language: 'en', category: 'company', audience_size: 'large', priority: 'normal' },
  { name: 'Neon', handle: 'neondatabase', platform: 'twitter', platform_url: 'https://twitter.com/neondatabase', language: 'en', category: 'company', audience_size: 'medium', priority: 'high' },
  { name: 'Neon (LinkedIn)', handle: 'neondatabase', platform: 'linkedin', platform_url: 'https://www.linkedin.com/company/neondatabase', language: 'en', category: 'company', audience_size: 'medium', priority: 'high' },
  { name: 'Playwright', handle: 'playwrightweb', platform: 'twitter', platform_url: 'https://twitter.com/playwrightweb', language: 'en', category: 'company', audience_size: 'medium', priority: 'high' },
  { name: 'Cursor', handle: 'cursor_ai', platform: 'twitter', platform_url: 'https://twitter.com/cursor_ai', language: 'en', category: 'company', audience_size: 'large', priority: 'high' },
  { name: 'Anthropic', handle: 'anthropic', platform: 'twitter', platform_url: 'https://twitter.com/anthropic', language: 'en', category: 'company', audience_size: 'large', priority: 'normal' },
  { name: 'OpenAI', handle: 'openai', platform: 'twitter', platform_url: 'https://twitter.com/openai', language: 'en', category: 'company', audience_size: 'large', priority: 'normal' },
  { name: 'Hugging Face', handle: 'huggingface', platform: 'twitter', platform_url: 'https://twitter.com/huggingface', language: 'en', category: 'company', audience_size: 'large', priority: 'normal' },
  { name: 'Sourcegraph', handle: 'sourcegraph', platform: 'twitter', platform_url: 'https://twitter.com/sourcegraph', language: 'en', category: 'company', audience_size: 'medium', priority: 'high' },
  { name: 'Continue Dev', handle: 'continuedev', platform: 'twitter', platform_url: 'https://twitter.com/continuedev', language: 'en', category: 'company', audience_size: 'medium', priority: 'high' },
  { name: 'Aider', handle: 'aider_ai', platform: 'twitter', platform_url: 'https://twitter.com/aider_ai', language: 'en', category: 'oss', audience_size: 'medium', priority: 'high' },
  { name: 'Paul Grahahm', handle: 'paulg', platform: 'twitter', platform_url: 'https://twitter.com/paulg', language: 'en', category: 'creator', audience_size: 'large', priority: 'normal' },
  { name: 'Jason Calacanis', handle: 'jason', platform: 'twitter', platform_url: 'https://twitter.com/jason', language: 'en', category: 'creator', audience_size: 'large', priority: 'normal' },

  // === Reddit / HN / Dev.to communities ===
  { name: 'r/programming', handle: 'programming', platform: 'reddit', platform_url: 'https://www.reddit.com/r/programming', language: 'en', category: 'community', audience_size: 'large', priority: 'high' },
  { name: 'r/webdev', handle: 'webdev', platform: 'reddit', platform_url: 'https://www.reddit.com/r/webdev', language: 'en', category: 'community', audience_size: 'large', priority: 'high' },
  { name: 'r/cscareerquestions', handle: 'cscareerquestions', platform: 'reddit', platform_url: 'https://www.reddit.com/r/cscareerquestions', language: 'en', category: 'community', audience_size: 'large', priority: 'high' },
  { name: 'r/jobs', handle: 'jobs', platform: 'reddit', platform_url: 'https://www.reddit.com/r/jobs', language: 'en', category: 'community', audience_size: 'large', priority: 'high' },
  { name: 'r/artificial', handle: 'artificial', platform: 'reddit', platform_url: 'https://www.reddit.com/r/artificial', language: 'en', category: 'community', audience_size: 'large', priority: 'high' },
  { name: 'r/LocalLLaMA', handle: 'LocalLLaMA', platform: 'reddit', platform_url: 'https://www.reddit.com/r/LocalLLaMA', language: 'en', category: 'community', audience_size: 'large', priority: 'high' },
  { name: 'r/ChatGPTCoding', handle: 'ChatGPTCoding', platform: 'reddit', platform_url: 'https://www.reddit.com/r/ChatGPTCoding', language: 'en', category: 'community', audience_size: 'large', priority: 'high' },
  { name: 'r/learnprogramming', handle: 'learnprogramming', platform: 'reddit', platform_url: 'https://www.reddit.com/r/learnprogramming', language: 'en', category: 'community', audience_size: 'large', priority: 'normal' },
  { name: 'r/devops', handle: 'devops', platform: 'reddit', platform_url: 'https://www.reddit.com/r/devops', language: 'en', category: 'community', audience_size: 'large', priority: 'normal' },
  { name: 'r/SideProject', handle: 'SideProject', platform: 'reddit', platform_url: 'https://www.reddit.com/r/SideProject', language: 'en', category: 'community', audience_size: 'medium', priority: 'high' },
  { name: 'r/InternetIsBeautiful', handle: 'InternetIsBeautiful', platform: 'reddit', platform_url: 'https://www.reddit.com/r/InternetIsBeautiful', language: 'en', category: 'community', audience_size: 'medium', priority: 'normal' },
  { name: 'Hacker News', handle: 'news.ycombinator.com', platform: 'hn', platform_url: 'https://news.ycombinator.com', language: 'en', category: 'community', audience_size: 'large', priority: 'high' },
  { name: 'Dev.to', handle: 'dev.to', platform: 'dev.to', platform_url: 'https://dev.to', language: 'en', category: 'community', audience_size: 'large', priority: 'high' },
  { name: 'Product Hunt', handle: 'producthunt', platform: 'producthunt', platform_url: 'https://www.producthunt.com', language: 'en', category: 'community', audience_size: 'large', priority: 'high' },
  { name: 'Show HN', handle: 'news.ycombinator.com/show', platform: 'hn', platform_url: 'https://news.ycombinator.com/show', language: 'en', category: 'community', audience_size: 'large', priority: 'high' },

  // === More Spanish-speaking creators ===
  { name: 'Guillermo Rodas', handle: 'guillermorodas', platform: 'youtube', platform_url: 'https://www.youtube.com/@guillermorodas', language: 'es', category: 'creator', audience_size: 'medium', priority: 'normal' },
  { name: 'Uli Schmidt', handle: 'ulischmidt', platform: 'youtube', platform_url: 'https://www.youtube.com/@ulischmidt', language: 'es', category: 'creator', audience_size: 'medium', priority: 'normal' },
  { name: 'Ignacio Gutierrez', handle: 'ignaciogutierrez', platform: 'youtube', platform_url: 'https://www.youtube.com/@ignaciogutierrez', language: 'es', category: 'creator', audience_size: 'small', priority: 'normal' },
  { name: 'MiduDev (GitHub)', handle: 'midudev', platform: 'github', platform_url: 'https://github.com/midudev', language: 'es', category: 'streamer', audience_size: 'large', priority: 'high' },
  { name: 'MoureDev (GitHub)', handle: 'mouredev', platform: 'github', platform_url: 'https://github.com/mouredev', language: 'es', category: 'streamer', audience_size: 'large', priority: 'high' },
  { name: 'CodelyTV (GitHub)', handle: 'CodelyTV', platform: 'github', platform_url: 'https://github.com/CodelyTV', language: 'es', category: 'creator', audience_size: 'medium', priority: 'high' },
  { name: 'Fazt (GitHub)', handle: 'FaztCode', platform: 'github', platform_url: 'https://github.com/FaztCode', language: 'es', category: 'creator', audience_size: 'medium', priority: 'high' },
  { name: 'HolaMundo (GitHub)', handle: 'nicolasschurmann', platform: 'github', platform_url: 'https://github.com/nicolasschurmann', language: 'es', category: 'creator', audience_size: 'large', priority: 'high' },

  // === More English creators ===
  { name: 'IndyDevDan', handle: 'indydevdan', platform: 'youtube', platform_url: 'https://www.youtube.com/@indydevdan', language: 'en', category: 'streamer', audience_size: 'medium', priority: 'high' },
  { name: 'Cole Medin', handle: 'colemedin', platform: 'youtube', platform_url: 'https://www.youtube.com/@colemedin', language: 'en', category: 'creator', audience_size: 'medium', priority: 'high' },
  { name: 'Cole Medin', handle: 'colemedin', platform: 'twitter', platform_url: 'https://twitter.com/colemedin', language: 'en', category: 'creator', audience_size: 'medium', priority: 'high' },
  { name: 'Matthew Berman', handle: 'matthew_berman', platform: 'youtube', platform_url: 'https://www.youtube.com/@matthew_berman', language: 'en', category: 'creator', audience_size: 'large', priority: 'high' },
  { name: 'Matthew Berman', handle: 'matthewberman', platform: 'twitter', platform_url: 'https://twitter.com/matthewberman', language: 'en', category: 'creator', audience_size: 'large', priority: 'high' },
  { name: 'Wes Roth', handle: 'wesroth', platform: 'youtube', platform_url: 'https://www.youtube.com/@wesroth', language: 'en', category: 'creator', audience_size: 'large', priority: 'normal' },
  { name: 'Skill Leap AI', handle: 'skillleapai', platform: 'youtube', platform_url: 'https://www.youtube.com/@skillleapai', language: 'en', category: 'creator', audience_size: 'medium', priority: 'normal' },
  { name: 'Liam Ottley', handle: 'liam_ottley', platform: 'youtube', platform_url: 'https://www.youtube.com/@liam_ottley', language: 'en', category: 'creator', audience_size: 'large', priority: 'normal' },
  { name: 'Yifan Lu', handle: 'yifanlu', platform: 'twitter', platform_url: 'https://twitter.com/yifanlu', language: 'en', category: 'creator', audience_size: 'medium', priority: 'normal' },
  { name: 'Guillermo Rauch', handle: 'rauchg', platform: 'twitter', platform_url: 'https://twitter.com/rauchg', language: 'en', category: 'creator', audience_size: 'large', priority: 'high' },
  { name: 'Guillermo Rauch', handle: 'rauchg', platform: 'linkedin', platform_url: 'https://www.linkedin.com/in/rauchg', language: 'en', category: 'creator', audience_size: 'large', priority: 'high' },
  { name: 'Lee Robinson', handle: 'leerob', platform: 'twitter', platform_url: 'https://twitter.com/leerob', language: 'en', category: 'creator', audience_size: 'large', priority: 'high' },
  { name: 'Lee Robinson', handle: 'leerob', platform: 'linkedin', platform_url: 'https://www.linkedin.com/in/leerob', language: 'en', category: 'creator', audience_size: 'large', priority: 'high' },
  { name: 'Delba de Oliveira', handle: 'delb_oliveira', platform: 'twitter', platform_url: 'https://twitter.com/delb_oliveira', language: 'en', category: 'creator', audience_size: 'medium', priority: 'normal' },
  { name: 'Jared Palmer', handle: 'jaredpalmer', platform: 'twitter', platform_url: 'https://twitter.com/jaredpalmer', language: 'en', category: 'creator', audience_size: 'large', priority: 'normal' },
  { name: 'Dan Abramov', handle: 'dan_abramov', platform: 'twitter', platform_url: 'https://twitter.com/dan_abramov', language: 'en', category: 'creator', audience_size: 'large', priority: 'normal' },
  { name: 'Josh Comeau', handle: 'joshcomeau', platform: 'twitter', platform_url: 'https://twitter.com/joshcomeau', language: 'en', category: 'creator', audience_size: 'large', priority: 'normal' },
  { name: 'Kent C Dodds', handle: 'kentcdodds', platform: 'twitter', platform_url: 'https://twitter.com/kentcdodds', language: 'en', category: 'creator', audience_size: 'large', priority: 'high' },
  { name: 'Kent C Dodds', handle: 'kentcdodds', platform: 'youtube', platform_url: 'https://www.youtube.com/@kentcdodds', language: 'en', category: 'creator', audience_size: 'large', priority: 'high' },
  { name: 'Epic Web Dev', handle: 'epicwebdev', platform: 'youtube', platform_url: 'https://www.youtube.com/@epicwebdev', language: 'en', category: 'creator', audience_size: 'medium', priority: 'normal' },
  { name: 'Jack Herrington', handle: 'jherr', platform: 'youtube', platform_url: 'https://www.youtube.com/@jherr', language: 'en', category: 'creator', audience_size: 'large', priority: 'high' },
  { name: 'Jack Herrington', handle: 'jherr', platform: 'twitter', platform_url: 'https://twitter.com/jherr', language: 'en', category: 'creator', audience_size: 'large', priority: 'high' },
  { name: 'CodeWithAntonio', handle: 'codewithantonio', platform: 'youtube', platform_url: 'https://www.youtube.com/@codewithantonio', language: 'en', category: 'creator', audience_size: 'large', priority: 'normal' },
  { name: 'JS Mastery', handle: 'jsmastery', platform: 'youtube', platform_url: 'https://www.youtube.com/@jsmastery', language: 'en', category: 'creator', audience_size: 'large', priority: 'normal' },
  { name: 'ByteGrad', handle: 'bytegrad', platform: 'youtube', platform_url: 'https://www.youtube.com/@bytegrad', language: 'en', category: 'creator', audience_size: 'medium', priority: 'normal' },
  { name: 'Clever Programmer', handle: 'cleverprogrammer', platform: 'youtube', platform_url: 'https://www.youtube.com/@cleverprogrammer', language: 'en', category: 'creator', audience_size: 'large', priority: 'normal' },
  { name: 'Programming with Mosh', handle: 'programmingwithmosh', platform: 'youtube', platform_url: 'https://www.youtube.com/@programmingwithmosh', language: 'en', category: 'creator', audience_size: 'large', priority: 'normal' },
  { name: 'Academind', handle: 'academind', platform: 'youtube', platform_url: 'https://www.youtube.com/@academind', language: 'en', category: 'creator', audience_size: 'large', priority: 'normal' },
  { name: 'Maximilian Schwarzmüller', handle: 'maximilian', platform: 'twitter', platform_url: 'https://twitter.com/maximilian', language: 'en', category: 'creator', audience_size: 'large', priority: 'normal' },
];

function escapeSql(str) {
  if (!str) return 'NULL';
  return `'${String(str).replace(/'/g, "''")}'`;
}

function seed() {
  let inserted = 0;
  for (const c of contacts) {
    const sql = `INSERT INTO outreach_contacts (name, handle, platform, platform_url, language, category, audience_size, priority, status)
                 VALUES (${escapeSql(c.name)}, ${escapeSql(c.handle)}, ${escapeSql(c.platform)}, ${escapeSql(c.platform_url)}, ${escapeSql(c.language)}, ${escapeSql(c.category)}, ${escapeSql(c.audience_size)}, ${escapeSql(c.priority)}, 'pending')
                 ON CONFLICT DO NOTHING RETURNING id`;
    try {
      const result = execSync(`node scripts/db.js --write "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8', cwd: __dirname + '/..' });
      const parsed = JSON.parse(result);
      if (parsed.length > 0) inserted++;
    } catch (e) {
      // duplicate or error, skip
    }
  }
  console.log(`Seeded ${inserted} new contacts. Total in DB: ${contacts.length} entries attempted.`);
}

seed();
