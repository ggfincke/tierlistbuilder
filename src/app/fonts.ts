// src/app/fonts.ts
// promote preloaded stylesheets to applied stylesheets w/o an inline onload
// handler — CSP script-src 'self' can't allow inline event handlers (F8 5b-ii)

// flip <link rel="preload" as="style"> -> rel="stylesheet" so Google Fonts apply
// once the preloaded sheet is ready, keeping it off the critical render path
export const activateFontStylesheet = (): void =>
{
  const links = document.querySelectorAll<HTMLLinkElement>(
    'link[rel="preload"][as="style"]'
  )
  links.forEach((link) =>
  {
    link.rel = 'stylesheet'
  })
}
