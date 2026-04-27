// convex/auth.config.ts
// * convex auth configuration — registers OAuth provider domains for token verification
// secrets read from environment variables at mutation time

// CONVEX_SITE_URL is the built-in JWT issuer for Convex Auth.
// Fail loudly when a runtime cannot expose HTTP actions.
const domain = process.env.CONVEX_SITE_URL
if (!domain)
{
  throw new Error(
    'CONVEX_SITE_URL is missing from the Convex runtime. Run `npx convex dev` or verify the deployment exposes HTTP actions.'
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
