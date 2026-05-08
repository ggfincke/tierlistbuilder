// scripts/marketplace-seed/catalog/techApps.ts
// tech app metadata for marketplace template seeds

import type { FolderMeta } from '../types'

export const TECH_APPS_TEMPLATE_META = {
  'design-tools': {
    title: 'Design tools',
    category: 'tech',
    description:
      'Product design, prototyping, visual design, whiteboarding, and motion tools.',
    tags: ['design', 'creative', 'tools'],
    labels: true,
    itemLabels: {
      '01-figma.png': 'Figma',
      '02-sketch.png': 'Sketch',
      '03-adobe-xd.png': 'Adobe XD',
      '04-photoshop.png': 'Photoshop',
      '05-illustrator.png': 'Illustrator',
      '06-canva.png': 'Canva',
      '07-framer.png': 'Framer',
      '08-webflow.png': 'Webflow',
      '09-penpot.png': 'Penpot',
      '10-miro.png': 'Miro',
      '11-invision.png': 'InVision',
      '12-affinity-designer.png': 'Affinity Designer',
      '13-blender.png': 'Blender',
      '14-rive.png': 'Rive',
    },
  },
  'productivity-apps': {
    title: 'Productivity apps',
    category: 'tech',
    description:
      'Collaboration, planning, notes, spreadsheets, calls, storage, and task apps.',
    tags: ['productivity', 'apps', 'work'],
    labels: true,
    itemLabels: {
      '01-slack.png': 'Slack',
      '02-notion.png': 'Notion',
      '03-trello.png': 'Trello',
      '04-asana.png': 'Asana',
      '05-jira.png': 'Jira',
      '06-google-docs.png': 'Google Docs',
      '07-google-sheets.png': 'Google Sheets',
      '08-microsoft-teams.png': 'Microsoft Teams',
      '09-zoom.png': 'Zoom',
      '10-dropbox.png': 'Dropbox',
      '11-todoist.png': 'Todoist',
      '12-obsidian.png': 'Obsidian',
    },
  },
  'ai-tools': {
    title: 'AI tools',
    category: 'tech',
    description:
      'AI assistants, coding copilots, model platforms, local runtimes, and ML workflow tools.',
    tags: ['ai', 'machine learning', 'tools'],
    labels: true,
    itemLabels: {
      '01-openai.png': 'OpenAI',
      '02-claude.png': 'Claude',
      '03-anthropic.png': 'Anthropic',
      '04-google-gemini.png': 'Google Gemini',
      '05-github-copilot.png': 'GitHub Copilot',
      '06-perplexity.png': 'Perplexity',
      '07-hugging-face.png': 'Hugging Face',
      '08-ollama.png': 'Ollama',
      '09-langchain.png': 'LangChain',
      '10-replicate.png': 'Replicate',
      '11-cursor.png': 'Cursor',
      '12-replit.png': 'Replit',
      '13-notebooklm.png': 'NotebookLM',
      '14-google-colab.png': 'Google Colab',
      '15-weights-and-biases.png': 'Weights & Biases',
      '16-mlflow.png': 'MLflow',
    },
  },
  'web-browsers': {
    title: 'Web browsers',
    category: 'tech',
    description:
      'Modern, historical, privacy-focused, and platform web browsers.',
    tags: ['web', 'browsers', 'software'],
  },
  'iphone-generations': {
    title: 'iPhone generations',
    category: 'tech',
    description:
      'Major iPhone generations from the original model through the 2026 entry line.',
    tags: ['apple', 'iphone', 'phones'],
  },
  'social-media-apps': {
    title: 'Social media apps',
    category: 'tech',
    description: 'Social, messaging, creator, forum, and community apps.',
    tags: ['apps', 'social media', 'internet'],
  },
  'streaming-services': {
    title: 'Streaming services',
    category: 'tech',
    description:
      'Streaming platforms — video on demand, live TV, sports, music, and niche channels — by official logo.',
    tags: ['streaming', 'video', 'music', 'tv', 'apps'],
    labels: true,
    itemLabels: {
      '002-disney-plus.png': 'Disney+',
      '006-paramount-plus.png': 'Paramount+',
      '008-apple-tv-plus.png': 'Apple TV+',
      '011-pluto-tv.png': 'Pluto TV',
      '014-youtube-music.png': 'YouTube Music',
      '016-soundcloud.png': 'SoundCloud',
      '020-youtube-tv.png': 'YouTube TV',
      '021-sling-tv.png': 'Sling TV',
      '022-fubotv.png': 'FuboTV',
      '023-directv-stream.png': 'DirecTV Stream',
      '025-espn-plus.png': 'ESPN+',
      '026-dazn.png': 'DAZN',
      '029-mubi.png': 'MUBI',
      '030-discovery-plus.png': 'Discovery+',
      '032-britbox.png': 'BritBox',
    },
  },
} satisfies Record<string, FolderMeta>
