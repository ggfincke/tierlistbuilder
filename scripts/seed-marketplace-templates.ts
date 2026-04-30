#!/usr/bin/env tsx
// scripts/seed-marketplace-templates.ts
// dev seeding for the templates marketplace.

// walks /examples, probes each image w/ sharp to capture aspectRatio + auto-
// crop bbox, picks a per-template slot ratio (snap-to-preset majority), then
// bakes per-item transforms before posting chunked payloads over http.

// requires the seed author to already exist (sign up via the app first),
// CONVEX_URL set, & CONVEX_SEED_ENABLED=true on the deployment

import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ConvexHttpClient } from 'convex/browser'

import { api } from '../convex/_generated/api.js'
import {
  LABEL_FONT_SIZE_PX_DEFAULT,
  type BoardLabelSettings,
  type ItemTransform,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  majorityAspectRatio,
  snapToNearestPreset,
} from '@tierlistbuilder/contracts/workspace/imageMath'
import { probeImage, resolveSeedAutoCropTransform } from './lib/autoCropDetect'
import { mapAsyncLimit } from '../src/shared/lib/asyncMapLimit'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const EXAMPLES_DIR = join(REPO_ROOT, 'examples')

const SEED_FOLDER_CONCURRENCY = 3
const SEED_ITEM_IO_CONCURRENCY = 8
const SEED_CHUNK_UPLOAD_CONCURRENCY = 2
const SUPPORTED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])

interface FolderMeta
{
  title?: string
  category: string
  description: string | null
  tags: string[]
  // when set, the seeded template ships w/ these board-level label settings
  // baked in. forked boards inherit them so captions show without each user
  // toggling Show labels. shorthand `true` -> LABEL_DEFAULT_STYLE
  labels?: true | BoardLabelSettings
  // per-item label text overrides keyed by source filename (e.g.
  // '01-pikachu.png'). missing keys fall through to titleizeFromFilename
  itemLabels?: Record<string, string>
}

// shared caption styling for any folder opted in via `labels: true` — caption-
// below, board font, 12px. matches the editor's "Apply to all items" default
// the curation pass landed on; caption modes ignore scrim/textColor
const LABEL_DEFAULT_STYLE: BoardLabelSettings = {
  show: true,
  placement: { mode: 'captionBelow' },
  fontSizePx: LABEL_FONT_SIZE_PX_DEFAULT,
}

