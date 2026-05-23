// tests/ci/securityHeaders.test.ts
// deployment hardening guard for public/_headers (F8) — 5a baseline, enforced 5b-i
// framing, & the Report-Only 5b-ii resource CSP, w/ the /embed carve-out

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const headersPath = join(process.cwd(), 'public', '_headers')

type Rule = { headers: Map<string, string>; unset: Set<string> }

// parse a Cloudflare `_headers` file into pathPattern -> set headers + `!` unsets;
// blank/`#` lines are skipped & path lines carry no leading indent
const parseHeaders = (text: string): Map<string, Rule> =>
{
  const rules = new Map<string, Rule>()
  let current: Rule | null = null

  for (const raw of text.split(/\r?\n/))
  {
    const line = raw.replace(/\s+$/, '')
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#'))
    {
      continue
    }
    if (!/^\s/.test(line))
    {
      current = { headers: new Map(), unset: new Set() }
      rules.set(trimmed, current)
      continue
    }
    if (!current)
    {
      continue
    }
    const unset = trimmed.match(/^!\s*([A-Za-z0-9-]+)$/)
    if (unset)
    {
      current.unset.add(unset[1].toLowerCase())
      continue
    }
    const set = trimmed.match(/^([A-Za-z0-9-]+):\s*(.*)$/)
    if (set)
    {
      current.headers.set(set[1].toLowerCase(), set[2])
    }
  }

  return rules
}

// split a CSP value into directive -> source-list
const parseCsp = (value: string): Map<string, string[]> =>
{
  const directives = new Map<string, string[]>()
  for (const part of value.split(';'))
  {
    const tokens = part.trim().split(/\s+/).filter(Boolean)
    if (tokens.length > 0)
    {
      directives.set(tokens[0].toLowerCase(), tokens.slice(1))
    }
  }
  return directives
}

// the resource policy lives in CSP-Report-Only today; after the 5b-ii enforce flip
// it moves into Content-Security-Policy. pick whichever value carries script-src.
const resourcePolicy = (
  rule: Rule | undefined
): Map<string, string[]> | null =>
{
  for (const name of [
    'content-security-policy-report-only',
    'content-security-policy',
  ])
  {
    const value = rule?.headers.get(name)
    if (value && /(^|;)\s*script-src\b/.test(value))
    {
      return parseCsp(value)
    }
  }
  return null
}

const rules = parseHeaders(readFileSync(headersPath, 'utf8'))
const catchAll = rules.get('/*')
const embed = rules.get('/embed*')

describe('static deployment security headers (F8)', () =>
{
  it('defines /* and /embed* rules', () =>
  {
    expect(catchAll, 'public/_headers must define a /* rule').toBeDefined()
    expect(embed, 'public/_headers must define a /embed* rule').toBeDefined()
  })

  it('sets the non-breaking 5a baseline on /*', () =>
  {
    expect(catchAll?.headers.get('x-content-type-options')).toBe('nosniff')
    expect(catchAll?.headers.get('referrer-policy')).toBe(
      'strict-origin-when-cross-origin'
    )
    const permissionsPolicy = catchAll?.headers.get('permissions-policy') ?? ''
    for (const feature of ['camera', 'microphone', 'geolocation'])
    {
      expect(permissionsPolicy, `${feature} must be disabled`).toContain(
        `${feature}=()`
      )
    }
    expect(
      /fullscreen\s*=\s*\(\)/.test(permissionsPolicy),
      'fullscreen must stay enabled for the embed iframe'
    ).toBe(false)
  })

  it('enforces framing denial on /* (XFO + frame-ancestors)', () =>
  {
    expect(catchAll?.headers.get('x-frame-options')).toBe('DENY')
    // framing must be ENFORCED (not Report-Only) — in the enforced CSP header
    expect(catchAll?.headers.get('content-security-policy') ?? '').toContain(
      "frame-ancestors 'none'"
    )
  })

  it('keeps a strict resource policy on /* (script-src self, no eval/inline)', () =>
  {
    const csp = resourcePolicy(catchAll)
    expect(csp, '/* must carry a resource CSP').not.toBeNull()
    expect(csp?.get('default-src')).toEqual(["'self'"])
    expect(csp?.get('script-src')).toEqual(["'self'"])
    expect(csp?.get('object-src')).toEqual(["'none'"])
    expect(csp?.get('base-uri')).toEqual(["'self'"])
    expect(csp?.get('frame-src')).toEqual(["'none'"])
    // style needs unsafe-inline (dynamic inline styles); script must not
    expect(csp?.get('style-src')).toContain("'unsafe-inline'")
    expect(csp?.get('script-src')).not.toContain("'unsafe-inline'")
    expect(csp?.get('script-src')).not.toContain("'unsafe-eval'")
    // convex data plane reachable (https + wss)
    expect(csp?.get('connect-src')).toEqual(
      expect.arrayContaining([
        "'self'",
        'https://*.convex.cloud',
        'wss://*.convex.cloud',
      ])
    )
  })

  it('carves out /embed* so third-party iframes still load', () =>
  {
    expect(embed?.unset.has('x-frame-options'), 'drop XFO on embed').toBe(true)
    expect(
      embed?.unset.has('content-security-policy'),
      'drop enforced framing CSP on embed'
    ).toBe(true)
    const csp = resourcePolicy(embed)
    expect(csp, '/embed* must carry its own resource CSP').not.toBeNull()
    expect(csp?.get('frame-ancestors'), 'embed must be framable').toEqual(['*'])
  })

  it('keeps /* and /embed* resource policies identical except frame-ancestors', () =>
  {
    const strip = (rule: Rule | undefined) =>
    {
      const csp = new Map(resourcePolicy(rule) ?? [])
      csp.delete('frame-ancestors')
      return Object.fromEntries(csp)
    }
    expect(strip(embed)).toEqual(strip(catchAll))
  })
})
