// scripts/lib/convexExec.mjs
// Convex CLI subprocess helpers shared by maintenance scripts

import { execFile, execFileSync } from 'node:child_process'

const commandArgs = (args) => ['convex', ...args]

export const runConvexSync = (args, options = {}) =>
  execFileSync('npx', commandArgs(args), { encoding: 'utf8', ...options })

export const runConvexAsync = (args, options = {}) =>
  new Promise((resolve, reject) =>
  {
    execFile(
      'npx',
      commandArgs(args),
      { encoding: 'utf8', ...options },
      (error, stdout) =>
      {
        if (error)
        {
          reject(error)
          return
        }
        resolve(stdout)
      }
    )
  })
