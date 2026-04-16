// convex/auth.config.ts
// * convex auth configuration — registers OAuth provider domains for token verification
// secrets read from environment variables at mutation time

export default {
  providers: [
    {
      // convex auth site URL — used as the JWT issuer
      domain: process.env.CONVEX_SITE_URL,
      applicationID: 'convex',
    },
  ],
}