// folder slug -> { title, category, description, tags }. add new examples
// here when /examples grows
const TEMPLATE_META: Record<string, FolderMeta> = {
  'breakfast-cereals': {
    title: 'Breakfast cereals',
    category: 'food',
    description:
      'A pantry shelf of iconic breakfast cereals and cereal brands.',
    tags: ['food', 'cereal', 'breakfast'],
  },
  'fast-food-chains': {
    title: 'Fast food chains',
    category: 'food',
    description:
      'Major fast food and fast casual chains, from burgers to tacos.',
    tags: ['food', 'restaurants', 'fast food'],
  },
  'hot-sauces': {
    title: 'Hot sauces',
    category: 'food',
    description:
      'Hot sauce brands and spicy condiments across American, Latin, Asian, and African styles.',
    tags: ['food', 'sauce', 'spicy'],
    labels: true,
  },
  sodas: {
    title: 'Sodas',
    category: 'food',
    description:
      'Classic, regional, discontinued, and limited-time sodas shown as cans or bottles.',
    tags: ['drinks', 'soda', 'soft drinks'],
    labels: true,
  },
  'ice-cream-flavors': {
    title: 'Ice cream flavors',
    category: 'food',
    description:
      'Classic and regional ice cream flavors, with scoops and desserts as reference art.',
    tags: ['food', 'dessert', 'ice cream'],
    labels: true,
  },
  'classic-novels': {
    title: 'Classic novels',
    category: 'books',
    description:
      'Canonical novels and epics often found on school shelves and all-time lists.',
    tags: ['books', 'classics', 'literature'],
    labels: true,
    itemLabels: {
      '01-moby-dick.jpg': 'Moby-Dick',
      '02-frankenstein.jpg': 'Frankenstein',
      '03-wuthering-heights.jpg': 'Wuthering Heights',
      '04-jane-eyre.jpg': 'Jane Eyre',
      '05-great-expectations.jpg': 'Great Expectations',
      '06-the-picture-of-dorian-gray.jpg': 'The Picture of Dorian Gray',
      '07-pride-and-prejudice.jpg': 'Pride and Prejudice',
      '08-dracula.jpg': 'Dracula',
      '09-alice-s-adventures-in-wonderland.jpg':
        "Alice's Adventures in Wonderland",
      '10-anna-karenina.jpg': 'Anna Karenina',
      '11-adventures-of-huckleberry-finn.jpg': 'Adventures of Huckleberry Finn',
      '12-war-and-peace.jpg': 'War and Peace',
      '13-don-quixote.jpg': 'Don Quixote',
      '14-the-count-of-monte-cristo.jpg': 'The Count of Monte Cristo',
      '15-crime-and-punishment.jpg': 'Crime and Punishment',
      '16-les-miserables.jpg': 'Les Misérables',
      '17-the-great-gatsby.jpg': 'The Great Gatsby',
      '18-to-kill-a-mockingbird.jpg': 'To Kill a Mockingbird',
      '19-the-brothers-karamazov.jpg': 'The Brothers Karamazov',
      '20-nineteen-eighty-four.jpg': 'Nineteen Eighty-Four',
      '21-the-catcher-in-the-rye.jpg': 'The Catcher in the Rye',
      '22-fahrenheit-451.jpg': 'Fahrenheit 451',
      '23-brave-new-world.jpg': 'Brave New World',
      '24-the-grapes-of-wrath.jpg': 'The Grapes of Wrath',
      '25-lord-of-the-flies.jpg': 'Lord of the Flies',
      '26-the-hobbit.jpg': 'The Hobbit',
      '27-the-odyssey.jpg': 'The Odyssey',
      '28-the-lord-of-the-rings.jpg': 'The Lord of the Rings',
      '29-the-iliad.jpg': 'The Iliad',
      '30-ulysses.jpg': 'Ulysses',
    },
  },
  'fantasy-book-series': {
    title: 'Fantasy book series',
    category: 'books',
    description:
      'Popular fantasy series spanning epic, portal, grimdark, and modern fantasy.',
    tags: ['books', 'fantasy', 'series'],
    labels: true,
    itemLabels: {
      '01-discworld.jpg': 'Discworld',
      '02-mistborn.jpg': 'Mistborn',
      '03-a-song-of-ice-and-fire.jpg': 'A Song of Ice and Fire',
      '04-the-wheel-of-time.jpg': 'The Wheel of Time',
      '05-the-stormlight-archive.jpg': 'The Stormlight Archive',
      '06-the-kingkiller-chronicle.jpg': 'The Kingkiller Chronicle',
      '07-the-lord-of-the-rings.jpg': 'The Lord of the Rings',
      '08-the-witcher.jpg': 'The Witcher',
      '09-earthsea.jpg': 'Earthsea',
      '10-the-chronicles-of-narnia.jpg': 'The Chronicles of Narnia',
      '11-his-dark-materials.jpg': 'His Dark Materials',
      '12-the-inheritance-cycle.jpg': 'The Inheritance Cycle',
      '13-the-broken-earth.jpg': 'The Broken Earth',
      '14-malazan-book-of-the-fallen.jpg': 'Malazan Book of the Fallen',
      '15-the-first-law.jpg': 'The First Law',
      '16-the-farseer-trilogy.jpg': 'The Farseer Trilogy',
      '17-the-belgariad.jpg': 'The Belgariad',
      '18-the-magicians.jpg': 'The Magicians',
      '19-the-poppy-war.jpg': 'The Poppy War',
      '20-the-dresden-files.jpg': 'The Dresden Files',
      '21-redwall.jpg': 'Redwall',
      '22-percy-jackson.jpg': 'Percy Jackson',
      '23-artemis-fowl.jpg': 'Artemis Fowl',
      '24-the-dark-tower.jpg': 'The Dark Tower',
      '25-the-black-company.jpg': 'The Black Company',
      '26-the-chronicles-of-amber.jpg': 'The Chronicles of Amber',
      '27-shannara.jpg': 'Shannara',
      '28-dragonriders-of-pern.jpg': 'Dragonriders of Pern',
      '29-the-riftwar-cycle.jpg': 'The Riftwar Cycle',
      '30-the-dark-is-rising.jpg': 'The Dark Is Rising',
      '31-the-chronicles-of-prydain.jpg': 'The Chronicles of Prydain',
      '32-elric.jpg': 'Elric',
      '33-conan.jpg': 'Conan',
      '34-memory-sorrow-and-thorn.jpg': 'Memory, Sorrow, and Thorn',
      '35-the-sword-of-truth.jpg': 'The Sword of Truth',
      '36-the-runelords.jpg': 'The Runelords',
      '37-the-deed-of-paksenarrion.jpg': 'The Deed of Paksenarrion',
      '38-the-black-jewels.jpg': 'The Black Jewels',
      '39-old-kingdom.jpg': 'Old Kingdom',
      '40-the-queen-s-thief.jpg': "The Queen's Thief",
      '41-the-edge-chronicles.jpg': 'The Edge Chronicles',
      '42-the-bartimaeus-sequence.jpg': 'The Bartimaeus Sequence',
      '43-the-keys-to-the-kingdom.jpg': 'The Keys to the Kingdom',
      '44-the-mortal-instruments.jpg': 'The Mortal Instruments',
      '45-grishaverse.jpg': 'Grishaverse',
      '46-the-raven-cycle.jpg': 'The Raven Cycle',
      '47-the-books-of-pellinor.jpg': 'The Books of Pellinor',
      '48-the-demon-cycle.jpg': 'The Demon Cycle',
      '49-lightbringer.jpg': 'Lightbringer',
      '50-the-powder-mage-trilogy.jpg': 'The Powder Mage Trilogy',
      '51-the-gentleman-bastard-sequence.jpg': 'The Gentleman Bastard Sequence',
      '52-the-riyria-revelations.jpg': 'The Riyria Revelations',
      '53-the-books-of-babel.jpg': 'The Books of Babel',
      '54-the-licanius-trilogy.jpg': 'The Licanius Trilogy',
      '55-the-green-bone-saga.jpg': 'The Green Bone Saga',
      '56-the-locked-tomb.jpg': 'The Locked Tomb',
      '57-the-daevabad-trilogy.jpg': 'The Daevabad Trilogy',
      '58-temeraire.jpg': 'Temeraire',
      '59-the-winternight-trilogy.jpg': 'The Winternight Trilogy',
      '60-the-broken-empire.jpg': 'The Broken Empire',
      '61-the-faithful-and-the-fallen.jpg': 'The Faithful and the Fallen',
      '62-the-books-of-the-raksura.jpg': 'The Books of the Raksura',
      '63-the-craft-sequence.jpg': 'The Craft Sequence',
      '64-the-divine-cities.jpg': 'The Divine Cities',
      '65-the-tide-child.jpg': 'The Tide Child',
      '66-the-dandelion-dynasty.jpg': 'The Dandelion Dynasty',
      '67-the-burning.jpg': 'The Burning',
      '68-world-of-the-five-gods.jpg': 'World of the Five Gods',
      '69-wayward-children.jpg': 'Wayward Children',
    },
  },
  'stephen-king-novels': {
    title: 'Stephen King novels',
    category: 'books',
    description:
      'Stephen King novels and novella-length standalone books from Carrie through Never Flinch.',
    tags: ['books', 'horror', 'stephen king'],
    labels: true,
    itemLabels: {
      '01-carrie.jpg': 'Carrie',
      '02-salem-s-lot.jpg': "'Salem's Lot",
      '03-the-shining.jpg': 'The Shining',
      '04-rage.jpg': 'Rage',
      '05-the-stand.jpg': 'The Stand',
      '06-the-long-walk.jpg': 'The Long Walk',
      '07-the-dead-zone.jpg': 'The Dead Zone',
      '08-firestarter.jpg': 'Firestarter',
      '09-roadwork.jpg': 'Roadwork',
      '10-cujo.jpg': 'Cujo',
      '11-the-running-man.jpg': 'The Running Man',
      '12-the-gunslinger.jpg': 'The Gunslinger',
      '13-christine.jpg': 'Christine',
      '14-pet-sematary.jpg': 'Pet Sematary',
      '15-cycle-of-the-werewolf.jpg': 'Cycle of the Werewolf',
      '16-the-talisman.jpg': 'The Talisman',
      '17-thinner.jpg': 'Thinner',
      '18-it.jpg': 'It',
      '19-the-eyes-of-the-dragon.jpg': 'The Eyes of the Dragon',
      '20-the-drawing-of-the-three.jpg': 'The Drawing of the Three',
      '21-misery.jpg': 'Misery',
      '22-the-tommyknockers.jpg': 'The Tommyknockers',
      '23-the-dark-half.jpg': 'The Dark Half',
      '24-the-waste-lands.jpg': 'The Waste Lands',
      '25-needful-things.jpg': 'Needful Things',
      '26-gerald-s-game.jpg': "Gerald's Game",
      '27-dolores-claiborne.jpg': 'Dolores Claiborne',
      '28-insomnia.jpg': 'Insomnia',
      '29-rose-madder.jpg': 'Rose Madder',
      '30-the-green-mile.jpg': 'The Green Mile',
      '31-desperation.jpg': 'Desperation',
      '32-the-regulators.jpg': 'The Regulators',
      '33-wizard-and-glass.jpg': 'Wizard and Glass',
      '34-bag-of-bones.jpg': 'Bag of Bones',
      '35-the-girl-who-loved-tom-gordon.jpg': 'The Girl Who Loved Tom Gordon',
      '36-dreamcatcher.jpg': 'Dreamcatcher',
      '37-black-house.jpg': 'Black House',
      '38-from-a-buick-8.jpg': 'From a Buick 8',
      '39-wolves-of-the-calla.jpg': 'Wolves of the Calla',
      '40-song-of-susannah.jpg': 'Song of Susannah',
      '41-the-dark-tower.jpg': 'The Dark Tower',
      '42-the-colorado-kid.jpg': 'The Colorado Kid',
      '43-cell.jpg': 'Cell',
      '44-lisey-s-story.jpg': "Lisey's Story",
      '45-blaze.jpg': 'Blaze',
      '46-duma-key.jpg': 'Duma Key',
      '47-under-the-dome.jpg': 'Under the Dome',
      '48-11-22-63.jpg': '11/22/63',
      '49-the-wind-through-the-keyhole.jpg': 'The Wind Through the Keyhole',
      '50-joyland.jpg': 'Joyland',
      '51-doctor-sleep.jpg': 'Doctor Sleep',
      '52-mr-mercedes.jpg': 'Mr. Mercedes',
      '53-revival.jpg': 'Revival',
      '54-finders-keepers.jpg': 'Finders Keepers',
      '55-end-of-watch.jpg': 'End of Watch',
      '56-gwendy-s-button-box.jpg': "Gwendy's Button Box",
      '57-sleeping-beauties.jpg': 'Sleeping Beauties',
      '58-the-outsider.jpg': 'The Outsider',
      '59-elevation.jpg': 'Elevation',
      '60-the-institute.jpg': 'The Institute',
      '61-later.jpg': 'Later',
      '62-billy-summers.jpg': 'Billy Summers',
      '63-gwendy-s-final-task.jpg': "Gwendy's Final Task",
      '64-fairy-tale.jpg': 'Fairy Tale',
      '65-holly.jpg': 'Holly',
      '66-never-flinch.jpg': 'Never Flinch',
    },
  },
  'harry-potter-books': {
    title: 'Harry Potter books',
    category: 'books',
    description: 'The seven main Harry Potter novels in publication order.',
    tags: ['books', 'fantasy', 'harry potter'],
    labels: true,
    itemLabels: {
      '01-philosopher-s-stone.jpg': "Philosopher's Stone",
      '02-chamber-of-secrets.jpg': 'Chamber of Secrets',
      '03-prisoner-of-azkaban.jpg': 'Prisoner of Azkaban',
      '04-goblet-of-fire.jpg': 'Goblet of Fire',
      '05-order-of-the-phoenix.jpg': 'Order of the Phoenix',
      '06-half-blood-prince.jpg': 'Half-Blood Prince',
      '07-deathly-hallows.jpg': 'Deathly Hallows',
    },
  },
  'manga-series': {
    title: 'Manga series',
    category: 'anime',
    description:
      'Popular and influential manga series across shonen, seinen, sports, shojo, josei, comedy, romance, and modern hits.',
    tags: ['manga', 'anime', 'comics'],
    labels: true,
    itemLabels: {
      '01-jujutsu-kaisen.jpg': 'Jujutsu Kaisen',
      '02-naruto.jpg': 'Naruto',
      '03-dragon-ball.jpg': 'Dragon Ball',
      '04-attack-on-titan.jpg': 'Attack on Titan',
      '05-one-piece.jpg': 'One Piece',
      '06-bleach.jpg': 'Bleach',
      '07-my-hero-academia.jpg': 'My Hero Academia',
      '08-demon-slayer.jpg': 'Demon Slayer',
      '09-fullmetal-alchemist.jpg': 'Fullmetal Alchemist',
      '10-hunter-x-hunter.jpg': 'Hunter x Hunter',
      '11-jojo-s-bizarre-adventure.jpg': "JoJo's Bizarre Adventure",
      '12-chainsaw-man.jpg': 'Chainsaw Man',
      '13-death-note.jpg': 'Death Note',
      '14-tokyo-ghoul.jpg': 'Tokyo Ghoul',
      '15-berserk.jpg': 'Berserk',
      '16-sailor-moon.jpg': 'Sailor Moon',
      '17-fruits-basket.jpg': 'Fruits Basket',
      '18-slam-dunk.jpg': 'Slam Dunk',
      '19-blue-lock.jpg': 'Blue Lock',
      '20-spy-x-family.jpg': 'Spy x Family',
      '21-haikyu.jpg': 'Haikyu!!',
      '22-vagabond.jpg': 'Vagabond',
      '23-vinland-saga.jpg': 'Vinland Saga',
      '24-monster.jpg': 'Monster',
      '25-nana.jpg': 'Nana',
      '26-black-clover.jpg': 'Black Clover',
      '27-akira.jpg': 'Akira',
      '28-gintama.jpg': 'Gintama',
      '29-mob-psycho-100.jpg': 'Mob Psycho 100',
      '30-yuyu-hakusho.jpg': 'YuYu Hakusho',
      '31-one-punch-man.jpg': 'One-Punch Man',
      '32-kingdom.jpg': 'Kingdom',
      '33-fairy-tail.jpg': 'Fairy Tail',
      '34-the-seven-deadly-sins.jpg': 'The Seven Deadly Sins',
      '35-rurouni-kenshin.jpg': 'Rurouni Kenshin',
      '36-inuyasha.jpg': 'Inuyasha',
      '37-ranma-1-2.jpg': 'Ranma 1/2',
      '38-case-closed.jpg': 'Case Closed',
      '39-yu-gi-oh.jpg': 'Yu-Gi-Oh!',
      '40-dr-stone.jpg': 'Dr. Stone',
      '41-fire-force.jpg': 'Fire Force',
      '42-soul-eater.jpg': 'Soul Eater',
      '43-d-gray-man.jpg': 'D.Gray-man',
      '44-reborn.jpg': 'Reborn!',
      '45-the-promised-neverland.jpg': 'The Promised Neverland',
      '46-made-in-abyss.jpg': 'Made in Abyss',
      '47-kaguya-sama-love-is-war.jpg': 'Kaguya-sama: Love Is War',
      '48-oshi-no-ko.jpg': 'Oshi no Ko',
      '49-frieren-beyond-journey-s-end.jpg': "Frieren: Beyond Journey's End",
      '50-dandadan.jpg': 'Dandadan',
      '51-delicious-in-dungeon.jpg': 'Delicious in Dungeon',
      '52-komi-can-t-communicate.jpg': "Komi Can't Communicate",
      '53-yotsuba-and.jpg': 'Yotsuba&!',
      '54-azumanga-daioh.jpg': 'Azumanga Daioh',
      '55-nichijou.jpg': 'Nichijou',
      '56-great-teacher-onizuka.jpg': 'Great Teacher Onizuka',
      '57-initial-d.jpg': 'Initial D',
      '58-hajime-no-ippo.jpg': 'Hajime no Ippo',
      '59-kuroko-s-basketball.jpg': "Kuroko's Basketball",
      '60-eyeshield-21.jpg': 'Eyeshield 21',
      '61-chihayafuru.jpg': 'Chihayafuru',
      '62-ao-haru-ride.jpg': 'Ao Haru Ride',
      '63-ouran-high-school-host-club.jpg': 'Ouran High School Host Club',
      '64-skip-beat.jpg': 'Skip Beat!',
      '65-kimi-ni-todoke.jpg': 'Kimi ni Todoke',
      '66-boys-over-flowers.jpg': 'Boys Over Flowers',
      '67-cardcaptor-sakura.jpg': 'Cardcaptor Sakura',
      '68-a-silent-voice.jpg': 'A Silent Voice',
      '69-your-lie-in-april.jpg': 'Your Lie in April',
      '70-20th-century-boys.jpg': '20th Century Boys',
      '71-pluto.jpg': 'Pluto',
      '72-dorohedoro.jpg': 'Dorohedoro',
      '73-parasyte.jpg': 'Parasyte',
      '74-golden-kamuy.jpg': 'Golden Kamuy',
      '75-claymore.jpg': 'Claymore',
      '76-hellsing.jpg': 'Hellsing',
      '77-trigun.jpg': 'Trigun',
      '78-nausicaa-of-the-valley-of-the-wind.jpg':
        'Nausicaä of the Valley of the Wind',
      '79-lone-wolf-and-cub.jpg': 'Lone Wolf and Cub',
      '80-the-rose-of-versailles.jpg': 'The Rose of Versailles',
      '81-astro-boy.jpg': 'Astro Boy',
    },
  },
  'anime-protagonists': {
    title: 'Anime protagonists',
    category: 'anime',
    description:
      'Lead and central characters from influential anime and manga series.',
    tags: ['anime', 'characters', 'protagonists'],
    labels: true,
    itemLabels: {
      '01-tanjiro-kamado.png': 'Tanjiro Kamado',
      '02-ichigo-kurosaki.png': 'Ichigo Kurosaki',
      '03-monkey-d-luffy.png': 'Monkey D. Luffy',
      '04-sailor-moon.jpg': 'Sailor Moon',
      '05-izuku-midoriya.png': 'Izuku Midoriya',
      '06-goku.png': 'Goku',
      '07-naruto-uzumaki.png': 'Naruto Uzumaki',
      '08-eren-yeager.jpg': 'Eren Yeager',
      '09-edward-elric.jpg': 'Edward Elric',
      '10-light-yagami.png': 'Light Yagami',
      '11-ash-ketchum.png': 'Ash Ketchum',
      '12-gon-freecss.jpg': 'Gon Freecss',
      '13-spike-spiegel.png': 'Spike Spiegel',
      '14-l.png': 'L',
      '15-yusuke-urameshi.png': 'Yusuke Urameshi',
      '16-shinji-ikari.png': 'Shinji Ikari',
      '17-kenshin-himura.png': 'Kenshin Himura',
      '18-vash-the-stampede.png': 'Vash the Stampede',
      '19-mob.png': 'Mob',
      '20-lelouch-lamperouge.png': 'Lelouch Lamperouge',
      '21-saitama.jpg': 'Saitama',
      '22-jotaro-kujo.png': 'Jotaro Kujo',
      '23-guts.png': 'Guts',
      '24-inuyasha.png': 'Inuyasha',
      '25-frieren.png': 'Frieren',
      '26-ryuko-matoi.png': 'Ryuko Matoi',
      '27-yuji-itadori.png': 'Yuji Itadori',
      '28-denji.png': 'Denji',
      '29-anya-forger.png': 'Anya Forger',
      '30-thorfinn.png': 'Thorfinn',
      '31-natsu-dragneel.png': 'Natsu Dragneel',
      '32-asta.png': 'Asta',
      '33-yugi-muto.jpg': 'Yugi Muto',
      '34-kenshiro.jpg': 'Kenshiro',
      '35-astro-boy.jpg': 'Astro Boy',
      '36-motoko-kusanagi.jpg': 'Motoko Kusanagi',
      '37-alucard.jpg': 'Alucard',
      '38-kirito.png': 'Kirito',
      '39-simon.jpg': 'Simon',
      '40-haruhi-suzumiya.png': 'Haruhi Suzumiya',
      '41-koyomi-araragi.png': 'Koyomi Araragi',
      '42-madoka-kaname.jpg': 'Madoka Kaname',
      '43-sakura-kinomoto.png': 'Sakura Kinomoto',
      '44-tohru-honda.png': 'Tohru Honda',
      '45-violet-evergarden.png': 'Violet Evergarden',
      '46-rintaro-okabe.png': 'Rintaro Okabe',
      '47-giorno-giovanna.png': 'Giorno Giovanna',
      '48-josuke-higashikata.jpg': 'Josuke Higashikata',
      '49-jonathan-joestar.png': 'Jonathan Joestar',
      '50-senku-ishigami.png': 'Senku Ishigami',
      '51-soma-yukihira.jpg': 'Soma Yukihira',
      '52-shoyo-hinata.png': 'Shoyo Hinata',
      '53-tetsuya-kuroko.png': 'Tetsuya Kuroko',
      '54-ippo-makunouchi.jpg': 'Ippo Makunouchi',
      '55-joe-yabuki.jpg': 'Joe Yabuki',
      '56-gintoki-sakata.png': 'Gintoki Sakata',
      '57-toriko.png': 'Toriko',
      '58-eikichi-onizuka.png': 'Eikichi Onizuka',
      '59-lupin-iii.jpg': 'Lupin III',
      '60-conan-edogawa.png': 'Conan Edogawa',
      '61-taichi-yagami.png': 'Taichi Yagami',
      '62-kaneki-ken.png': 'Kaneki Ken',
      '63-emma.png': 'Emma',
      '64-maka-albarn.png': 'Maka Albarn',
      '65-atsushi-nakajima.png': 'Atsushi Nakajima',
      '66-rimuru-tempest.png': 'Rimuru Tempest',
      '67-subaru-natsuki.png': 'Subaru Natsuki',
      '68-kazuma-satou.png': 'Kazuma Satou',
      '69-naofumi-iwatani.png': 'Naofumi Iwatani',
      '70-ainz-ooal-gown.png': 'Ainz Ooal Gown',
      '71-tanya-degurechaff.png': 'Tanya Degurechaff',
      '72-kaguya-shinomiya.png': 'Kaguya Shinomiya',
      '73-hachiman-hikigaya.png': 'Hachiman Hikigaya',
      '74-tomoya-okazaki.png': 'Tomoya Okazaki',
      '75-shirou-emiya.png': 'Shirou Emiya',
      '76-saber.png': 'Saber',
      '77-shana.png': 'Shana',
      '78-yato.png': 'Yato',
      '79-yona.png': 'Yona',
      '80-shirayuki.png': 'Shirayuki',
      '81-kaiman.png': 'Kaiman',
      '82-rudeus-greyrat.png': 'Rudeus Greyrat',
      '83-chihiro-ogino.png': 'Chihiro Ogino',
      '84-nausicaa.png': 'Nausicaä',
      '85-kiki.png': 'Kiki',
      '86-ashitaka.png': 'Ashitaka',
      '87-bojji.png': 'Bojji',
      '88-maomao.png': 'Maomao',
      '89-laios-touden.png': 'Laios Touden',
      '90-kafka-hibino.png': 'Kafka Hibino',
      '91-mash-burnedead.jpg': 'Mash Burnedead',
      '92-nagisa-shiota.png': 'Nagisa Shiota',
      '93-kusuo-saiki.png': 'Kusuo Saiki',
      '94-takemichi-hanagaki.png': 'Takemichi Hanagaki',
      '95-boruto-uzumaki.jpg': 'Boruto Uzumaki',
      '96-meliodas.png': 'Meliodas',
      '97-holo.jpg': 'Holo',
      '98-kraft-lawrence.png': 'Kraft Lawrence',
      '99-riko.png': 'Riko',
      '100-akko-kagari.png': 'Akko Kagari',
    },
  },
  'studio-trigger-anime': {
    title: 'Studio Trigger anime',
    category: 'anime',
    description:
      'TV series, films, specials, music videos, shorts, and PV projects from Studio Trigger.',
    tags: ['anime', 'studio trigger', 'animation'],
    labels: true,
    itemLabels: {
      '01-inferno-cop.png': 'Inferno Cop',
      '02-inferno-cop-fact-files.jpg': 'Inferno Cop: Fact Files',
      '03-yonhyakunijuu-renpai-girl.jpg': 'Yonhyakunijuu Renpai Girl',
      '04-little-witch-academia.jpg': 'Little Witch Academia',
      '05-turning-girls.jpg': 'Turning Girls',
      '06-kill-la-kill.png': 'Kill la Kill',
      '07-bishoujo-mobage-mobami-chan.png': 'Bishoujo Mobage: Mobami-chan',
      '08-kill-la-kill-goodbye-again.jpg': 'Kill la Kill: GOODBYE AGAIN',
      '09-hacka-doll.jpg': 'Hacka Doll',
      '10-when-supernatural-battles-became-commonplace.jpg':
        'When Supernatural Battles Became Commonplace',
      '11-yume-no-ukiyo-ni-saitemina.png': 'Yume no Ukiyo ni Saitemina',
      '12-ninja-slayer-from-animation.jpg': 'Ninja Slayer from Animation',
      '13-inferno-cop-specials.jpg': 'Inferno Cop Specials',
      '14-change-our-mirai.png': 'Change Our Mirai!',
      '15-hackadoll-the-animation.jpg': 'Hackadoll the Animation',
      '16-little-witch-academia-the-enchanted-parade.jpg':
        'Little Witch Academia: The Enchanted Parade',
      '17-space-patrol-luluco.jpg': 'Space Patrol Luluco',
      '18-kiznaiver.jpg': 'Kiznaiver',
      '19-trigger-chan.jpg': 'Trigger-chan',
      '20-little-witch-academia-tv.jpg': 'Little Witch Academia (TV)',
      '21-darling-in-the-franxx.png': 'Darling in the Franxx',
      '22-ssss-gridman.jpg': 'SSSS.Gridman',
      '23-promare-galo.png': 'Promare: Galo',
      '24-promare-lio.jpg': 'Promare: Lio',
      '25-promare.png': 'Promare',
      '26-delicious-in-dungeon-cm.jpg': 'Delicious in Dungeon CM',
      '27-crescent-rise.jpg': 'Crescent Rise',
      '28-bna-brand-new-animal.jpg': 'BNA: Brand New Animal',
      '29-azur-lane-anime-pvs.png': 'Azur Lane Anime PVs',
      '30-ssss-dynazenon.png': 'SSSS.Dynazenon',
      '31-star-wars-visions.jpg': 'Star Wars: Visions',
      '32-cyberpunk-edgerunners.jpg': 'Cyberpunk: Edgerunners',
      '33-ssss-gridman-movie.jpg': 'SSSS.Gridman Movie',
      '34-ssss-dynazenon-grand-episode.jpg': 'SSSS.Dynazenon Grand Episode',
      '35-gridman-universe.png': 'Gridman Universe',
      '36-delicious-in-dungeon.jpg': 'Delicious in Dungeon',
      '37-chocolat-cadabra.jpg': 'Chocolat Cadabra',
      '38-transformers-40th-anniversary-special-movie.jpg':
        'Transformers 40th Anniversary Special Movie',
      '39-new-panty-and-stocking-with-garterbelt.jpg':
        'New Panty & Stocking with Garterbelt',
      '40-star-wars-visions-volume-3.jpg': 'Star Wars: Visions Volume 3',
      '41-the-lenticulars.jpg': 'The Lenticulars',
    },
  },
  'gundam-series': {
    title: 'Gundam series',
    category: 'anime',
    description:
      'Major Gundam TV series, films, OVAs, SD entries, and Build-era projects.',
    tags: ['anime', 'gundam', 'mecha'],
    labels: true,
    itemLabels: {
      '01-mobile-suit-gundam.jpg': 'Mobile Suit Gundam',
      '02-mobile-suit-gundam-i.jpg': 'Mobile Suit Gundam I',
      '03-soldiers-of-sorrow.jpg': 'Soldiers of Sorrow',
      '04-encounters-in-space.jpg': 'Encounters in Space',
      '05-zeta-gundam.jpg': 'Zeta Gundam',
      '06-gundam-zz.png': 'Gundam ZZ',
      '07-char-s-counterattack.png': "Char's Counterattack",
      '08-war-in-the-pocket.png': 'War in the Pocket',
      '09-stardust-memory.jpg': 'Stardust Memory',
      '10-the-afterglow-of-zeon.jpg': 'The Afterglow of Zeon',
      '11-gundam-f91.png': 'Gundam F91',
      '12-victory-gundam.jpg': 'Victory Gundam',
      '13-g-gundam.png': 'G Gundam',
      '14-gundam-wing.png': 'Gundam Wing',
      '15-the-08th-ms-team.jpg': 'The 08th MS Team',
      '16-after-war-gundam-x.png': 'After War Gundam X',
      '17-endless-waltz.png': 'Endless Waltz',
      '18-turn-a-gundam.jpg': 'Turn A Gundam',
      '19-gundam-evolve.jpg': 'Gundam Evolve',
      '20-gundam-seed.jpg': 'Gundam SEED',
      '21-sd-gundam-force.jpg': 'SD Gundam Force',
      '22-seed-destiny.jpg': 'SEED Destiny',
      '23-ms-igloo-the-hidden-one-year-war.jpg':
        'MS IGLOO: The Hidden One Year War',
      '24-ms-igloo-apocalypse-0079.jpg': 'MS IGLOO: Apocalypse 0079',
      '25-ms-igloo-2-gravity-of-the-battlefront.jpg':
        'MS IGLOO 2: Gravity of the Battlefront',
      '26-seed-c-e-73-stargazer.jpg': 'SEED C.E.73: Stargazer',
      '27-gundam-00.jpg': 'Gundam 00',
      '28-gundam-00-second-season.png': 'Gundam 00 Second Season',
      '29-a-wakening-of-the-trailblazer.png': 'A Wakening of the Trailblazer',
      '30-gundam-unicorn.jpg': 'Gundam Unicorn',
      '31-gundam-age.jpg': 'Gundam AGE',
      '32-gundam-age-memory-of-eden.jpg': 'Gundam AGE: Memory of Eden',
      '33-gundam-build-fighters.jpg': 'Gundam Build Fighters',
      '34-reconguista-in-g.jpg': 'Reconguista in G',
      '35-gundam-build-fighters-try.png': 'Gundam Build Fighters Try',
      '36-the-origin.png': 'The Origin',
      '37-iron-blooded-orphans.jpg': 'Iron-Blooded Orphans',
      '38-gundam-thunderbolt.jpg': 'Gundam Thunderbolt',
      '39-iron-blooded-orphans-2.jpg': 'Iron-Blooded Orphans 2',
      '40-build-fighters-battlogue.jpg': 'Build Fighters: Battlogue',
      '41-twilight-axis.png': 'Twilight AXIS',
      '42-gundam-build-divers.jpg': 'Gundam Build Divers',
      '43-gundam-narrative.jpg': 'Gundam Narrative',
      '44-build-divers-re-rise.png': 'Build Divers Re:RISE',
      '45-sd-gundam-world-sangoku-soketsuden.jpg':
        'SD Gundam World Sangoku Soketsuden',
      '46-hathaway.jpg': 'Hathaway',
      '47-build-divers-re-rise-2nd-season.jpg':
        'Build Divers Re:RISE 2nd Season',
      '48-build-divers-battlogue.jpg': 'Build Divers Battlogue',
      '49-sd-gundam-world-heroes.jpg': 'SD Gundam World Heroes',
      '50-gundam-breaker-battlogue.png': 'Gundam Breaker Battlogue',
      '51-cucuruz-doan-s-island.jpg': "Cucuruz Doan's Island",
      '52-the-witch-from-mercury-prologue.png':
        'The Witch from Mercury: Prologue',
      '53-the-witch-from-mercury.png': 'The Witch from Mercury',
      '54-the-witch-from-mercury-season-2.jpg':
        'The Witch from Mercury Season 2',
      '55-gundam-build-metaverse.jpg': 'Gundam Build Metaverse',
      '56-seed-freedom.jpg': 'SEED Freedom',
      '57-requiem-for-vengeance.jpg': 'Requiem for Vengeance',
      '58-gquuuuuux.jpg': 'GQuuuuuuX',
    },
  },
  'game-consoles': {
    title: 'Game consoles',
    category: 'tech',
    description:
      'Landmark home consoles, handhelds, microconsoles, and PC handhelds across console generations.',
    tags: ['gaming', 'consoles', 'hardware'],
    labels: true,
    itemLabels: {
      '01-magnavox-odyssey.jpg': 'Magnavox Odyssey',
      '02-fairchild-channel-f.jpg': 'Fairchild Channel F',
      '03-atari-2600.png': 'Atari 2600',
      '04-magnavox-odyssey-2.jpg': 'Magnavox Odyssey 2',
      '05-intellivision.png': 'Intellivision',
      '06-colecovision.jpg': 'ColecoVision',
      '07-atari-5200.jpg': 'Atari 5200',
      '08-vectrex.jpg': 'Vectrex',
      '09-nes.png': 'NES',
      '10-sega-master-system.jpg': 'Sega Master System',
      '11-atari-7800.jpg': 'Atari 7800',
      '12-turbografx-16.jpg': 'TurboGrafx-16',
      '13-sega-genesis.jpg': 'Sega Genesis',
      '14-neo-geo.png': 'Neo Geo',
      '15-snes.png': 'SNES',
      '16-3do.jpg': '3DO',
      '17-atari-jaguar.jpg': 'Atari Jaguar',
      '18-sega-saturn.png': 'Sega Saturn',
      '19-playstation.jpg': 'PlayStation',
      '20-virtual-boy.png': 'Virtual Boy',
      '21-nintendo-64.jpg': 'Nintendo 64',
      '22-pc-fx.jpg': 'PC-FX',
      '23-dreamcast.jpg': 'Dreamcast',
      '24-playstation-2.png': 'PlayStation 2',
      '25-gamecube.png': 'GameCube',
      '26-xbox.jpg': 'Xbox',
      '27-xbox-360.png': 'Xbox 360',
      '28-playstation-3.jpg': 'PlayStation 3',
      '29-wii.png': 'Wii',
      '30-ouya.jpg': 'Ouya',
      '31-wii-u.png': 'Wii U',
      '32-playstation-4.jpg': 'PlayStation 4',
      '33-xbox-one.png': 'Xbox One',
      '34-nvidia-shield-tv.jpg': 'Nvidia Shield TV',
      '35-nintendo-switch.jpg': 'Nintendo Switch',
      '36-playstation-5.png': 'PlayStation 5',
      '37-xbox-series-x.png': 'Xbox Series X',
      '38-xbox-series-s.png': 'Xbox Series S',
      '39-nintendo-switch-2.png': 'Nintendo Switch 2',
      '40-game-and-watch.png': 'Game & Watch',
      '41-game-boy.png': 'Game Boy',
      '42-atari-lynx.jpg': 'Atari Lynx',
      '43-game-gear.png': 'Game Gear',
      '44-turboexpress.jpg': 'TurboExpress',
      '45-game-boy-color.png': 'Game Boy Color',
      '46-neo-geo-pocket-color.jpg': 'Neo Geo Pocket Color',
      '47-wonderswan-color.jpg': 'WonderSwan Color',
      '48-game-boy-advance.png': 'Game Boy Advance',
      '49-n-gage.png': 'N-Gage',
      '50-nintendo-ds.png': 'Nintendo DS',
      '51-psp.jpg': 'PSP',
      '52-nintendo-3ds.png': 'Nintendo 3DS',
      '53-playstation-vita.jpg': 'PlayStation Vita',
      '54-nintendo-switch-lite.jpg': 'Nintendo Switch Lite',
      '55-analogue-pocket.jpg': 'Analogue Pocket',
      '56-playdate.png': 'Playdate',
      '57-steam-deck.png': 'Steam Deck',
      '58-asus-rog-ally.jpg': 'ASUS ROG Ally',
      '59-lenovo-legion-go.jpg': 'Lenovo Legion Go',
      '60-msi-claw.png': 'MSI Claw',
    },
  },
  'programming-languages': {
    title: 'Programming languages',
    category: 'tech',
    description:
      'Widely used programming, scripting, markup, query, and shell languages.',
    tags: ['programming', 'software', 'languages'],
    labels: true,
    itemLabels: {
      '01-python.png': 'Python',
      '02-javascript.png': 'JavaScript',
      '03-typescript.png': 'TypeScript',
      '04-java.png': 'Java',
      '05-c.png': 'C',
      '06-cplusplus.png': 'C++',
      '07-csharp.png': 'C#',
      '08-go.png': 'Go',
      '09-rust.png': 'Rust',
      '10-kotlin.png': 'Kotlin',
      '11-swift.png': 'Swift',
      '12-php.png': 'PHP',
      '13-ruby.png': 'Ruby',
      '14-r.png': 'R',
      '15-julia.png': 'Julia',
      '16-scala.png': 'Scala',
      '17-haskell.png': 'Haskell',
      '18-elixir.png': 'Elixir',
      '19-erlang.png': 'Erlang',
      '20-perl.png': 'Perl',
      '21-lua.png': 'Lua',
      '22-dart.png': 'Dart',
      '23-objective-c.png': 'Objective-C',
      '24-matlab.png': 'MATLAB',
      '25-visual-basic-net.png': 'Visual Basic .NET',
      '26-bash.png': 'Bash',
      '27-powershell.png': 'PowerShell',
      '28-html.png': 'HTML',
      '29-css.png': 'CSS',
      '30-sql.png': 'SQL',
      '31-clojure.png': 'Clojure',
      '32-groovy.png': 'Groovy',
      '33-fsharp.png': 'F#',
      '34-fortran.png': 'Fortran',
      '35-cobol.png': 'COBOL',
      '36-solidity.png': 'Solidity',
      '37-zig.png': 'Zig',
      '38-nim.png': 'Nim',
      '39-crystal.png': 'Crystal',
      '40-ocaml.png': 'OCaml',
      '41-elm.png': 'Elm',
      '42-graphql.png': 'GraphQL',
      '43-markdown.png': 'Markdown',
      '44-yaml.png': 'YAML',
      '45-json.png': 'JSON',
      '46-xml.png': 'XML',
      '47-delphi.png': 'Delphi',
      '48-latex.png': 'LaTeX',
      '49-apl.png': 'APL',
      '50-ballerina.png': 'Ballerina',
    },
  },
  'final-fantasy-mainline': {
    title: 'Final Fantasy mainline series',
    category: 'gaming',
    description:
      'Every numbered Final Fantasy game from FF I through XVI, in release order.',
    tags: ['rpg', 'final fantasy', 'square enix'],
  },
  'mario-kart-8-deluxe': {
    title: 'Mario Kart 8 Deluxe roster',
    category: 'gaming',
    description:
      'All 48 racers from Mario Kart 8 Deluxe, including DLC characters.',
    tags: ['nintendo', 'racing', 'mario kart'],
  },
  'mcu-posters': {
    title: 'MCU films',
    category: 'movies',
    description:
      'Every theatrical Marvel Cinematic Universe release, by poster art.',
    tags: ['marvel', 'mcu', 'films'],
  },
  'mcu-shows': {
    title: 'MCU streaming series',
    category: 'movies',
    description: 'Disney+ MCU shows from WandaVision onward.',
    tags: ['marvel', 'mcu', 'disney+'],
  },
  'one-piece-arcs': {
    title: 'One Piece story arcs',
    category: 'anime',
    description:
      'Story arcs from One Piece, sourced from One Piece Wiki arc artwork.',
    tags: ['anime', 'one piece', 'arcs'],
    labels: true,
  },
  'mortal-kombat-1': {
    title: 'Mortal Kombat 1 roster',
    category: 'gaming',
    description: 'The base + Kombat Pack roster from Mortal Kombat 1 (2023).',
    tags: ['fighting', 'mortal kombat', 'netherrealm'],
  },
  'nba-teams': {
    title: 'NBA teams',
    category: 'sports',
    description: 'All 30 NBA franchises, by primary team logo.',
    tags: ['basketball', 'nba'],
  },
  'nfl-teams': {
    title: 'NFL teams',
    category: 'sports',
    description: 'All 32 NFL franchises, by primary team logo.',
    tags: ['football', 'nfl'],
  },
  'pixar-films': {
    title: 'Pixar feature films',
    category: 'movies',
    description: 'Every Pixar Animation Studios feature, by poster.',
    tags: ['pixar', 'animation', 'films'],
  },
  'pokemon-generations': {
    title: 'Pokemon game generations',
    category: 'gaming',
    description:
      'Mainline Pokemon generations represented by paired flagship games, including the announced tenth generation.',
    tags: ['pokemon', 'nintendo', 'generations'],
    labels: true,
    itemLabels: {
      '01-generation-i-red-blue-yellow.webp':
        'Generation I: Red, Blue & Yellow',
      '02-generation-ii-gold-silver.png': 'Generation II: Gold & Silver',
      '03-generation-iii-ruby-sapphire.jpg': 'Generation III: Ruby & Sapphire',
      '04-generation-iv-diamond-pearl.jpg': 'Generation IV: Diamond & Pearl',
      '05-generation-v-black-white.jpg': 'Generation V: Black & White',
      '06-generation-vi-x-y.jpg': 'Generation VI: X & Y',
      '07-generation-vii-sun-moon.jpg': 'Generation VII: Sun & Moon',
      '08-generation-viii-sword-shield.jpg': 'Generation VIII: Sword & Shield',
      '09-generation-ix-scarlet-violet.png': 'Generation IX: Scarlet & Violet',
      '10-generation-x-winds-waves.png': 'Generation X: Winds & Waves',
    },
  },
  'pokemon-starters': {
    title: 'Pokémon starter trios',
    category: 'gaming',
    description: 'The first-stage starters from every mainline generation.',
    tags: ['pokemon', 'starters', 'nintendo'],
  },
  'premier-league-clubs': {
    title: 'Premier League clubs',
    category: 'sports',
    description: 'Every active Premier League club for the current season.',
    tags: ['football', 'soccer', 'premier league'],
  },
  'ssbu-fighters': {
    title: 'Super Smash Bros. Ultimate roster',
    category: 'gaming',
    description: 'All 87 fighters in Super Smash Bros. Ultimate, base + DLC.',
    tags: ['nintendo', 'fighting', 'smash bros'],
  },
  'star-wars-films': {
    title: 'Star Wars theatrical films',
    category: 'movies',
    description: 'Every theatrical Star Wars release, by poster.',
    tags: ['star wars', 'films', 'lucasfilm'],
  },
  'street-fighter-6': {
    title: 'Street Fighter 6 roster',
    category: 'gaming',
    description: 'Base + Year 1 + Year 2 fighters from Street Fighter 6.',
    tags: ['fighting', 'capcom', 'street fighter'],
  },
  'studio-ghibli': {
    title: 'Studio Ghibli films',
    category: 'movies',
    description: 'Every Studio Ghibli theatrical feature, by poster.',
    tags: ['ghibli', 'animation', 'films'],
  },
  'taylor-swift-albums': {
    title: 'Taylor Swift studio albums',
    category: 'music',
    description:
      "All of Taylor Swift's studio albums, including re-recordings.",
    tags: ['taylor swift', 'pop', 'albums'],
  },
  'zelda-games': {
    title: 'Legend of Zelda mainline',
    category: 'gaming',
    description: 'Every mainline Zelda title, by box art.',
    tags: ['zelda', 'nintendo', 'rpg'],
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
  'disney-animated-films': {
    title: 'Disney animated features',
    category: 'movies',
    description:
      'Walt Disney Animation Studios feature films from Snow White through Zootopia 2.',
    tags: ['disney', 'animation', 'films'],
  },
  'dreamworks-films': {
    title: 'DreamWorks Animation films',
    category: 'movies',
    description:
      'DreamWorks Animation theatrical features from Antz through Gabby’s Dollhouse: The Movie.',
    tags: ['dreamworks', 'animation', 'films'],
  },
  'horror-movie-franchises': {
    title: 'Horror movie franchises',
    category: 'movies',
    description:
      'Major horror franchises from Halloween and Friday the 13th through modern series like Terrifier and A Quiet Place.',
    tags: ['horror', 'movies', 'franchises'],
  },
  'best-picture-winners': {
    title: 'Best Picture winners',
    category: 'movies',
    description:
      'Academy Award Best Picture winners from American Beauty (2000 ceremony) through One Battle After Another (2026 ceremony).',
    tags: ['oscars', 'best picture', 'movies'],
  },
  'formula-1-teams': {
    title: 'Formula 1 teams',
    category: 'sports',
    description:
      'The 2026 Formula 1 grid, including Cadillac as the eleventh team.',
    tags: ['formula 1', 'f1', 'racing'],
  },
  'mlb-teams': {
    title: 'MLB teams',
    category: 'sports',
    description: 'All 30 Major League Baseball franchises.',
    tags: ['baseball', 'mlb', 'teams'],
  },
  'nhl-teams': {
    title: 'NHL teams',
    category: 'sports',
    description:
      'All 32 National Hockey League franchises, including Utah Mammoth as the current Utah identity.',
    tags: ['hockey', 'nhl', 'teams'],
  },
  'wwe-wrestlers': {
    title: 'WWE wrestlers',
    category: 'sports',
    description:
      'A mix of current WWE stars, women’s division, and Hall of Fame icons.',
    tags: ['wwe', 'wrestling', 'sports entertainment'],
  },
  'board-games': {
    title: 'Board games',
    category: 'other',
    description:
      'Classic and modern tabletop favorites from Chess and Monopoly to Gloomhaven and Wingspan.',
    tags: ['board games', 'tabletop', 'games'],
  },
  'lego-themes': {
    title: 'LEGO themes',
    category: 'other',
    description:
      'Classic, licensed, and modern LEGO theme lines from City and Space to Star Wars and Super Mario.',
    tags: ['lego', 'toys', 'themes'],
  },
}

const DEFAULT_META: FolderMeta = {
  category: 'other',
  description: null,
  tags: [],
}

// homepage curation: rank 0 -> hero/editor's pick, 1 -> trending card,
// 2 -> curated card. wipe ranks first, then promote freshly seeded templates.
const FEATURED_RANKS: Record<string, number> = {
  'ssbu-fighters': 0,
  'nba-teams': 1,
  'mcu-posters': 2,
}

const usage = (): never =>
{
  process.stderr.write(
    [
      'usage: tsx scripts/seed-marketplace-templates.ts <author-email> [folder...]',
      '',
      '  <author-email>   email of the user to attribute seeded templates to.',
      '                   the user must already exist (sign in once via the app).',
      '  [folder]         optional list of /examples subfolders to seed; if',
      '                   omitted, every folder under examples/ is seeded.',
      '',
      'environment:',
      '  CONVEX_URL                       deployment URL (eg https://your-dev.convex.cloud)',
      '  CONVEX_SEED_ENABLED              must be "true" on the deployment env vars',
      '                                   (set via `npx convex env set CONVEX_SEED_ENABLED true`)',
      '',
    ].join('\n')
  )
  process.exit(1)
}

const titleizeFromFilename = (filename: string): string =>
{
  const dot = filename.lastIndexOf('.')
  const stem = dot === -1 ? filename : filename.slice(0, dot)
  const noPrefix = stem.replace(/^\d+[a-z]?[-_.]?/, '')
  return noPrefix
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

interface ProbedItem
{
  label: string
  filePath: string
  byteSize: number
  aspectRatio: number
  // bbox null when detection finds nothing useful (eg full-bleed photo);
  // transform stays null for those & the item falls back to imageFit/cover
  bbox: Awaited<ReturnType<typeof probeImage>>['bbox']
}

interface PreparedItem
{
  label: string
  filePath: string
  byteSize: number
  aspectRatio: number
  transform: ItemTransform | null
}

interface PreparedFolder
{
  templateRatio: number | null
  items: PreparedItem[]
}

const probeFolder = async (
  folderPath: string,
  itemLabels: Record<string, string> | undefined
): Promise<ProbedItem[]> =>
{
  const entries = await readdir(folderPath, { withFileTypes: true })
  const files = entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((name) =>
    {
      const dot = name.lastIndexOf('.')
      if (dot === -1) return false
      return SUPPORTED_EXTENSIONS.has(name.slice(dot).toLowerCase())
    })
    .sort()

  return await mapAsyncLimit(files, SEED_ITEM_IO_CONCURRENCY, async (name) =>
  {
    const filePath = join(folderPath, name)
    const buffer = await readFile(filePath)
    const probe = await probeImage(new Uint8Array(buffer))
    return {
      label: itemLabels?.[name] ?? titleizeFromFilename(name),
      filePath,
      byteSize: buffer.byteLength,
      aspectRatio: probe.aspectRatio,
      bbox: probe.bbox,
    }
  })
}

// pick the template's slot ratio (snap-to-preset majority of per-item ratios)
// so each item's autocrop transform is computed against the same frame the
// forked board will use, then bake transforms against that ratio
const prepareFolder = (probes: ProbedItem[]): PreparedFolder =>
{
  const majority = majorityAspectRatio(probes.map((p) => p.aspectRatio))
  const templateRatio = majority === null ? null : snapToNearestPreset(majority)
  const frameRatio = templateRatio ?? 1
  const items = probes.map((probe) => ({
    label: probe.label,
    filePath: probe.filePath,
    byteSize: probe.byteSize,
    aspectRatio: probe.aspectRatio,
    transform: probe.bbox
      ? resolveSeedAutoCropTransform({
          imageAspectRatio: probe.aspectRatio,
          bbox: probe.bbox,
          boardAspectRatio: frameRatio,
        })
      : null,
  }))
  return { templateRatio, items }
}

// rough JSON-overhead floor per item — keeps chunked payloads under the
// action body limit. tuned conservatively against the ~8MB Convex action
// body cap; bigger values risk "BadJsonBody / length limit exceeded"
const MAX_CHUNK_BASE64_BYTES = 5 * 1024 * 1024

const estimateBase64Bytes = (byteSize: number): number =>
  Math.ceil(byteSize / 3) * 4

const chunkItemsBySize = (items: PreparedItem[]): PreparedItem[][] =>
{
  const chunks: PreparedItem[][] = []
  let current: PreparedItem[] = []
  let currentSize = 0

  for (const item of items)
  {
    const itemSize = estimateBase64Bytes(item.byteSize)
    if (current.length > 0 && currentSize + itemSize > MAX_CHUNK_BASE64_BYTES)
    {
      chunks.push(current)
      current = []
      currentSize = 0
    }
    current.push(item)
    currentSize += itemSize
  }

  if (current.length > 0)
  {
    chunks.push(current)
  }
  return chunks
}

const toPayloadItems = async (
  items: readonly PreparedItem[]
): Promise<
  {
    label: string
    contentBase64: string
    aspectRatio: number
    transform: ItemTransform | null
  }[]
> =>
  await mapAsyncLimit(items, SEED_ITEM_IO_CONCURRENCY, async (item) => ({
    label: item.label,
    contentBase64: (await readFile(item.filePath)).toString('base64'),
    aspectRatio: item.aspectRatio,
    transform: item.transform,
  }))

const seedFolder = async (
  client: ConvexHttpClient,
  folderName: string,
  authorEmail: string
): Promise<string | null> =>
{
  const folderPath = join(EXAMPLES_DIR, folderName)
  const meta: FolderMeta = {
    ...DEFAULT_META,
    ...(TEMPLATE_META[folderName] ?? {}),
  }
  const title = meta.title ?? titleizeFromFilename(folderName)
  const probes = await probeFolder(folderPath, meta.itemLabels)
  if (probes.length === 0)
  {
    process.stdout.write(`  · ${folderName}: no images found, skipping\n`)
    return null
  }

  const { templateRatio, items } = prepareFolder(probes)
  const labels: BoardLabelSettings | null =
    meta.labels === true ? LABEL_DEFAULT_STYLE : (meta.labels ?? null)

  const chunks = chunkItemsBySize(items)
  process.stdout.write(
    `  · ${folderName}: ${items.length} items in ${chunks.length} chunk(s) @ ratio ${templateRatio?.toFixed(3) ?? 'auto'}${labels ? ', labels on' : ''}, uploading…\n`
  )

  const [firstChunk, ...remainingChunks] = chunks
  const created = await client.action(
    api.marketplace.templates.seed.seedTemplateFromBlobs,
    {
      authorEmail,
      title,
      description: meta.description ?? null,
      category: meta.category,
      tags: meta.tags ?? [],
      itemAspectRatio: templateRatio,
      labels,
      items: await toPayloadItems(firstChunk),
    }
  )

  let totalItems = created.itemsCreated
  const uploadJobs: {
    chunk: PreparedItem[]
    chunkNumber: number
    startOrder: number
  }[] = []
  let nextStartOrder = firstChunk.length
  for (let i = 0; i < remainingChunks.length; i++)
  {
    const chunk = remainingChunks[i]
    uploadJobs.push({
      chunk,
      chunkNumber: i + 2,
      startOrder: nextStartOrder,
    })
    nextStartOrder += chunk.length
  }

  await mapAsyncLimit(
    uploadJobs,
    SEED_CHUNK_UPLOAD_CONCURRENCY,
    async ({ chunk, chunkNumber, startOrder }) =>
    {
      const result = await client.action(
        api.marketplace.templates.seed.appendItemsToSeededTemplateBlobs,
        {
          authorEmail,
          slug: created.slug,
          startOrder,
          items: await toPayloadItems(chunk),
        }
      )
      process.stdout.write(
        `    .. appended chunk ${chunkNumber}/${chunks.length} (${result.itemsAppended} items)\n`
      )
    }
  )

  if (remainingChunks.length > 0)
  {
    const finalized = await client.action(
      api.marketplace.templates.seed.finalizeSeededTemplateChunks,
      {
        authorEmail,
        slug: created.slug,
        itemCount: items.length,
      }
    )
    totalItems = finalized.totalItems
  }

  process.stdout.write(
    `    -> seeded slug=${created.slug} (${totalItems} items)\n`
  )

  const featuredRank = FEATURED_RANKS[folderName]
  if (featuredRank !== undefined)
  {
    await client.action(api.marketplace.templates.seed.promoteFeatured, {
      slug: created.slug,
      featuredRank,
    })
    process.stdout.write(
      `    -> promoted ${folderName} to featuredRank=${featuredRank}\n`
    )
  }
  return folderName
}

interface SeedSummary
{
  succeeded: number
  failed: number
}

const seedFolders = async (
  client: ConvexHttpClient,
  targetFolders: string[],
  authorEmail: string
): Promise<SeedSummary> =>
{
  let succeeded = 0
  let failed = 0
  let nextIndex = 0

  const runNext = async (): Promise<void> =>
  {
    while (nextIndex < targetFolders.length)
    {
      const folderName = targetFolders[nextIndex]
      nextIndex += 1

      try
      {
        const result = await seedFolder(client, folderName, authorEmail)
        if (result) succeeded += 1
      }
      catch (error)
      {
        failed += 1
        const message = error instanceof Error ? error.message : String(error)
        process.stderr.write(`  ! ${folderName} failed: ${message}\n`)
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(SEED_FOLDER_CONCURRENCY, targetFolders.length) },
      runNext
    )
  )

  return { succeeded, failed }
}

const main = async (): Promise<void> =>
{
  const [authorEmail, ...folders] = process.argv.slice(2)
  if (!authorEmail || authorEmail.startsWith('-'))
  {
    usage()
  }

  const convexUrl = process.env.CONVEX_URL
  if (!convexUrl)
  {
    process.stderr.write(
      'CONVEX_URL is not set. export it from your .env.local or run via `npx convex env`\n'
    )
    process.exit(1)
  }

  const client = new ConvexHttpClient(convexUrl)
  const targetFolders =
    folders.length > 0
      ? folders
      : (await readdir(EXAMPLES_DIR, { withFileTypes: true }))
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
          .sort()

  process.stdout.write(
    `seeding ${targetFolders.length} template(s) as ${authorEmail} on ${convexUrl}\n`
  )

  // wipe stale featured ranks first so we don't leave duplicates at the same
  // slot — only when we'll actually be re-promoting at least one trio member
  const willPromoteFeatured = targetFolders.some(
    (folder) => folder in FEATURED_RANKS
  )
  if (willPromoteFeatured)
  {
    const { cleared } = await client.action(
      api.marketplace.templates.seed.clearAllFeaturedRanks,
      {}
    )
    process.stdout.write(`cleared ${cleared} prior featured rank(s)\n`)
  }

  const { succeeded, failed } = await seedFolders(
    client,
    targetFolders,
    authorEmail
  )

  process.stdout.write(
    `\ndone — ${succeeded} succeeded, ${failed} failed of ${targetFolders.length}\n`
  )
  if (failed > 0) process.exit(1)
}

main().catch((error) =>
{
  const stack = error instanceof Error ? (error.stack ?? error.message) : error
  process.stderr.write(`seed failed: ${stack}\n`)
  process.exit(1)
})
