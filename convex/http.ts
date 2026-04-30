// convex/http.ts
// * convex HTTP router — registers auth callback routes

import { httpRouter } from 'convex/server'
import { auth } from './auth'

const http = httpRouter()

// register /auth/* routes required by @convex-dev/auth for OAuth callbacks
auth.addHttpRoutes(http)

export default http
