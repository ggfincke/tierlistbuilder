// scripts/marketplace-seed/catalog/food.ts
// food example metadata for marketplace template seeds

import type { FolderMeta } from '../types'

export const FOOD_TEMPLATE_META = {
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
  'pizza-toppings': {
    title: 'Pizza toppings',
    category: 'food',
    description:
      'Pizza toppings — meats, vegetables, cheeses, & the controversial classics. Rank what belongs on the perfect pie.',
    tags: ['pizza', 'toppings', 'food', 'ingredients'],
    labels: true,
    itemLabels: {
      '018-jalapeno.jpg': 'Jalapeño',
      '023-sun-dried-tomato.jpg': 'Sun-dried Tomato',
    },
  },
  'candy-bars': {
    title: 'Candy bars',
    category: 'food',
    description:
      'Candy bars — American classics, British chocolate, & a few Canadian gems. Rank the chocolate aisle.',
    tags: ['candy', 'chocolate', 'snacks', 'food'],
    labels: true,
    itemLabels: {
      '004-hersheys-milk-chocolate.jpg': "Hershey's Milk Chocolate",
      '005-reeses-peanut-butter-cups.png': "Reese's Peanut Butter Cups",
      '012-nestle-crunch.jpg': 'Nestlé Crunch',
      '017-mr-goodbar.jpg': 'Mr. Goodbar',
      '018-payday.png': 'PayDay',
      '024-flake.jpg': 'Cadbury Flake',
      '025-crunchie.jpg': 'Cadbury Crunchie',
    },
  },
} satisfies Record<string, FolderMeta>
