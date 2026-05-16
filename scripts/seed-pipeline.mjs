#!/usr/bin/env node
// scripts/seed-pipeline.mjs
// npm wrapper that runs the Python seed pipeline with the repo-local venv

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '..')
const localPython = join(
  repoRoot,
  process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python'
)

const python =
  process.env.SEED_PIPELINE_PYTHON ||
  process.env.PYTHON ||
  (existsSync(localPython) ? localPython : 'python3')

const pythonPath = [
  join(repoRoot, 'scripts/seed_pipeline'),
  process.env.PYTHONPATH,
].filter(Boolean)

const result = spawnSync(
  python,
  ['-m', 'seed_pipeline', ...process.argv.slice(2)],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      PYTHONPATH: pythonPath.join(delimiter),
    },
    stdio: 'inherit',
  }
)

if (result.error)
{
  console.error(
    `seed pipeline failed to start with ${python}: ${result.error.message}`
  )
  process.exit(1)
}

process.exit(result.status ?? 1)
