// scripts/check-src-dir-casing.mjs
// enforce kebab-case directory segments under src

import { readdir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

const SRC_DIR = 'src'
const uppercasePattern = /[A-Z]/

const violations = []

const visit = async (dir) =>
{
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries)
  {
    if (!entry.isDirectory()) continue

    const child = join(dir, entry.name)
    if (uppercasePattern.test(entry.name))
    {
      violations.push(relative(process.cwd(), child).split(sep).join('/'))
    }
    await visit(child)
  }
}

await visit(SRC_DIR)

if (violations.length > 0)
{
  console.error('src directory names must use lowercase/kebab-case segments:')
  for (const violation of violations)
  {
    console.error(`  - ${violation}`)
  }
  process.exit(1)
}
