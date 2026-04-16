// convex/auth.config.ts
// * convex auth configuration — registers OAuth provider domains for token verification
// secrets read from environment variables at mutation time

// CONVEX_SITE_URL is the JWT issuer; without it getUserIdentity() silently
// returns null & every auth-guarded mutation looks like "not authenticated"
// to the user. fail loudly at boot instead of shipping a dead auth surface
const domain = process.env.CONVEX_SITE_URL
if (!domain)
{
  throw new Error(
    'CONVEX_SITE_URL must be set on the Convex deployment for JWT verification. ' +
      'Run `npx convex env set CONVEX_SITE_URL <your-deployment-site-url>`.'
  )
}

export default {
  providers: [
    {
      // convex auth site URL — used as the JWT issuer
      domain,
      applicationID: 'convex',
    },
  ],
}
