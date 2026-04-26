require('dotenv').config()

const http = require('http')
const routes = require('./routes')
const { handleCors, sendJson, getRequestContext } = require('./lib/http')
const { connectDatabase } = require('./lib/database')
const { cleanupExpiredChallenges } = require('./models/otpChallengeModel')
const { getSessionCount } = require('./models/sessionModel')
const { initializeUsers } = require('./models/userModel')
const { initializeAuthSessions } = require('./models/authSessionModel')
const { initializeOtpChallenges } = require('./models/otpChallengeModel')
const { initializeSessions } = require('./models/sessionModel')
const { initializeVendors } = require('./models/vendorModel')
const { initializeScripts } = require('./models/scriptModel')

const PORT = Number(process.env.PORT || 5000)

// Match incoming requests against exact paths first, then regex routes with params.
function matchRoute(req, pathname) {
  for (const route of routes) {
    if (route.method !== req.method) {
      continue
    }

    if (route.path && route.path === pathname) {
      return { route, params: {} }
    }

    if (route.pattern) {
      const match = pathname.match(route.pattern)
      if (!match) {
        continue
      }

      const params = {}
      for (let index = 0; index < (route.paramNames || []).length; index += 1) {
        params[route.paramNames[index]] = match[index + 1]
      }

      return { route, params }
    }
  }

  return null
}

const server = http.createServer((req, res) => {
  // OPTIONS requests finish here so every API endpoint gets the same CORS behavior.
  if (handleCors(req, res)) {
    return
  }

  cleanupExpiredChallenges()

  const context = getRequestContext(req, PORT)
  const matched = matchRoute(req, context.pathname)

  if (!matched) {
    sendJson(res, 404, { error: 'Route not found.' })
    return
  }

  // Controllers receive request-derived values and lightweight runtime helpers.
  const runtimeContext = {
    ...context,
    port: PORT,
    sessionCount: getSessionCount,
  }

  matched.route.handler(req, res, runtimeContext, matched.params).catch((error) => {
    console.error(error)
    sendJson(res, 500, { error: 'Internal server error.' })
  })
})

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `Port ${PORT} already use mein hai. Purana backend stop kijiye ya backend/.env mein PORT change kijiye.`,
    )
    process.exit(1)
  }

  console.error('Server failed:', error)
  process.exit(1)
})

async function startServer() {
  try {
    await connectDatabase()
    await Promise.all([
      initializeUsers(),
      initializeAuthSessions(),
      initializeOtpChallenges(),
      initializeSessions(),
      initializeVendors(),
      initializeScripts(),
    ])
  } catch (error) {
    console.error('Database startup failed:', error.message)
    process.exit(1)
  }

  server.listen(PORT, () => {
    console.log(`Podcast backend running on http://localhost:${PORT}`)
  })
}

void startServer()
