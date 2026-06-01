// tests/ci/workflowsPinned.test.ts
// supply-chain guard — every GitHub Actions `uses:` ref in .github/workflows
// must be pinned to a full commit SHA, never a mutable tag or branch (F5)

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const workflowsDir = join(process.cwd(), '.github', 'workflows')

const SHA_PIN = /@[0-9a-fA-F]{40}$/
const DOCKER_DIGEST_PIN = /^docker:\/\/.+@sha256:[0-9a-fA-F]{64}$/

const isImmutableUsesRef = (ref: string): boolean =>
  ref.startsWith('./') || SHA_PIN.test(ref) || DOCKER_DIGEST_PIN.test(ref)

const usesRefs = (yaml: string): string[] =>
  yaml
    .split('\n')
    .map((line) => line.match(/^\s*-?\s*uses:\s*(\S+)/)?.[1])
    .filter((ref): ref is string => ref !== undefined)

const workflowFiles = readdirSync(workflowsDir).filter((name) =>
  /\.ya?ml$/.test(name)
)

describe('github actions uses ref pinning predicates', () =>
{
  it('rejects mutable GitHub and Docker action refs', () =>
  {
    const mutableRefs = [
      'actions/checkout@v6',
      'actions/setup-node@main',
      'docker://alpine:latest',
      'docker://ghcr.io/org/action:latest',
      'docker://ghcr.io/org/action@main',
      `docker://ghcr.io/org/action@sha256:${'a'.repeat(63)}`,
      `docker://ghcr.io/org/action@sha512:${'a'.repeat(128)}`,
    ]

    for (const ref of mutableRefs)
    {
      expect(isImmutableUsesRef(ref), ref).toBe(false)
    }
  })
})

describe('github actions are SHA-pinned', () =>
{
  for (const file of workflowFiles)
  {
    it(`${file} pins every uses: ref to a commit SHA`, () =>
    {
      const yaml = readFileSync(join(workflowsDir, file), 'utf8')
      for (const ref of usesRefs(yaml))
      {
        // local (./...), owner/repo@40-char-SHA, & Docker digest refs are
        // immutable; Docker tags/branches remain mutable & must fail.
        expect(isImmutableUsesRef(ref), `unpinned action ref: ${ref}`).toBe(
          true
        )
      }
    })
  }
})
