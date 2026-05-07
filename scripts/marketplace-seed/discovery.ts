// scripts/marketplace-seed/discovery.ts
// discover example folders for marketplace template seeding

import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

import { EXAMPLES_DIR } from './constants'
import type { SeedTarget } from './types'

export const discoverSeedTargets = async (): Promise<SeedTarget[]> =>
  (
    await Promise.all(
      (await readdir(EXAMPLES_DIR, { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map(async (cat) =>
          (
            await readdir(join(EXAMPLES_DIR, cat.name), {
              withFileTypes: true,
            })
          )
            .filter((e) => e.isDirectory())
            .map((e): SeedTarget => ({ folder: e.name, category: cat.name }))
        )
    )
  )
    .flat()
    .sort((a, b) => a.folder.localeCompare(b.folder))

export const resolveSeedTargets = (
  discovered: readonly SeedTarget[],
  folders: readonly string[]
): SeedTarget[] =>
{
  const discoveredByFolder = new Map(
    discovered.map((target) => [target.folder, target])
  )
  return folders.length > 0
    ? folders.map(
        (folder) => discoveredByFolder.get(folder) ?? { folder, category: null }
      )
    : [...discovered]
}
