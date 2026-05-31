// scripts/setup-local-convex-auth.mjs
// configure Convex Auth env vars for the selected local deployment

import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { runConvexAsync, runConvexSync } from './lib/convexExec.mjs'

const args = new Set(process.argv.slice(2))
const shouldRotate = args.has('--rotate')
const siteUrlArg = process.argv
  .slice(2)
  .find((arg) => arg.startsWith('--site-url='))
const siteUrl =
  siteUrlArg?.split('=').slice(1).join('=') || 'http://localhost:5173'

const getEnv = async (name) =>
{
  try
  {
    const value = await runConvexAsync([
      'env',
      'get',
      '--deployment',
      'local',
      name,
    ])
    return value.trim()
  }
  catch
  {
    return ''
  }
}

const setEnv = (name, value) =>
{
  runConvexSync(['env', 'set', '--deployment', 'local', name, value], {
    stdio: 'ignore',
  })
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
    runConvexSync(
      ['env', 'set', '--deployment', 'local', '--from-file', file, '--force'],
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

const [jwtPrivateKeyValue, jwksValue] = await Promise.all([
  getEnv('JWT_PRIVATE_KEY'),
  getEnv('JWKS'),
])
const hasJwtPrivateKey = jwtPrivateKeyValue !== ''
const hasJwks = jwksValue !== ''

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
