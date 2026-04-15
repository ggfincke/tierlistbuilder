// packages/contracts/index.ts
// re-export barrel — prefer per-subpath imports (e.g. @tierlistbuilder/contracts/workspace/board)
// this barrel exists for convenience & is explicitly allowed here since the package is small

export * from './lib/ids'
export * from './lib/theme'
export * from './workspace/board'
export * from './workspace/tierPreset'
export * from './workspace/settings'
