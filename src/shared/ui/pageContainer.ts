// src/shared/ui/pageContainer.ts
// shared page container & top-level page chrome class constants

// centered content column + horizontal gutters
export const PAGE_COLUMN = 'mx-auto w-full max-w-[1320px] px-6 sm:px-10'

// page section shell — column above the ambient backdrop (relative z-10)
export const PAGE_SHELL = `relative z-10 ${PAGE_COLUMN}`

// full-height ambient route backdrop shared by non-workspace pages
export const AMBIENT_PAGE_CLASS =
  'ambient-layer dot-grid-bg relative min-h-screen bg-[var(--t-bg-page)] text-[var(--t-text)]'

// editor shell backdrop — deliberately omits dot-grid-bg (the board area carries
// its own / per-board background). kept beside AMBIENT_PAGE_CLASS so the two
// can't silently drift; the workspace not-ready & ready states share this one
export const WORKSPACE_SHELL_CLASS =
  'ambient-layer min-h-screen bg-[var(--t-bg-page)] text-[var(--t-text)]'

export const PAGE_TOP_LEVEL = `${PAGE_SHELL} pb-24 pt-20 sm:pt-24`

export const PAGE_DETAIL_TOP_LEVEL = `${PAGE_SHELL} pt-20 pb-20 sm:pt-24`

export const CENTERED_PAGE_STATE_CLASS =
  'flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center'
