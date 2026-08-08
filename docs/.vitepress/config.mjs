import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Job Seeker',
  description: 'Automate your job search with your favorite coding agent.',
  lang: 'en-US',
  lastUpdated: true,
  cleanUrls: true,

  themeConfig: {
    siteTitle: 'Job Seeker',

    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Flows', link: '/guide/flows' },
      { text: 'Reference', link: '/reference/platforms' },
      {
        text: 'GitHub',
        link: 'https://github.com/galiprandi/job-seeker',
      },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Introduction', link: '/guide/getting-started' },
            { text: 'Quick Start', link: '/guide/quick-start' },
            { text: 'How It Works', link: '/guide/how-it-works' },
          ],
        },
        {
          text: 'Core Concepts',
          items: [
            { text: 'Flows', link: '/guide/flows' },
            { text: 'Strategy Levels', link: '/guide/strategy' },
            { text: 'Data Model', link: '/guide/data-model' },
            { text: 'Gold Rules', link: '/guide/gold-rules' },
          ],
        },
        {
          text: 'Sourcing',
          items: [
            { text: 'Platforms', link: '/reference/platforms' },
            { text: 'Strategies', link: '/reference/strategies' },
          ],
        },
        {
          text: 'Reference',
          items: [
            { text: 'Architecture', link: '/reference/architecture' },
            { text: 'Contributing', link: '/reference/contributing' },
          ],
        },
      ],
      '/reference/': [
        {
          text: 'Reference',
          items: [
            { text: 'Platforms', link: '/reference/platforms' },
            { text: 'Strategies', link: '/reference/strategies' },
            { text: 'Architecture', link: '/reference/architecture' },
            { text: 'Contributing', link: '/reference/contributing' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/galiprandi/job-seeker' },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright 2026 German Aliprandi',
    },

    search: {
      provider: 'local',
    },

    outline: {
      label: 'On this page',
    },

    lastUpdated: {
      text: 'Last updated',
    },

    docFooter: {
      prev: 'Previous',
      next: 'Next',
    },
  },
})
