// Small response helpers keep every controller's JSON/CORS headers consistent.
function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  })
  res.end(JSON.stringify(payload))
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(message)
}

function handleCors(req, res) {
  // Browsers send OPTIONS before cross-origin POST requests.
  if (req.method !== 'OPTIONS') {
    return false
  }

  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  })
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
  sendJson,
  sendText,
  handleCors,
  collectRequest,
  readJsonBody,
  getRequestContext,
}
