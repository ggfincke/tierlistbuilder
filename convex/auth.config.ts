// convex/auth.config.ts
// * convex auth configuration — registers OAuth provider domains for token verification
// secrets (client IDs, client secrets, site URL) are read from environment variables
// at mutation time — see README in this directory once created in a future auth PR

export default {
  providers: [
    {
      // convex auth site URL — used as the JWT issuer
      domain: process.env.CONVEX_SITE_URL,
      applicationID: 'convex',
    },
  ],
}
