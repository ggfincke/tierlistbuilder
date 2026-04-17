// convex/convex.config.ts
// * register convex components — rate-limiter protects anon-callable mutations
// from resource abuse & caps signed-in callers on storage-touching paths

import { defineApp } from 'convex/server'
import rateLimiter from '@convex-dev/rate-limiter/convex.config.js'

const app = defineApp()
app.use(rateLimiter)

export default app
