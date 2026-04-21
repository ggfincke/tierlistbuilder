// convex/convex.config.ts
// * register convex components — rate-limiter caps signed-in callers on
// storage-touching paths (upload-url issue, short-link create, media upload)

import { defineApp } from 'convex/server'
import rateLimiter from '@convex-dev/rate-limiter/convex.config.js'

const app = defineApp()
app.use(rateLimiter)

export default app
