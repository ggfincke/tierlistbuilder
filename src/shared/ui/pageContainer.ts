// src/shared/ui/pageContainer.ts
// shared page container — one centered column + responsive gutters so every
// top-level surface lines up under the fixed top nav

// centered content column + horizontal gutters
export const PAGE_COLUMN = 'mx-auto w-full max-w-[1320px] px-6 sm:px-10'

// page section shell — column above the ambient backdrop (relative z-10)
export const PAGE_SHELL = `relative z-10 ${PAGE_COLUMN}`
