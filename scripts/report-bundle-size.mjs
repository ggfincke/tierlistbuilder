// scripts/report-bundle-size.mjs
// report Vite JS/CSS asset sizes from the latest production build

import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

const rootDir = dirname(
  fileURLToPath(new URL('../package.json', import.meta.url))
)
const assetsDir = join(rootDir, 'dist', 'assets')
const assetPattern = /\.(css|js)$/

const formatBytes = (bytes) =>
{
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} kB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

const formatRow = (cells) => `| ${cells.join(' | ')} |`

if (!existsSync(assetsDir))
{
  console.error('Missing dist/assets. Run `npm run build` first.')
  process.exit(1)
}

const entries = await readdir(assetsDir, { withFileTypes: true })
const files = entries
  .filter((entry) => entry.isFile() && assetPattern.test(entry.name))
  .map((entry) => join(assetsDir, entry.name))

const rows = await Promise.all(
  files.map(async (file) =>
  {
    const buffer = await readFile(file)
    const brotli = brotliCompressSync(buffer, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: 11,
      },
    })

    return {
      file: relative(rootDir, file),
      raw: buffer.byteLength,
      gzip: gzipSync(buffer).byteLength,
      brotli: brotli.byteLength,
    }
  })
)

rows.sort((a, b) => b.raw - a.raw)

const totals = rows.reduce(
  (acc, row) => ({
    raw: acc.raw + row.raw,
    gzip: acc.gzip + row.gzip,
    brotli: acc.brotli + row.brotli,
  }),
  { raw: 0, gzip: 0, brotli: 0 }
)

console.log('# Bundle Asset Report')
console.log('')
console.log(formatRow(['Asset', 'Raw', 'Gzip', 'Brotli']))
console.log(formatRow(['---', '---:', '---:', '---:']))

for (const row of rows)
{
  console.log(
    formatRow([
      `\`${row.file}\``,
      formatBytes(row.raw),
      formatBytes(row.gzip),
      formatBytes(row.brotli),
    ])
  )
}

console.log('')
console.log(
  formatRow([
    '**Total JS/CSS**',
    formatBytes(totals.raw),
    formatBytes(totals.gzip),
    formatBytes(totals.brotli),
  ])
)
