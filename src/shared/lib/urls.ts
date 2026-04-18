// src/shared/lib/urls.ts
// centralized URLs for public pages, source repo, & Google Fonts loader

export const APP_PUBLIC_URL = 'https://tierlistbuilder.com'

export const GITHUB_REPO_URL = 'https://github.com/ggfincke/tierlistbuilder'

const GOOGLE_FONT_BASE = 'https://fonts.googleapis.com/css2'

// build a Google Fonts CSS link for one family w/ weights, e.g.
// buildGoogleFontUrl('Outfit', '500;800') ->
// https://fonts.googleapis.com/css2?family=Outfit:wght@500;800&display=swap
export const buildGoogleFontUrl = (family: string, weights: string): string =>
{
  const encodedFamily = family.replace(/ /g, '+')
  return `${GOOGLE_FONT_BASE}?family=${encodedFamily}:wght@${weights}&display=swap`
}
