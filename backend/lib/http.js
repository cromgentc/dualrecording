const DEFAULT_ALLOWED_ORIGINS = [
  'https://dualrecording.vercel.app',
  'https://dualrecord-frontend.onrender.com',
]

function getAllowedOrigins() {
  return [
    ...DEFAULT_ALLOWED_ORIGINS,
    ...(process.env.APP_ORIGIN || '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  ]
}

function getCorsOrigin(req) {
  const requestOrigin = req.headers.origin
  if (!requestOrigin) {
    return '*'
  }

  return getAllowedOrigins().includes(requestOrigin) ? requestOrigin : '*'
}

function setCorsHeaders(req, res) {
  res.setHeader('Access-Control-Allow-Origin', getCorsOrigin(req))
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  res.setHeader(
    'Access-Control-Allow-Headers',
    req.headers['access-control-request-headers'] || 'Content-Type, Authorization',
  )
  res.setHeader('Vary', 'Origin, Access-Control-Request-Headers')
}

// Small response helpers keep every controller's JSON/CORS headers consistent.
function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  })
  res.end(JSON.stringify(payload))
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
  })
  res.end(message)
}

function handleCors(req, res) {
  // Browsers send OPTIONS before cross-origin POST requests.
  if (req.method !== 'OPTIONS') {
    return false
  }

  setCorsHeaders(req, res)
  res.writeHead(204)
  res.end()
  return true
}

function collectRequest(req) {
  // Native Node requests stream data in chunks, so collect them before parsing.
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function readJsonBody(req) {
  const buffer = await collectRequest(req)
  if (!buffer.length) {
    return {}
  }

  return JSON.parse(buffer.toString('utf8'))
}

function getRequestContext(req, port) {
  // Build a full URL object even when Node only gives us a relative request URL.
  const url = new URL(req.url, `http://${req.headers.host || `localhost:${port}`}`)
  return {
    url,
    pathname: url.pathname,
    searchParams: url.searchParams,
  }
}

module.exports = {
  setCorsHeaders,
  sendJson,
  sendText,
  handleCors,
  collectRequest,
  readJsonBody,
  getRequestContext,
}
