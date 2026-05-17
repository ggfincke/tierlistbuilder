#!/usr/bin/env node
// scripts/seed-pipeline.mjs
// npm wrapper that runs the Python seed pipeline via uv (auto-syncs the
// env from scripts/seed_pipeline/uv.lock). Set SEED_PIPELINE_PYTHON or
// PYTHON to bypass uv and use a specific interpreter.

import { spawnSync } from 'node:child_process'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '..')
const seedPipelineDir = join(repoRoot, 'scripts/seed_pipeline')

const explicitPython = process.env.SEED_PIPELINE_PYTHON || process.env.PYTHON

const [command, args] = explicitPython
  ? [
      explicitPython,
      ['-m', 'seed_pipeline', ...process.argv.slice(2)],
    ]
  : [
      'uv',
      [
        'run',
        '--project',
        seedPipelineDir,
        'python',
        '-m',
        'seed_pipeline',
        ...process.argv.slice(2),
      ],
    ]

const pythonPath = [seedPipelineDir, process.env.PYTHONPATH]
  .filter(Boolean)
  .join(delimiter)

const result = spawnSync(command, args, {
  cwd: repoRoot,
  env: {
    ...process.env,
    PYTHONPATH: pythonPath,
  },
  stdio: 'inherit',
})

if (result.error)
{
  const hint =
    !explicitPython && result.error.code === 'ENOENT'
      ? ' (install uv from https://docs.astral.sh/uv/ or set SEED_PIPELINE_PYTHON)'
      : ''
  console.error(
    `seed pipeline failed to start with ${command}: ${result.error.message}${hint}`
  )
  process.exit(1)
}

process.exit(result.status ?? 1)
