// scripts/setup-local-convex-auth.mjs
// Configure Convex Auth env vars for the selected local deployment.

import { execFileSync } from 'node:child_process'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const args = new Set(process.argv.slice(2))
const shouldRotate = args.has('--rotate')
const siteUrlArg = process.argv
  .slice(2)
  .find((arg) => arg.startsWith('--site-url='))
const siteUrl =
  siteUrlArg?.split('=').slice(1).join('=') || 'http://localhost:5173'

const runConvex = (args, options = {}) =>
  execFileSync('npx', ['convex', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', options.stderr ?? 'ignore'],
  })

const getEnv = (name) =>
{
  try
  {
    return runConvex(['env', 'get', '--deployment', 'local', name]).trim()
  }
  catch
  {
    return ''
  }
}

const setEnv = (name, value) =>
{
  execFileSync(
    'npx',
    ['convex', 'env', 'set', '--deployment', 'local', name, value],
    {
      stdio: 'ignore',
    }
  )
}

const quoteEnv = (value) =>
{
  if (value.includes("'"))
  {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  }
  return `'${value}'`
}

const generateAuthKeys = () =>
{
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicExponent: 0x10001,
  })
  const jwtPrivateKey = privateKey
    .export({ type: 'pkcs8', format: 'pem' })
    .trimEnd()
    .replace(/\n/g, ' ')
  const publicJwk = publicKey.export({ format: 'jwk' })
  const jwks = JSON.stringify({ keys: [{ use: 'sig', ...publicJwk }] })

  return { jwtPrivateKey, jwks }
}

const setAuthKeys = () =>
{
  const { jwtPrivateKey, jwks } = generateAuthKeys()
  const dir = mkdtempSync(join(tmpdir(), 'tierlistbuilder-convex-auth-'))
  const file = join(dir, 'local-auth.env')

  try
  {
    writeFileSync(
      file,
      `JWT_PRIVATE_KEY=${quoteEnv(jwtPrivateKey)}\nJWKS=${quoteEnv(jwks)}\n`,
      { mode: 0o600 }
    )
    execFileSync(
      'npx',
      [
        'convex',
        'env',
        'set',
        '--deployment',
        'local',
        '--from-file',
        file,
        '--force',
      ],
      { stdio: 'ignore' }
    )
  }
  finally
  {
    rmSync(dir, { recursive: true, force: true })
  }
}

setEnv('SITE_URL', siteUrl)
console.log(`SITE_URL: ${siteUrl}`)

const hasJwtPrivateKey = getEnv('JWT_PRIVATE_KEY') !== ''
const hasJwks = getEnv('JWKS') !== ''

if (shouldRotate || !hasJwtPrivateKey || !hasJwks)
{
  setAuthKeys()
  console.log(
    shouldRotate ? 'Convex Auth keys: rotated' : 'Convex Auth keys: generated'
  )
}
else
{
  console.log('Convex Auth keys: already set')
}
